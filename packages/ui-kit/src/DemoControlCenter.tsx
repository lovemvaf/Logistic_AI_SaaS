'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

declare const process: { env: Record<string, string | undefined> };

export type DemoPortalId = 'admin' | 'tenant' | 'customer' | 'pack';

type DemoPersonaItem = {
  key: string;
  portal: DemoPortalId;
  allowedPortals: DemoPortalId[];
  tenantId: string | null;
  tenantSlug: string;
  tenantName: string;
  tenantStatus: 'ACTIVE' | 'SUSPENDED';
  role: string;
  email: string;
  fullName: string;
  title: string;
  description: string;
  isNegativeTest?: boolean;
  defaultPath: string;
};

type DemoScenarioItem = {
  code: string;
  title: string;
  category:
    | 'OPERATIONS'
    | 'DELIVERY_FINANCE'
    | 'CONTAINER_YARD_TRADE'
    | 'WMS_PACK'
    | 'GEO_SECURITY';
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'NEGATIVE_TEST';
  targetPortal: DemoPortalId;
  targetPath: string;
  expectedOutcome: string;
  simulatedSystems: string[];
  summary: string;
};

type DemoEventItem = {
  id: string;
  category: string;
  eventType: string;
  summary: string;
  createdAt: string;
};

type SandboxState = {
  sandboxKey: string;
  activeScenario: string;
  scenarioStatus?: string;
  simSpeed: number;
  telemetryPaused: boolean;
  networkSimMode: 'NORMAL' | 'SLOW_800MS' | 'RATE_LIMIT_429' | 'SERVER_500';
  stateJson?: Record<string, any>;
};

type DemoMeResponse = {
  authenticated: boolean;
  user: {
    id?: string;
    email?: string;
    fullName?: string;
    role?: string;
    tenantId?: string | null;
    tenantSlug?: string;
    readOnlyGuest?: boolean;
  } | null;
  tenant: { id?: string | null; slug?: string; name?: string } | null;
  portalUrls?: Record<DemoPortalId, string>;
  sandbox?: SandboxState;
  events?: DemoEventItem[];
};

const PORTAL_STORAGE_KEYS: Record<DemoPortalId, { token: string; user: string; loginPath: string; label: string }> = {
  admin: {
    token: 'smartlogi_admin_token',
    user: 'smartlogi_admin_user',
    loginPath: '/admin/login',
    label: 'Admin',
  },
  tenant: {
    token: 'smartlogi_tenant_token',
    user: 'smartlogi_tenant_user',
    loginPath: '/login',
    label: 'Tenant',
  },
  customer: {
    token: 'smartlogi_customer_token',
    user: 'smartlogi_customer_user',
    loginPath: '/client/login',
    label: 'Customer',
  },
  pack: {
    token: 'smartlogi_pack_token',
    user: 'smartlogi_pack_user',
    loginPath: '/login',
    label: 'Pack',
  },
};

