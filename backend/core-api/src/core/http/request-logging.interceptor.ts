import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, originalUrl, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const requestId = request.get('x-request-id') || this.generateRequestId();
    const startTime = Date.now();

    response.setHeader('X-Request-Id', requestId);

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        const userId = (request as any).user?.sub || '-';
        this.logger.log(
          `${method} ${originalUrl} ${response.statusCode} ${duration}ms ${userId} ${ip} ${userAgent}`
        );
      })
    );
  }

  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
