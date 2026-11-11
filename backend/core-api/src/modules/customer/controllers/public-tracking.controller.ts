import { Controller, Get, Param, NotFoundException, UseInterceptors } from "@nestjs/common";
import { CacheInterceptor } from "@nestjs/cache-manager";
import { Throttle } from "@nestjs/throttler";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { ApiTags } from "@nestjs/swagger";

@ApiTags('Public Tracking')
@Controller("public")
@UseInterceptors(CacheInterceptor)
export class PublicTrackingController {
  constructor(private readonly prisma: PrismaService) {}

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
