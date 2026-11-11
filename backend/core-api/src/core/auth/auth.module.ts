import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { jwtSecret } from 'shared-types';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './google.strategy';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Hạ tầng xác thực dùng chung cho toàn bộ core-api.
 *
 * Nghiệp vụ đăng nhập (đổi mật khẩu, quên mật khẩu, refresh token) nằm ở
 * module IAM, không nằm ở đây.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: { expiresIn: '1d' },
    }),
    PrismaModule,
  ],
  providers: [JwtStrategy, GoogleStrategy],
  exports: [PassportModule, JwtModule, JwtStrategy, GoogleStrategy],
})
export class CoreAuthModule {}
