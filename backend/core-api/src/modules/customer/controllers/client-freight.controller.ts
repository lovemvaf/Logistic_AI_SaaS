import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { Permissions, PermissionsGuard, RequirePermissions } from 'shared-types';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { OutboxService } from '../../../core/outbox/outbox.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { generateTrackingCode } from '../../../core/utils/tracking-code';

@ApiTags('Client Freight B2B')
@Controller('client/freight')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClientFreightController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  private async getClientId(req: any): Promise<string> {
    const email = req.user?.email;
    if (!email) throw new NotFoundException('User email not found in token');
    const clientUser = await this.prisma.getTenantDb().clientUser.findFirst({ where: { email } });
    if (!clientUser) throw new NotFoundException('Client account not found for this user');
    return clientUser.clientId;
  }

  @Get('geography/units')
  @RequirePermissions(Permissions.GeographyRead)
  async listUnits(@Query('search') search?: string) {
    return this.prisma.runAsPlatform(async (db) => {
      const where: any = { isActive: true };
      if (search && search.trim()) {
        where.canonicalName = { contains: search.trim(), mode: 'insensitive' };
      }
      const [units, facilities] = await Promise.all([
        db.administrativeUnit.findMany({
          where,
          orderBy: [{ unitType: 'asc' }, { canonicalName: 'asc' }],
          take: 95,
        }),
        db.logisticsFacility.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      ]);
      return { units, facilities };
    });
  }

  @Get('rfqs')
  @RequirePermissions(Permissions.FreightRead)
  async listRfqs(@Request() req: any) {
    const clientId = await this.getClientId(req);
    return this.prisma.getTenantDb().freightRFQ.findMany({
      where: { clientId },
      include: { quotes: { include: { lines: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('rfqs')
  @RequirePermissions(Permissions.FreightManage)
  async createRfq(@Request() req: any, @Body() body: any) {
    const clientId = await this.getClientId(req);
    if (!body?.originName || !body?.destName || !body?.cargoDesc) {
      throw new BadRequestException('originName, destName, and cargoDesc are required');
    }
    const rfqNumber = `RFQ-C-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    return this.prisma.getTenantDb().freightRFQ.create({
      data: {
        rfqNumber,
        clientId,
        serviceMode: body.serviceMode || 'FCL_EXPORT',
        incoterm: body.incoterm || 'FOB',
        originName: String(body.originName).trim(),
        destName: String(body.destName).trim(),
        corridorTag: body.corridorTag || null,
        containerSize: body.containerSize || '40HC',
        containerQty: Math.max(1, Number(body.containerQty || 1)),
        cargoDesc: String(body.cargoDesc).trim(),
        weightKg: body.weightKg ?? null,
        volumeCbm: body.volumeCbm ?? null,
        status: 'OPEN',
      },
    });
  }

  @Get('quotes')
  @RequirePermissions(Permissions.FreightRead)
  async listQuotes(@Request() req: any) {
    const clientId = await this.getClientId(req);
    return this.prisma.getTenantDb().freightQuote.findMany({
      where: { clientId },
      include: { rfq: true, lines: true, booking: { select: { id: true, bookingNo: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('quotes/:id/accept')
  @RequirePermissions(Permissions.FreightManage)
  async acceptQuote(@Param('id') quoteId: string, @Request() req: any) {
    const clientId = await this.getClientId(req);
    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const quote = await tx.freightQuote.findFirst({
        where: { id: quoteId, clientId },
        include: { rfq: true, booking: true },
      });
      if (!quote) throw new NotFoundException(`Quote ${quoteId} not found`);
      if (quote.status === 'ACCEPTED' || quote.booking) {
        throw new ConflictException(`Quote ${quote.quoteNumber} is already accepted`);
      }

      await tx.freightQuote.update({
        where: { id: quoteId },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      if (quote.rfqId) {
        await tx.freightRFQ.update({ where: { id: quote.rfqId }, data: { status: 'BOOKED' } });
      }

      const bookingNo = `BK-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
      const booking = await tx.freightBooking.create({
        data: {
          bookingNo,
          quoteId: quote.id,
          clientId,
          serviceMode: quote.rfq?.serviceMode || 'FCL_EXPORT',
          status: 'CONFIRMED',
        },
      });
      const shipmentNo = `SHP-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
      const shipment = await tx.freightShipment.create({
        data: {
          shipmentNo,
          bookingId: booking.id,
          clientId,
          trackingCode: generateTrackingCode(),
          cargoDesc: quote.rfq?.cargoDesc || 'B2B Freight Cargo',
          status: 'PLANNED',
        },
      });
      return { booking, shipment };
    });
  }

  @Get('bookings')
  @RequirePermissions(Permissions.FreightRead)
  async listBookings(@Request() req: any) {
    const clientId = await this.getClientId(req);
    return this.prisma.getTenantDb().freightBooking.findMany({
      where: { clientId },
      include: {
        shipments: { include: { container: true, legs: { orderBy: { sequence: 'asc' } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('shipments')
  @RequirePermissions(Permissions.FreightRead)
  async listShipments(@Request() req: any) {
    const clientId = await this.getClientId(req);
    return this.prisma.getTenantDb().freightShipment.findMany({
      where: { clientId },
      include: {
        booking: { select: { id: true, bookingNo: true, mblNo: true, hblNo: true, serviceMode: true } },
        container: true,
        legs: { orderBy: { sequence: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('shipments/:id')
  @RequirePermissions(Permissions.FreightRead)
  async getShipment(@Param('id') id: string, @Request() req: any) {
    const clientId = await this.getClientId(req);
    const s = await this.prisma.getTenantDb().freightShipment.findFirst({
      where: { id, clientId },
      include: {
        booking: true,
        container: true,
        legs: { orderBy: { sequence: 'asc' } },
        tradeDocs: true,
      },
    });
    if (!s) throw new NotFoundException('FreightShipment not found');
    return s;
  }

  @Get('documents')
  @RequirePermissions(Permissions.TradeRead)
  async listDocs(@Request() req: any) {
    const clientId = await this.getClientId(req);
    return this.prisma.getTenantDb().tradeDocument.findMany({
      where: { clientId },
      include: { booking: { select: { id: true, bookingNo: true } }, versions: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('documents')
  @RequirePermissions(Permissions.FreightManage)
  async uploadDoc(@Request() req: any, @Body() body: any) {
    const clientId = await this.getClientId(req);
    if (!body?.docType || !body?.docNumber || !body?.fileName) {
      throw new BadRequestException('docType, docNumber, and fileName are required');
    }
    const safeName = String(body.fileName).split(/[\\/]/).pop() || 'doc.pdf';
    return this.prisma.getTenantDb().tradeDocument.create({
      data: {
        bookingId: body.bookingId || null,
        shipmentId: body.shipmentId || null,
        clientId,
        docType: String(body.docType),
        docNumber: String(body.docNumber).trim(),
        fileName: safeName.replace(/[^a-zA-Z0-9._-]/g, '_'),
        mimeType: body.mimeType || 'application/pdf',
        status: body.extractedJson ? 'EXTRACTED' : 'UPLOADED',
        extractionStatus: body.extractedJson ? 'SUCCEEDED' : 'PENDING',
        extractedJson: body.extractedJson ?? undefined,
      },
    });
  }

  @Get('invoices')
  @RequirePermissions(Permissions.PricingRead)
  async listInvoices(@Request() req: any) {
    const clientId = await this.getClientId(req);
    return this.prisma.getTenantDb().freightInvoice.findMany({
      where: { clientId },
      include: { ledgerEntries: true, allocations: true, disputes: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('disputes')
  @RequirePermissions(Permissions.FreightRead)
  async listDisputes(@Request() req: any) {
    const clientId = await this.getClientId(req);
    return this.prisma.getTenantDb().disputeCase.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('disputes')
  @RequirePermissions(Permissions.FreightManage)
  async createDispute(@Request() req: any, @Body() body: any) {
    const clientId = await this.getClientId(req);
    const claimedAmount = Number(body?.claimedAmount);
    if (!body?.reason || !Number.isFinite(claimedAmount) || claimedAmount <= 0) {
      throw new BadRequestException('reason and positive claimedAmount are required');
    }
    const disputeCode = `DSP-C-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    return this.prisma.getTenantDb().disputeCase.create({
      data: {
        disputeCode,
        clientId,
        invoiceId: body.invoiceId || null,
        shipmentId: body.shipmentId || null,
        category: body.category || 'DEM_DET',
        claimedAmount,
        reason: String(body.reason).trim(),
        status: 'OPEN',
      },
    });
  }

  @Get('tracking-grants')
  @RequirePermissions(Permissions.PublicTrackingGrantManage)
  async listGrants(@Request() req: any) {
    const createdBy = req.user?.sub || req.user?.email;
    return this.prisma.getTenantDb().publicTrackingGrant.findMany({
      where: createdBy ? { createdBy } : {},
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        trackingCode: true,
        orderId: true,
        shipmentId: true,
        allowedPrecision: true,
        expiresAt: true,
        revokedAt: true,
        accessCount: true,
        lastAccessedAt: true,
        createdAt: true,
      },
    });
  }

  @Post('tracking-grants')
  @RequirePermissions(Permissions.PublicTrackingGrantManage)
  async createGrant(@Request() req: any, @Body() body: any) {
    const trackingCode = String(body?.trackingCode || '').trim();
    if (!trackingCode) throw new BadRequestException('trackingCode is required');

    const precision = ['FULL', 'CITY_WARD', 'STATUS_ONLY'].includes(body?.allowedPrecision)
      ? body.allowedPrecision
      : 'CITY_WARD';
    const ttlHours = Math.min(Math.max(1, Number(body?.ttlHours || 72)), 720);
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    const rawToken = `slg_trk_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const grant = await this.prisma.getTenantDb().publicTrackingGrant.create({
      data: {
        trackingCode,
        orderId: body?.orderId || null,
        shipmentId: body?.shipmentId || null,
        tokenHash,
        allowedPrecision: precision,
        expiresAt,
        createdBy: req.user?.sub || req.user?.email || null,
      },
    });

    await this.outbox.enqueue({
      channel: 'KAFKA',
      topic: 'tracking.grant.created',
      aggregateId: grant.id,
      payload: {
        grantId: grant.id,
        trackingCode,
        allowedPrecision: precision,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      grant: {
        id: grant.id,
        trackingCode: grant.trackingCode,
        allowedPrecision: grant.allowedPrecision,
        expiresAt: grant.expiresAt,
      },
      shareToken: rawToken,
    };
  }

  @Post('tracking-grants/:id/revoke')
  @RequirePermissions(Permissions.PublicTrackingGrantManage)
  async revokeGrant(@Param('id') id: string, @Request() req: any) {
    const grant = await this.prisma.getTenantDb().publicTrackingGrant.findUnique({ where: { id } });
    if (!grant) throw new NotFoundException('Tracking grant not found');
    return this.prisma.getTenantDb().publicTrackingGrant.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }
}