const TOUR_STEPS: Array<{
  id: string;
  title: string;
  portal: DemoPortalId;
  path: string;
  detail: string;
}> = [
  {
    id: 'step-1',
    title: '1. Quản trị SaaS & Địa giới 95 phường/xã Đồng Nai + Outbox DLQ',
    portal: 'admin',
    path: '/admin/geography',
    detail: 'Kiểm tra 4 tenant, 95 đơn vị hành chính mới 2026 (PENDING_OFFICIAL_CODE trung thực) và thao tác Redrive sự kiện Dead-Letter.',
  },
  {
    id: 'step-2',
    title: '2. Control Tower & Vận hành Kho WMS (Wave Picking / Cycle Count)',
    portal: 'tenant',
    path: '/dashboard',
    detail: 'Xem KPI tổng hợp đơn hàng, tồn kho FEFO, tạo đơn hàng mới và giải phóng đợt Wave Picking.',
  },
  {
    id: 'step-3',
    title: '3. Quản lý Container & Vận tải Đa phương thức (Freight RFQ -> Dispatch)',
    portal: 'tenant',
    path: '/freight',
    detail: 'Duyệt RFQ, lập báo giá FCL/LCL, ghép đầu kéo rơ-moóc (chặn trùng 409) và kiểm tra phí lưu cont DEM/DET.',
  },
  {
    id: 'step-4',
    title: '4. Điều hành Bãi Container Depot & Biên bản EIR (Yard)',
    portal: 'tenant',
    path: '/yard',
    detail: 'Thực hiện Gate-In / Gate-Out xe đầu kéo, phát hành biên bản EIR hư hỏng và theo dõi ổ cắm lạnh Reefer.',
  },
  {
    id: 'step-5',
    title: '5. Xuất nhập khẩu & Hải quan (XNK Trade & HS Review Gate)',
    portal: 'tenant',
    path: '/trade',
    detail: 'Đối chiếu Commercial Invoice vs Packing List, xử lý tờ khai Luồng ĐỎ và xác nhận mã HS tham khảo.',
  },
  {
    id: 'step-6',
    title: '6. Bàn Đóng gói Mô phỏng Phần cứng (Pack Station)',
    portal: 'pack',
    path: '/pack',
    detail: 'Quét mã vạch, bật Camera CV mô phỏng (<0.6 cảnh báo), cân điện tử vượt dung sai, ghi nhận sai lệch & Seal kiện.',
  },
  {
    id: 'step-7',
    title: '7. Mô phỏng Tài xế & GPS Hành lang Đồng Nai',
    portal: 'tenant',
    path: '/driver-sim',
    detail: 'Bắt đầu chuyến, đẩy GPS, ký ePOD Canvas, thu COD, gửi SOS, thử hàng đợi Offline & xử lý xung đột 409.',
  },
  {
    id: 'step-8',
    title: '8. Cổng Khách hàng B2B & Chia sẻ Public Tracking 3 cấp độ',
    portal: 'customer',
    path: '/client/freight',
    detail: 'Tạo RFQ B2B, chấp nhận báo giá sinh Shipment và tạo link Tracking STATUS_ONLY / CITY_WARD / FULL.',
  },
];

function detectPortal(override?: DemoPortalId): DemoPortalId {
  if (override) return override;
  if (typeof window === 'undefined') return 'tenant';
  const host = window.location.hostname.toLowerCase();
  const port = window.location.port;
  const path = window.location.pathname.toLowerCase();
  if (host.includes('smartlogi-admin') || port === '4001') return 'admin';
  if (host.includes('smartlogi-pack') || port === '4004') return 'pack';
  if (host.includes('smartlogi-customer') || port === '4003') return 'customer';
  if (host.includes('smartlogi-tenant') || port === '4002') return 'tenant';
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/pack')) return 'pack';
  if (path.startsWith('/client') || path.startsWith('/track')) return 'customer';
  return 'tenant';
}

function resolvePortalBase(
  target: DemoPortalId,
  serverUrls?: Record<DemoPortalId, string>,
): string {
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') {
      const portMap: Record<DemoPortalId, number> = {
        admin: 4001,
        tenant: 4002,
        customer: 4003,
        pack: 4004,
      };
      return `http://localhost:${portMap[target]}`;
    }
  }
  const fromEnv: Record<DemoPortalId, string | undefined> = {
    admin: typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_ADMIN_URL : undefined,
    tenant: typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_TENANT_URL : undefined,
    customer: typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_CUSTOMER_URL : undefined,
    pack: typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_PACK_URL : undefined,
  };
  return (
    serverUrls?.[target] ||
    fromEnv[target] ||
    `https://smartlogi-${target}.vercel.app`
  ).replace(/\/+$/, '');
}

function getApiBase(): string {
  const raw =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) || '/api/v1';
  return raw.replace(/\/+$/, '');
}

function severityClass(sev: string): string {
  if (sev === 'CRITICAL' || sev === 'NEGATIVE_TEST') {
    return 'border-red-300 bg-red-50 text-red-800';
  }
  if (sev === 'WARNING') {
    return 'border-amber-300 bg-amber-50 text-amber-800';
  }
  return 'border-sky-300 bg-sky-50 text-sky-800';
}

export type DemoControlCenterProps = {
  variant?: 'banner' | 'floating' | 'inline';
  portalOverride?: DemoPortalId;
};

