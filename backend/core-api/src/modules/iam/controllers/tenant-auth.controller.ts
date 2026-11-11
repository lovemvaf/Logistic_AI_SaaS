import { Body, Controller, Post, Get, Patch, UseGuards, Req, Headers, UnauthorizedException, BadRequestException, HttpException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { LoginResponse } from "../../../core/types/shared-types";
import { LoginRequestDto } from "../dtos/login.dto";
import { ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto, UpdateProfileDto } from "../dtos/forgot-password.dto";
import { AuthService } from "../auth/auth.service";
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";

@ApiTags('Tenant Auth')
@Controller("tenant/auth")
export class TenantAuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @Post("login")
  async login(
    @Body() body: LoginRequestDto,
    @Headers("x-tenant-slug") tenantSlug: string,
    @Headers("x-portal") portal: string
  ): Promise<LoginResponse> {
    if (!tenantSlug) {
      throw new BadRequestException("Missing x-tenant-slug header");
    }

    try {
      const result = await this.authService.loginTenantUser(tenantSlug, body.email, body.password, portal);
      return {
        ok: true,
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        role: result.role,
        slug: tenantSlug,
      } as any;
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new UnauthorizedException(error.message || "Invalid credentials");
    }
  }

  @Post("google")
  async googleLogin(
    @Body() body: { credential: string },
    @Headers("x-tenant-slug") tenantSlug: string,
    @Headers("x-portal") portal: string
  ): Promise<any> {
    if (!tenantSlug) {
      throw new BadRequestException("Missing x-tenant-slug header");
    }

    try {
      const result = await this.authService.loginTenantUserWithGoogle(tenantSlug, body.credential, portal);
      return {
        ok: true,
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        role: result.role,
        slug: tenantSlug,
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new UnauthorizedException(error.message || "Google authentication failed");
    }
  }

  @Post("refresh")
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  async refresh(@Body() body: { refreshToken: string }): Promise<any> {
    const result = await this.authService.refreshSession(body.refreshToken, "tenant");
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

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() req: any,
  ): Promise<any> {
    const schemaName = req.user.schema_name;
    if (!schemaName) {
      throw new UnauthorizedException('Invalid tenant context.');
    }
    return this.authService.changePasswordTenantUser(schemaName, req.user.sub, body.oldPassword, body.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get("profile")
  async getProfile(@Req() req: any): Promise<any> {
    const schemaName = req.user.schema_name;
    if (!schemaName) {
      throw new UnauthorizedException('Invalid tenant context.');
    }
    return this.authService.getProfileTenantUser(req.user.sub, schemaName);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("profile")
  async updateProfile(@Body() body: UpdateProfileDto, @Req() req: any): Promise<any> {
    return this.authService.updateProfileTenantUser(req.user.sub, body);
  }

  @Get("tenants")
  async listTenants(): Promise<{ ok: boolean; data: Array<{ slug: string; name: string }> }> {
    const tenants = await this.authService.listTenantSlugs();
    return { ok: true, data: tenants };
  }
}
