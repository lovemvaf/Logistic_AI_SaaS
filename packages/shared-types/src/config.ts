/**
 * Environment helpers.
 *
 * Security-sensitive secrets must fail fast: a hard-coded fallback means a
 * deployment that forgets `JWT_SECRET` silently accepts tokens signed with a
 * value published in the repository.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} environment variable is required.`);
  }
  return value;
}

export function jwtSecret(): string {
  return requireEnv('JWT_SECRET');
}

export function jwtRefreshSecret(): string {
  return process.env.JWT_REFRESH_SECRET || jwtSecret();
}
