import type { SyncQueueItem, DatasourceConfig, LibrarySnapshot } from '../types';
import * as sheetsService from './sheets';

const MAX_RETRY_COUNT = 3;
const RETRY_DELAYS = [1000, 5000, 15000];

export async function flushSyncQueue(): Promise<void> {
  const result = await browser.storage.local.get(['syncQueue', 'datasourceConfig', 'librarySnapshot']);
  const queue: SyncQueueItem[] = result.syncQueue || [];
  const config: DatasourceConfig | undefined = result.datasourceConfig;
  const snapshot: LibrarySnapshot | undefined = result.librarySnapshot;

  if (!config || !config.connected || queue.length === 0) {
    return;
  }

  const pendingItems = queue.filter(item => item.syncState === 'pending' || item.syncState === 'retrying');
  if (pendingItems.length === 0) {
    return;
  }

  const updates = pendingItems.map(item => ({
    pageKey: item.pageKey,
    status: item.status,
    version: item.version,
  }));

  try {
    await sheetsService.batchUpdateStatus(config, updates);

    const successIds = pendingItems.map(item => item.id);
    const updatedQueue = queue.filter(item => !successIds.includes(item.id));
    await browser.storage.local.set({ syncQueue: updatedQueue });

    if (snapshot) {
      const updatedRecords = snapshot.records.map(record => {
        const item = pendingItems.find(i => i.pageKey === record.pageKey && i.siteKey === record.siteKey);
        if (item) {
          return { ...record, syncState: 'synced' as const };
        }
        return record;
      });
      await browser.storage.local.set({ librarySnapshot: { ...snapshot, records: updatedRecords } });
    }
  } catch (error: unknown) {
    console.error('Sync queue flush failed:', error);

    const updatedQueue = queue.map(item => {
      if (pendingItems.find(p => p.id === item.id)) {
        const newRetryCount = item.retryCount + 1;
        if (newRetryCount >= MAX_RETRY_COUNT) {
          return {
            ...item,
            syncState: 'error' as const,
            lastError: error instanceof Error ? error.message : 'Unknown error',
            retryCount: newRetryCount,
          };
        }
        return {
          ...item,
          syncState: 'retrying' as const,
          lastError: error instanceof Error ? error.message : 'Unknown error',
          retryCount: newRetryCount,
        };
      }
      return item;
    });

    await browser.storage.local.set({ syncQueue: updatedQueue });

    const retryDelay = RETRY_DELAYS[Math.min(pendingItems[0]?.retryCount || 0, RETRY_DELAYS.length - 1)];
    setTimeout(() => flushSyncQueue(), retryDelay);
  }
}

export async function schedulePeriodicSync(): Promise<void> {
  await flushSyncQueue();
  setTimeout(() => schedulePeriodicSync(), 60000);
}
