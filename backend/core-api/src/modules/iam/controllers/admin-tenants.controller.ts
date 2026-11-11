import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, InternalServerErrorException, NotFoundException, BadRequestException, Logger } from "@nestjs/common"
import { SchemaProvisioner } from '../../../core/provisioner/schema-provisioner';
import { TenantCreateDto } from "../dtos/tenant-create.dto"
import { UpdateTenantDto } from "../dtos/tenant-update.dto"
import { Permissions, PermissionsGuard, RequirePermissions, RequireRoles, Roles } from "../../../core/types/shared-types"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { PrismaService } from "../../../core/prisma/prisma.service"
import { DEFAULT_ROLES, ROLE_PERMISSION_MAP, permissionRows } from "../scripts/default-roles"
import * as bcrypt from "bcrypt"
import { ApiTags } from '@nestjs/swagger'

@ApiTags('Admin Tenants')
@Controller("admin/tenants")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireRoles(Roles.SUPER_ADMIN)
export class AdminTenantsController {
  private readonly logger = new Logger('AdminTenantsController');

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.TenantsManage)
  async list(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('sort') sort: string = 'createdAt',
    @Query('order') order: 'asc' | 'desc' = 'desc',
  ) {
    try {
      const safePage = Math.max(1, Number(page || 1));
      const safeLimit = Math.min(100, Math.max(1, Number(limit || 20)));
      const skip = (safePage - 1) * safeLimit;
      const take = safeLimit;

      // Validate sort field to prevent injection
      const allowedSortFields = ['createdAt', 'name', 'status', 'slug'];
      const safeSort = allowedSortFields.includes(sort) ? sort : 'createdAt';
      const safeOrder = order === 'asc' ? 'asc' : 'desc';

      const [data, total] = await Promise.all([
        this.prisma.tenant.findMany({
          skip,
          take,
          orderBy: { [safeSort]: safeOrder },
          include: { plan: true },
        }),
        this.prisma.tenant.count(),
      ]);

      return {
        data,
        meta: {
          total,
          page: safePage,
          limit: take,
          totalPages: Math.max(1, Math.ceil(total / take)),
        },
      };
    } catch (error) {
      throw new InternalServerErrorException("Failed to fetch tenants");
    }
  }

  @Get(":id")
  @RequirePermissions(Permissions.TenantsManage)
  async detail(@Param("id") id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id }, include: { plan: true } });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    // Usage figures live in the tenant schema, so they are best-effort: a
    // provisioning problem must not make the tenant profile unreadable.
    let usersCount = 0;
    let ordersMonthly = 0;
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      await this.prisma.runWithSchema(tenant.dbSchemaName, async () => {
        const db = this.prisma.getTenantDb();
        const [users, orders] = await Promise.all([
          db.tenantUser.count().catch(() => 0),
          db.order.count({ where: { createdAt: { gte: startOfMonth } } }).catch(() => 0),
        ]);
        usersCount = users;
        ordersMonthly = orders;
      });
    } catch (error: any) {
      this.logger.warn(`Could not read usage for tenant ${id}: ${error.message}`);
    }

    return {
      ...tenant,
      plan: tenant.plan?.name ?? 'Free',
      planDetails: tenant.plan,
      usersCount,
      ordersMonthly,
      domain: `${tenant.slug}.${process.env.TENANT_BASE_DOMAIN || 'smartlogi.vn'}`,
    };
  }

  @Post()
  @RequirePermissions(Permissions.TenantsManage)
  async create(@Body() body: TenantCreateDto & { adminEmail?: string, adminPassword?: string }) {
    const dbSchemaName = `tenant_${body.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36)}`;
    
    let ddlStatements: string[] = [];
    try {
      ddlStatements = await SchemaProvisioner.getProvisioningSql(dbSchemaName);
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }

    return await this.prisma.$transaction(async (tx) => {
      // 1. Táº¡o Tenant record trong public
      const tenant = await tx.tenant.create({
        data: {
          name: body.name,
          slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          dbSchemaName,
          status: "ACTIVE",
          planId: body.planId,
        }
      });

      try {
        // 2. Táº¡o PostgreSQL Schema
        await tx.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${dbSchemaName}"`);

        // 3. Chuyển transaction sang schema của tenant TRƯỚC khi chạy DDL.
        // Các câu lệnh tạo bảng lấy từ schema.prisma không qualify tên bảng,
        // nên search_path quyết định chúng được tạo ở schema nào.
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${dbSchemaName}", public`);

        // 4. Gắn tenant context: `app.tenant_id` là điều kiện của policy
        // row-level-security và là giá trị mặc định của cột `tenant_id`.
        await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, tenant.id);

        // 5. Chạy toàn bộ DDL (tự động extract từ schema.prisma)
        for (const statement of ddlStatements) {
          await tx.$executeRawUnsafe(statement);
        }

        // 6. Seed đầy đủ role + permission mặc định. Nếu thiếu bước này,
        // TENANT_ADMIN đăng nhập được nhưng mọi endpoint có guard đều 403.
        const roleIds: Record<string, string> = {};
        for (const roleName of DEFAULT_ROLES) {
          const role = await tx.customRole.create({
            data: { name: roleName, isSystemDefault: true },
          });
          roleIds[roleName] = role.id;

          const permissions = ROLE_PERMISSION_MAP[roleName] || [];
          if (permissions.length > 0) {
            await tx.rolePermission.createMany({
              data: permissionRows(role.id, permissions),
              skipDuplicates: true,
            });
          }
        }

        // 7. Seed Admin đầu tiên cho Tenant
        if (body.adminEmail && body.adminPassword) {
          // Validate password length
          if (body.adminPassword.length < 8) {
            throw new BadRequestException("Password must be at least 8 characters long");
          }
          const passwordHash = await bcrypt.hash(body.adminPassword, 10);

          const userResult = await tx.tenantUser.create({
            data: {
              email: body.adminEmail,
              passwordHash,
              fullName: `Admin ${body.name}`,
              status: 'ACTIVE',
            }
          });
          const userId = userResult.id;

          // Gán role TENANT_ADMIN đã seed ở bước 5
          await tx.userRole.create({
            data: {
              userId,
              roleId: roleIds.TENANT_ADMIN,
            }
          });
        }

        return tenant;
      } catch (error) {
        this.logger.error(`Provisioning failed: ${error.message}`);
        throw new InternalServerErrorException(`Failed to provision tenant database: ${error.message}`);
      }
    }, { timeout: 120000, maxWait: 15000 });
  }

  @Patch(":id")
  @RequirePermissions(Permissions.TenantsManage)
  async update(@Param("id") id: string, @Body() body: UpdateTenantDto) {
    try {
      return await this.prisma.tenant.update({
        where: { id },
        data: body,
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Tenant with ID ${id} not found`);
      }
      throw new InternalServerErrorException(`Failed to update tenant: ${error.message}`);
    }
  }

  @Delete(":id")
  @RequirePermissions(Permissions.TenantsManage)
  async remove(@Param("id") id: string) {
    try {
      return await this.prisma.tenant.update({
        where: { id },
        data: { status: 'DELETED', deletedAt: new Date() }
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Tenant with ID ${id} not found`);
      }
      throw new InternalServerErrorException("Failed to delete tenant");
    }
  }
}
