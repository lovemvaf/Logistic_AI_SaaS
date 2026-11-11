import { Controller, Get, Post, Patch, Param, Body, UseGuards, NotFoundException, InternalServerErrorException, Query, HttpException } from "@nestjs/common";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { ExcludeRoles, PermissionsGuard, RequirePermissions, Permissions, Roles } from "shared-types";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { ApiTags } from "@nestjs/swagger";

@ApiTags('AI Models')
@Controller("ai/models")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class AiModelsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.TripsRead)
  async listAiModels(@Query('type') type?: string) {
    try {
      return await this.prisma.getTenantDb().aiModel.findMany({
        where: type ? { type } : {},
        orderBy: { trainedAt: 'desc' }
      });
    } catch (error) {
      throw new InternalServerErrorException("Failed to fetch AI models");
    }
  }

  @Get(":id")
  @RequirePermissions(Permissions.TripsRead)
  async getAiModel(@Param("id") id: string) {
    try {
      const model = await this.prisma.getTenantDb().aiModel.findUnique({
        where: { id }
      });
      if (!model) throw new NotFoundException(`AI Model with ID ${id} not found`);
      return model;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException("Failed to fetch AI model");
    }
  }

  @Post()
  @RequirePermissions(Permissions.TripsDispatch)
  async createAiModel(@Body() body: { name: string, version: string, type: string, accuracy?: number, modelPath: string, metadata?: string }) {
    try {
      const existingCurrent = await this.prisma.getTenantDb().aiModel.findFirst({
        where: { isCurrent: true, type: body.type }
      });
      if (existingCurrent) {
        await this.prisma.getTenantDb().aiModel.update({
          where: { id: existingCurrent.id },
          data: { isCurrent: false }
        });
      }

      return await this.prisma.getTenantDb().aiModel.create({
        data: {
          name: body.name,
          version: body.version,
          type: body.type,
          accuracy: body.accuracy,
          modelPath: body.modelPath,
          metadata: body.metadata,
          isCurrent: true
        }
      });
    } catch (error) {
      throw new InternalServerErrorException("Failed to create AI model");
    }
  }

  @Patch(":id")
  @RequirePermissions(Permissions.TripsDispatch)
  async updateAiModel(@Param("id") id: string, @Body() body: { name?: string, version?: string, accuracy?: number, isCurrent?: boolean, metadata?: string }) {
    try {
      const model = await this.prisma.getTenantDb().aiModel.findUnique({ where: { id } });
      if (!model) throw new NotFoundException(`AI Model with ID ${id} not found`);

      if (body.isCurrent) {
        await this.prisma.getTenantDb().aiModel.updateMany({
          where: { type: model.type, id: { not: id } },
          data: { isCurrent: false }
        });
      }

      const allowed: Record<string, unknown> = {};
      if (body?.name !== undefined) allowed.name = String(body.name);
      if (body?.version !== undefined) allowed.version = String(body.version);
      if (body?.accuracy !== undefined) allowed.accuracy = body.accuracy;
      if (body?.isCurrent !== undefined) allowed.isCurrent = Boolean(body.isCurrent);
      if (body?.metadata !== undefined) allowed.metadata = body.metadata;

      return await this.prisma.getTenantDb().aiModel.update({
        where: { id },
        data: allowed
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to update AI model");
    }
  }
}
