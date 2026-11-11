import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy as GooglePassportStrategy, VerifyCallback } from 'passport-google-oauth20';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

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
    const { id, displayName, emails } = profile;
    const email = emails?.[0]?.value;

    if (!email) {
      return done(new UnauthorizedException('Google account does not have an email'), false);
    }

    const isSqlite = (process.env.DATABASE_URL || '').startsWith('file:');

    if (isSqlite) {
      let user = await this.prisma.systemAdmin.findFirst({ where: { email } });

      if (!user) {
        const passwordHash = await bcrypt.hash(id + '_' + Date.now(), 10);
        user = await this.prisma.systemAdmin.create({
          data: {
            email,
            fullName: displayName || email.split('@')[0],
            passwordHash,
            status: 'ACTIVE',
          },
        });
      }

      const payload: any = {
        sub: user.id,
        email: user.email,
        role: 'SUPER_ADMIN',
        permissions: [],
        schema_name: 'public',
      };

      return done(null, {
        accessToken: this.jwtService.sign(payload),
        refreshToken: this.jwtService.sign({ sub: user.id, type: 'refresh' }, { expiresIn: '7d' }),
        email: user.email,
        fullName: user.fullName,
      });
    }

    const payload: any = {
      sub: id,
      email,
      role: 'SUPER_ADMIN',
      permissions: [],
      schema_name: 'public',
    };

    return done(null, {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign({ sub: id, type: 'refresh' }, { expiresIn: '7d' }),
      email,
      fullName: displayName || email.split('@')[0],
    });
  }
}
