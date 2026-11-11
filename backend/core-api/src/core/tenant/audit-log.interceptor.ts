import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, defer, from, lastValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

const SENSITIVE_FIELDS = ['password', 'passwordHash', 'token', 'secret', 'apiKey', 'secretToken', 'accessToken', 'refreshToken'];

function filterSensitiveData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  
  const filtered = { ...data };
  for (const key of Object.keys(filtered)) {
    if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      filtered[key] = '[REDACTED]';
    } else if (typeof filtered[key] === 'object' && filtered[key] !== null) {
      filtered[key] = filterSensitiveData(filtered[key]);
    }
  }
  return filtered;
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditLogInterceptor');

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
    
    if (request.method === 'GET' || request.method === 'OPTIONS') {
      return next.handle();
    }

    const { method, originalUrl, ip } = request;
    const user = request.user;
    const tenantId: string | null = user?.tenant_id || request.tenantId || null;
    const actorId = user?.sub || user?.id || 'anonymous';
    const actorEmail = user?.email || 'unknown@example.com';
    
    let action = 'UNKNOWN';
    if (method === 'POST') action = 'CREATE';
    if (method === 'PUT' || method === 'PATCH') action = 'UPDATE';
    if (method === 'DELETE') action = 'DELETE';
    if (originalUrl.includes('/login')) action = 'LOGIN';

    const resourceType = originalUrl.split('/')[3]?.toUpperCase() || 'SYSTEM';
    const prisma = this.prisma;

    return next.handle().pipe(
      tap(() => {
        prisma.systemAuditLog.create({
          data: {
            tenantId,
            actorId,
            actorEmail,
            action,
            resourceType,
            resourceId: 'SUCCESS',
            ipAddress: ip || 'unknown',
            newValues: JSON.stringify({ body: filterSensitiveData(request.body), query: request.query }),
          },
        }).catch(() => {});
      }),
      catchError((error) => {
        prisma.systemAuditLog.create({
          data: {
            tenantId,
            actorId,
            actorEmail,
            action,
            resourceType,
            resourceId: 'FAILED',
            ipAddress: ip || 'unknown',
            newValues: JSON.stringify({ error: error.message, status: error.status }),
          },
        }).catch(() => {});
        return throwError(() => error);
      }),
    );
  }
}

@Injectable()
export class TenantSchemaInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user || {};
    const tenantId: string | undefined = user.sub
      ? (user.tenant_id || (user.role === 'SUPER_ADMIN' ? request.tenantId : undefined))
      : request.tenantId;
    const schemaName: string | undefined =
      user.schemaName || user.schema_name || request.schemaName;

    // Platform/super-admin requests have no tenant context.
    if (!tenantId && (!schemaName || schemaName === 'public')) {
      return next.handle();
    }

    return defer(() =>
      from(
        this.prisma.runWithTenantRequest(tenantId, schemaName, () =>
          lastValueFrom(next.handle(), { defaultValue: undefined }),
        ),
      ),
    );
  }
}
