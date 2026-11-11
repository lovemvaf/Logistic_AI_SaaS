import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy as GooglePassportStrategy, VerifyCallback } from 'passport-google-oauth20';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class GoogleStrategy extends PassportStrategy(GooglePassportStrategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/v1/admin/auth/google/callback',
      scope: ['email', 'profile'],
      passReqToCallback: false,
    });

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      this.logger.warn('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set. Google OAuth will not be available.');
    }
  }

  async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback): Promise<any> {
    const { emails } = profile;
    const email = emails?.[0]?.value;

    if (!email) {
      return done(new UnauthorizedException('Google account does not have an email'), false);
    }

    const admin = await this.prisma.runAsPlatform<any>((db) =>
      db.systemAdmin.findFirst({ where: { email: email.toLowerCase(), status: 'ACTIVE' } }),
    );
    if (!admin) {
      return done(new UnauthorizedException('Google account is not authorized as an active SystemAdmin'), false);
    }

    const payload: any = {
      sub: admin.id,
      email: admin.email,
      role: 'SUPER_ADMIN',
      permissions: [],
      schema_name: 'public',
    };

    return done(null, {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign({ sub: admin.id, type: 'refresh' }, { expiresIn: '7d' }),
      email: admin.email,
      fullName: admin.fullName,
    });
  }
}
