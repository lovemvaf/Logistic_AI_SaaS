import { Body, Controller, Post, Get, Patch, UseGuards, Req, Res, UnauthorizedException, HttpException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { LoginResponse } from "../../../core/types/shared-types";
import { LoginRequestDto } from "../dtos/login.dto";
import { ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto, UpdateProfileDto } from "../dtos/forgot-password.dto";
import { AuthService } from "../auth/auth.service";
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";

@ApiTags('Admin Auth')
@Controller("admin/auth")
export class AdminAuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Post("login")
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  async login(@Body() body: LoginRequestDto): Promise<LoginResponse> {
    try {
      const result = await this.authService.loginSuperAdmin(body.email, body.password);
      return {
        ok: true,
        accessToken: result.access_token,
        role: result.role,
      } as any;
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new UnauthorizedException(error.message || "Invalid credentials");
    }
  }

  @Post("google")
  async googleLogin(@Body() body: { credential: string }) {
    try {
      const result = await this.authService.loginSuperAdminWithGoogle(body.credential);
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

  @Post("forgot-password")
  @Throttle({ auth: { limit: 3, ttl: 60000 } })
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<any> {
    return this.authService.forgotPasswordSuperAdmin(body.email);
  }

  @Post("reset-password")
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  async resetPassword(@Body() body: ResetPasswordDto): Promise<any> {
    return this.authService.resetPasswordSuperAdmin(body.email, body.token, body.password);
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  async changePassword(@Body() body: ChangePasswordDto, @Req() req: any): Promise<any> {
    return this.authService.changePasswordSuperAdmin(req.user.email, body.oldPassword, body.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get("profile")
  async getProfile(@Req() req: any): Promise<any> {
    return this.authService.getProfileSuperAdmin(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("profile")
  async updateProfile(@Body() body: UpdateProfileDto, @Req() req: any): Promise<any> {
    return this.authService.updateProfileSuperAdmin(req.user.sub, body);
  }
}
