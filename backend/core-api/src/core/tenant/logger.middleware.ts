import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const { ip, method, originalUrl } = request;
    const userAgent = request.get('user-agent') || '';
    const start = Date.now();

    response.on('finish', () => {
      const { statusCode } = response;
      const duration = Date.now() - start;
      
      if (statusCode >= 400) {
        this.logger.error(`${method} ${originalUrl} ${statusCode} ${duration}ms - ${userAgent} ${ip}`);
      } else {
        this.logger.log(`${method} ${originalUrl} ${statusCode} ${duration}ms - ${userAgent} ${ip}`);
      }
    });

    next();
  }
}
