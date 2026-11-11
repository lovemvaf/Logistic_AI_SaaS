import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExcludeRoles, Permissions, PermissionsGuard, RequirePermissions, Roles } from 'shared-types';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { PricingService } from '../services/pricing.service';

@ApiTags('Pricing & Freight Finance')
@Controller('pricing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('contracts')
  @RequirePermissions(Permissions.PricingRead)
  async listContracts(@Query('status') status?: string, @Query('corridorTag') corridorTag?: string) {
    return this.pricingService.listContractRates({ status, corridorTag });
  }

  @Post('contracts')
  @RequirePermissions(Permissions.PricingManage)
  async createContract(@Body() body: any) {
    return this.pricingService.createContractRate(body);
  }

  @Get('surcharges')
  @RequirePermissions(Permissions.PricingRead)
  async listSurcharges() {
    return this.pricingService.listSurcharges();
  }

  @Post('surcharges')
  @RequirePermissions(Permissions.PricingManage)
  async createSurcharge(@Body() body: any) {
    return this.pricingService.createSurcharge(body);
  }

  @Get('dem-det-rules')
  @RequirePermissions(Permissions.PricingRead)
  async listDemDetRules() {
    return this.pricingService.listDemDetRules();
  }

  @Post('dem-det-rules')
  @RequirePermissions(Permissions.PricingManage)
  async createDemDetRule(@Body() body: any) {
    return this.pricingService.createDemDetRule(body);
  }

  @Get('shipments/:id/dem-det')
  @RequirePermissions(Permissions.PricingRead)
  async computeDemDet(@Param('id') shipmentId: string, @Query('asOf') asOf?: string) {
    return this.pricingService.computeShipmentDemDet(shipmentId, asOf);
  }

  @Get('invoices')
  @RequirePermissions(Permissions.PricingRead)
  async listInvoices(@Query('direction') direction?: string, @Query('status') status?: string) {
    return this.pricingService.listFreightInvoices({ direction, status });
  }

  @Post('invoices')
  @RequirePermissions(Permissions.PricingManage)
  async createInvoice(@Body() body: any) {
    return this.pricingService.createFreightInvoice(body);
  }

  @Post('invoices/:id/payments')
  @RequirePermissions(Permissions.PricingManage)
  async allocatePayment(@Param('id') invoiceId: string, @Body() body: any, @Request() req: any) {
    return this.pricingService.allocatePayment(invoiceId, { ...body, actorId: req.user?.sub });
  }

  @Get('disputes')
  @RequirePermissions(Permissions.PricingRead)
  async listDisputes() {
    return this.pricingService.listDisputes();
  }

  @Post('disputes')
  @RequirePermissions(Permissions.FreightManage)
  async createDispute(@Body() body: any) {
    return this.pricingService.createDispute(body);
  }

  @Patch('disputes/:id/resolve')
  @RequirePermissions(Permissions.PricingManage)
  async resolveDispute(@Param('id') id: string, @Body() body: any) {
    return this.pricingService.resolveDispute(id, body);
  }
}
