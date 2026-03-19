import type {
  DatasourceConfig,
  Product,
  ProductPageStatusRecord,
  WebPageRecord,
} from '../types';
import {
  buildProductSheetName,
  createProductPageStatusId,
  normalizePageKey,
  normalizeSiteKey,
} from '../types';
import { getAccessToken } from './auth';

interface SheetProperties {
  title: string;
}

interface SpreadsheetMetadata {
  sheets?: Array<{ properties?: SheetProperties }>;
}

interface SheetSchema {
  [key: string]: number;
}

const WEB_PAGE_COLUMNS = [
  'site_key',
  'page_key',
  'source_url',
  'canonical_url',
  'title',
  'version',
  'updated_at',
] as const;

const PRODUCT_STATUS_COLUMNS = [
  'page_key',
  'site_key',
  'status',
  'comment',
  'version',
  'updated_at',
] as const;

async function getToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('No access token available');
  }

  return token;
}

function getWebPageSheetName(config: DatasourceConfig): string {
  return config.webPageSheetName || config.sheetName;
}

async function sheetsFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  return response;
}

async function getSpreadsheetMetadata(config: DatasourceConfig): Promise<SpreadsheetMetadata> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}`;
  const response = await sheetsFetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch spreadsheet metadata: ${response.statusText}`);
  }

  return response.json() as Promise<SpreadsheetMetadata>;
}

async function sheetExists(config: DatasourceConfig, sheetName: string): Promise<boolean> {
  const metadata = await getSpreadsheetMetadata(config);
  return (metadata.sheets ?? []).some((sheet) => sheet.properties?.title === sheetName);
}

async function ensureSheet(config: DatasourceConfig, sheetName: string): Promise<void> {
  const exists = await sheetExists(config, sheetName);
  if (exists) {
    return;
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}:batchUpdate`;
  const response = await sheetsFetch(url, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetName,
            },
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create sheet ${sheetName}: ${response.statusText}`);
  }
}

async function getSheetValues(
  config: DatasourceConfig,
  range: string,
): Promise<string[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodeURIComponent(range)}`;
  const response = await sheetsFetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch range ${range}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.values || [];
}

async function updateSheetValues(
  config: DatasourceConfig,
  range: string,
  values: unknown[][],
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const response = await sheetsFetch(url, {
    method: 'PUT',
    body: JSON.stringify({ values }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update range ${range}: ${response.statusText}`);
  }
}

async function appendSheetValues(
  config: DatasourceConfig,
  range: string,
  values: unknown[][],
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`;
  const response = await sheetsFetch(url, {
    method: 'POST',
    body: JSON.stringify({ values }),
  });

  if (!response.ok) {
    throw new Error(`Failed to append to ${range}: ${response.statusText}`);
  }
}

function buildSchema(headers: string[], requiredColumns: readonly string[]): SheetSchema {
  const schema: SheetSchema = {};
  for (const column of requiredColumns) {
    const index = headers.indexOf(column);
    if (index === -1) {
      throw new Error(`Missing required column: ${column}`);
    }
    schema[column] = index;
  }
  return schema;
}

async function ensureHeaderRow(
  config: DatasourceConfig,
  sheetName: string,
  columns: readonly string[],
): Promise<void> {
  const values = await getSheetValues(config, `${sheetName}!1:1`);
  const headers = values[0] || [];
  const matches = columns.every((column, index) => headers[index] === column);

  if (!matches) {
    await updateSheetValues(config, `${sheetName}!1:1`, [Array.from(columns)]);
  }
}

async function ensureProductSheet(config: DatasourceConfig, product: Product): Promise<string> {
  const sheetName = buildProductSheetName(product);
  await ensureSheet(config, sheetName);
  await ensureHeaderRow(config, sheetName, PRODUCT_STATUS_COLUMNS);
  return sheetName;
}

export async function fetchWebPages(config: DatasourceConfig): Promise<WebPageRecord[]> {
  const sheetName = getWebPageSheetName(config);
  await ensureHeaderRow(config, sheetName, WEB_PAGE_COLUMNS);
  const values = await getSheetValues(config, `${sheetName}!1:10000`);
  const headers = values[0] || [];
  const schema = buildSchema(headers, WEB_PAGE_COLUMNS);

  return values.slice(1).filter((row) => row.length > 0).map((row) => {
    const sourceUrl = row[schema.source_url] || '';
    const canonicalUrl = row[schema.canonical_url] || sourceUrl;
    return {
      pageKey: normalizePageKey(row[schema.page_key] || canonicalUrl),
      siteKey: normalizeSiteKey(row[schema.site_key] || sourceUrl),
      sourceUrl,
      canonicalUrl,
      title: row[schema.title] || canonicalUrl,
      version: Number.parseInt(row[schema.version] || '1', 10),
      updatedAt: row[schema.updated_at] || new Date().toISOString(),
    };
  });
}

export async function fetchProductStatuses(
  config: DatasourceConfig,
  product: Product,
): Promise<ProductPageStatusRecord[]> {
  const sheetName = buildProductSheetName(product);
  const exists = await sheetExists(config, sheetName);
  if (!exists) {
    return [];
  }

  await ensureHeaderRow(config, sheetName, PRODUCT_STATUS_COLUMNS);
  const values = await getSheetValues(config, `${sheetName}!1:10000`);
  const headers = values[0] || [];
  const schema = buildSchema(headers, PRODUCT_STATUS_COLUMNS);

  return values.slice(1).filter((row) => row.length > 0).map((row) => {
    const pageKey = normalizePageKey(row[schema.page_key] || '');
    const siteKey = normalizeSiteKey(row[schema.site_key] || '');

    return {
      id: createProductPageStatusId(product.id, pageKey),
      productId: product.id,
      pageKey,
      siteKey,
      status: (row[schema.status] as ProductPageStatusRecord['status']) || 'pending',
      comment: row[schema.comment] || undefined,
      version: Number.parseInt(row[schema.version] || '1', 10),
      updatedAt: row[schema.updated_at] || new Date().toISOString(),
      syncState: 'synced',
    };
  });
}

export async function upsertProductStatus(
  config: DatasourceConfig,
  product: Product,
  record: ProductPageStatusRecord,
): Promise<void> {
  const sheetName = await ensureProductSheet(config, product);
  const values = await getSheetValues(config, `${sheetName}!1:10000`);
  const headers = values[0] || [];
  const schema = buildSchema(headers, PRODUCT_STATUS_COLUMNS);
  const rows = values.slice(1);
  const rowIndex = rows.findIndex((row) => normalizePageKey(row[schema.page_key] || '') === record.pageKey);

  const rowValues = [
    record.pageKey,
    record.siteKey,
    record.status,
    record.comment || '',
    record.version,
    record.updatedAt,
  ];

  if (rowIndex >= 0) {
    const targetRow = rowIndex + 2;
    await updateSheetValues(config, `${sheetName}!A${targetRow}:F${targetRow}`, [rowValues]);
    return;
  }

  await appendSheetValues(config, `${sheetName}!A:F`, [rowValues]);
}
