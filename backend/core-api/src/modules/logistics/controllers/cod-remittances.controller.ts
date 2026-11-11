import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  Query,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
  HttpException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { ApiTags } from "@nestjs/swagger";

@ApiTags('COD Remittances')
@Controller("finance/cod")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT, Roles.DRIVER)
export class CodRemittancesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.TripsRead)
  async listRemittances(
    @Query('driverId') driverId?: string,
    @Query('status') status?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20
  ) {
    try {
      const safePage = Math.max(1, Number(page) || 1);
      const take = Math.min(Math.max(1, Number(limit) || 20), 100);
      const skip = (safePage - 1) * take;

      const where: any = {};
      if (driverId) where.driverId = driverId;
      if (status) where.status = status;

      const [data, total] = await Promise.all([
        this.prisma.getTenantDb().codRemittance.findMany({
          where,
          skip,
          take,
          include: {
            driver: {
              include: {
                user: {
                  select: { id: true, fullName: true, email: true }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        this.prisma.getTenantDb().codRemittance.count({ where })
      ]);

      return {
        data,
        meta: {
          total,
          page: safePage,
          limit: take,
          totalPages: Math.max(1, Math.ceil(total / take))
        }
      };
    } catch {
      throw new InternalServerErrorException("Failed to fetch COD remittances");
    }
  }

  @Get(":id")
  @RequirePermissions(Permissions.TripsRead)
  async getRemittance(@Param("id") id: string) {
    try {
      const remittance = await this.prisma.getTenantDb().codRemittance.findUnique({
        where: { id },
        include: {
          driver: {
            include: {
              user: {
                select: { id: true, fullName: true, email: true }
              }
            }
          }
        }
      });
      if (!remittance) throw new NotFoundException(`Remittance with ID ${id} not found`);
      return remittance;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to fetch COD remittance");
    }
  }

  @Patch(":id/approve")
  @RequirePermissions(Permissions.TripsDispatch)
  async approveRemittance(@Param("id") id: string) {
    try {
      const db = this.prisma.getTenantDb();
      const remittance = await db.codRemittance.findUnique({ where: { id } });
      if (!remittance) throw new NotFoundException(`Remittance with ID ${id} not found`);
      if (remittance.status !== 'PENDING') {
        throw new BadRequestException(`Cannot approve remittance in status ${remittance.status}`);
      }

      const claimed = await db.codRemittance.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'APPROVED' },
      });
      if (claimed.count === 0) {
        throw new BadRequestException(`Remittance ${id} is no longer PENDING`);
      }

      return await db.codRemittance.findUnique({ where: { id } });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to approve remittance");
    }
  }

  @Patch(":id/reject")
  @RequirePermissions(Permissions.TripsDispatch)
  async rejectRemittance(@Param("id") id: string) {
    try {
      const db = this.prisma.getTenantDb();
      const remittance = await db.codRemittance.findUnique({ where: { id } });
      if (!remittance) throw new NotFoundException(`Remittance with ID ${id} not found`);
      if (remittance.status !== 'PENDING') {
        throw new BadRequestException(`Cannot reject remittance in status ${remittance.status}`);
      }

      const claimed = await db.codRemittance.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'REJECTED' },
      });
      if (claimed.count === 0) {
        throw new BadRequestException(`Remittance ${id} is no longer PENDING`);
      }

      return await db.codRemittance.findUnique({ where: { id } });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to reject remittance");
    }
  }
}
