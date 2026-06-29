import type {
  GoogleSheetsDatasourceConfig,
  Product,
  ProductPageStatusRecord,
  WebPageBooleanField,
  WebPageFormat,
  WebPageRecord,
  WebPageType,
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
  'category',
  'country',
  'dofollow',
  'login_required',
  'approval_required',
  'type',
  'format',
  'disabled',
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

function getWebPageSheetName(config: GoogleSheetsDatasourceConfig): string {
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

async function getSpreadsheetMetadata(config: GoogleSheetsDatasourceConfig): Promise<SpreadsheetMetadata> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}`;
  const response = await sheetsFetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch spreadsheet metadata: ${response.statusText}`);
  }

  return response.json() as Promise<SpreadsheetMetadata>;
}

async function sheetExists(config: GoogleSheetsDatasourceConfig, sheetName: string): Promise<boolean> {
  const metadata = await getSpreadsheetMetadata(config);
  return (metadata.sheets ?? []).some((sheet) => sheet.properties?.title === sheetName);
}

async function ensureSheet(config: GoogleSheetsDatasourceConfig, sheetName: string): Promise<void> {
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
  config: GoogleSheetsDatasourceConfig,
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
  config: GoogleSheetsDatasourceConfig,
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

function normalizeNullableBoolean(value: string | undefined): boolean | null {
  if (value == null || value.trim() === '') {
    return null;
  }
  return normalizeBoolean(value);
}

function getWebPageColumnRange(column: (typeof WEB_PAGE_COLUMNS)[number], rowNumber: number): string {
  const columnIndex = WEB_PAGE_COLUMNS.indexOf(column);
  const columnLetter = String.fromCharCode(65 + columnIndex);
  return `${columnLetter}${rowNumber}:${columnLetter}${rowNumber}`;
}

async function updateWebPageField(
  config: GoogleSheetsDatasourceConfig,
  pageKey: string,
  column: 'login_required' | 'approval_required' | 'disabled',
  value: boolean,
): Promise<void> {
  const sheetName = getWebPageSheetName(config);
  await ensureWebPageHeaderRow(config, sheetName, { updateMismatchedHeader: false });
  const values = await getSheetValues(config, `${sheetName}!1:10000`);
  const headers = values[0] || [];
  const schema = buildWebPageSchema(headers);
  const rows = values.slice(1);
  const rowIndex = rows.findIndex((row) => normalizePageKey(row[schema.page_key] || '') === pageKey);

  if (rowIndex < 0) {
    throw new Error(`Page not found in web pages sheet: ${pageKey}`);
  }

  const targetRow = rowIndex + 2;
  const range = getWebPageColumnRange(column, targetRow);
  await updateSheetValues(config, `${sheetName}!${range}`, [[value ? '1' : '0']]);
}

async function updateWebPageBooleanField(
  config: GoogleSheetsDatasourceConfig,
  pageKey: string,
  field: WebPageBooleanField,
  value: boolean,
): Promise<void> {
  const columnByField: Record<WebPageBooleanField, 'login_required' | 'approval_required' | 'disabled'> = {
    loginRequired: 'login_required',
    approvalRequired: 'approval_required',
    disabled: 'disabled',
  };

  await updateWebPageField(config, pageKey, columnByField[field], value);
}

async function appendSheetValues(
  config: GoogleSheetsDatasourceConfig,
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
  config: GoogleSheetsDatasourceConfig,
  sheetName: string,
  columns: readonly string[],
  options: { updateMismatchedHeader?: boolean } = { updateMismatchedHeader: true },
): Promise<void> {
  const values = await getSheetValues(config, `${sheetName}!1:1`);
  const headers = values[0] || [];
  const matches = columns.every((column, index) => headers[index] === column);

  if (matches) {
    return;
  }

  if (headers.length === 0 || options.updateMismatchedHeader) {
    await updateSheetValues(config, `${sheetName}!1:1`, [Array.from(columns)]);
    return;
  }

  throw new Error(`网页表表头不匹配，请将 ${sheetName} 第一行更新为：${columns.join(', ')}`);
}

async function ensureWebPageHeaderRow(
  config: GoogleSheetsDatasourceConfig,
  sheetName: string,
  options: { updateMismatchedHeader?: boolean } = { updateMismatchedHeader: true },
): Promise<void> {
  const values = await getSheetValues(config, `${sheetName}!1:1`);
  const headers = values[0] || [];
  const matchesCurrent = WEB_PAGE_COLUMNS.every((column, index) => headers[index] === column);

  if (matchesCurrent) {
    return;
  }

  if (headers.length === 0 || options.updateMismatchedHeader) {
    await updateSheetValues(config, `${sheetName}!1:1`, [Array.from(WEB_PAGE_COLUMNS)]);
    return;
  }

  throw new Error(`网页表表头不匹配，请将 ${sheetName} 第一行更新为：${WEB_PAGE_COLUMNS.join(', ')}`);
}

function buildWebPageSchema(headers: string[]): SheetSchema {
  return buildSchema(headers, WEB_PAGE_COLUMNS);
}

async function ensureProductSheet(config: GoogleSheetsDatasourceConfig, product: Product): Promise<string> {
  const sheetName = buildProductSheetName(product);
  await ensureSheet(config, sheetName);
  await ensureHeaderRow(config, sheetName, PRODUCT_STATUS_COLUMNS);
  return sheetName;
}

function normalizeBoolean(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y', '是', '✓', 'checked'].includes(normalized);
}

function normalizeWebPageType(value: string | undefined): WebPageType {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'profile' || normalized === 'post') {
    return normalized;
  }
  return 'comment';
}

