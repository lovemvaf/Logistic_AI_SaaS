import { Controller, Get, Param, NotFoundException, GoneException, UseInterceptors } from "@nestjs/common";
import { CacheInterceptor } from "@nestjs/cache-manager";
import { Throttle } from "@nestjs/throttler";
import * as crypto from "crypto";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { ApiTags } from "@nestjs/swagger";

@ApiTags('Public Tracking')
@Controller("public")
@UseInterceptors(CacheInterceptor)
export class PublicTrackingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("t/:token")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async trackByGrant(@Param("token") token: string) {
    const tokenHash = crypto.createHash("sha256").update(String(token || "")).digest("hex");
    return this.prisma.runAsPlatform<any>(async (db) => {
      const grant = await db.publicTrackingGrant.findUnique({ where: { tokenHash } });
      if (!grant) {
        throw new NotFoundException("Tracking share link not found");
      }
      if (grant.revokedAt) {
        throw new GoneException("Tracking share link has been revoked");
      }
      if (new Date(grant.expiresAt).getTime() <= Date.now()) {
        throw new GoneException("Tracking share link has expired");
      }

      await db.publicTrackingGrant.update({
        where: { id: grant.id },
        data: {
          accessCount: { increment: 1 },
          lastAccessedAt: new Date(),
        },
      });

      const order = grant.orderId
        ? await db.order.findUnique({
            where: { id: grant.orderId },
            include: { events: { orderBy: { timestamp: "desc" }, take: 15 } },
          })
        : await db.order.findUnique({
            where: { trackingCode: grant.trackingCode },
            include: { events: { orderBy: { timestamp: "desc" }, take: 15 } },
          });

      if (order) {
        const delivery = await db.delivery.findFirst({
          where: { orderId: order.id },
          orderBy: { syncVersion: "desc" },
        });
        const rawLat = delivery?.checkinLat ?? order.lat ?? null;
        const rawLng = delivery?.checkinLng ?? order.lng ?? null;
        const numLat = rawLat !== null ? Number(rawLat) : null;
        const numLng = rawLng !== null ? Number(rawLng) : null;
        const coords =
          grant.allowedPrecision === "FULL"
            ? { lat: numLat, lng: numLng }
            : grant.allowedPrecision === "CITY_WARD"
              ? {
                  lat: numLat !== null ? Math.round(numLat * 100) / 100 : null,
                  lng: numLng !== null ? Math.round(numLng * 100) / 100 : null,
                }
              : { lat: null, lng: null };

        return {
          kind: "ORDER",
          trackingCode: order.trackingCode,
          status: order.status,
          precision: grant.allowedPrecision,
          expiresAt: grant.expiresAt,
          ...coords,
          eta: order.estimatedDeliveryDate ?? null,
          events: order.events || [],
        };
      }

      const shipment = grant.shipmentId
        ? await db.freightShipment.findUnique({
            where: { id: grant.shipmentId },
            include: { legs: { orderBy: { sequence: "asc" } }, container: true },
          })
        : await db.freightShipment.findUnique({
            where: { trackingCode: grant.trackingCode },
            include: { legs: { orderBy: { sequence: "asc" } }, container: true },
          });

      if (!shipment) {
        throw new NotFoundException("Tracked record no longer exists");
      }

      return {
        kind: "FREIGHT_SHIPMENT",
        trackingCode: shipment.trackingCode,
        shipmentNo: shipment.shipmentNo,
        status: shipment.status,
        containerNo: shipment.container?.containerNo ?? null,
        precision: grant.allowedPrecision,
        expiresAt: grant.expiresAt,
        legs: (shipment.legs || []).map((l: any) => ({
          sequence: l.sequence,
          legType: l.legType,
          originName: l.originName,
          destName: l.destName,
          status: l.status,
          originLat:
            grant.allowedPrecision === "FULL" && l.originLat !== null
              ? Number(l.originLat)
              : grant.allowedPrecision === "CITY_WARD" && l.originLat !== null
                ? Math.round(Number(l.originLat) * 100) / 100
                : null,
          originLng:
            grant.allowedPrecision === "FULL" && l.originLng !== null
              ? Number(l.originLng)
              : grant.allowedPrecision === "CITY_WARD" && l.originLng !== null
                ? Math.round(Number(l.originLng) * 100) / 100
                : null,
        })),
      };
    });
  }

  @Get("track/:trackingCode")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async track(@Param("trackingCode") trackingCode: string) {
    // Public tracking is a cross-tenant lookup: the visitor only knows the
    // tracking code, not the tenant. It therefore runs on the platform path
    // (row-level security lifted) instead of a tenant scope.
    const order = await this.prisma.runAsPlatform<any>((db) =>
      db.order.findUnique({
        where: { trackingCode },
        include: { events: { orderBy: { timestamp: "desc" } } }
      }),
    );

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    return {
      trackingCode: order.trackingCode,
      status: order.status,
      recipientName: order.recipientName.substring(0, 1) + "***",
      events: order.events,
    };
  }

  @Get("verify/:trackingCode")
  async verify(@Param("trackingCode") trackingCode: string) {
    const { order, delivery } = await this.prisma.runAsPlatform<any>(async (db) => {
      const found = await db.order.findUnique({
        where: { trackingCode },
      });
      if (!found) {
        return { order: null, delivery: null };
      }
      const deliveries = await db.delivery.findMany({
        where: { orderId: found.id },
        orderBy: { syncVersion: "desc" },
        take: 1
      });
      return { order: found, delivery: deliveries[0] ?? null };
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    if (!delivery) {
      return { ok: false, message: "No delivery info found" };
    }

    return {
      ok: true,
      podImageUrl: delivery.podImageUrl,
      podSignatureUrl: delivery.podSignatureUrl,
      precision: "COARSE_PUBLIC",
      checkinLat:
        typeof delivery.checkinLat === "number"
          ? Math.round(delivery.checkinLat * 100) / 100
          : null,
      checkinLng:
        typeof delivery.checkinLng === "number"
          ? Math.round(delivery.checkinLng * 100) / 100
          : null,
      status: delivery.status,
    };
  }

  @Get("track/:trackingCode/live")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async livePublic(@Param("trackingCode") trackingCode: string) {
    return buildPublicLive(this.prisma, trackingCode);
  }

  @Get("track/:trackingCode/sla")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async slaPublic(@Param("trackingCode") trackingCode: string) {
    return buildPublicSla(this.prisma, trackingCode);
  }
}

async function buildPublicLive(prisma: PrismaService, trackingCode: string) {
  const { order, delivery } = await prisma.runAsPlatform<any>(async (db) => {
    const found = await db.order.findUnique({
      where: { trackingCode },
      include: { events: { orderBy: { timestamp: "desc" }, take: 10 } },
    });
    if (!found) return { order: null, delivery: null };
    const deliveries = await db.delivery.findMany({
      where: { orderId: found.id },
      orderBy: { syncVersion: "desc" },
      take: 1,
    });
    return { order: found, delivery: deliveries[0] ?? null };
  });

  if (!order) throw new NotFoundException("Order not found");
  const rawLat = delivery?.checkinLat ?? order.lat ?? null;
  const rawLng = delivery?.checkinLng ?? order.lng ?? null;
  // Unauthenticated public live endpoint coarse-rounds GPS to ~1.1km (2 decimals);
  // full precision requires an authenticated client session or scoped PublicTrackingGrant.
  const coarseLat = typeof rawLat === "number" ? Math.round(rawLat * 100) / 100 : null;
  const coarseLng = typeof rawLng === "number" ? Math.round(rawLng * 100) / 100 : null;
  return {
    trackingCode: order.trackingCode,
    status: order.status,
    precision: "COARSE_PUBLIC",
    lat: coarseLat,
    lng: coarseLng,
    eta: order.estimatedDeliveryDate ?? null,
    actualDeliveryTime: order.actualDeliveryTime ?? null,
    events: order.events || [],
  };
}

async function buildPublicSla(prisma: PrismaService, trackingCode: string) {
  const order = await prisma.runAsPlatform<any>((db) =>
    db.order.findUnique({ where: { trackingCode } }),
  );
  if (!order) throw new NotFoundException("Order not found");
  const deadline = order.estimatedDeliveryDate
    ? new Date(order.estimatedDeliveryDate)
    : new Date(new Date(order.createdAt).getTime() + 48 * 3600 * 1000);
  const completedAt = order.actualDeliveryTime ? new Date(order.actualDeliveryTime) : new Date();
  const remainingMinutes = Math.round((deadline.getTime() - completedAt.getTime()) / 60000);
  return {
    trackingCode: order.trackingCode,
    status: order.status,
    promisedAt: deadline.toISOString(),
    deliveredAt: order.actualDeliveryTime ?? null,
    onTrack: remainingMinutes >= 0,
    remainingMinutes,
  };
}

@Controller("track")
@UseInterceptors(CacheInterceptor)
export class TrackingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":trackingCode/live")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async live(@Param("trackingCode") trackingCode: string) {
    return buildPublicLive(this.prisma, trackingCode);
  }

  @Get(":trackingCode/sla")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async sla(@Param("trackingCode") trackingCode: string) {
    return buildPublicSla(this.prisma, trackingCode);
  }

  @Get(":trackingCode")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async track(@Param("trackingCode") trackingCode: string) {
    const order = await this.prisma.runAsPlatform<any>((db) =>
      db.order.findUnique({
        where: { trackingCode },
        include: { events: { orderBy: { timestamp: "desc" } } }
      }),
    );

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    return {
      trackingCode: order.trackingCode,
      status: order.status,
      recipientName: order.recipientName.substring(0, 1) + "***",
      events: order.events,
    };
  }
}
