import type { Product } from '../types';

const PRODUCTS_KEY = 'products';
const ACTIVE_PRODUCT_ID_KEY = 'activeProductId';
const LEGACY_SITES_KEY = 'sites';

function nowIso(): string {
  return new Date().toISOString();
}

export function createProductId(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  return `${base || 'product'}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getProducts(): Promise<Product[]> {
  const result = await browser.storage.local.get([PRODUCTS_KEY, LEGACY_SITES_KEY]);

  if (Array.isArray(result[PRODUCTS_KEY])) {
    return result[PRODUCTS_KEY] as Product[];
  }

  if (Array.isArray(result[LEGACY_SITES_KEY]) && result[LEGACY_SITES_KEY].length > 0) {
    const migrated = (result[LEGACY_SITES_KEY] as Product[]).map((site) => ({
      ...site,
      createdAt: site.createdAt ?? nowIso(),
      updatedAt: site.updatedAt ?? nowIso(),
    }));

    await browser.storage.local.set({ [PRODUCTS_KEY]: migrated });
    return migrated;
  }

  return [];
}

export async function saveProducts(products: Product[]): Promise<void> {
  await browser.storage.local.set({ [PRODUCTS_KEY]: products });
}

export async function getActiveProductId(): Promise<string | null> {
  const result = await browser.storage.local.get(ACTIVE_PRODUCT_ID_KEY);
  return result[ACTIVE_PRODUCT_ID_KEY] ?? null;
}

export async function setActiveProductId(productId: string | null): Promise<void> {
  if (!productId) {
    await browser.storage.local.remove(ACTIVE_PRODUCT_ID_KEY);
    return;
  }

  await browser.storage.local.set({ [ACTIVE_PRODUCT_ID_KEY]: productId });
}
