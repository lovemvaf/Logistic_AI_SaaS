import { Controller, Post, UseInterceptors, UploadedFile, UseGuards, Request, BadRequestException, Logger } from '@nestjs/common';
import { generateTrackingCode } from '../../../core/utils/tracking-code';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as os from 'os';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from 'shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { OutboxService } from '../../../core/outbox/outbox.service';
import { ApiTags } from '@nestjs/swagger';

const ALLOWED_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function parseCsvRows(content: string): string[][] {
  const clean = content.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) {
        rows.push(row);
      }
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell !== '')) {
    rows.push(row);
  }
  return rows;
}

@ApiTags('Bulk Upload')
@Controller('orders/bulk')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class BulkUploadController {
  private readonly logger = new Logger('BulkUploadController');

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  @Post('upload')
  @RequirePermissions(Permissions.OrdersCreate)
  @UseInterceptors(FileInterceptor('file', { 
    storage: diskStorage({ destination: os.tmpdir() }),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
      const isCsvExt = (file.originalname || '').toLowerCase().endsWith('.csv');
      if (!ALLOWED_MIMES.includes(file.mimetype) && !isCsvExt) {
        return cb(new BadRequestException('Only Excel and CSV files are allowed'), false);
      }
      cb(null, true);
    }
  }))
  async uploadExcel(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) throw new BadRequestException("No file uploaded");

    const tenantId = req.tenantId ?? req.user?.tenant_id ?? this.prisma.currentTenant.tenantId;
    const results = {
      total: 0,
      success: 0,
      failed: 0,
      errors: [] as { row: number, message: string }[]
    };

    const processNormalizedRow = async (
      rowNumber: number,
      getCol: (name: string) => any,
    ) => {
      results.total++;
      const name = getCol('Recipient Name') || getCol('Name');
      const phone = getCol('Phone');
      const address = getCol('Address');
      const cod = getCol('COD');
      const fee = getCol('Fee');
      const orderRef = getCol('OrderRef');
      const sku = getCol('SKU');
      const qty = getCol('Qty');

      try {
        await this.prisma.getTenantDb().$transaction(async (tx: any) => {
          if (!name || !phone || !address) {
            throw new Error('Missing mandatory info (Name, Phone, or Address)');
          }

          const codAmount = cod === undefined || cod === '' ? 0 : Number(cod);
          const shippingFee = fee === undefined || fee === '' ? 0 : Number(fee);
          if (!Number.isFinite(codAmount) || codAmount < 0) {
            throw new Error('COD amount must be a finite non-negative number');
          }
          if (!Number.isFinite(shippingFee) || shippingFee < 0) {
            throw new Error('Shipping fee must be a finite non-negative number');
          }

          let parsedQty: number | null = null;
          if (sku && qty !== undefined && qty !== '') {
            parsedQty = Number(qty);
            if (!Number.isInteger(parsedQty) || parsedQty < 1) {
              throw new Error('Item quantity must be a positive integer');
            }
          }

          const trackingCode = generateTrackingCode();

          const order = await tx.order.create({
            data: {
              trackingCode,
              recipientName: String(name),
              recipientPhone: String(phone),
              recipientAddress: String(address),
              codAmount,
              shippingFee,
              clientOrderRef: orderRef ? String(orderRef) : undefined,
              status: 'NEW',
            },
          });

          await tx.orderTrackingEvent.create({
            data: {
              orderId: order.id,
              status: 'NEW',
              location: 'System',
              description: 'Order created via Bulk Upload',
            },
          });

          if (sku && parsedQty !== null) {
            const product = await tx.product.findFirst({
              where: { sku: String(sku), ...(tenantId ? { tenantId } : {}) },
            });
            if (product) {
              await tx.orderItem.create({
                data: {
                  orderId: order.id,
                  productId: product.id,
                  quantity: parsedQty,
                },
              });
            }
          }
        });
        results.success++;
      } catch (e: any) {
        results.failed++;
        results.errors.push({ row: rowNumber, message: e?.message || 'Unknown error' });
      }
    };

    try {
      const isCsv =
        file.mimetype === 'text/csv' ||
        file.mimetype === 'application/csv' ||
        (file.originalname || '').toLowerCase().endsWith('.csv');

      if (isCsv) {
        const content = fs.readFileSync(file.path, 'utf-8');
        const rows = parseCsvRows(content);
        if (rows.length > 1) {
          const headers = rows[0].map((h) => String(h).trim());
          for (let r = 1; r < rows.length; r++) {
            const rowData = rows[r];
            await processNormalizedRow(r + 1, (colName: string) => {
              const idx = headers.indexOf(colName);
              return idx > -1 ? rowData[idx] : undefined;
            });
          }
        }
      } else {
        const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(file.path, {
          sharedStrings: 'cache',
          hyperlinks: 'ignore',
          worksheets: 'emit',
        });

        let sheetIndex = 0;
        for await (const worksheetReader of workbookReader) {
          sheetIndex++;
          if (sheetIndex !== 1) continue;

          let isHeader = true;
          let headers: string[] = [];

          for await (const row of worksheetReader) {
            if (isHeader) {
              headers = (row.values as any[]).map((v) => (v !== undefined && v !== null ? String(v).trim() : ''));
              isHeader = false;
              continue;
            }
            const rowData = row.values as any[];
            await processNormalizedRow(results.total + 2, (colName: string) => {
              const idx = headers.indexOf(colName);
              return idx > -1 ? rowData[idx] : undefined;
            });
          }
        }
      }
    } finally {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }

    if (results.success > 0) {
      await this.outbox.enqueue({
        channel: 'KAFKA',
        topic: 'order.bulk_uploaded',
        payload: {
          totalUploaded: results.success,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return results;
  }
}
