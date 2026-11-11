import { Controller, Get, Header } from "@nestjs/common"
import { ApiTags } from '@nestjs/swagger'

@ApiTags('Metrics')
@Controller("metrics")
export class MetricsController {
  private requestCount = 0
  private errorCount = 0
  private startTime = Date.now()

  @Get()
  @Header('Content-Type', 'text/plain')
  metrics() {
    const uptime = (Date.now() - this.startTime) / 1000
    const memUsage = process.memoryUsage()

    return `
# HELP smartlogi_uptime_seconds Uptime in seconds
# TYPE smartlogi_uptime_seconds gauge
smartlogi_uptime_seconds ${uptime}

# HELP smartlogi_memory_rss_bytes Resident Set Size in bytes
# TYPE smartlogi_memory_rss_bytes gauge
smartlogi_memory_rss_bytes ${memUsage.rss}

# HELP smartlogi_memory_heap_used_bytes Heap used in bytes
# TYPE smartlogi_memory_heap_used_bytes gauge
smartlogi_memory_heap_used_bytes ${memUsage.heapUsed}

# HELP smartlogi_memory_heap_total_bytes Heap total in bytes
# TYPE smartlogi_memory_heap_total_bytes gauge
smartlogi_memory_heap_total_bytes ${memUsage.heapTotal}

# HELP smartlogi_requests_total Total number of requests
# TYPE smartlogi_requests_total counter
smartlogi_requests_total ${this.requestCount}

# HELP smartlogi_errors_total Total number of errors
# TYPE smartlogi_errors_total counter
smartlogi_errors_total ${this.errorCount}
`.trim()
  }

  incrementRequests() {
    this.requestCount++
  }

  incrementErrors() {
    this.errorCount++
  }
}
