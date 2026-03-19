import type {
  DatasourceConfig,
  Product,
  ProductPageStatusRecord,
  ProductStatusSnapshot,
  ProductSyncQueueItem,
} from '../types';
import { getProducts } from './products';
import { getProductStatuses, saveProductStatuses } from './productMatrix';
import { upsertProductStatus } from './sheets';

const MAX_RETRY_COUNT = 3;
const RETRY_DELAYS = [1000, 5000, 15000];

function getRetryDelay(retryCount: number): number {
  return RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
}

function markSynced(
  statuses: ProductStatusSnapshot,
  item: ProductSyncQueueItem,
): ProductStatusSnapshot {
  const next: ProductStatusSnapshot = { ...statuses };
  next[item.productId] = (next[item.productId] ?? []).map((record) => {
    if (record.id !== item.id) {
      return record;
    }

    return {
      ...record,
      syncState: 'synced',
    } as ProductPageStatusRecord;
  });

  return next;
}

export async function flushSyncQueue(): Promise<void> {
  const result = await browser.storage.local.get(['syncQueue', 'datasourceConfig']);
  const queue: ProductSyncQueueItem[] = result.syncQueue || [];
  const config: DatasourceConfig | undefined = result.datasourceConfig;

  if (!config || !config.connected || queue.length === 0) {
    return;
  }

  const products = await getProducts();
  const productsById = new Map<string, Product>(products.map((product) => [product.id, product]));
  let statuses = await getProductStatuses();
  const pendingItems = queue.filter((item) => item.syncState === 'pending' || item.syncState === 'retrying');

  if (pendingItems.length === 0) {
    return;
  }

  const nextQueue = [...queue];

  for (const item of pendingItems) {
    const product = productsById.get(item.productId);
    if (!product) {
      continue;
    }

    try {
      await upsertProductStatus(config, product, {
        id: item.id,
        productId: item.productId,
        pageKey: item.pageKey,
        siteKey: item.siteKey,
        status: item.status,
        comment: item.comment,
        version: item.version,
        updatedAt: new Date().toISOString(),
        syncState: 'synced',
      });

      const queueIndex = nextQueue.findIndex((queueItem) => queueItem.id === item.id);
      if (queueIndex >= 0) {
        nextQueue.splice(queueIndex, 1);
      }
      statuses = markSynced(statuses, item);
    } catch (error: unknown) {
      const queueIndex = nextQueue.findIndex((queueItem) => queueItem.id === item.id);
      if (queueIndex === -1) {
        continue;
      }

      const retryCount = nextQueue[queueIndex].retryCount + 1;
      nextQueue[queueIndex] = {
        ...nextQueue[queueIndex],
        retryCount,
        syncState: retryCount >= MAX_RETRY_COUNT ? 'error' : 'retrying',
        lastError: error instanceof Error ? error.message : 'Unknown error',
      };

      setTimeout(() => {
        void flushSyncQueue();
      }, getRetryDelay(retryCount));
    }
  }

  await browser.storage.local.set({ syncQueue: nextQueue });
  await saveProductStatuses(statuses);
}

export async function schedulePeriodicSync(): Promise<void> {
  await flushSyncQueue();
  setTimeout(() => {
    void schedulePeriodicSync();
  }, 60000);
}
