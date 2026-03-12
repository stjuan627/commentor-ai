export interface DatasourceConfig {
  provider: 'google-sheets';
  spreadsheetId: string;
  sheetName: string;
  connected: boolean;
  connectedAt?: string;
}

export interface AuthState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
}

export type PageStatus = 'pending' | 'done' | 'invalid';
export type SyncState = 'synced' | 'pending' | 'retrying' | 'error';

export interface PageRecord {
  pageKey: string;
  siteKey: string;
  sourceUrl: string;
  canonicalUrl: string;
  title: string;
  status: PageStatus;
  version: number;
  updatedAt: string;
  updatedBy?: string;
  syncState?: SyncState;
}

export interface LibrarySnapshot {
  records: PageRecord[];
  fetchedAt: string;
  datasourceVersion?: string;
}

export interface SyncQueueItem {
  id: string;
  pageKey: string;
  siteKey: string;
  status: PageStatus;
  version: number;
  enqueuedAt: string;
  retryCount: number;
  lastError?: string;
  syncState: SyncState;
}

export interface ActiveLibraryContext {
  pageKey: string;
  siteKey: string;
  tabId?: number;
  boundAt: string;
}

export const LibraryStorageKeys = {
  DATASOURCE_CONFIG: 'datasourceConfig',
  AUTH_STATE: 'authState',
  LIBRARY_SNAPSHOT: 'librarySnapshot',
  SYNC_QUEUE: 'syncQueue',
  ACTIVE_LIBRARY_CONTEXT: 'activeLibraryContext',
} as const;

export interface LibraryStorage {
  datasourceConfig?: DatasourceConfig;
  authState?: AuthState;
  librarySnapshot?: LibrarySnapshot;
  syncQueue?: SyncQueueItem[];
  activeLibraryContext?: ActiveLibraryContext;
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
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}
