import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SERVICES, PROXY_SKIP_PATHS, matchRoute } from '../config/services.config';
import { isPublicPath, verifyBearerToken } from '../auth/token-verifier';

interface CircuitState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
}

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

const DEFAULT_TIMEOUT_MS = 30000;

@Injectable()
export class ProxyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ProxyMiddleware.name);
  private readonly circuitStates: Map<string, CircuitState> = new Map();
  private readonly maxFailures = 5;
  private readonly resetTimeoutMs = 30000;

  use(req: Request, res: Response, next: NextFunction) {
    const path = req.originalUrl.split('?')[0];

    if (PROXY_SKIP_PATHS.includes(path)) {
      return next();
    }

    const rule = matchRoute(path);
    if (!rule) {
      return next();
    }

    // Middleware runs before Nest guards, so the edge must authenticate here.
    // Without this, the proxy would forward requests before the guard runs.
    if (!isPublicPath(path)) {
      const auth = verifyBearerToken(req);
      if (!auth.ok) {
        res.status(401).json({
          statusCode: 401,
          message:
            auth.reason === 'missing'
              ? 'Missing or invalid authorization header'
              : 'Invalid or expired token',
          error: 'Unauthorized',
        });
        return;
      }
      (req as any).user = auth.user;
    }

    const service = SERVICES.find((s) => s.name === rule.service);
    if (!service) {
      this.logger.error(`No service configuration for ${rule.service}`);
      res.status(502).json({
        statusCode: 502,
        message: `Service ${rule.service} is not configured`,
        error: 'Bad Gateway',
      });
      return;
    }

    if (this.isCircuitOpen(service.name)) {
      this.logger.warn(`Circuit open for ${service.name}, returning 503`);
      res.status(503).json({
        statusCode: 503,
        message: `Service ${service.name} is temporarily unavailable`,
        error: 'Service Unavailable',
      });
      return;
    }

    const forwardPath = rule.mapPath ? rule.mapPath(path) : path;
    const queryIndex = req.originalUrl.indexOf('?');
    const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
    const fullUrl = `${service.url}${forwardPath}${query}`;

    this.logger.debug(`Proxying ${req.method} ${path} -> ${fullUrl}`);

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
      // content-length is recomputed by fetch for buffered bodies.
      if (key.toLowerCase() === 'content-length') continue;
      // Never trust a client-supplied tenant header. The edge derives it from
      // the verified JWT (or a verified API key) below.
      if (key.toLowerCase() === 'x-tenant-id') continue;
      headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
    }
    const verifiedTenantId = (req as any).user?.tenant_id || (req as any).apiKeyTenantId;
    if (verifiedTenantId) {
      headers['x-tenant-id'] = String(verifiedTenantId);
    }
    headers['x-request-id'] = (req.headers['x-request-id'] as string) || this.generateRequestId();

    const fetchOptions: any = {
      method: req.method,
      headers,
    };

    const contentType = (req.headers['content-type'] || '').toLowerCase();
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

    if (hasBody) {
      if (contentType.startsWith('multipart/form-data')) {
        // body-parser skips multipart, so the request stream is still intact.
        // Forward it as-is to preserve the boundary and file bytes.
        fetchOptions.body = req;
        fetchOptions.duplex = 'half';
      } else if ((req as any).rawBody && (req as any).rawBody.length > 0) {
        // Forward the exact bytes that were received. Re-serialising JSON would
        // invalidate signatures (Stripe) and change key order.
        fetchOptions.body = (req as any).rawBody;
      } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
      } else if (typeof req.body === 'string' && req.body.length > 0) {
        fetchOptions.body = req.body;
      }
    }

    const timeoutMs = rule.timeoutMs || DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    fetchOptions.signal = controller.signal;

    fetch(fullUrl, fetchOptions)
      .then(async (upstreamRes) => {
        clearTimeout(timeoutId);
        this.recordSuccess(service.name);

        res.status(upstreamRes.status);
        upstreamRes.headers.forEach((value, key) => {
          const lower = key.toLowerCase();
          // `fetch` transparently decompresses, so the original encoding and
          // length headers no longer describe the bytes we are about to send.
          if (
            lower === 'content-encoding' ||
            lower === 'content-length' ||
            lower === 'transfer-encoding' ||
            lower === 'connection'
          ) {
            return;
          }
          res.setHeader(key, value);
        });

        const buffer = Buffer.from(await upstreamRes.arrayBuffer());
        res.send(buffer);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        this.recordFailure(service.name);
        const isTimeout = error.name === 'AbortError';
        this.logger.error(`Proxy error for ${service.name} (${path}): ${error.message}`);
        res.status(isTimeout ? 504 : 502).json({
          statusCode: isTimeout ? 504 : 502,
          message: isTimeout ? 'Upstream service timeout' : 'Service unavailable',
          error: isTimeout ? 'Gateway Timeout' : 'Bad Gateway',
        });
      });
  }

  private isCircuitOpen(serviceName: string): boolean {
    const state = this.circuitStates.get(serviceName);
    if (!state || !state.isOpen) return false;
    if (Date.now() - state.lastFailureTime > this.resetTimeoutMs) {
      state.isOpen = false;
      state.failures = 0;
      return false;
    }
    return true;
  }

  private recordSuccess(serviceName: string) {
    const state = this.circuitStates.get(serviceName);
    if (state) {
      state.failures = 0;
      state.isOpen = false;
    }
  }

  private recordFailure(serviceName: string) {
    const now = Date.now();
    let state = this.circuitStates.get(serviceName);
    if (!state) {
      state = { failures: 0, lastFailureTime: now, isOpen: false };
      this.circuitStates.set(serviceName, state);
    }
    state.failures++;
    state.lastFailureTime = now;
    if (state.failures >= this.maxFailures) {
      state.isOpen = true;
      this.logger.warn(`Circuit opened for ${serviceName} after ${state.failures} failures`);
    }
  }

  private generateRequestId(): string {
    return `gw-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
