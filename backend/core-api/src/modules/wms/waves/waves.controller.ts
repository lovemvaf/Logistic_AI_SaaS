import { Controller, Get, Post, Body, Param, NotFoundException, UseGuards, Request, UnauthorizedException } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types"
import { WavesService } from "./waves.service"
import { AllocationStrategy } from "wms-engine"

@ApiTags("Waves")
@Controller("waves")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class WavesController {
  constructor(private readonly wavesService: WavesService) {}

  @Post("generate")
  @RequirePermissions(Permissions.TasksCreate)
  async generateWave(
    @Body() body: { warehouseId: string, orderIds: string[], strategy?: AllocationStrategy },
    @Request() req: any,
  ) {
    const actorId = req.user?.sub;
    if (!actorId) {
      throw new UnauthorizedException("Authenticated user required");
    }
    return this.wavesService.generateWave(body.warehouseId, body.orderIds, body.strategy, actorId);
  }

  @Post("allocate")
  @RequirePermissions(Permissions.TasksCreate)
  async allocateWave(
    @Body() body: { warehouseId: string; orderIds: string[]; strategy?: AllocationStrategy },
    @Request() req: any,
  ) {
    const actorId = req.user?.sub;
    if (!actorId) {
      throw new UnauthorizedException("Authenticated user required");
    }
    return this.wavesService.generateWave(body.warehouseId, body.orderIds, body.strategy, actorId);
  }

  @Get()
  @RequirePermissions(Permissions.TasksRead)
  async listWaves() {
    return this.wavesService.listWaves();
  }

  @Get(":id")
  @RequirePermissions(Permissions.TasksRead)
  async getWave(@Param("id") id: string) {
    const waves = await this.wavesService.listWaves();
    const wave = waves.find((w: any) => w.id === id || w.waveNumber === id);
    if (!wave) throw new NotFoundException(`Wave ${id} not found`);
    return wave;
  }
}
