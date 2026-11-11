import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { jwtSecret } from 'shared-types';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private jwtService: JwtService;

  constructor(private readonly prisma: PrismaService) {
    this.jwtService = new JwtService({ secret: jwtSecret() });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);

      if (!payload || !payload.sub) {
        throw new UnauthorizedException('Invalid token payload');
      }

      if (payload.tenant_id) {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: payload.tenant_id },
        });

        if (!tenant || tenant.status !== 'ACTIVE') {
          throw new UnauthorizedException('Tenant is inactive or deleted');
        }
      }

      request.user = { ...payload, schemaName: payload.schema_name || 'public' };
      return true;
    } catch (e) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
