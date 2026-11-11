import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Param,
  Body,
  Request,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from 'shared-types';
import { S3Service } from '../services/s3.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { IdempotencyInterceptor } from '../../../core/http/idempotency.interceptor';
import { ApiTags } from '@nestjs/swagger';

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@ApiTags('Upload')
@Controller('mobile/uploads')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class UploadController {
  constructor(
    private readonly s3Service: S3Service,
    private readonly prisma: PrismaService,
  ) {}

  @Post('pod/:deliveryId')
  @RequirePermissions(Permissions.MobileUploads)
  @UseInterceptors(
    IdempotencyInterceptor,
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
          return cb(new BadRequestException('Only JPEG, PNG, and WebP images are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadPOD(
    @Param('deliveryId') deliveryId: string,
    @UploadedFile() file: any,
    @Body('type') type: 'IMAGE' | 'SIGNATURE' = 'IMAGE',
    @Body('codCollected') codCollected?: string,
    @Request() req?: any,
  ) {
    if (!file) {
      throw new BadRequestException('POD image file is required');
    }

    const db = this.prisma.getTenantDb();
    const delivery = await db.delivery.findUnique({
      where: { id: deliveryId },
      include: { trip: true },
    });
    if (!delivery) {
      throw new NotFoundException(`Delivery ${deliveryId} not found`);
    }

    const userId = req?.user?.sub;
    const role = req?.user?.role;
    const driver = userId ? await db.driver.findUnique({ where: { userId } }) : null;
    if (role === Roles.DRIVER || driver) {
      if (!driver) {
        throw new ForbiddenException('Driver profile not found');
      }
      const assignedToDriver =
        delivery.driverId === driver.id || delivery.trip?.driverId === driver.id;
      if (!assignedToDriver) {
        throw new ForbiddenException('Delivery is not assigned to the authenticated driver');
      }
    }

    if (delivery.status === 'CANCELLED') {
      throw new BadRequestException('Cannot upload POD for a cancelled delivery');
    }

    const updateData: any = { status: 'DELIVERED' };
    if (codCollected !== undefined && codCollected !== '') {
      const parsedCod = Number(codCollected);
      if (!Number.isFinite(parsedCod) || parsedCod < 0) {
        throw new BadRequestException('codCollected must be a finite non-negative number');
      }
      updateData.codAmountCollected = parsedCod;
    }

    // Upload to object storage after ownership and status validation pass
    const folder = type === 'SIGNATURE' ? 'signatures' : 'pod';
    const result = await this.s3Service.uploadFile(file, folder);

    if (type === 'SIGNATURE') {
      updateData.podSignatureUrl = result.url;
    } else {
      updateData.podImageUrl = result.url;
    }

    await db.delivery.update({
      where: { id: deliveryId },
      data: updateData,
    });

    return { ok: true, url: result.url };
  }
}
