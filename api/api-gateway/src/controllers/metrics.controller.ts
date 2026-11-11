import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

@ApiTags('Metrics')
@Controller('gateway/metrics')
export class MetricsController {
  private readonly startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;

  @Get()
  getMetrics(@Req() req: Request) {
    this.requestCount++;
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);

    const lines: string[] = [
      '# HELP smartlogi_gateway_uptime_seconds Gateway uptime',
      '# TYPE smartlogi_gateway_uptime_seconds gauge',
      `smartlogi_gateway_uptime_seconds ${uptimeSeconds}`,
      '',
      '# HELP smartlogi_gateway_requests_total Total requests processed',
      '# TYPE smartlogi_gateway_requests_total counter',
      `smartlogi_gateway_requests_total ${this.requestCount}`,
      '',
      '# HELP smartlogi_gateway_errors_total Total errors encountered',
      '# TYPE smartlogi_gateway_errors_total counter',
      `smartlogi_gateway_errors_total ${this.errorCount}`,
      '',
      '# HELP smartlogi_gateway_info Gateway info',
      '# TYPE smartlogi_gateway_info gauge',
      'smartlogi_gateway_info{version="1.0",service="api-gateway"} 1',
    ];

    return lines.join('\n');
  }

  incrementError() {
    this.errorCount++;
  }
}
