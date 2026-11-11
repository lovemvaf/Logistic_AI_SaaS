import { Controller, Get } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger"
import { SkipThrottle } from "@nestjs/throttler"

@ApiTags('health')
// Skip every named throttler (default + auth); otherwise the container
// healthcheck gets throttled by the stricter "auth" limiter.
@SkipThrottle({ default: true, auth: true })
@Controller("health")
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  health() {
    return {
      status: "ok",
      service: "core-api",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: process.memoryUsage().rss,
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
      },
    }
  }

  @Get("ready")
  @ApiOperation({ summary: 'Readiness check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  ready() {
    return { status: "ready", service: "core-api" }
  }
}
