import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { getJwtSecret, PUBLIC_PATHS } from '../config/services.config';

export interface AuthenticatedUser {
  sub?: string;
  email?: string;
  role?: string;
  roles?: string[];
  tenant_id?: string;
  tenant_slug?: string;
  schema_name?: string;
  schemaName?: string;
  permissions?: string[];
  [key: string]: unknown;
}

export interface TokenVerification {
  ok: boolean;
  user?: AuthenticatedUser;
  reason?: 'missing' | 'invalid';
}

/** Segment-boundary match so `/api/v1/publicity` is not treated as public. */
export function isPublicPath(path: string): boolean {
  const cleanPath = path.split('?')[0];
  return PUBLIC_PATHS.some(
    (publicPath) => cleanPath === publicPath || cleanPath.startsWith(`${publicPath}/`),
  );
}

export function verifyBearerToken(req: Request): TokenVerification {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, reason: 'missing' };
  }

  try {
    const decoded = jwt.verify(authHeader.substring(7), getJwtSecret()) as AuthenticatedUser;
    decoded.schemaName = (decoded.schema_name as string) || 'public';
    return { ok: true, user: decoded };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}
