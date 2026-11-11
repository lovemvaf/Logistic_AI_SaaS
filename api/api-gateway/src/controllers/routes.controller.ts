import { Controller, Get } from '@nestjs/common';
import { SERVICES } from '../config/services.config';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Routes')
@Controller('routes')
export class RoutesController {
  @Get()
  list() {
    return {
      gateway: 'SmartLogi API Gateway v1.0',
      services: SERVICES.map((s) => ({
        name: s.name,
        prefix: s.prefix,
      })),
      endpoints: {
        auth: '/api/v1/tenant/auth/login',
        admin: '/api/v1/admin',
        tenant: '/api/v1/tenant',
        inventory: '/api/v1/inventory',
        wms: '/api/v1/wms (alias)',
        orders: '/api/v1/orders',
        logistics: '/api/v1/logistics',
        customers: '/api/v1/client',
        publicTracking: '/api/v1/public/track',
        notifications: '/api/v1/notifications',
        ai: '/api/v1/ai',
        gps: '/api/v1/gps',
        gpsIngest: '/api/v1/gps/batch',
        webhooks: '/api/v1/webhooks',
      },
    };
  }
}
