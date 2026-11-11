import { Body, Controller, Post, Get } from "@nestjs/common"
import { Throttle } from "@nestjs/throttler"
import { UnauthorizedException, GoneException } from "@nestjs/common"
import { ApiTags } from '@nestjs/swagger'

@ApiTags('Auth')
@Controller("auth")
export class AuthController {
  @Post("login")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  login(): any {
    throw new GoneException('Generic login endpoint is deprecated. Use POST /api/v1/admin/auth/login for super admin or POST /api/v1/tenant/auth/login for tenant users.');
  }
}
