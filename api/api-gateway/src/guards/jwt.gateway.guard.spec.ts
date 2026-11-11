import { JwtGatewayGuard } from './jwt.gateway.guard';
import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

jest.mock('../config/services.config', () => ({
  getJwtSecret: jest.fn(() => 'test-secret-key'),
  PUBLIC_PATHS: ['/health', '/api/health', '/routes', '/api/v1/public', '/api/v1/track', '/api/gateway/health'],
}));

describe('JwtGatewayGuard', () => {
  let guard: JwtGatewayGuard;

  beforeEach(() => {
    guard = new JwtGatewayGuard();
  });

  it('should allow access to public paths', () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          originalUrl: '/health',
          headers: {},
        }),
      }),
    } as any;

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should throw UnauthorizedException when no auth header', () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          originalUrl: '/api/v1/orders',
          headers: {},
        }),
      }),
    } as any;

    expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);
  });

  it('should allow access with valid token', () => {
    const token = jwt.sign({ sub: 'user-1', email: 'test@test.com' }, 'test-secret-key');
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          originalUrl: '/api/v1/orders',
          headers: {
            authorization: `Bearer ${token}`,
          },
        }),
      }),
    } as any;

    const result = guard.canActivate(mockContext);
    expect(result).toBe(true);
  });

  it('should NOT allow access to /api/v1/tracking (authenticated) even though /api/v1/track is public', () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          originalUrl: '/api/v1/tracking/123',
          headers: {},
        }),
      }),
    } as any;

    expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);
  });
});