function normalizeWebPageFormat(value: string | undefined): WebPageFormat {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'html' || normalized === 'markdown' || normalized === 'bbcode' || normalized === 'others') {
    return normalized;
  }
  if (normalized === 'mardown') {
    return 'markdown';
  }
  return 'others';
}

export async function fetchWebPages(config: GoogleSheetsDatasourceConfig): Promise<WebPageRecord[]> {
  const sheetName = getWebPageSheetName(config);
  await ensureWebPageHeaderRow(config, sheetName, { updateMismatchedHeader: false });
  const values = await getSheetValues(config, `${sheetName}!1:10000`);
  const headers = values[0] || [];
  const schema = buildWebPageSchema(headers);

  return values.slice(1).filter((row) => row.length > 0).map((row) => {
    const rawPageKey = row[schema.page_key] || '';
    const normalizedPageKey = normalizePageKey(rawPageKey);
    return {
      pageKey: normalizedPageKey,
      siteKey: normalizeSiteKey(row[schema.site_key] || normalizedPageKey),
      category: row[schema.category] || '',
      country: row[schema.country] || '',
      dofollow: normalizeBoolean(row[schema.dofollow]),
      loginRequired: normalizeNullableBoolean(row[schema.login_required]),
      approvalRequired: normalizeNullableBoolean(row[schema.approval_required]),
      type: normalizeWebPageType(row[schema.type]),
      format: normalizeWebPageFormat(row[schema.format]),
      disabled: normalizeBoolean(row[schema.disabled]),
      updatedAt: row[schema.updated_at] || new Date().toISOString(),
    };
  });
}

export async function fetchProductStatuses(
  config: GoogleSheetsDatasourceConfig,
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

export async function updateGoogleWebPageBooleanField(
  config: GoogleSheetsDatasourceConfig,
  pageKey: string,
  field: WebPageBooleanField,
  value: boolean,
): Promise<void> {
  await updateWebPageBooleanField(config, pageKey, field, value);
}

export async function upsertProductStatus(
  config: GoogleSheetsDatasourceConfig,
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
  } else {
    await appendSheetValues(config, `${sheetName}!A:F`, [rowValues]);
  }

  await updateWebPageBooleanField(config, record.pageKey, 'disabled', record.status === 'invalid');
}
