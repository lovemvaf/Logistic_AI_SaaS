import { Controller, Get, Post, Patch, Body, UseGuards, Query, Param, NotFoundException, BadRequestException, InternalServerErrorException, Logger } from "@nestjs/common";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { ExcludeRoles, PermissionsGuard, RequirePermissions, Permissions, Roles } from "shared-types";
import { LogisticsService } from "../services/logistics.service";
import { ApiTags } from "@nestjs/swagger";

@ApiTags('AI Management')
@Controller("logistics/ai")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class AiManagementController {
  private readonly logger = new Logger(AiManagementController.name);

  constructor(private readonly logisticsService: LogisticsService) {}

  @Get("models")
  @RequirePermissions(Permissions.InventoryRead)
  async listModels(@Query("type") type: string) {
    return this.logisticsService.listAiModels(type)
  }

  @Post("models")
  @RequirePermissions(Permissions.InventoryAdjust)
  async createModel(@Body() body: { name: string; version: string; type: string; accuracy?: number; modelPath: string; metadata?: string }) {
    if (!body.name || !body.version || !body.type || !body.modelPath) {
      throw new BadRequestException("Missing required fields: name, version, type, modelPath");
    }
    try {
      return this.logisticsService.createAiModel(body);
    } catch (error: any) {
      this.logger.error(`Failed to create AI model: ${error.message}`);
      throw new InternalServerErrorException("Failed to create AI model");
    }
  }

  @Patch("models/:id")
  @RequirePermissions(Permissions.InventoryAdjust)
  async updateModel(@Param("id") id: string, @Body() body: { name?: string; version?: string; accuracy?: number; isCurrent?: boolean; metadata?: string }) {
    try {
      return this.logisticsService.updateAiModel(id, body);
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`AI model with ID ${id} not found`);
      }
      throw new InternalServerErrorException("Failed to update AI model");
    }
  }

  @Post("feedback")
  @RequirePermissions(Permissions.InventoryAdjust)
  async submitFeedback(@Body() body: any) {
    return this.logisticsService.createAiFeedback(body)
  }

  @Get("feedbacks")
  @RequirePermissions(Permissions.InventoryRead)
  async listFeedbacks(@Query("modelId") modelId: string, @Query("isUsed") isUsed: string) {
    return this.logisticsService.getAiFeedbacks({
      modelId,
      isUsedForTrain: isUsed === "true"
    })
  }

  @Patch("feedback/:id/used")
  @RequirePermissions(Permissions.InventoryAdjust)
  async markAsUsed(@Param("id") id: string) {
    return this.logisticsService.markFeedbackAsUsed(id)
  }
}
