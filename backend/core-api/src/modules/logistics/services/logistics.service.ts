import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GeocodingService } from './geocoding.service';

@Injectable()
export class LogisticsService {
  private readonly logger = new Logger(LogisticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocodingService: GeocodingService,
    @InjectQueue('routing') private routingQueue: Queue,
    private readonly httpService: HttpService,
  ) {}

  async listTrips(params: { page?: number; limit?: number }) {
    const safePage = Math.max(1, Number(params.page || 1));
    const take = Math.min(Math.max(1, Number(params.limit || 20)), 100);
    const skip = (safePage - 1) * take;

    const [data, total] = await Promise.all([
      this.prisma.getTenantDb().trip.findMany({
        skip,
        take,
        include: { driver: { include: { user: true } }, vehicle: true },
        orderBy: { tripCode: 'desc' },
      }),
      this.prisma.getTenantDb().trip.count(),
    ]);

    return {
      data,
      meta: {
        total,
        page: safePage,
        limit: take,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    };
  }

  async getUnassignedOrders() {
    return this.prisma.getTenantDb().order.findMany({
      where: {
        status: { in: ['NEW', 'PENDING', 'UNASSIGNED'] },
        driverId: null,
      },
      take: 50,
    });
  }

  async optimizeRouting(dto: any) {
    const orderIds = Array.isArray(dto?.orderIds) ? dto.orderIds : [];
    if (orderIds.length === 0) {
      throw new BadRequestException('orderIds must be a non-empty array');
    }
    this.logger.log(`Bắt đầu tạo Job tối ưu lộ trình cho ${orderIds.length} đơn hàng...`);

    const db = this.prisma.getTenantDb();

    // 1. Lấy thông tin đơn hàng kèm items và trọng lượng sản phẩm
    const orders = await db.order.findMany({
      where: { id: { in: orderIds } },
      include: { items: { include: { product: true } } },
    });

    // 2. Lấy thông tin đội xe đang hoạt động
    const vehicles = await db.vehicle.findMany({
      where: { status: 'ACTIVE' },
      take: 25,
    });

    // 3. Chuẩn bị payload với tọa độ thực và trọng lượng hàng hóa thực
    const skippedOrderIds: string[] = [];
    const locations: Array<{ id: string; lat: number; lng: number; demand: number }> = [];

    for (const o of orders as any[]) {
      let lat = o.lat !== null && o.lat !== undefined ? Number(o.lat) : NaN;
      let lng = o.lng !== null && o.lng !== undefined ? Number(o.lng) : NaN;

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        this.logger.log(`Đang Geocoding địa chỉ: ${o.recipientAddress} cho đơn hàng ${o.trackingCode}`);
        const coords = await this.geocodingService.geocode(o.recipientAddress);
        if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
          lat = coords.lat;
          lng = coords.lng;
          await db.order.update({
            where: { id: o.id },
            data: { lat, lng },
          });
        } else {
          this.logger.warn(`Không thể geocode địa chỉ đơn hàng ${o.id}; loại khỏi VRP thay vì dùng tọa độ giả.`);
          skippedOrderIds.push(o.id);
          continue;
        }
      }

      const computedWeight =
        Array.isArray(o.items) && o.items.length > 0
          ? o.items.reduce((sum: number, item: any) => {
              const unitWeight = Number(item.product?.weightKg || 1);
              const qty = Number(item.quantity || 1);
              const safeUnit = Number.isFinite(unitWeight) && unitWeight > 0 ? unitWeight : 1;
              const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
              return sum + safeUnit * safeQty;
            }, 0)
          : 1;

      locations.push({
        id: o.id,
        lat,
        lng,
        demand: Math.max(1, Math.round(computedWeight * 100) / 100),
      });
    }

    if (locations.length === 0) {
      throw new BadRequestException('No orders with valid or geocodable coordinates for routing');
    }

    const payload = {
      locations: [
        {
          id: 'DEPOT',
          lat: 10.762622,
          lng: 106.660172,
          demand: 0,
        },
        ...locations,
      ],
      vehicles: vehicles.map((v: any) => ({
        id: v.id,
        capacity: Number(v.capacityKg) > 0 ? Number(v.capacityKg) : 100,
      })),
      depot_index: 0,
      skipped_order_ids: skippedOrderIds,
    };

