import api from './api';
import { createMockRepository, createRestRepository } from './mock';
import type { MockRepository, RequestFn } from './mock';

/**
 * Single entry point for pack station data.
 *
 * `NEXT_PUBLIC_DATA_SOURCE` defaults to `mock` so the deployed demo works with
 * no backend. Set it to `api` (plus `NEXT_PUBLIC_API_URL`) once the Rust or
 * NestJS backend is reachable.
 */

export const dataSource: 'mock' | 'api' =
  process.env.NEXT_PUBLIC_DATA_SOURCE === 'api' ? 'api' : 'mock';

export const isMockDataSource = dataSource === 'mock';

const request: RequestFn = async (method, path, body) => {
  const isReadOrDelete = method === 'GET' || method === 'DELETE' || method === 'HEAD';
  const response = await api.request({
    method,
    url: path,
    ...(isReadOrDelete ? { params: body } : { data: body }),
  });
  return response.data;
};

export const data: MockRepository = isMockDataSource
  ? createMockRepository()
  : createRestRepository(request);

/** Demo-only helpers used by the reset button in the shell. */
export async function resetDemoData() {
  if (!isMockDataSource) return;
  await data.controls({ reset: true });
}

export async function simulateOutage(enabled: boolean) {
  if (!isMockDataSource) return;
  await data.controls({ failureRate: enabled ? 1 : 0 });
}
