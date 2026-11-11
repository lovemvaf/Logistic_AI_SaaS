import { Controller, Get, Post, Patch, Body, UseGuards, Query, Param, UseInterceptors, UploadedFile, BadRequestException, NotFoundException } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { ExcludeRoles, PermissionsGuard, RequirePermissions, Permissions, Roles } from "shared-types";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { LogisticsService } from "../services/logistics.service";
import * as XLSX from "xlsx";
import { ApiTags } from "@nestjs/swagger";

const ALLOWED_EXCEL_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@ApiTags('Finance')
@Controller("logistics/finance")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class FinanceController {
  constructor(
    private readonly logisticsService: LogisticsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("remittances")
  @RequirePermissions(Permissions.TripsRead)
  async listRemittances(@Query() query: any) {
    return this.logisticsService.getRemittances(query);
  }

  @Patch("remittances/:id/status")
  @RequirePermissions(Permissions.TripsDispatch)
  async approveRemittance(@Param("id") id: string, @Body() body: { status: string }) {
    return this.logisticsService.updateRemittanceStatus(id, body.status);
  }

  @Post("reconcile")
  @RequirePermissions(Permissions.TripsDispatch)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_EXCEL_MIMES.includes(file.mimetype)) {
        return cb(new BadRequestException('Only Excel and CSV files are allowed'), false);
      }
      cb(null, true);
    }
  }))
  async reconcileBankStatement(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    // 1. Đọc file Excel/CSV từ ngân hàng
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data: any[] = XLSX.utils.sheet_to_json(sheet);

    // 2. Map data sang format chuẩn (Reference, Amount, Date)
    const entries = data.map((row) => {
      const rawAmount = row['Amount'] ?? row['Số tiền'] ?? row['So tien'] ?? 0;
      const numericAmount = typeof rawAmount === 'number'
        ? rawAmount
        : Number(String(rawAmount).replace(/[,\s]/g, ''));

      return {
        reference: String(row['Reference'] ?? row['Nội dung'] ?? row['Noi dung'] ?? ''),
        amount: numericAmount,
        transactionDate: String(row['Date'] ?? row['Ngày'] ?? row['Ngay'] ?? ''),
      };
    });

    // 3. Thực hiện đối soát
    return this.logisticsService.reconcileBankStatement(entries);
  }

  @Get("expenses")
  @RequirePermissions(Permissions.TripsRead)
  async listExpenses(@Query("driverId") driverId?: string) {
    return this.logisticsService.getDriverExpenses(driverId);
  }

  @Patch("expenses/:id/approve")
  @RequirePermissions(Permissions.TripsDispatch)
  async approveExpense(@Param("id") id: string, @Body() body?: { note?: string }) {
    const db = this.prisma.getTenantDb();
    const existing = await db.driverExpense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Expense ${id} not found`);
    return db.driverExpense.update({
      where: { id },
      data: {
        status: "APPROVED",
        ...(body?.note ? { note: String(body.note) } : {}),
      },
    });
  }

  @Patch("expenses/:id/reject")
  @RequirePermissions(Permissions.TripsDispatch)
  async rejectExpense(@Param("id") id: string, @Body() body?: { note?: string }) {
    const db = this.prisma.getTenantDb();
    const existing = await db.driverExpense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Expense ${id} not found`);
    return db.driverExpense.update({
      where: { id },
      data: {
        status: "REJECTED",
        ...(body?.note ? { note: String(body.note) } : {}),
      },
    });
  }

  @Get("sos")
  @RequirePermissions(Permissions.TripsRead)
  async listSos(@Query("status") status: string) {
    return this.logisticsService.getSosAlerts(status);
  }

  @Patch("sos/:id/resolve")
  @RequirePermissions(Permissions.TripsDispatch)
  async resolveSos(@Param("id") id: string, @Body() body: { status: string }) {
    return this.logisticsService.resolveSos(id, body.status);
  }

  @Post("ai/feedback")
  @RequirePermissions(Permissions.TripsDispatch)
  async submitAiFeedback(@Body() body: any) {
    return this.logisticsService.submitAiFeedback(body);
  }
}
