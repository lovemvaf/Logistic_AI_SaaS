import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors, NotFoundException, BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import { IsString, IsNumber, IsOptional, Min } from "class-validator";
import * as ExcelJS from "exceljs";
import { Readable } from "stream";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types";
import { PrismaService } from "../../../core/prisma/prisma.service";

class CreateProductDto {
  @IsString()
  sku!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  volumeCbm?: number;
}

@ApiTags("Products")
@Controller("products")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class ProductsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.InventoryRead)
  async list(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('search') search?: string,
  ) {
    try {
      const safePage = Math.max(1, Number(page || 1));
      const take = Math.min(100, Math.max(1, Number(limit || 20)));
      const skip = (safePage - 1) * take;

      const where: any = { deletedAt: null };
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' as const } },
          { sku: { contains: search, mode: 'insensitive' as const } },
        ];
      }

      const [data, total] = await Promise.all([
        this.prisma.getTenantDb().product.findMany({
          where,
          skip,
          take,
          orderBy: { name: 'asc' },
        }),
        this.prisma.getTenantDb().product.count({ where }),
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
      throw new InternalServerErrorException("Failed to fetch products");
    }
  }

  @Get(":id")
  @RequirePermissions(Permissions.InventoryRead)
  async detail(@Param("id") id: string) {
    try {
      const product = await this.prisma.getTenantDb().product.findUnique({ where: { id } });
      if (!product) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }
      return product;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException("Failed to fetch product");
    }
  }

  @Post()
  @RequirePermissions(Permissions.InventoryAdjust)
  async create(@Body() body: CreateProductDto) {
    try {
      return await this.prisma.getTenantDb().product.create({ data: body });
    } catch (error) {
      throw new BadRequestException("Failed to create product");
    }
  }

  @Post("import")
  @RequirePermissions(Permissions.InventoryAdjust)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async importExcel(@UploadedFile() file: any) {
    if (!file?.buffer) {
      throw new BadRequestException('No file uploaded');
    }

    const workbook = new ExcelJS.Workbook();
    const isCsv =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/csv' ||
      /\.csv$/i.test(file.originalname || '');

    try {
      if (isCsv) {
        await workbook.csv.read(Readable.from(file.buffer));
      } else {
        await workbook.xlsx.load(file.buffer);
      }
    } catch {
      throw new BadRequestException('Could not read the uploaded file. Use a valid .xlsx or .csv file.');
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('The uploaded file has no worksheet');
    }

    // Map header labels (case/space-insensitive) to canonical field names.
    const headerMap = new Map<number, string>();
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      const label = String(cell.text || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
      const canonical: Record<string, string> = {
        sku: 'sku',
        productcode: 'sku',
        code: 'sku',
        name: 'name',
        productname: 'name',
        barcode: 'barcode',
        weight: 'weightKg',
        weightkg: 'weightKg',
        volume: 'volumeCbm',
        volumecbm: 'volumeCbm',
        description: 'description',
      };
      if (canonical[label]) headerMap.set(colNumber, canonical[label]);
    });

    if (![...headerMap.values()].includes('sku') || ![...headerMap.values()].includes('name')) {
      throw new BadRequestException('The file must include at least the SKU and Name columns.');
    }

    const db = this.prisma.getTenantDb();
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const values: Record<string, string> = {};
      headerMap.forEach((field, colNumber) => {
        values[field] = String(row.getCell(colNumber).text || '').trim();
      });

      if (!values.sku && !values.name) {
        skipped++;
        continue;
      }
      if (!values.sku || !values.name) {
        errors.push(`Row ${rowNumber}: SKU and Name are required`);
        continue;
      }

      const data = {
        sku: values.sku,
        name: values.name,
        barcode: values.barcode || null,
        description: values.description || null,
        weightKg: Number(values.weightKg) || 0,
        volumeCbm: Number(values.volumeCbm) || 0,
      };

      try {
        // `sku` giờ unique theo tenant => upsert phải dùng khoá composite.
        const tenantId = this.prisma.currentTenant.tenantId;
        if (!tenantId) {
          throw new BadRequestException('Missing tenant context for product upsert');
        }
        await db.product.upsert({
          where: {
            tenantId_sku: {
              tenantId,
              sku: data.sku,
            },
          },
          update: data,
          create: data,
        });
        imported++;
      } catch (error: any) {
        errors.push(`Row ${rowNumber} (${values.sku}): ${error.message}`);
      }
    }

    return {
      success: errors.length === 0,
      imported,
      skipped,
      errors,
    };
  }

  @Patch(":id")
  @RequirePermissions(Permissions.InventoryAdjust)
  async update(@Param("id") id: string, @Body() body: Partial<CreateProductDto>) {
    try {
      const product = await this.prisma.getTenantDb().product.findUnique({ where: { id } });
      if (!product) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }
      return await this.prisma.getTenantDb().product.update({
        where: { id },
        data: body,
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException("Failed to update product");
    }
  }

  @Delete(":id")
  @RequirePermissions(Permissions.InventoryAdjust)
  async remove(@Param("id") id: string) {
    return this.softDelete(id);
  }

  @Patch(":id/soft-delete")
  @RequirePermissions(Permissions.InventoryAdjust)
  async softDelete(@Param("id") id: string) {
    try {
      const product = await this.prisma.getTenantDb().product.findUnique({ where: { id } });
      if (!product) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }
      return await this.prisma.getTenantDb().product.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException("Failed to delete product");
    }
  }
}
