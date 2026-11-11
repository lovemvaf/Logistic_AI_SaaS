import { Body, Controller, Post, Headers, UnauthorizedException, BadRequestException, HttpException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { LoginResponse } from "../../../core/types/shared-types";
import { LoginRequestDto } from "../dtos/login.dto";
import { ForgotPasswordDto, ResetPasswordDto } from "../dtos/forgot-password.dto";
import { AuthService } from "../auth/auth.service";
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Mobile Auth')
@Controller("mobile/auth")
export class MobileAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  async login(
    @Body() body: LoginRequestDto,
    @Headers("x-tenant-slug") tenantSlug: string
  ): Promise<LoginResponse> {
    if (!tenantSlug) {
      throw new BadRequestException("Missing x-tenant-slug header");
    }

    try {
      const result = await this.authService.loginTenantUser(tenantSlug, body.email, body.password, "mobile");
      return {
        ok: true,
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        role: result.role,
      } as any;
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new UnauthorizedException(error.message || "Invalid credentials");
    }
  }

  @Post("google")
  async googleLogin(
    @Body() body: { credential: string },
    @Headers("x-tenant-slug") tenantSlug: string
  ): Promise<any> {
    if (!tenantSlug) {
      throw new BadRequestException("Missing x-tenant-slug header");
    }

    try {
      const result = await this.authService.loginTenantUserWithGoogle(tenantSlug, body.credential, "mobile");
      return {
        ok: true,
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        role: result.role,
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new UnauthorizedException(error.message || "Google authentication failed");
    }
  }

  @Post("refresh")
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  async refresh(@Body() body: { refreshToken: string }): Promise<any> {
    const result = await this.authService.refreshSession(body.refreshToken, "mobile");
    return {
      ok: true,
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      role: result.role,
      permissions: result.permissions,
    };
  }

  @Post("forgot-password")
  @Throttle({ auth: { limit: 3, ttl: 60000 } })
  async forgotPassword(
    @Body() body: ForgotPasswordDto,
    @Headers("x-tenant-slug") tenantSlug: string
  ): Promise<any> {
    if (!tenantSlug) {
      return { ok: false, message: "Missing x-tenant-slug header" };
    }
    return this.authService.forgotPasswordTenantUser(tenantSlug, body.email);
  }

  @Post("reset-password")
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  async resetPassword(
    @Body() body: ResetPasswordDto,
    @Headers("x-tenant-slug") tenantSlug: string
  ): Promise<any> {
    if (!tenantSlug) {
      return { ok: false, message: "Missing x-tenant-slug header" };
    }
    return this.authService.resetPasswordTenantUser(tenantSlug, body.email, body.token, body.password);
  }
}
