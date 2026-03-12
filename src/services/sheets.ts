import type { PageRecord, PageStatus, DatasourceConfig } from '../types';
import { normalizePageKey, normalizeSiteKey } from '../types/library';
import { getAccessToken } from './auth';

export interface SheetSchema {
  site_key: number;
  page_key: number;
  source_url: number;
  canonical_url: number;
  title: number;
  status: number;
  version: number;
  updated_at: number;
}

export interface SheetRow {
  site_key: string;
  page_key: string;
  source_url: string;
  canonical_url: string;
  title: string;
  status: PageStatus;
  version: number;
  updated_at: string;
}

const REQUIRED_COLUMNS = ['site_key', 'page_key', 'source_url', 'canonical_url', 'title', 'status', 'version', 'updated_at'];

export async function validateSheetSchema(config: DatasourceConfig): Promise<SheetSchema> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('No access token available');
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${config.sheetName}!1:1`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sheet headers: ${response.statusText}`);
  }

  const data = await response.json();
  const headers: string[] = data.values?.[0] || [];

  const schema: Partial<SheetSchema> = {};
  for (const col of REQUIRED_COLUMNS) {
    const index = headers.indexOf(col);
    if (index === -1) {
      throw new Error(`Missing required column: ${col}`);
    }
    schema[col as keyof SheetSchema] = index;
  }

  return schema as SheetSchema;
}

export async function fetchPageRecords(config: DatasourceConfig): Promise<PageRecord[]> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('No access token available');
  }

  const schema = await validateSheetSchema(config);

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${config.sheetName}!2:1000`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sheet data: ${response.statusText}`);
  }

  const data = await response.json();
  const rows: string[][] = data.values || [];

  const records: PageRecord[] = [];
  for (const row of rows) {
    if (row.length === 0) continue;

    const sourceUrl = row[schema.source_url] || '';
    const canonicalUrl = row[schema.canonical_url] || sourceUrl;

    const record: PageRecord = {
      pageKey: normalizePageKey(row[schema.page_key] || canonicalUrl),
      siteKey: normalizeSiteKey(row[schema.site_key] || sourceUrl),
      sourceUrl,
      canonicalUrl,
      title: row[schema.title] || '',
      status: (row[schema.status] as PageStatus) || 'pending',
      version: parseInt(row[schema.version] || '1', 10),
      updatedAt: row[schema.updated_at] || new Date().toISOString(),
      syncState: 'synced',
    };

    records.push(record);
  }

  return records;
}

export interface StatusUpdate {
  pageKey: string;
  status: PageStatus;
  version: number;
}

export async function batchUpdateStatus(config: DatasourceConfig, updates: StatusUpdate[]): Promise<void> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('No access token available');
  }

  const schema = await validateSheetSchema(config);
  const allRecords = await fetchPageRecords(config);

  const data: any[] = [];
  const conflicts: string[] = [];

  for (const update of updates) {
    const recordIndex = allRecords.findIndex(r => r.pageKey === update.pageKey);
    if (recordIndex === -1) {
      console.warn(`Record not found for pageKey: ${update.pageKey}`);
      continue;
    }

    const currentRecord = allRecords[recordIndex];
    if (currentRecord.version >= update.version) {
      conflicts.push(update.pageKey);
      console.warn(`Version conflict for pageKey ${update.pageKey}: current=${currentRecord.version}, update=${update.version}`);
      continue;
    }

    const rowNumber = recordIndex + 2;
    const statusCol = String.fromCharCode(65 + schema.status);
    const versionCol = String.fromCharCode(65 + schema.version);
    const updatedAtCol = String.fromCharCode(65 + schema.updated_at);

    data.push({
      range: `${config.sheetName}!${statusCol}${rowNumber}`,
      values: [[update.status]],
    });
    data.push({
      range: `${config.sheetName}!${versionCol}${rowNumber}`,
      values: [[update.version]],
    });
    data.push({
      range: `${config.sheetName}!${updatedAtCol}${rowNumber}`,
      values: [[new Date().toISOString()]],
    });
  }

  if (conflicts.length > 0) {
    throw new Error(`Version conflicts detected for: ${conflicts.join(', ')}`);
  }

  if (data.length === 0) {
    return;
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values:batchUpdate`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to batch update: ${response.statusText}`);
  }
}