export function DemoControlCenter({
  variant = 'banner',
  portalOverride,
}: DemoControlCenterProps) {
  const [portal, setPortal] = useState<DemoPortalId>(portalOverride || 'tenant');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'personas' | 'scenarios' | 'tour'>('personas');
  const [me, setMe] = useState<DemoMeResponse | null>(null);
  const [personas, setPersonas] = useState<DemoPersonaItem[]>([]);
  const [scenarios, setScenarios] = useState<DemoScenarioItem[]>([]);
  const [events, setEvents] = useState<DemoEventItem[]>([]);
  const [sandboxKey, setSandboxKey] = useState('shared-demo');
  const [readOnlyGuest, setReadOnlyGuest] = useState(false);
  const [personaFilter, setPersonaFilter] = useState<'all' | DemoPortalId>('all');
  const [scenarioCat, setScenarioCat] = useState<string>('ALL');
  const [scenarioQuery, setScenarioQuery] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [tourDone, setTourDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const p = detectPortal(portalOverride);
    setPortal(p);
    if (typeof window !== 'undefined') {
      const savedSbx = window.localStorage.getItem('smartlogi_sandbox_key');
      if (savedSbx) setSandboxKey(savedSbx);
      try {
        const rawTour = window.localStorage.getItem('smartlogi_demo_tour_done');
        if (rawTour) setTourDone(JSON.parse(rawTour));
      } catch {
        // ignore invalid json
      }
    }
  }, [portalOverride]);

  const buildHeaders = useCallback(
    (activePortal: DemoPortalId, tokenOverride?: string): Record<string, string> => {
      const token =
        tokenOverride ??
        (typeof window !== 'undefined'
          ? window.localStorage.getItem(PORTAL_STORAGE_KEYS[activePortal].token)
          : null);
      const sbx =
        (typeof window !== 'undefined'
          ? window.localStorage.getItem('smartlogi_sandbox_key')
          : null) || sandboxKey;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-smartlogi-portal': activePortal,
        'x-smartlogi-sandbox': sbx || 'shared-demo',
      };
      if (token && token !== 'null' && token !== 'undefined') {
        headers.Authorization = `Bearer ${token}`;
      }
      return headers;
    },
    [sandboxKey],
  );

  const apiCall = useCallback(
    async <T = any>(
      path: string,
      opts: { method?: string; body?: any; activePortal?: DemoPortalId; tokenOverride?: string } = {},
    ): Promise<{ ok: boolean; status: number; data: T }> => {
      const targetPortal = opts.activePortal || portal;
      const res = await fetch(`${getApiBase()}${path}`, {
        method: opts.method || 'GET',
        credentials: 'include',
        headers: buildHeaders(targetPortal, opts.tokenOverride),
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      return { ok: res.ok, status: res.status, data };
    },
    [buildHeaders, portal],
  );

  const refreshState = useCallback(
    async (loadCatalogs = false) => {
      try {
        const meRes = await apiCall<DemoMeResponse>('/demo/me');
        if (meRes.ok && meRes.data) {
          setMe(meRes.data);
          if (meRes.data.sandbox?.sandboxKey) {
            setSandboxKey(meRes.data.sandbox.sandboxKey);
          }
          if (Array.isArray(meRes.data.events)) {
            setEvents(meRes.data.events);
          }
        }
        if (loadCatalogs) {
          const [pRes, sRes, eRes] = await Promise.all([
            apiCall<{ data: DemoPersonaItem[] }>('/demo/personas'),
            apiCall<{ data: DemoScenarioItem[] }>('/demo/scenarios'),
            apiCall<{ data: DemoEventItem[] }>('/demo/events'),
          ]);
          if (pRes.ok && Array.isArray(pRes.data?.data)) setPersonas(pRes.data.data);
          if (sRes.ok && Array.isArray(sRes.data?.data)) setScenarios(sRes.data.data);
          if (eRes.ok && Array.isArray(eRes.data?.data)) setEvents(eRes.data.data);
        }
      } catch {
        // non-fatal during boot
      }
    },
    [apiCall],
  );

  useEffect(() => {
    refreshState(false);
  }, [refreshState]);

  useEffect(() => {
    if (drawerOpen) {
      refreshState(true);
    }
  }, [drawerOpen, refreshState]);

  const handlePortalSwitch = async (target: DemoPortalId, explicitPath?: string) => {
    if (target === portal) {
      if (explicitPath && typeof window !== 'undefined') {
        window.location.href = explicitPath;
      } else {
        setDrawerOpen(true);
      }
      return;
    }

    setBusyKey(`switch-${target}`);
    setFeedback(null);
    try {
      if (me?.authenticated) {
        const res = await apiCall<{ handoffUrl?: string; message?: string; code?: string }>(
          '/demo/handoff',
          {
            method: 'POST',
            body: { targetPortal: target, targetPath: explicitPath || '' },
          },
        );
        if (res.ok && res.data?.handoffUrl) {
          window.location.href = res.data.handoffUrl;
          return;
        }
        setFeedback({
          tone: 'err',
          text: res.data?.message || `Không thể chuyển cổng (${res.status}).`,
        });
      } else {
        const base = resolvePortalBase(target, me?.portalUrls);
        window.location.href = `${base}${PORTAL_STORAGE_KEYS[target].loginPath}`;
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handlePersonaLogin = async (p: DemoPersonaItem) => {
    setBusyKey(`persona-${p.key}`);
    setFeedback(null);
    try {
      const targetPortal = p.portal;
      const res = await apiCall<{
        token?: string;
        user?: Record<string, any>;
        sandboxKey?: string;
        code?: string;
        message?: string;
      }>('/demo/login', {
        method: 'POST',
        body: {
          personaKey: p.key,
          portal: targetPortal === portal ? portal : targetPortal,
          sandboxKey,
          readOnlyGuest,
        },
      });

      if (!res.ok) {
        setFeedback({
          tone: 'err',
          text: `HTTP ${res.status} [${res.data?.code || 'ERROR'}]: ${res.data?.message || 'Đăng nhập thất bại.'}`,
        });
        return;
      }

      const token = res.data?.token;
      const user = res.data?.user;
      if (!token) {
        setFeedback({ tone: 'err', text: 'API không trả về JWT token.' });
        return;
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('smartlogi_sandbox_key', res.data.sandboxKey || sandboxKey);
      }

      if (p.portal === portal) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(PORTAL_STORAGE_KEYS[portal].token, token);
          window.localStorage.setItem(
            PORTAL_STORAGE_KEYS[portal].user,
            JSON.stringify(user || { email: p.email, role: p.role, tenantSlug: p.tenantSlug }),
          );
          if (p.tenantSlug && p.tenantSlug !== 'platform') {
            window.localStorage.setItem('smartlogi_tenant_slug', p.tenantSlug);
          }
          window.location.href = p.defaultPath;
        }
        return;
      }

      // Cross-portal single-use handoff with freshly issued persona token
      const handoff = await apiCall<{ handoffUrl?: string; message?: string }>(
        '/demo/handoff',
        {
          method: 'POST',
          tokenOverride: token,
          body: { targetPortal: p.portal, targetPath: p.defaultPath },
        },
      );
      if (handoff.ok && handoff.data?.handoffUrl && typeof window !== 'undefined') {
        window.location.href = handoff.data.handoffUrl;
        return;
      }
      setFeedback({
        tone: 'err',
        text: handoff.data?.message || 'Không tạo được handoff URL sang cổng đích.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleLoadScenario = async (s: DemoScenarioItem, navigateAfter: boolean) => {
    setBusyKey(`scen-${s.code}`);
    setFeedback(null);
    try {
      const res = await apiCall<{
        effects?: string[];
        message?: string;
        code?: string;
      }>('/demo/scenarios/load', {
        method: 'POST',
        body: { scenarioCode: s.code },
      });
      if (!res.ok) {
        setFeedback({
          tone: 'err',
          text: `HTTP ${res.status}: ${res.data?.message || 'Không tải được kịch bản.'}`,
        });
        return;
      }
      setFeedback({
        tone: 'ok',
        text: `${s.code}: ${(res.data?.effects || []).join(' ') || 'Đã kích hoạt.'}`,
      });
      await refreshState(true);
      if (navigateAfter && typeof window !== 'undefined') {
        if (s.targetPortal === portal) {
          window.location.href = s.targetPath;
        } else if (me?.authenticated) {
          await handlePortalSwitch(s.targetPortal, s.targetPath);
        } else {
          const base = resolvePortalBase(s.targetPortal, me?.portalUrls);
          window.location.href = `${base}${PORTAL_STORAGE_KEYS[s.targetPortal].loginPath}`;
        }
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleStepTick = async () => {
    setBusyKey('step-tick');
    try {
      const res = await apiCall<{
        stepped: boolean;
        reason?: string;
        stepCount?: number;
        waypoint?: { label: string };
      }>('/demo/scenarios/step', { method: 'POST', body: {} });
      if (res.ok && res.data?.stepped) {
        setFeedback({
          tone: 'ok',
          text: `GPS Tick #${res.data.stepCount}: ${res.data.waypoint?.label || 'Updated'}`,
        });
      } else {
        setFeedback({
          tone: 'err',
          text: `Telemetry không chạy: ${res.data?.reason || 'PAUSED'}`,
        });
      }
      await refreshState(drawerOpen);
    } finally {
      setBusyKey(null);
    }
  };

  const handleControl = async (patch: Record<string, any>) => {
    setBusyKey('control');
    try {
      const res = await apiCall('/demo/scenarios/control', { method: 'POST', body: patch });
      if (res.ok) {
        setFeedback({ tone: 'ok', text: 'Đã cập nhật cấu hình mô phỏng.' });
        await refreshState(drawerOpen);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleCreateSandbox = async () => {
    setBusyKey('create-sbx');
    try {
      const res = await apiCall<{ sandboxKey?: string; token?: string }>(
        '/demo/sandbox/create',
        { method: 'POST', body: {} },
      );
      if (res.ok && res.data?.sandboxKey) {
        const nextKey = res.data.sandboxKey;
        setSandboxKey(nextKey);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('smartlogi_sandbox_key', nextKey);
          if (res.data.token) {
            window.localStorage.setItem(PORTAL_STORAGE_KEYS[portal].token, res.data.token);
          }
        }
        setFeedback({ tone: 'ok', text: `Đã tạo Sandbox riêng: ${nextKey}` });
        await refreshState(true);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleResetSandbox = async () => {
    setBusyKey('reset-sbx');
    try {
      const res = await apiCall('/demo/sandbox/reset', {
        method: 'POST',
        body: { sandboxKey },
      });
      if (res.ok) {
        setFeedback({
          tone: 'ok',
          text: `Đã Reset Sandbox "${sandboxKey}" về trạng thái vận hành tiêu chuẩn.`,
        });
        await refreshState(true);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const toggleTourStep = (id: string) => {
    setTourDone((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('smartlogi_demo_tour_done', JSON.stringify(next));
      }
      return next;
    });
  };

  const filteredPersonas = useMemo(
    () => personas.filter((p) => personaFilter === 'all' || p.portal === personaFilter),
    [personas, personaFilter],
  );

  const filteredScenarios = useMemo(
    () =>
      scenarios.filter((s) => {
        if (scenarioCat !== 'ALL' && s.category !== scenarioCat) return false;
        if (scenarioQuery.trim()) {
          const q = scenarioQuery.trim().toLowerCase();
          return (
            s.code.toLowerCase().includes(q) ||
            s.title.toLowerCase().includes(q) ||
            s.summary.toLowerCase().includes(q)
          );
        }
        return true;
      }),
    [scenarios, scenarioCat, scenarioQuery],
  );

  const completedTourCount = useMemo(
    () => TOUR_STEPS.filter((t) => tourDone[t.id]).length,
    [tourDone],
  );

  const sbx = me?.sandbox;
  const activeMode = sbx?.networkSimMode || 'NORMAL';

  const renderDrawer = () => {
    if (!drawerOpen) return null;
    return (
      <div
        className="fixed inset-0 z-[80] flex justify-end bg-black/40 backdrop-blur-[1px]"
        role="dialog"
        aria-modal="true"
        aria-label="Trung tâm Điều khiển Demo"
      >
        <div
          className="fixed inset-0"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
        <div className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-line bg-surface shadow-2xl">
          {/* Drawer Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-alt px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">
                Trung tâm Điều khiển Demo &amp; Kịch bản (Cloud PostgreSQL + RLS)
              </h2>
              <p className="text-[11px] text-ink-soft">
                Portal: <strong className="uppercase">{portal}</strong> · Sandbox:{' '}
                <code className="rounded bg-surface px-1 py-0.5 font-mono text-[10px]">
                  {sandboxKey}
                </code>{' '}
                · Scenario:{' '}
                <code className="rounded bg-surface px-1 py-0.5 font-mono text-[10px]">
                  {sbx?.activeScenario || 'NORMAL_DAY'}
                </code>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:border-line-strong"
            >
              Đóng
            </button>
          </div>

          {/* Feedback Bar */}
          {feedback ? (
            <div
              className={`border-b px-4 py-2 text-xs ${
                feedback.tone === 'err'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}
            >
              {feedback.text}
            </div>
          ) : null}

          {/* Tabs */}
          <div className="flex border-b border-line bg-surface px-4">
            <button
              type="button"
              onClick={() => setActiveTab('personas')}
              className={`border-b-2 px-3 py-2 text-xs font-semibold ${
                activeTab === 'personas'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              Vai trò &amp; Cổng ({personas.length || 15})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('scenarios')}
              className={`border-b-2 px-3 py-2 text-xs font-semibold ${
                activeTab === 'scenarios'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              Kịch bản &amp; Hỗn loạn ({scenarios.length || 32})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tour')}
              className={`border-b-2 px-3 py-2 text-xs font-semibold ${
                activeTab === 'tour'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              Tour 8 bước ({completedTourCount}/8)
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 text-xs">
            {activeTab === 'personas' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface-alt p-2.5">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
                    <input
                      type="checkbox"
                      checked={readOnlyGuest}
                      onChange={(e) => setReadOnlyGuest(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-line-strong"
                    />
                    <span>Chế độ Read-Only Guest (chỉ đọc, kiểm chứng chặn ghi HTTP 403)</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busyKey === 'create-sbx'}
                      onClick={handleCreateSandbox}
                      className="rounded border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:border-accent"
                    >
                      Tạo Sandbox riêng
                    </button>
                    <button
                      type="button"
                      disabled={busyKey === 'reset-sbx'}
                      onClick={handleResetSandbox}
                      className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100"
                    >
                      Reset Sandbox
                    </button>
                  </div>
                </div>

                {/* Portal Filter */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['all', 'admin', 'tenant', 'customer', 'pack'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setPersonaFilter(f)}
                      className={`rounded-md border px-2.5 py-1 text-[11px] font-medium uppercase ${
                        personaFilter === f
                          ? 'border-accent bg-accent text-white'
                          : 'border-line bg-surface text-ink-soft hover:text-ink'
                      }`}
                    >
                      {f === 'all' ? 'Tất cả cổng' : f}
                    </button>
                  ))}
                </div>

                {/* Personas List */}
                <div className="grid gap-2">
                  {filteredPersonas.map((p) => {
                    const isCurrent = me?.user?.email === p.email;
                    return (
                      <div
                        key={p.key}
                        className={`flex flex-col justify-between gap-2 rounded-md border p-3 sm:flex-row sm:items-center ${
                          p.isNegativeTest
                            ? 'border-red-200 bg-red-50/40'
                            : isCurrent
                              ? 'border-accent bg-accent-soft/40'
                              : 'border-line bg-surface'
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-surface-alt px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-ink">
                              {p.portal}
                            </span>
                            <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                              {p.role}
                            </span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
                              {p.tenantSlug}
                            </span>
                            {p.isNegativeTest ? (
                              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
                                403 NEGATIVE TEST
                              </span>
                            ) : null}
                            {isCurrent ? (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                                ĐANG DÙNG
                              </span>
                            ) : null}
                          </div>
                          <p className="font-semibold text-ink">{p.title}</p>
                          <p className="text-[11px] text-ink-soft">{p.description}</p>
                          <p className="font-mono text-[10px] text-ink-faint">{p.email}</p>
                        </div>
                        <button
                          type="button"
                          disabled={busyKey === `persona-${p.key}`}
                          onClick={() => handlePersonaLogin(p)}
                          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold ${
                            p.isNegativeTest
                              ? 'border border-red-300 bg-white text-red-700 hover:bg-red-50'
                              : 'bg-accent text-white hover:opacity-90'
                          } disabled:opacity-50`}
                        >
                          {busyKey === `persona-${p.key}`
                            ? 'Đang xử lý...'
                            : p.isNegativeTest
                              ? 'Thử chặn 403'
                              : p.portal === portal
                                ? 'Vào ngay'
                                : `Mở cổng ${p.portal}`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {activeTab === 'scenarios' ? (
              <div className="space-y-3">
                {/* Simulation Controls */}
                <div className="space-y-2 rounded-md border border-line bg-surface-alt p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-ink">
                      Điều khiển Telemetry &amp; Fault Injection
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busyKey === 'step-tick'}
                        onClick={handleStepTick}
                        className="rounded border border-accent bg-accent px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90"
                      >
                        Chạy 1 nhịp GPS
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleControl({ telemetryPaused: !sbx?.telemetryPaused })
                        }
                        className="rounded border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink"
                      >
                        {sbx?.telemetryPaused ? 'Tiếp tục GPS' : 'Tạm dừng GPS'}
                      </button>
                      {[1, 2, 5].map((sp) => (
                        <button
                          key={sp}
                          type="button"
                          onClick={() => handleControl({ simSpeed: sp })}
                          className={`rounded border px-2 py-1 text-[11px] font-mono ${
                            (sbx?.simSpeed || 1) === sp
                              ? 'border-accent bg-accent text-white'
                              : 'border-line bg-surface text-ink-soft'
                          }`}
                        >
                          {sp}x
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <label className="flex items-center gap-2 text-[11px] text-ink-soft">
                      <span>Chế độ lỗi mạng giả lập:</span>
                      <select
                        value={activeMode}
                        onChange={(e) => handleControl({ networkSimMode: e.target.value })}
                        className="rounded border border-line bg-surface px-2 py-1 text-[11px] font-mono text-ink"
                      >
                        <option value="NORMAL">NORMAL (Bình thường)</option>
                        <option value="SLOW_800MS">SLOW_800MS (Trễ mạng 800ms)</option>
                        <option value="RATE_LIMIT_429">RATE_LIMIT_429 (Thử retry 429)</option>
                        <option value="SERVER_500">SERVER_500 (Lỗi 500 trên /orders|/freight)</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={handleResetSandbox}
                      className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700"
                    >
                      Reset Sandbox
                    </button>
                  </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="search"
                    value={scenarioQuery}
                    onChange={(e) => setScenarioQuery(e.target.value)}
                    placeholder="Tìm mã hoặc tên kịch bản..."
                    className="h-8 flex-1 rounded-md border border-line bg-surface px-2.5 text-xs text-ink outline-none focus:border-accent"
                  />
                  <select
                    value={scenarioCat}
                    onChange={(e) => setScenarioCat(e.target.value)}
                    className="h-8 rounded-md border border-line bg-surface px-2 text-xs text-ink"
                  >
                    <option value="ALL">Tất cả nhóm (32)</option>
                    <option value="OPERATIONS">Vận hành &amp; Điều phối</option>
                    <option value="DELIVERY_FINANCE">Giao hàng, COD &amp; Tài chính</option>
                    <option value="CONTAINER_YARD_TRADE">Container, Bãi &amp; XNK</option>
                    <option value="WMS_PACK">Kho WMS &amp; Đóng gói</option>
                    <option value="GEO_SECURITY">Địa giới, Bảo mật &amp; Outbox</option>
                  </select>
                </div>

                {/* Scenario List */}
                <div className="grid gap-2">
                  {filteredScenarios.map((s) => (
                    <div
                      key={s.code}
                      className="rounded-md border border-line bg-surface p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <code className="rounded bg-surface-alt px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink">
                            {s.code}
                          </code>
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${severityClass(
                              s.severity,
                            )}`}
                          >
                            {s.severity}
                          </span>
                          <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-soft">
                            {s.targetPortal}: {s.targetPath}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyKey === `scen-${s.code}`}
                            onClick={() => handleLoadScenario(s, false)}
                            className="rounded border border-line bg-surface-alt px-2.5 py-1 text-[11px] font-medium text-ink hover:border-accent"
                          >
                            Kích hoạt
                          </button>
                          <button
                            type="button"
                            disabled={busyKey === `scen-${s.code}`}
                            onClick={() => handleLoadScenario(s, true)}
                            className="rounded bg-accent px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90"
                          >
                            Tải &amp; Mở
                          </button>
                        </div>
                      </div>
                      <p className="mt-1.5 font-semibold text-ink">{s.title}</p>
                      <p className="mt-0.5 text-[11px] text-ink-soft">{s.summary}</p>
                      <p className="mt-1 text-[11px] text-ink-faint">
                        Kết quả kỳ vọng: {s.expectedOutcome}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Live Event Feed */}
                <div className="rounded-md border border-line bg-surface-alt p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-ink">
                      Nhật ký sự kiện mô phỏng ({events.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => refreshState(true)}
                      className="text-[11px] font-medium text-accent hover:underline"
                    >
                      Làm mới
                    </button>
                  </div>
                  <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
                    {events.length === 0 ? (
                      <p className="text-[11px] text-ink-faint">
                        Chưa có sự kiện nào trong sandbox này.
                      </p>
                    ) : (
                      events.map((ev) => (
                        <div
                          key={ev.id}
                          className="rounded border border-line bg-surface px-2 py-1.5 text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] font-semibold text-accent">
                              {ev.category} · {ev.eventType}
                            </span>
                            <span className="font-mono text-[10px] text-ink-faint">
                              {new Date(ev.createdAt).toLocaleTimeString('vi-VN')}
                            </span>
                          </div>
                          <p className="mt-0.5 text-ink">{ev.summary}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'tour' ? (
              <div className="space-y-3">
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
                  <p className="font-semibold">
                    Phân tách minh bạch: Mô phỏng vs Dữ liệu DB thật
                  </p>
                  <p className="mt-1">
                    Các thao tác nghiệp vụ ghi trực tiếp vào PostgreSQL + PostGIS theo Tenant RLS.
                    Các nguồn ngoại vi sau chạy mô phỏng có nhãn rõ ràng:{' '}
                    <strong>GPS Telemetry Feed</strong>,{' '}
                    <strong>Pack Virtual Camera/Barcode/Scale</strong>,{' '}
                    <strong>Bank CSV Fixture</strong>,{' '}
                    <strong>VNACCS Customs Gateway</strong>,{' '}
                    <strong>AI Simulation Workflow (501 Boundary được giữ nguyên)</strong>.
                  </p>
                </div>

                <div className="space-y-2">
                  {TOUR_STEPS.map((st) => {
                    const checked = Boolean(tourDone[st.id]);
                    return (
                      <div
                        key={st.id}
                        className={`flex flex-col justify-between gap-2 rounded-md border p-3 sm:flex-row sm:items-center ${
                          checked ? 'border-emerald-200 bg-emerald-50/40' : 'border-line bg-surface'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTourStep(st.id)}
                            className="mt-0.5 h-4 w-4 rounded border-line-strong"
                          />
                          <div>
                            <p className="font-semibold text-ink">{st.title}</p>
                            <p className="mt-0.5 text-[11px] text-ink-soft">{st.detail}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePortalSwitch(st.portal, st.path)}
                          className="shrink-0 rounded-md border border-line bg-surface-alt px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-accent"
                        >
                          Mở {st.portal}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between rounded-md border border-line bg-surface-alt p-3">
                  <span className="text-[11px] text-ink-soft">
                    Kiểm tra trạng thái commit SHA, PostGIS và kết nối Cloud Database:
                  </span>
                  <a
                    href="/build-info"
                    className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-semibold text-white"
                  >
                    Xem /build-info
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  if (variant === 'floating') {
    return (
      <>
        <div className="fixed bottom-4 left-4 z-50 flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface/95 px-2.5 py-1.5 shadow-lg backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-[11px] font-semibold text-ink">Demo Cloud</span>
          <button
            type="button"
            data-testid="demo-control-toggle"
            onClick={() => setDrawerOpen(true)}
            className="rounded bg-accent px-2 py-0.5 text-[11px] font-semibold text-white hover:opacity-90"
          >
            Trung tâm Demo
          </button>
        </div>
        {renderDrawer()}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              activeMode === 'NORMAL' ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          <span className="font-semibold text-ink">
            SMARTLOGI DEMO CLOUD · Synthetic Demo Data
          </span>
          {me?.authenticated && me.user ? (
            <span className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink">
              {me.user.email} · {me.user.role}
              {me.user.readOnlyGuest ? ' [READ-ONLY]' : ''}
            </span>
          ) : null}
          <span className="hidden rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-soft sm:inline-block">
            Sbx: {sandboxKey} · Scen: {sbx?.activeScenario || 'NORMAL_DAY'}
          </span>
          {activeMode !== 'NORMAL' ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-900">
              FAULT: {activeMode}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {(['admin', 'tenant', 'customer', 'pack'] as DemoPortalId[]).map((p) => (
            <button
              key={p}
              type="button"
              disabled={busyKey === `switch-${p}`}
              onClick={() => handlePortalSwitch(p)}
              className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                portal === p
                  ? 'border-accent bg-accent text-white'
                  : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'
              }`}
              title={`Chuyển sang cổng ${PORTAL_STORAGE_KEYS[p].label}`}
            >
              {PORTAL_STORAGE_KEYS[p].label}
            </button>
          ))}
          <button
            type="button"
            disabled={busyKey === 'step-tick'}
            onClick={handleStepTick}
            className="hidden rounded border border-line bg-surface px-2 py-0.5 text-[10px] font-medium text-ink hover:border-accent sm:inline-block"
            title="Giả lập 1 bước GPS tuyến Đồng Nai"
          >
            +1 GPS
          </button>
          <button
            type="button"
            data-testid="demo-control-toggle"
            onClick={() => setDrawerOpen(true)}
            className="rounded border border-accent bg-surface px-2 py-0.5 text-[10px] font-semibold text-accent hover:bg-accent hover:text-white"
          >
            Trung tâm Demo ({completedTourCount}/8)
          </button>
        </div>
      </div>
      {renderDrawer()}
    </>
  );
}