    // 4. Tạo Job trong DB với trạng thái PENDING
    const job = await db.routeOptimizationJob.create({
      data: {
        status: 'PENDING',
        payload: JSON.stringify(payload),
        result: JSON.stringify({}),
      },
    });

    // 5. Đẩy vào BullMQ kèm tenant context để worker chạy đúng schema/tenant
    const tenantContext = this.prisma.currentTenant;
    await this.routingQueue.add('optimize', {
      jobId: job.id,
      payload,
      tenantId: tenantContext.tenantId,
      schemaName: tenantContext.schemaName,
    });

    this.logger.log(`Job ${job.id} đã được đưa vào Queue`);

    return {
      ok: true,
      message: 'Routing optimization job queued successfully',
      jobId: job.id,
      skippedOrderIds,
    };
  }

  async startTrip(id: string) {
    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const trip = await tx.trip.findUnique({ where: { id } });
      if (!trip) throw new NotFoundException(`Trip ${id} not found`);
      if (trip.status !== 'DISPATCHED') {
        throw new BadRequestException(`Cannot start trip that is not DISPATCHED (current: ${trip.status})`);
      }
      return tx.trip.update({
        where: { id },
        data: { status: 'IN_TRANSIT', departureTime: new Date() },
      });
    });
  }

  async completeTrip(id: string) {
    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const trip = await tx.trip.findUnique({ where: { id } });
      if (!trip) throw new NotFoundException(`Trip ${id} not found`);
      if (trip.status !== 'IN_TRANSIT') {
        throw new BadRequestException(`Cannot complete trip that is not IN_TRANSIT (current: ${trip.status})`);
      }
      return tx.trip.update({
        where: { id },
        data: { status: 'COMPLETED', returnTime: new Date() },
      });
    });
  }

  async updateTripStatus(id: string, status: string) {
    const allowedTransitions: Record<string, string[]> = {
      'DRAFT': ['NEW', 'CANCELLED'],
      'NEW': ['DISPATCHED', 'CANCELLED'],
      'DISPATCHED': ['IN_TRANSIT', 'CANCELLED'],
      'IN_TRANSIT': ['COMPLETED', 'CANCELLED'],
      'COMPLETED': [],
      'CANCELLED': [],
    };
    const trip = await this.prisma.getTenantDb().trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException(`Trip ${id} not found`);
    const allowed = allowedTransitions[trip.status] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Cannot transition from ${trip.status} to ${status}. Allowed: ${allowed.join(', ') || 'none'}`);
    }
    return this.prisma.getTenantDb().trip.update({
      where: { id },
      data: { status },
    });
  }

  async dispatchTrip(id: string, driverId?: string, vehicleId?: string, targetStatus: string = 'DISPATCHED') {
    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const trip = await tx.trip.findUnique({ where: { id } });

      if (!trip) {
        throw new NotFoundException(`Trip with ID ${id} not found`);
      }

      if (trip.status !== 'NEW' && trip.status !== 'PENDING' && trip.status !== 'DRAFT') {
        throw new BadRequestException(`Trip is already in status ${trip.status} and cannot be dispatched again`);
      }

      if (driverId) {
        const driver = await tx.driver.findUnique({ where: { id: driverId } });
        if (!driver) throw new NotFoundException(`Driver ${driverId} not found`);

        if (driver.status !== 'ACTIVE' && driver.status !== 'ONLINE') {
          throw new BadRequestException(`Driver is not ACTIVE/ONLINE. Current status: ${driver.status}`);
        }

        if (driver.licenseExpiry < new Date()) {
          throw new BadRequestException(`Driver's license has expired since ${driver.licenseExpiry.toISOString()}`);
        }

        const activeTrip = await tx.trip.findFirst({
          where: {
            driverId,
            status: { in: ['ASSIGNED', 'DISPATCHED', 'IN_TRANSIT'] },
          },
        });
        if (activeTrip) {
          throw new BadRequestException(`Driver is already assigned to active trip ${activeTrip.tripCode}`);
        }
      }

      if (vehicleId) {
        const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId } });
        if (!vehicle) throw new NotFoundException(`Vehicle ${vehicleId} not found`);

        if (vehicle.status !== 'ACTIVE') {
          throw new BadRequestException(`Vehicle is not ACTIVE. Current status: ${vehicle.status}`);
        }

        const activeTrip = await tx.trip.findFirst({
          where: {
            vehicleId,
            status: { in: ['ASSIGNED', 'DISPATCHED', 'IN_TRANSIT'] },
          },
        });
        if (activeTrip) {
          throw new BadRequestException(`Vehicle is already assigned to active trip ${activeTrip.tripCode}`);
        }
      }

      return tx.trip.update({
        where: { id },
        data: {
          driverId: driverId || trip.driverId,
          vehicleId: vehicleId || trip.vehicleId,
          status: targetStatus,
        },
      });
    });
  }

  async getRoutingJob(jobId: string) {
    const job = await this.prisma.getTenantDb().routeOptimizationJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Routing job ${jobId} not found`);
    }

    let parsed: any = null;
    if (job.result) {
      try {
        parsed = JSON.parse(job.result);
      } catch {
        parsed = job.result;
      }
    }

    const routes = Array.isArray(parsed) ? parsed : parsed?.routes ?? null;
    const error = parsed?.error ?? null;

    return {
      ...job,
      parsedResult: parsed,
      routes,
      unassigned: parsed?.unassigned ?? [],
      distance_source: parsed?.distance_source ?? null,
      warnings: parsed?.warnings ?? [],
      error,
    };
  }

  async applyRoutingJob(jobId: string) {
    const job = await this.prisma.getTenantDb().routeOptimizationJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Routing job ${jobId} not found`);
    }

    if (job.status !== 'COMPLETED') {
      throw new BadRequestException(`Routing job ${jobId} is not COMPLETED (current status: ${job.status})`);
    }

    let routes: any[] = [];
    try {
      const parsed = JSON.parse(job.result || '[]');
      routes = Array.isArray(parsed) ? parsed : parsed?.routes ?? [];
    } catch {
      routes = [];
    }
    if (!Array.isArray(routes) || routes.length === 0) {
      throw new BadRequestException(`Job ${jobId} has no valid routes to apply`);
    }

    this.logger.log(`Applying routing job ${jobId} with ${routes.length} routes...`);

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      let createdTripsCount = 0;

      for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        const vehicleId = route.vehicle_id;
        const locations = route.route || [];

        const orderIds = locations
          .filter((loc: any) => loc.id && loc.id !== 'DEPOT')
          .map((loc: any) => loc.id);

        if (orderIds.length === 0) continue;

        const trip = await tx.trip.create({
          data: {
            tripCode: `TRIP-AI-${Date.now().toString().slice(-6)}-${i + 1}`,
            status: 'NEW',
            vehicleId: vehicleId !== 'UNKNOWN' && vehicleId ? vehicleId : null,
          },
        });
        createdTripsCount++;

        let sequence = 1;
        for (const orderId of orderIds) {
          const order = await tx.order.findUnique({ where: { id: orderId } });
          if (!order) {
            throw new NotFoundException(`Order ${orderId} in route not found. Aborting transaction.`);
          }

          await tx.order.update({
            where: { id: orderId },
            data: { status: 'DISPATCHED' },
          });

          await tx.delivery.create({
            data: {
              tripId: trip.id,
              orderId,
              stopSequence: sequence++,
              stopType: 'ORDER',
              status: 'PENDING',
              customerName: order.recipientName,
              customerPhone: order.recipientPhone,
              deliveryAddress: order.recipientAddress,
              lat: Number(order.lat || 0),
              lng: Number(order.lng || 0),
              codAmountExpected: order.codAmount,
              driverId: order.driverId || null,
            },
          });
        }
      }

      await tx.routeOptimizationJob.update({
        where: { id: jobId },
        data: { status: 'APPLIED' },
      });

      return { ok: true, jobId, appliedRoutes: routes.length, createdTripsCount };
    });
  }

  // --- Delivery & Driver Methods ---

  async completeDelivery(
    id: string,
    data: { codCollected: number; podUrl?: string; syncVersion: number },
    expectedDriverId?: string,
  ) {
    const codCollected = Number(data?.codCollected);
    if (!Number.isFinite(codCollected) || codCollected < 0) {
      throw new BadRequestException('codCollected must be a finite non-negative number');
    }

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const delivery = await tx.delivery.findUnique({
        where: { id },
        include: { trip: true },
      });
      if (!delivery) throw new NotFoundException(`Delivery ${id} not found`);

      if (expectedDriverId) {
        const ownsDelivery =
          delivery.driverId === expectedDriverId || delivery.trip?.driverId === expectedDriverId;
        if (!ownsDelivery) {
          throw new ForbiddenException('Delivery is not assigned to this driver');
        }
      }

      if (['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(delivery.status)) {
        throw new BadRequestException(`Delivery ${id} is already in terminal status ${delivery.status}`);
      }

      if (Number(data?.syncVersion ?? 0) < delivery.syncVersion) {
        throw new ConflictException(
          `Sync conflict: Your data is stale (Version ${data.syncVersion} vs Server ${delivery.syncVersion}). Please refresh.`,
        );
      }

      return tx.delivery.update({
        where: { id },
        data: {
          status: 'DELIVERED',
          codAmountCollected: codCollected,
          podImageUrl: data.podUrl,
          syncVersion: delivery.syncVersion + 1,
        },
      });
    });
  }

  // --- Financial & Remittance Methods ---

  async createRemittance(data: { driverId: string; totalCod: number; expenses: number; amount: number }) {
    const expectedAmount = data.totalCod - data.expenses;
    if (Math.abs(expectedAmount - data.amount) > 0.01) {
      throw new BadRequestException(
        `Remittance amount (${data.amount}) does not match expected calculation (${data.totalCod} - ${data.expenses} = ${expectedAmount})`,
      );
    }

    return this.prisma.getTenantDb().codRemittance.create({
      data: {
        driverId: data.driverId,
        totalCodCollected: data.totalCod,
        totalExpensesDeducted: data.expenses,
        amountRemitted: data.amount,
        status: 'PENDING',
        qrCodeToken: `REM-${Date.now()}`,
      },
    });
  }

  async getRemittances(params: { driverId?: string; status?: string; page?: number; limit?: number }) {
    const safePage = Math.max(1, Number(params.page || 1));
    const take = Math.min(Math.max(1, Number(params.limit || 20)), 100);
    const skip = (safePage - 1) * take;
    const where: any = {};
    if (params.driverId) where.driverId = params.driverId;
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      this.prisma.getTenantDb().codRemittance.findMany({
        where,
        skip,
        take,
        include: { driver: { include: { user: true } } },
        orderBy: { id: 'desc' },
      }),
      this.prisma.getTenantDb().codRemittance.count({ where }),
    ]);

    return {
      data,
      total,
      page: safePage,
      limit: take,
      meta: {
        total,
        page: safePage,
        limit: take,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    };
  }

  async updateRemittanceStatus(id: string, status: string) {
    const allowedTransitions: Record<string, string[]> = {
      PENDING: ['APPROVED', 'REJECTED'],
      APPROVED: ['RECONCILED', 'COMPLETED', 'SETTLED'],
      REJECTED: [],
      RECONCILED: [],
      COMPLETED: ['RECONCILED'],
      SETTLED: ['RECONCILED'],
    };

    const db = this.prisma.getTenantDb();
    const existing = await db.codRemittance.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`COD remittance ${id} not found`);
    }
    const allowed = allowedTransitions[existing.status] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition remittance from ${existing.status} to ${status}`,
      );
    }

    return db.codRemittance.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * Bridge human feedback to the AI Worker (Cloudflare) for self-learning.
   */
  async submitAiFeedback(body: any) {
    const aiWorkerUrl = process.env.AI_WORKER_URL || 'http://localhost:8787';
    const aiApiKey = process.env.AI_API_KEY || '';

    const localFeedback = await this.prisma.getTenantDb().aiFeedback.create({
      data: {
        modelId: body.modelId || 'demand-v1',
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        aiPrediction: body.aiPrediction,
        humanCorrected: body.humanCorrected,
        confidence: body.confidence || 1.0,
      },
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${aiWorkerUrl}/ai/v1/feedback`, body, {
          headers: { 'x-ai-api-key': aiApiKey },
        })
      );
      return { ok: true, localId: localFeedback.id, aiResponse: response.data };
    } catch (error: any) {
      this.logger.error(`Failed to forward feedback to AI Worker: ${error.message}`);
      return { ok: true, localId: localFeedback.id, warning: 'AI Worker unreachable, feedback saved locally' };
    }
  }

  // --- SOS Alert Methods ---

  async getSosAlerts(status?: string) {
    const where: any = {};
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.getTenantDb().sosAlert.findMany({
        where,
        include: { driver: { include: { user: true } }, trip: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.getTenantDb().sosAlert.count({ where }),
    ]);

    return { data, total };
  }

  async resolveSos(id: string, status: string) {
    const allowedStatuses = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_ALARM'];
    if (!allowedStatuses.includes(status)) {
      throw new BadRequestException(`Invalid SOS status: ${status}`);
    }
    const existing = await this.prisma.getTenantDb().sosAlert.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`SOS alert ${id} not found`);
    }
    return this.prisma.getTenantDb().sosAlert.update({
      where: { id },
      data: { status },
    });
  }

  // --- Report Methods ---

  async getTripReport(range: string = '7d') {
    const days = Math.min(Math.max(1, parseInt(range, 10) || 7), 365);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [total, completed, inTransit, cancelled] = await Promise.all([
      this.prisma.getTenantDb().trip.count({ where: { createdAt: { gte: since } } }),
      this.prisma.getTenantDb().trip.count({ where: { status: 'COMPLETED', createdAt: { gte: since } } }),
      this.prisma.getTenantDb().trip.count({ where: { status: 'IN_TRANSIT', createdAt: { gte: since } } }),
      this.prisma.getTenantDb().trip.count({ where: { status: 'CANCELLED', createdAt: { gte: since } } }),
    ]);

    return {
      range,
      total,
      completed,
      inTransit,
      cancelled,
    };
  }

  async getFleetReport(range: string = '7d') {
    const days = Math.min(Math.max(1, parseInt(range, 10) || 7), 365);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [totalDrivers, activeDrivers, totalVehicles, activeVehicles, trips] = await Promise.all([
      this.prisma.getTenantDb().driver.count(),
      this.prisma.getTenantDb().driver.count({ where: { status: { in: ['ACTIVE', 'ONLINE'] } } }),
      this.prisma.getTenantDb().vehicle.count(),
      this.prisma.getTenantDb().vehicle.count({ where: { status: 'ACTIVE' } }),
      this.prisma.getTenantDb().trip.findMany({
        where: { createdAt: { gte: since } },
        select: { actualDistanceKm: true, totalWeightKg: true },
      }),
    ]);

    const totalDistance = trips.reduce((sum: number, t: any) => sum + Number(t.actualDistanceKm || 0), 0);
    const totalCargo = trips.reduce((sum: number, t: any) => sum + Number(t.totalWeightKg || 0), 0);

    return {
      range,
      drivers: { total: totalDrivers, active: activeDrivers },
      vehicles: { total: totalVehicles, active: activeVehicles },
      totalDistanceKm: totalDistance,
      totalCargoWeightKg: totalCargo,
    };
  }

  // --- Feedback & Finance Methods ---

  async listAiModels(type?: string) {
    const where: any = {};
    if (type) where.type = type;
    return this.prisma.getTenantDb().aiModel.findMany({
      where,
      orderBy: { trainedAt: 'desc' },
    });
  }

  async createAiModel(data: any) {
    const existingCurrent = await this.prisma.getTenantDb().aiModel.findFirst({
      where: { isCurrent: true, type: data.type },
    });
    if (existingCurrent) {
      await this.prisma.getTenantDb().aiModel.update({
        where: { id: existingCurrent.id },
        data: { isCurrent: false },
      });
    }

    return this.prisma.getTenantDb().aiModel.create({
      data: {
        name: data.name,
        version: data.version,
        type: data.type,
        accuracy: data.accuracy,
        modelPath: data.modelPath,
        metadata: data.metadata,
        isCurrent: true,
      },
    });
  }

  async updateAiModel(id: string, body: any) {
    const allowed: Record<string, unknown> = {};
    if (body?.name !== undefined) allowed.name = String(body.name);
    if (body?.version !== undefined) allowed.version = String(body.version);
    if (body?.accuracy !== undefined) allowed.accuracy = body.accuracy;
    if (body?.isCurrent !== undefined) allowed.isCurrent = Boolean(body.isCurrent);
    if (body?.metadata !== undefined) allowed.metadata = body.metadata;

    return this.prisma.getTenantDb().aiModel.update({
      where: { id },
      data: allowed,
    });
  }

  async createAiFeedback(body: any) {
    return this.prisma.getTenantDb().aiFeedback.create({
      data: {
        modelId: body.modelId || 'demand-v1',
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        aiPrediction: body.aiPrediction,
        humanCorrected: body.humanCorrected,
        confidence: body.confidence || 1.0,
      },
    });
  }

  async getAiFeedbacks(params: { modelId?: string; isUsedForTrain?: boolean }) {
    const where: any = {};
    if (params.modelId) where.modelId = params.modelId;
    if (typeof params.isUsedForTrain === 'boolean') where.isUsedForTrain = params.isUsedForTrain;

    return this.prisma.getTenantDb().aiFeedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async markFeedbackAsUsed(id: string) {
    const existing = await this.prisma.getTenantDb().aiFeedback.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`AI feedback ${id} not found`);
    }
    return this.prisma.getTenantDb().aiFeedback.update({
      where: { id },
      data: { isUsedForTrain: true },
    });
  }

  async reconcileBankStatement(entries: any[]) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return { ok: true, reconciled: 0, matched: 0, unmatched: 0, ambiguous: 0, results: [] };
    }

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const candidates = await tx.codRemittance.findMany({
        where: { status: { in: ['PENDING', 'APPROVED'] } },
        include: { driver: { include: { user: { select: { fullName: true, phone: true } } } } },
        orderBy: { createdAt: 'asc' },
      });

      const claimedIds = new Set<string>();
      const results: any[] = [];
      let matchedCount = 0;
      let unmatchedCount = 0;
      let ambiguousCount = 0;

      for (const entry of entries) {
        const reference = String(entry?.reference || '').trim();
        const amount = Number(entry?.amount);
        const rawDate = entry?.transactionDate ? new Date(entry.transactionDate) : null;
        const txTime = rawDate && !Number.isNaN(rawDate.getTime()) ? rawDate.getTime() : null;

        if (!Number.isFinite(amount) || amount <= 0) {
          unmatchedCount++;
          results.push({ reference, status: 'unmatched', matched: false, reason: 'INVALID_AMOUNT' });
          continue;
        }

        const unclaimed = candidates.filter((c: any) => !claimedIds.has(c.id));
        const tokenMatch = reference.match(/REM-\d+/i);
        const extractedToken = tokenMatch ? tokenMatch[0].toUpperCase() : null;

        let matches: any[] = [];
        if (extractedToken) {
          matches = unclaimed.filter(
            (c: any) =>
              (c.qrCodeToken || '').toUpperCase() === extractedToken &&
              Math.abs(Number(c.amountRemitted) - amount) <= 1,
          );
        }

        if (matches.length === 0 && !extractedToken) {
          const amountMatches = unclaimed.filter(
            (c: any) => Math.abs(Number(c.amountRemitted) - amount) <= 1,
          );
          if (txTime !== null) {
            const windowMs = 24 * 60 * 60 * 1000;
            const dateScoped = amountMatches.filter(
              (c: any) => Math.abs(new Date(c.createdAt).getTime() - txTime) <= windowMs,
            );
            matches = dateScoped.length > 0 ? dateScoped : amountMatches;
          } else {
            matches = amountMatches;
          }
        }

        if (matches.length === 1) {
          const target = matches[0];
          const updated = await tx.codRemittance.updateMany({
            where: { id: target.id, status: { in: ['PENDING', 'APPROVED'] } },
            data: { status: 'RECONCILED' },
          });
          if (updated.count === 1) {
            claimedIds.add(target.id);
            matchedCount++;
            results.push({
              reference,
              status: 'matched',
              matched: true,
              remittanceId: target.id,
              qrCodeToken: target.qrCodeToken,
              amount,
            });
          } else {
            unmatchedCount++;
            results.push({ reference, status: 'unmatched', matched: false, reason: 'ALREADY_RECONCILED' });
          }
        } else if (matches.length > 1) {
          ambiguousCount++;
          results.push({
            reference,
            status: 'ambiguous',
            matched: false,
            candidateIds: matches.map((m: any) => m.id),
            reason: 'MULTIPLE_CANDIDATES',
          });
        } else {
          unmatchedCount++;
          results.push({ reference, status: 'unmatched', matched: false, reason: 'NO_MATCH' });
        }
      }

      return {
        ok: true,
        reconciled: matchedCount,
        matched: matchedCount,
        unmatched: unmatchedCount,
        ambiguous: ambiguousCount,
        results,
      };
    });
  }

  async getDriverExpenses(driverId?: string) {
    return this.prisma.getTenantDb().driverExpense.findMany({
      where: driverId ? { driverId } : {},
      orderBy: { createdAt: 'desc' },
      include: { driver: { include: { user: true } } },
    });
  }
}
