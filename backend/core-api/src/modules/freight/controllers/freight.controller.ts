import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExcludeRoles, Permissions, PermissionsGuard, RequirePermissions, Roles } from 'shared-types';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { FreightService } from '../services/freight.service';

@ApiTags('Freight Control Tower')
@Controller('freight')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class FreightController {
  constructor(private readonly freightService: FreightService) {}

  @Get('summary')
  @RequirePermissions(Permissions.FreightRead)
  async summary() {
    return this.freightService.getControlTowerSummary();
  }

  @Get('tractors')
  @RequirePermissions(Permissions.FreightRead)
  async listTractors() {
    return this.freightService.listTractors();
  }

  @Post('tractors')
  @RequirePermissions(Permissions.FreightManage)
  async createTractor(@Body() body: any) {
    return this.freightService.createTractor(body);
  }

  @Get('chassis')
  @RequirePermissions(Permissions.FreightRead)
  async listChassis() {
    return this.freightService.listChassis();
  }

  @Post('chassis')
  @RequirePermissions(Permissions.FreightManage)
  async createChassis(@Body() body: any) {
    return this.freightService.createChassis(body);
  }

  @Get('containers')
  @RequirePermissions(Permissions.FreightRead)
  async listContainers(@Query('status') status?: string) {
    return this.freightService.listContainers(status);
  }

  @Post('containers')
  @RequirePermissions(Permissions.FreightManage)
  async createContainer(@Body() body: any) {
    return this.freightService.createContainer(body);
  }

  @Get('assignments')
  @RequirePermissions(Permissions.FreightRead)
  async listAssignments(@Query('status') status?: string) {
    return this.freightService.listAssignments({ status });
  }

  @Post('assignments')
  @RequirePermissions(Permissions.FreightManage)
  async assignEquipment(@Body() body: any) {
    return this.freightService.assignEquipment(body);
  }

  @Get('rfqs')
  @RequirePermissions(Permissions.FreightRead)
  async listRfqs(@Query('status') status?: string) {
    return this.freightService.listRfqs({ status });
  }

  @Post('rfqs')
  @RequirePermissions(Permissions.FreightManage)
  async createRfq(@Body() body: any) {
    return this.freightService.createRfq(body);
  }

  @Get('quotes')
  @RequirePermissions(Permissions.FreightRead)
  async listQuotes(@Query('rfqId') rfqId?: string, @Query('status') status?: string) {
    return this.freightService.listQuotes({ rfqId, status });
  }

  @Post('quotes')
  @RequirePermissions(Permissions.FreightManage)
  async createQuote(@Body() body: any) {
    return this.freightService.createQuote(body);
  }

  @Post('quotes/:id/accept')
  @RequirePermissions(Permissions.FreightManage)
  async acceptQuote(@Param('id') id: string) {
    return this.freightService.acceptQuote(id);
  }

  @Get('bookings')
  @RequirePermissions(Permissions.FreightRead)
  async listBookings(@Query('status') status?: string) {
    return this.freightService.listBookings({ status });
  }

  @Post('bookings')
  @RequirePermissions(Permissions.FreightManage)
  async createBooking(@Body() body: any) {
    return this.freightService.createBooking(body);
  }

  @Get('shipments')
  @RequirePermissions(Permissions.FreightRead)
  async listShipments(@Query('bookingId') bookingId?: string) {
    return this.freightService.listShipments({ bookingId });
  }

  @Post('shipments')
  @RequirePermissions(Permissions.FreightManage)
  async createShipment(@Body() body: any) {
    return this.freightService.createShipment(body);
  }

  @Post('shipments/:id/legs')
  @RequirePermissions(Permissions.FreightManage)
  async addLeg(@Param('id') shipmentId: string, @Body() body: any) {
    return this.freightService.addShipmentLeg(shipmentId, body);
  }
}
