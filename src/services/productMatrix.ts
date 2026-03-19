import type {
  Product,
  ProductPageStatusRecord,
  ProductStatusSnapshot,
  ProductTaskRecord,
  WebPageRecord,
  WebPageSnapshot,
} from '../types';
import { createProductPageStatusId, createProductTaskRecord } from '../types';

const WEB_PAGE_SNAPSHOT_KEY = 'webPageSnapshot';
const PRODUCT_STATUSES_KEY = 'productStatuses';

export async function getWebPageSnapshot(): Promise<WebPageSnapshot | null> {
  const result = await browser.storage.local.get(WEB_PAGE_SNAPSHOT_KEY);
  return result[WEB_PAGE_SNAPSHOT_KEY] ?? null;
}

export async function saveWebPageSnapshot(snapshot: WebPageSnapshot): Promise<void> {
  await browser.storage.local.set({ [WEB_PAGE_SNAPSHOT_KEY]: snapshot });
}

export async function getProductStatuses(): Promise<ProductStatusSnapshot> {
  const result = await browser.storage.local.get(PRODUCT_STATUSES_KEY);
  return result[PRODUCT_STATUSES_KEY] ?? {};
}

export async function saveProductStatuses(statuses: ProductStatusSnapshot): Promise<void> {
  await browser.storage.local.set({ [PRODUCT_STATUSES_KEY]: statuses });
}

export function mergeProductStatuses(
  current: ProductStatusSnapshot,
  incoming: ProductStatusSnapshot,
): ProductStatusSnapshot {
  const merged: ProductStatusSnapshot = { ...current };

  for (const [productId, records] of Object.entries(incoming)) {
    const currentRecords = current[productId] ?? [];
    const byId = new Map<string, ProductPageStatusRecord>();

    for (const record of currentRecords) {
      byId.set(record.id, record);
    }

    for (const record of records) {
      const existing = byId.get(record.id);
      if (!existing || existing.version <= record.version) {
        byId.set(record.id, record);
      }
    }

    merged[productId] = Array.from(byId.values());
  }

  return merged;
}

export async function upsertProductStatusRecord(record: ProductPageStatusRecord): Promise<void> {
  const statuses = await getProductStatuses();
  const current = statuses[record.productId] ?? [];
  const next = current.filter((item) => item.id !== record.id);
  next.push(record);
  statuses[record.productId] = next;
  await saveProductStatuses(statuses);
}

export function buildTaskRecords(
  product: Product,
  pages: WebPageRecord[],
  statuses: ProductPageStatusRecord[],
): ProductTaskRecord[] {
  const statusMap = new Map(statuses.map((record) => [record.pageKey, record]));

  return pages.map((page) => createProductTaskRecord(product, page, statusMap.get(page.pageKey)));
}

export function createLocalStatusRecord(
  product: Product,
  page: WebPageRecord,
  status: ProductPageStatusRecord['status'],
  version: number,
  comment?: string,
): ProductPageStatusRecord {
  return {
    id: createProductPageStatusId(product.id, page.pageKey),
    productId: product.id,
    pageKey: page.pageKey,
    siteKey: page.siteKey,
    status,
    comment,
    version,
    updatedAt: new Date().toISOString(),
    syncState: 'pending',
  };
}
