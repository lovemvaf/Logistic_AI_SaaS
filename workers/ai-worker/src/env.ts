/** Shape of a verified JWT payload. */
export interface JwtPayload {
  sub?: string;
  email?: string;
  role?: string;
  permissions?: string[];
  tenant_id?: string;
  schema_name?: string;
  iat?: number;
  exp?: number;
}

export interface Bindings {
  [key: string]: any; // Hono's Env constraint + Workers dynamic bindings
  // Secrets (wrangler secret / .dev.vars)
  JWT_SECRET: string;
  AI_API_KEY?: string;
  OPENAI_API_KEY?: string; // Fallback LLM provider (vision + chat) when Cloudflare AI is not available
  // Services
  DB: D1Database;
  AI: any; // Workers AI binding (global `ai`)
  CACHE: KVNamespace;
  // Vars
  DEFAULT_MODEL?: string;
  // Optional model override honoring the project's `CLOUDFLARE_MODEL` env var.
  // When set (via .dev.vars / Worker secret / env), it takes precedence over
  // DEFAULT_MODEL for Workers AI inference.
  CLOUDFLARE_MODEL?: string;
}

export interface Variables {
  [key: string]: any;
  user: JwtPayload | null;
  tenantId: string;
}

export const SYSTEM_TENANT = '__system__';

/** Resolve the effective tenant id for a request. */
export function effectiveTenantId(user: JwtPayload | null): string {
  if (user && (user.tenant_id || user.schema_name)) {
    return user.tenant_id || user.schema_name || SYSTEM_TENANT;
  }
  return SYSTEM_TENANT;
}

/** Small JSON helper. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
