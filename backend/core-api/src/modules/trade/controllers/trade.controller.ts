import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExcludeRoles, Permissions, PermissionsGuard, RequirePermissions, Roles } from 'shared-types';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { TradeService } from '../services/trade.service';

@ApiTags('Trade & Customs (XNK)')
@Controller('trade')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class TradeController {
  constructor(private readonly tradeService: TradeService) {}

  @Get('documents')
  @RequirePermissions(Permissions.TradeRead)
  async listDocuments(@Query('bookingId') bookingId?: string, @Query('status') status?: string) {
    return this.tradeService.listDocuments({ bookingId, status });
  }

  @Post('documents')
  @RequirePermissions(Permissions.FreightManage)
  async uploadDocument(@Body() body: any, @Request() req: any) {
    return this.tradeService.uploadDocument({ ...body, uploadedBy: req.user?.sub });
  }

  @Post('bookings/:bookingId/reconcile')
  @RequirePermissions(Permissions.FreightManage)
  async reconcileBooking(@Param('bookingId') bookingId: string) {
    return this.tradeService.reconcileBookingDocuments(bookingId);
  }

  @Get('declarations')
  @RequirePermissions(Permissions.TradeRead)
  async listDeclarations(@Query('status') status?: string, @Query('channel') channel?: string) {
    return this.tradeService.listDeclarations({ status, channel });
  }

  @Post('declarations')
  @RequirePermissions(Permissions.FreightManage)
  async createDeclaration(@Body() body: any, @Request() req: any) {
    return this.tradeService.createDeclaration(body, req.user?.sub);
  }

  @Post('declarations/:id/submit')
  @RequirePermissions(Permissions.TradeApprove)
  async submitDeclaration(@Param('id') id: string, @Request() req: any) {
    return this.tradeService.submitDeclaration(id, req.user?.sub);
  }

  @Post('hs-suggestions')
  @RequirePermissions(Permissions.TradeRead)
  async suggestHs(@Body() body: any) {
    return this.tradeService.suggestHsCodes(body);
  }

  @Post('hs-suggestions/:id/review')
  @RequirePermissions(Permissions.TradeApprove)
  async reviewHs(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.tradeService.reviewHsSuggestion(id, body, req.user?.sub);
  }
}
