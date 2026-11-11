import { Controller, Get, Post, Patch, Param, Body, UseGuards, Request, InternalServerErrorException, NotFoundException, BadRequestException, HttpException } from "@nestjs/common";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("Clients")
@Controller("clients")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class ClientsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @RequirePermissions(Permissions.ClientsManage)
  async createClient(@Body() body: { name: string }) {
    try {
      return await this.prisma.getTenantDb().client.create({ data: { name: body.name } });
    } catch (error) {
      throw new InternalServerErrorException("Failed to create client");
    }
  }

  @Post(":id/users")
  @RequirePermissions(Permissions.ClientsManage)
  async createClientUser(@Param("id") id: string, @Body() body: { email: string, fullName: string }) {
    try {
      return await this.prisma.getTenantDb().clientUser.create({
        data: {
          clientId: id,
          email: body.email,
          fullName: body.fullName,
        },
      });
    } catch (error) {
      throw new InternalServerErrorException("Failed to create client user");
    }
  }

  @Get()
  @RequirePermissions(Permissions.ClientsManage)
  async listClients() {
    try {
      return await this.prisma.getTenantDb().client.findMany({ include: { users: true } });
    } catch (error) {
      throw new InternalServerErrorException("Failed to fetch clients");
    }
  }

  @Get(":id")
  @RequirePermissions(Permissions.ClientsManage)
  async getClient(@Param("id") id: string) {
    const client = await this.prisma.getTenantDb().client.findUnique({
      where: { id },
      include: { users: true },
    });
    if (!client) throw new NotFoundException(`Client ${id} not found`);
    return client;
  }

  @Patch(":id")
  @RequirePermissions(Permissions.ClientsManage)
  async updateClient(@Param("id") id: string, @Body() body: { name?: string; status?: string }) {
    try {
      const existing = await this.prisma.getTenantDb().client.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`Client ${id} not found`);
      return await this.prisma.getTenantDb().client.update({
        where: { id },
        data: {
          ...(body?.name !== undefined ? { name: String(body.name) } : {}),
          ...(body?.status !== undefined ? { status: String(body.status) } : {}),
        },
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to update client");
    }
  }

  @Patch(":id/credit")
  @RequirePermissions(Permissions.ClientsManage)
  async updateClientCredit(
    @Param("id") id: string,
    @Body() body: { amount: number },
    @Request() req: any,
  ) {
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException("Credit limit amount must be a finite non-negative number");
    }
    const db = this.prisma.getTenantDb();
    const client = await db.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException(`Client ${id} not found`);

    const tenantId = req.tenantId ?? req.user?.tenant_id ?? client.tenantId;
    const key = `client_credit_limit:${id}`;
    await this.prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key } },
      update: { value: String(amount), description: `Credit limit for client ${client.name}` },
      create: { tenantId, key, value: String(amount), description: `Credit limit for client ${client.name}` },
    });

    return { ok: true, id: client.id, name: client.name, creditLimit: amount };
  }
}
