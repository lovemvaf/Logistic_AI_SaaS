import { Injectable, NestMiddleware, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { jwtSecret } from 'shared-types';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request | any, res: Response, next: NextFunction) {
    const headerTenantId = req.headers['x-tenant-id'] as string | undefined;
    const tokenTenantId = this.tenantIdFromBearer(req.headers.authorization);

    // The edge sets `x-tenant-id` from the verified session. If a caller sends
    // a different value than the one inside their own token, reject instead of
    // silently switching tenants.
    if (tokenTenantId && headerTenantId && tokenTenantId !== headerTenantId) {
      return next(new ForbiddenException('Tenant header does not match the authenticated session'));
    }

    const tenantId = tokenTenantId || headerTenantId;

    if (!tenantId) {
      return next();
    }

    // SQLite mode: skip tenant validation
    if (PrismaService.isSqlite) {
      req.tenantId = tenantId;
      req.schemaName = 'public';
      return next();
    }

    try {
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: tenantId },
      });

      if (!tenant) {
        throw new UnauthorizedException('Tenant not found');
      }

      if (tenant.status !== 'ACTIVE') {
        throw new ForbiddenException('Tenant suspended');
      }

      req.tenantId = tenant.id;
      req.schemaName = tenant.dbSchemaName;

      // The request-scoped transaction is opened by TenantSchemaInterceptor,
      // after guards have resolved req.user. Do not open it here: next() only
      // schedules the handler, so the transaction would commit too early.
      return next();
    } catch (error) {
      next(error);
    }
  }

  private tenantIdFromBearer(authorization?: string): string | null {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return null;
    }
    try {
      const decoded: any = jwt.verify(authorization.slice(7), jwtSecret());
      return decoded?.tenant_id || null;
    } catch {
      return null;
    }
  }
}
