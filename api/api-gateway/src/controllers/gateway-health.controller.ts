import { Controller, Get } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { SERVICES } from '../config/services.config';
import { lastValueFrom } from 'rxjs';
import { ApiTags } from '@nestjs/swagger';

/**
 * Aggregated health endpoint for the API Gateway.
 * Calls the health endpoint of each registered downstream service
 * and returns a consolidated status.
 */
@ApiTags('Gateway Health')
@Controller('gateway/health')
export class GatewayHealthController {
  constructor(private readonly httpService: HttpService) {}

  @Get()
  async getHealth() {
    const results = await Promise.all(
      SERVICES.map(async (service) => {
        const url = `${service.url}${service.healthPath}`;
        try {
          const resp = await lastValueFrom(this.httpService.get(url));
          return { name: service.name, status: resp.data?.status || 'unknown', ok: true };
        } catch (err) {
          return { name: service.name, status: 'unreachable', ok: false };
        }
      }),
    );
    const overall = results.every((r) => r.ok) ? 'ok' : 'degraded';
    return { status: overall, services: results };
  }
}
