import * as crypto from 'crypto';
import {
  DEMO_PERSONAS,
  authenticateWithPersona,
  buildSetCookieHeader,
  isDemoModeEnabled,
  portalCookieName,
  signSessionToken,
} from '../auth';
import { checkDbHealth, iso, withPlatform } from '../db';
import {
  SCENARIO_CATALOG,
  appendSimulationEvent,
  applyScenarioPreset,
  getOrCreateSandbox,
  normalizeNetworkMode,
  resetSandboxState,
  stepSimulationTick,
} from '../scenarios';
import type { ApiContext, ApiResult, DemoPersona, PortalId } from '../types';

function resolvePortalUrls() {
  return {
    admin: process.env.NEXT_PUBLIC_ADMIN_URL || 'https://smartlogi-admin.vercel.app',
    tenant: process.env.NEXT_PUBLIC_TENANT_URL || 'https://smartlogi-tenant.vercel.app',
    customer: process.env.NEXT_PUBLIC_CUSTOMER_URL || 'https://smartlogi-customer.vercel.app',
    pack: process.env.NEXT_PUBLIC_PACK_URL || 'https://smartlogi-pack.vercel.app',
  };
}

export async function handleDemoRoutes(ctx: ApiContext): Promise<ApiResult | null> {
  const { method, path } = ctx;

  // --- Health Endpoints ---
  if (method === 'GET' && (path === '/health' || path === '/demo/health')) {
    const db = await checkDbHealth();
    return {
      status: db.ok ? 200 : 503,
      body: {
        status: db.ok ? 'ok' : 'degraded',
        mode: 'demo-cloud-api',
        demoEnabled: isDemoModeEnabled(),
        database: db,
        portal: ctx.portal,
        sandboxKey: ctx.sandboxKey,
        timestamp: new Date().toISOString(),
        commitSha:
          process.env.VERCEL_GIT_COMMIT_SHA ||
          process.env.NEXT_PUBLIC_COMMIT_SHA ||
          'local-dev',
        simulatedSystems: [
          'GPS Telemetry Feed',
          'Pack Virtual Camera / Barcode / Scale',
          'Simulated Bank CSV Feed',
          'Simulated VNACCS Customs Gateway',
          'AI Simulation Retraining Workflow (Non-Training)',
        ],
      },
    };
  }

  // --- List Curated Demo Personas (zero passwords!) ---
  if (method === 'GET' && path === '/demo/personas') {
    if (!isDemoModeEnabled()) {
      return { status: 404, body: { code: 'DEMO_MODE_DISABLED', message: 'Demo mode disabled' } };
    }
    const sandbox = await getOrCreateSandbox(ctx.sandboxKey);
    return {
      status: 200,
      body: {
        data: DEMO_PERSONAS,
        portalUrls: resolvePortalUrls(),
        sandbox: {
          sandboxKey: sandbox.sandboxKey,
          activeScenario: sandbox.activeScenario,
          simSpeed: sandbox.simSpeed,
          telemetryPaused: sandbox.telemetryPaused,
          networkSimMode: sandbox.networkSimMode,
        },
      },
    };
  }

  // --- One-Click Persona Demo Login ---
  if (method === 'POST' && path === '/demo/login') {
    const personaKey = String(ctx.body?.personaKey || ctx.body?.email || '');
    const sandboxKey = String(ctx.body?.sandboxKey || ctx.sandboxKey || 'shared-demo');
    const readOnlyGuest = Boolean(ctx.body?.readOnlyGuest);
    const targetPortal = (ctx.body?.portal as PortalId) || ctx.portal;

    const auth = await authenticateWithPersona({
      personaKey,
      portal: targetPortal,
      sandboxKey,
      readOnlyGuest,
    });
    if (!auth.ok) {
      return { status: auth.status, body: { code: auth.code, message: auth.message } };
    }

    await appendSimulationEvent(null, {
      sandboxKey,
      tenantId: auth.session.tenantId,
      category: 'AUTH',
      eventType: 'PERSONA_SWITCH',
      summary: `Đăng nhập demo dưới vai trò ${auth.persona.title} (${auth.session.email})`,
      payloadJson: { portal: targetPortal, role: auth.session.role, readOnlyGuest },
    });

    const cookie = buildSetCookieHeader(portalCookieName(targetPortal), auth.token, 8 * 3600, ctx.isHttps);
    return {
      status: 200,
      setCookies: [cookie],
      body: {
        token: auth.token,
        accessToken: auth.token,
        access_token: auth.token,
        user: {
          id: auth.session.sub,
          email: auth.session.email,
          fullName: auth.session.fullName,
          role: auth.session.role,
          roles: auth.session.roles,
          tenantId: auth.session.tenantId,
          tenantSlug: auth.session.tenantSlug,
          clientId: auth.session.clientId,
          readOnlyGuest: auth.session.readOnlyGuest,
        },
        tenant: auth.tenant,
        persona: auth.persona,
        sandboxKey,
      },
    };
  }

  // --- Logout (clears HttpOnly portal cookie) ---
  if (method === 'POST' && path === '/demo/logout') {
    const clear = buildSetCookieHeader(portalCookieName(ctx.portal), '', 0, ctx.isHttps);
    return {
      status: 200,
      setCookies: [clear],
      body: { ok: true },
    };
  }

  // --- Hydrate Current Session & Active Sandbox State ---
  if (method === 'GET' && path === '/demo/me') {
    const sandbox = await getOrCreateSandbox(
      ctx.session?.sandboxKey || ctx.sandboxKey,
      ctx.session?.tenantId || undefined,
      ctx.session?.tenantSlug || 'demo-3pl-dn',
    );
    const events = await withPlatform(async (tx) =>
      tx.demoSimulationEvent.findMany({
        where: { sandboxKey: sandbox.sandboxKey },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
    );

    if (!ctx.session) {
      return {
        status: 200,
        body: {
          authenticated: false,
          user: null,
          tenant: null,
          portalUrls: resolvePortalUrls(),
          sandbox,
          events: events.map((e) => ({ ...e, createdAt: iso(e.createdAt) })),
        },
      };
    }

    return {
      status: 200,
      body: {
        authenticated: true,
        user: {
          id: ctx.session.sub,
          email: ctx.session.email,
          fullName: ctx.session.fullName,
          role: ctx.session.role,
          roles: ctx.session.roles,
          tenantId: ctx.session.tenantId,
          tenantSlug: ctx.session.tenantSlug,
          clientId: ctx.session.clientId,
          driverId: ctx.session.driverId,
          readOnlyGuest: ctx.session.readOnlyGuest,
        },
        tenant: {
          id: ctx.session.tenantId,
          slug: ctx.session.tenantSlug,
          name: ctx.session.tenantName,
        },
        portalUrls: resolvePortalUrls(),
        sandbox,
        events: events.map((e) => ({ ...e, createdAt: iso(e.createdAt) })),
      },
    };
  }

  // --- Cross-Portal Single-Use Handoff Token Mint ---
  if (method === 'POST' && path === '/demo/handoff') {
    if (!ctx.session) {
      return { status: 401, body: { code: 'UNAUTHORIZED', message: 'Cần đăng nhập để chuyển cổng.' } };
    }
    const targetPortal = (ctx.body?.targetPortal || 'tenant') as PortalId;
    if (!['admin', 'tenant', 'customer', 'pack'].includes(targetPortal)) {
      return { status: 400, body: { code: 'INVALID_PORTAL', message: 'Portal đích không hợp lệ.' } };
    }
    const targetPath = String(ctx.body?.targetPath || '');
    // Choose a compatible persona on the target portal if current role isn't naturally supported
    let targetEmail = ctx.session.email;
    let targetRole = ctx.session.role;
    let targetTenantId = ctx.session.tenantId || 'platform';
    let targetTenantSlug = ctx.session.tenantSlug || 'platform';
    let targetPersonaId = 'custom';

    const currentPersona = DEMO_PERSONAS.find((p: DemoPersona) => p.email === ctx.session!.email);
    if (currentPersona) targetPersonaId = currentPersona.key;
    if (currentPersona && !currentPersona.allowedPortals.includes(targetPortal)) {
      // Pick matching tenant persona for targetPortal
      const matchSameTenant = DEMO_PERSONAS.find(
        (p: DemoPersona) =>
          p.portal === targetPortal &&
          !p.isNegativeTest &&
          (p.tenantSlug === ctx.session!.tenantSlug || p.tenantId === ctx.session!.tenantId),
      );
      const fallback = DEMO_PERSONAS.find((p: DemoPersona) => p.portal === targetPortal && !p.isNegativeTest);
      const chosen = matchSameTenant || fallback;
      if (chosen) {
        targetEmail = chosen.email;
        targetRole = chosen.role;
        targetTenantId = chosen.tenantId || 'platform';
        targetTenantSlug = chosen.tenantSlug || 'platform';
        targetPersonaId = chosen.key;
      }
    }

    const rawToken = `handoff_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 90 * 1000);

    await withPlatform(async (tx: any) => {
      await tx.demoHandoffToken.create({
        data: {
          tokenHash,
          personaId: targetPersonaId,
          sandboxKey: ctx.session!.sandboxKey || ctx.sandboxKey,
          tenantId: targetTenantId,
          tenantSlug: targetTenantSlug,
          role: targetRole,
          portal: targetPortal,
          userEmail: targetEmail,
          expiresAt,
        },
      });
    });

    const portalUrls = resolvePortalUrls();
    // On localhost preserve origin scheme if requested from localhost; otherwise use configured public portal URL
    const originHeader = String(ctx.headers.get('origin') || '');
    const isLocalOrigin = originHeader.includes('localhost:') || originHeader.includes('127.0.0.1:');
    const localPortMap: Record<PortalId, number> = { admin: 4001, tenant: 4002, customer: 4003, pack: 4004 };
    const baseUrl = isLocalOrigin
      ? `http://localhost:${localPortMap[targetPortal]}`
      : portalUrls[targetPortal];

    const safeNext = targetPath && targetPath.startsWith('/') ? targetPath : '';
    const handoffUrl = `${baseUrl.replace(/\/+$/, '')}/demo-handoff?token=${encodeURIComponent(rawToken)}${
      safeNext ? `&next=${encodeURIComponent(safeNext)}` : ''
    }`;

    return {
      status: 201,
      body: {
        token: rawToken,
        targetPortal,
        targetEmail,
        targetRole,
        handoffUrl,
        expiresAt: expiresAt.toISOString(),
      },
    };
  }

  // --- Exchange Single-Use Handoff Token ---
  if (method === 'POST' && path === '/demo/handoff/exchange') {
    const rawToken = String(ctx.body?.token || '').trim();
    const targetPortal = (ctx.body?.portal as PortalId) || ctx.portal;
    if (!rawToken) {
      return { status: 400, body: { code: 'TOKEN_REQUIRED', message: 'Thiếu token handoff.' } };
    }
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const record = await withPlatform(async (tx: any) => {
      const found = await tx.demoHandoffToken.findUnique({ where: { tokenHash } });
      if (!found) return { error: 'NOT_FOUND' as const };
      if (found.usedAt) return { error: 'ALREADY_USED' as const };
      if (found.expiresAt.getTime() < Date.now()) return { error: 'EXPIRED' as const };

      // Atomic single-use claim
      const claimed = await tx.demoHandoffToken.updateMany({
        where: { id: found.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) return { error: 'ALREADY_USED' as const };
      return { found };
    });

    if ('error' in record) {
      return {
        status: record.error === 'NOT_FOUND' ? 404 : 410,
        body: {
          code: `HANDOFF_${record.error}`,
          message:
            record.error === 'ALREADY_USED'
              ? 'Liên kết chuyển cổng chỉ dùng được một lần và đã được sử dụng.'
              : record.error === 'EXPIRED'
                ? 'Liên kết chuyển cổng đã hết hạn (90s). Vui lòng tạo lại.'
                : 'Không tìm thấy token chuyển cổng.',
        },
      };
    }

    const auth = await authenticateWithPersona({
      personaKey: record.found.userEmail,
      portal: targetPortal,
      sandboxKey: record.found.sandboxKey,
    });
    if (!auth.ok) {
      return { status: auth.status, body: { code: auth.code, message: auth.message } };
    }

    await appendSimulationEvent(null, {
      sandboxKey: record.found.sandboxKey,
      tenantId: auth.session.tenantId,
      category: 'HANDOFF',
      eventType: 'PORTAL_HANDOFF_COMPLETED',
      summary: `Chuyển cổng -> ${targetPortal} (${auth.session.email})`,
    });

    const cookie = buildSetCookieHeader(portalCookieName(targetPortal), auth.token, 8 * 3600, ctx.isHttps);
    return {
      status: 200,
      setCookies: [cookie],
      body: {
        token: auth.token,
        accessToken: auth.token,
        user: {
          id: auth.session.sub,
          email: auth.session.email,
          fullName: auth.session.fullName,
          role: auth.session.role,
          roles: auth.session.roles,
          tenantId: auth.session.tenantId,
          tenantSlug: auth.session.tenantSlug,
          clientId: auth.session.clientId,
        },
        tenant: auth.tenant,
        persona: auth.persona,
        sandboxKey: record.found.sandboxKey,
      },
    };
  }

  // --- Scenario Catalog ---
  if (method === 'GET' && path === '/demo/scenarios') {
    const sandbox = await getOrCreateSandbox(ctx.sandboxKey);
    return {
      status: 200,
      body: {
        data: SCENARIO_CATALOG,
        meta: { total: SCENARIO_CATALOG.length, activeScenario: sandbox.activeScenario },
        sandbox,
      },
    };
  }

  // --- Load Scenario Preset ---
  if (method === 'POST' && path === '/demo/scenarios/load') {
    const code = String(ctx.body?.scenarioCode || ctx.body?.code || 'NORMAL_DAY').toUpperCase();
    const res = await applyScenarioPreset({
      scenarioCode: code,
      sandboxKey: ctx.session?.sandboxKey || ctx.sandboxKey,
      tenantId: ctx.session?.tenantId,
      tenantSlug: ctx.session?.tenantSlug,
    });
    return { status: 200, body: res };
  }

  // --- Step Simulation Tick ---
  if (method === 'POST' && path === '/demo/scenarios/step') {
    const res = await stepSimulationTick({
      sandboxKey: ctx.session?.sandboxKey || ctx.sandboxKey,
      tenantId: ctx.session?.tenantId,
    });
    return { status: 200, body: res };
  }

  // --- Sandbox Playback & Fault Controls ---
  if (method === 'POST' && path === '/demo/scenarios/control') {
    const sandboxKey = ctx.session?.sandboxKey || ctx.sandboxKey;
    const updated = await withPlatform(async (tx) => {
      const curr = await getOrCreateSandbox(sandboxKey);
      const data: any = {};
      if (typeof ctx.body?.telemetryPaused === 'boolean') data.telemetryPaused = ctx.body.telemetryPaused;
      if (ctx.body?.simSpeed !== undefined) data.simSpeed = Math.min(10, Math.max(1, Number(ctx.body.simSpeed) || 1));
      if (ctx.body?.networkSimMode !== undefined) data.networkSimMode = normalizeNetworkMode(ctx.body.networkSimMode);
      return tx.demoSandbox.update({ where: { id: curr.id }, data });
    });
    return { status: 200, body: { sandbox: updated } };
  }

  // --- Reset Current Sandbox ---
  if (method === 'POST' && path === '/demo/sandbox/reset') {
    const targetKey = String(ctx.body?.sandboxKey || ctx.session?.sandboxKey || ctx.sandboxKey || 'shared-demo');
    const res = await resetSandboxState({
      sandboxKey: targetKey,
      tenantId: ctx.session?.tenantId,
    });
    return { status: 200, body: { ok: true, ...res } };
  }

  // --- Create Isolated Session Sandbox ---
  if (method === 'POST' && path === '/demo/sandbox/create') {
    const newKey = `sbx-${crypto.randomBytes(4).toString('hex')}`;
    const sandbox = await getOrCreateSandbox(
      newKey,
      ctx.session?.tenantId || undefined,
      ctx.session?.tenantSlug || 'demo-3pl-dn',
    );
    let refreshedToken: string | undefined;
    const setCookies: string[] = [];
    if (ctx.session) {
      const { iat: _i, exp: _e, ...rest } = ctx.session;
      refreshedToken = signSessionToken({ ...rest, sandboxKey: newKey });
      setCookies.push(buildSetCookieHeader(portalCookieName(ctx.portal), refreshedToken, 8 * 3600, ctx.isHttps));
    }
    return {
      status: 201,
      setCookies,
      body: { sandbox, sandboxKey: newKey, ...(refreshedToken ? { token: refreshedToken } : {}) },
    };
  }

  // --- Simulation Event Feed ---
  if (method === 'GET' && path === '/demo/events') {
    const sandboxKey = ctx.query.get('sandboxKey') || ctx.session?.sandboxKey || ctx.sandboxKey;
    const rows = await withPlatform(async (tx: any) =>
      tx.demoSimulationEvent.findMany({
        where: { sandboxKey },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
    );
    return {
      status: 200,
      body: {
        data: rows.map((r: any) => ({ ...r, createdAt: iso(r.createdAt) })),
        meta: { total: rows.length, sandboxKey },
      },
    };
  }

  // --- Honest Simulation-Only Retraining Workflow (never fakes /ai/v1/train/:type 501!) ---
  if (method === 'POST' && path === '/demo/ai-sim/retrain') {
    const modelType = String(ctx.body?.modelType || 'demand');
    const tenantId = ctx.session?.tenantId || '30000000-0000-4000-8000-000000000001';
    const sampleCount = await withPlatform(async (tx: any) =>
      tx.aiFeedback.count({ where: { humanCorrected: { not: '' } } }),
    );
    await appendSimulationEvent(null, {
      sandboxKey: ctx.session?.sandboxKey || ctx.sandboxKey,
      tenantId,
      category: 'AI_SIMULATION',
      eventType: 'RETRAIN_DRY_RUN',
      summary: `[SIMULATION ONLY, MODEL NOT TRAINED] Đánh giá ${sampleCount} mẫu feedback cho mô hình ${modelType}. Endpoint huấn luyện thật (/ai/v1/train) vẫn trả 501 TRAINING_NOT_IMPLEMENTED.`,
      payloadJson: { modelType, sampleCount, simulationOnly: true, modelTrained: false },
    });
    return {
      status: 200,
      body: {
        simulationOnly: true,
        modelTrained: false,
        statusLabel: 'SIMULATION ONLY, MODEL NOT TRAINED',
        modelType,
        eligibleFeedbackSamples: sampleCount,
        stages: [
          { stage: '1. Trích xuất mẫu có human_corrected IS NOT NULL', status: 'COMPLETED', detail: `${sampleCount} mẫu hợp lệ` },
          { stage: '2. Kiểm tra phân phối đặc trưng Đồng Nai 2026', status: 'COMPLETED', detail: 'Synthetic dry-run passed' },
          { stage: '3. Đóng gói trọng số / Huấn luyện ML thực tế', status: 'SKIPPED_IN_DEMO', detail: 'Real GPU/ML training pipeline intentionally disabled (501)' },
        ],
        note: 'Đây là quy trình mô phỏng trực quan. Hệ thống sử dụng heuristic định lượng minh bạch, không bịa đặt độ chính xác mô hình.',
      },
    };
  }

  return null;
}
