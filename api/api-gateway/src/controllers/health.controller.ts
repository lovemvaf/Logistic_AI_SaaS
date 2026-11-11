import { Controller, Get } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"

@ApiTags('Health')
@Controller("health")
export class HealthController {
  @Get()
  health() {
    return { status: "ok", service: "api-gateway" }
  }
}
