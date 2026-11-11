const TENANT_SLUG_KEY = "smartlogi_customer_tenant_slug";

const isBrowser = () => typeof window !== "undefined";

export const getTenantSlug = (): string | null => {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(TENANT_SLUG_KEY);
};

export const setTenantSlug = (slug: string) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(TENANT_SLUG_KEY, slug);
};
