import {
  matchRoute,
  PUBLIC_PATHS,
  PROXY_SKIP_PATHS,
} from './services.config';

describe('API Gateway Route Rules & Public Paths', () => {
  it('matches segment boundaries so /api/v1/tracking/* is NOT treated as /api/v1/track', () => {
    const trackingRule = matchRoute('/api/v1/tracking/SLG-123');
    expect(trackingRule?.service).toBe('core-api');
    expect(trackingRule?.prefix).toBe('/api/v1/tracking');

    const trackRule = matchRoute('/api/v1/track/SLG-123');
    expect(trackRule?.service).toBe('core-api');
    expect(trackRule?.prefix).toBe('/api/v1/track');

    expect(PUBLIC_PATHS).toContain('/api/v1/track');
    expect(PUBLIC_PATHS).not.toContain('/api/v1/tracking');
  });

  it('routes device /api/v1/gps/ingest to Go gps-ingestion service with /gps/batch rewrite while keeping /api/v1/gps on core-api', () => {
    const ingestRule = matchRoute('/api/v1/gps/ingest');
    expect(ingestRule?.service).toBe('gps-ingestion');
    expect(ingestRule?.mapPath?.('/api/v1/gps/ingest')).toBe('/gps/batch');
    expect(PUBLIC_PATHS).toContain('/api/v1/gps/ingest');

    const fleetRule = matchRoute('/api/v1/gps/active-fleet');
    expect(fleetRule?.service).toBe('core-api');
    expect(fleetRule?.prefix).toBe('/api/v1/gps');
  });

  it('rewrites legacy /api/v1/wms/* prefix to /api/v1/* on core-api', () => {
    const wmsRule = matchRoute('/api/v1/wms/waves');
    expect(wmsRule?.service).toBe('core-api');
    expect(wmsRule?.mapPath?.('/api/v1/wms/waves')).toBe('/api/v1/waves');
  });

  it('routes /api/v1/routing/* to ai-worker without /api/v1 prefix while separating /api/v1/ai/models (core-api) vs /api/v1/ai/v1/* (ai-worker)', () => {
    const routingRule = matchRoute('/api/v1/routing/solve');
    expect(routingRule?.service).toBe('ai-worker');
    expect(routingRule?.mapPath?.('/api/v1/routing/solve')).toBe('/routing/solve');

    const modelsRule = matchRoute('/api/v1/ai/models');
    expect(modelsRule?.service).toBe('core-api');

    const aiWorkerRule = matchRoute('/api/v1/ai/v1/chat');
    expect(aiWorkerRule?.service).toBe('ai-worker');
  });

  it('keeps newly aligned portal prefixes on core-api and inbound webhooks on webhook-service', () => {
    expect(matchRoute('/api/v1/branches')?.service).toBe('core-api');
    expect(matchRoute('/api/v1/reports/summary')?.service).toBe('core-api');
    expect(matchRoute('/api/v1/settings')?.service).toBe('core-api');
    expect(matchRoute('/api/v1/finance/cod')?.service).toBe('core-api');

    const inboundRule = matchRoute('/api/v1/inbound/webhooks/deliver');
    expect(inboundRule?.service).toBe('webhook-service');
    expect(inboundRule?.mapPath?.('/api/v1/inbound/webhooks/deliver')).toBe('/webhooks/deliver');
    expect(PUBLIC_PATHS).toContain('/api/v1/inbound/webhooks');
  });

  it('excludes gateway-owned health/docs paths from proxy forwarding', () => {
    expect(PROXY_SKIP_PATHS).toEqual(
      expect.arrayContaining(['/health', '/api/health', '/routes', '/api/gateway/health', '/api/docs'])
    );
  });
});
