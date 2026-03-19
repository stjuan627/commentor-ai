import type { KeywordItem } from './keyword';

export interface DatasourceConfig {
  provider: 'google-sheets';
  spreadsheetId: string;
  sheetName: string;
  connected: boolean;
  connectedAt?: string;
  webPageSheetName?: string;
}

export interface AuthState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
}

export type PageStatus = 'pending' | 'done' | 'invalid';
export type SyncState = 'synced' | 'pending' | 'retrying' | 'error';

export interface Product {
  id: string;
  name: string;
  keywords: KeywordItem[];
  sheetName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WebPageRecord {
  pageKey: string;
  siteKey: string;
  sourceUrl: string;
  canonicalUrl: string;
  title: string;
  version: number;
  updatedAt: string;
}

export interface ProductPageStatusRecord {
  id: string;
  productId: string;
  pageKey: string;
  siteKey: string;
  status: PageStatus;
  comment?: string;
  version: number;
  updatedAt: string;
  syncState?: SyncState;
}

export interface ProductTaskRecord extends WebPageRecord {
  productId: string;
  productName: string;
  status: PageStatus;
  taskVersion: number;
  taskUpdatedAt: string;
  comment?: string;
  syncState?: SyncState;
}

export interface WebPageSnapshot {
  records: WebPageRecord[];
  fetchedAt: string;
  datasourceVersion?: string;
}

export interface ProductStatusSnapshot {
  [productId: string]: ProductPageStatusRecord[];
}

export interface ProductLibrarySnapshot {
  products: Product[];
  webPages: WebPageSnapshot | null;
  statuses: ProductStatusSnapshot;
  fetchedAt: string;
}

export interface ProductSyncQueueItem {
  id: string;
  productId: string;
  pageKey: string;
  siteKey: string;
  status: PageStatus;
  comment?: string;
  version: number;
  enqueuedAt: string;
  retryCount: number;
  lastError?: string;
  syncState: SyncState;
}

export interface ActiveProductContext {
  productId: string;
  pageKey: string;
  siteKey: string;
  tabId?: number;
  boundAt: string;
}

export const ProductStorageKeys = {
  DATASOURCE_CONFIG: 'datasourceConfig',
  AUTH_STATE: 'authState',
  PRODUCTS: 'products',
  WEB_PAGE_SNAPSHOT: 'webPageSnapshot',
  PRODUCT_STATUSES: 'productStatuses',
  SYNC_QUEUE: 'syncQueue',
  ACTIVE_PRODUCT_CONTEXT: 'activeProductContext',
  ACTIVE_PRODUCT_ID: 'activeProductId',
} as const;

export interface LibraryStorage {
  datasourceConfig?: DatasourceConfig;
  authState?: AuthState;
  products?: Product[];
  webPageSnapshot?: WebPageSnapshot;
  productStatuses?: ProductStatusSnapshot;
  syncQueue?: ProductSyncQueueItem[];
  activeProductContext?: ActiveProductContext;
  activeProductId?: string;
}

export interface PageRecord extends WebPageRecord {
  status: PageStatus;
  updatedBy?: string;
  syncState?: SyncState;
}

export interface LibrarySnapshot {
  records: PageRecord[];
  fetchedAt: string;
  datasourceVersion?: string;
}

export interface SyncQueueItem extends ProductSyncQueueItem {}

export interface ActiveLibraryContext {
  productId: string;
  pageKey: string;
  siteKey: string;
  tabId?: number;
  boundAt: string;
}

export function normalizePageKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'ref', 'source',
    ];
    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function normalizeSiteKey(url: string): string {
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
      return new URL(url).hostname.toLowerCase();
    }

    return new URL(`https://${url}`).hostname.toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0] || '';
  }
}

export function buildProductSheetName(product: Pick<Product, 'sheetName' | 'id' | 'name'>): string {
  if (product.sheetName && product.sheetName.trim()) {
    return product.sheetName.trim();
  }

  return `product_${product.id}`;
}

export function createProductPageStatusId(productId: string, pageKey: string): string {
  return `${productId}::${pageKey}`;
}

export function createProductTaskRecord(
  product: Product,
  page: WebPageRecord,
  status?: ProductPageStatusRecord,
): ProductTaskRecord {
  return {
    ...page,
    productId: product.id,
    productName: product.name,
    status: status?.status ?? 'pending',
    taskVersion: status?.version ?? 0,
    taskUpdatedAt: status?.updatedAt ?? page.updatedAt,
    comment: status?.comment,
    syncState: status?.syncState ?? 'synced',
  };
}
