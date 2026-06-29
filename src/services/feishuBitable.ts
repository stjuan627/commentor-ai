import type {
  DatasourceValidationIssue,
  DatasourceValidationReport,
  FeishuBitableDatasourceConfig,
  FeishuBitableFieldKey,
  PageStatus,
  Product,
  ProductPageStatusRecord,
  WebPageBooleanField,
  WebPageFormat,
  WebPageRecord,
  WebPageType,
} from '../types';
import { createProductPageStatusId, normalizePageKey, normalizeSiteKey } from '../types';
import { connectFeishuAuth, getFeishuAccessToken } from './feishuAuth';

interface FeishuApiResponse<T> {
  code: number;
  msg?: string;
  data?: T;
}

interface FeishuTable {
  table_id: string;
  name?: string;
  revision?: number;
}

interface FeishuField {
  field_id: string;
  field_name: string;
  type?: number;
  field_type?: number;
}

interface FeishuRecord {
  record_id: string;
  fields?: Record<string, unknown>;
}

interface FeishuListResponse<T> {
  items?: T[];
  has_more?: boolean;
  page_token?: string;
  total?: number;
}

interface FeishuRecordListResponse extends FeishuListResponse<FeishuRecord> {}
interface FeishuFieldListResponse extends FeishuListResponse<FeishuField> {}
interface FeishuTableListResponse extends FeishuListResponse<FeishuTable> {}

const FEISHU_OPEN_API_BASE_URL = 'https://open.feishu.cn/open-apis';

const WEB_PAGE_FIELDS = [
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

const PRODUCT_STATUS_FIELDS = [
  'product_id',
  'page_key',
  'site_key',
  'status',
  'comment',
  'version',
  'updated_at',
] as const;

const TEXT_COMPATIBLE_TYPES = new Set([1, 3, 5, 15, 17, 20]);
const NUMBER_COMPATIBLE_TYPES = new Set([1, 2, 5]);
const BOOLEAN_COMPATIBLE_TYPES = new Set([1, 2, 5, 7]);
const STATUS_COMPATIBLE_TYPES = new Set([1, 3]);

const DEFAULT_FIELD_TYPES: Record<FeishuBitableFieldKey, number> = {
  site_key: 1,
  page_key: 1,
  category: 1,
  country: 1,
  dofollow: 1,
  login_required: 1,
  approval_required: 1,
  type: 3,
  format: 3,
  disabled: 1,
  updated_at: 1,
  product_id: 1,
  status: 3,
  comment: 1,
  version: 2,
};

function nowIso(): string {
  return new Date().toISOString();
}

function getFieldType(field: FeishuField): number | undefined {
  return field.type ?? field.field_type;
}

function buildReport(
  config: FeishuBitableDatasourceConfig,
  issues: DatasourceValidationIssue[],
  warnings: DatasourceValidationIssue[] = [],
): DatasourceValidationReport {
  const missingFields = issues
    .filter((issue) => issue.type === 'missing-field' && issue.tableId && issue.fieldName)
    .reduce<Record<string, string[]>>((acc, issue) => {
      const tableId = issue.tableId!;
      acc[tableId] = [...(acc[tableId] ?? []), issue.fieldName!];
      return acc;
    }, {});

  return {
    provider: config.provider,
    ok: issues.length === 0,
    canAutoFix: issues.length > 0 && issues.every((issue) => issue.type === 'missing-field'),
    checkedAt: nowIso(),
    issues,
    warnings,
    missingFields,
  };
}

async function feishuFetch<T>(
  config: FeishuBitableDatasourceConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getFeishuAccessToken(config);
  const response = await fetch(`${FEISHU_OPEN_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      ...(init?.headers ?? {}),
    },
  });

  const data = await response.json() as FeishuApiResponse<T>;
  if (!response.ok || data.code !== 0) {
    throw new Error(data.msg || response.statusText || '飞书 API 请求失败');
  }

  return (data.data ?? {}) as T;
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value);
}

async function listAll<T>(
  config: FeishuBitableDatasourceConfig,
  path: string,
): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${FEISHU_OPEN_API_BASE_URL}${path}`);
    url.searchParams.set('page_size', '500');
    if (pageToken) {
      url.searchParams.set('page_token', pageToken);
    }

    const data = await feishuFetch<FeishuListResponse<T>>(
      config,
      `${url.pathname}${url.search}`.replace('/open-apis', ''),
    );
    items.push(...(data.items ?? []));
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);

  return items;
}

async function getBitableApp(config: FeishuBitableDatasourceConfig): Promise<unknown> {
  return feishuFetch(config, `/bitable/v1/apps/${encodePathPart(config.appToken)}`);
}

async function listTables(config: FeishuBitableDatasourceConfig): Promise<FeishuTable[]> {
  const data = await feishuFetch<FeishuTableListResponse>(config, `/bitable/v1/apps/${encodePathPart(config.appToken)}/tables`);
  return data.items ?? [];
}

async function listFields(config: FeishuBitableDatasourceConfig, tableId: string): Promise<FeishuField[]> {
  return listAll<FeishuField>(config, `/bitable/v1/apps/${encodePathPart(config.appToken)}/tables/${encodePathPart(tableId)}/fields`);
}

async function listRecords(config: FeishuBitableDatasourceConfig, tableId: string): Promise<FeishuRecord[]> {
  return listAll<FeishuRecord>(config, `/bitable/v1/apps/${encodePathPart(config.appToken)}/tables/${encodePathPart(tableId)}/records`);
}

function validateRequiredConfig(config: FeishuBitableDatasourceConfig): DatasourceValidationIssue[] {
  const issues: DatasourceValidationIssue[] = [];

  if (!config.appToken) {
    issues.push({ type: 'config', message: '请填写飞书多维表格 app_token' });
  }
  if (!config.webPageTableId) {
    issues.push({ type: 'config', message: '请填写网页表 table_id' });
  }
  if (!config.productStatusTableId) {
    issues.push({ type: 'config', message: '请填写状态表 table_id' });
  }
  if (config.authMode === 'tenant' && (!config.appId || !config.appSecret)) {
    issues.push({ type: 'config', message: '请填写飞书 App ID 和 App Secret' });
  }
  if (config.authMode === 'oauth' && !config.userAccessToken && !config.refreshToken && (!config.appId || !config.appSecret)) {
    issues.push({ type: 'config', message: 'OAuth 模式请填写 App ID/App Secret，或手动提供 user access token / refresh token' });
  }

  return issues;
}

function validateTableExists(tableId: string, tables: FeishuTable[], tableName: string): DatasourceValidationIssue | null {
  const exists = tables.some((table) => table.table_id === tableId);
  if (exists) {
    return null;
  }

  return {
    type: 'missing-table',
    tableId,
    tableName,
    message: `${tableName} 不存在或不属于当前多维表格：${tableId}`,
  };
}

function validateFields(
  tableId: string,
  tableName: string,
  fields: FeishuField[],
  requiredFields: readonly FeishuBitableFieldKey[],
): DatasourceValidationIssue[] {
  const issues: DatasourceValidationIssue[] = [];
  const fieldsByName = new Map(fields.map((field) => [field.field_name, field]));

  for (const fieldName of requiredFields) {
    const field = fieldsByName.get(fieldName);
    if (!field) {
      issues.push({
        type: 'missing-field',
        tableId,
        tableName,
        fieldName,
        expected: '字段存在',
        message: `${tableName} 缺少字段：${fieldName}`,
      });
      continue;
    }

    const type = getFieldType(field);
    if (!isCompatibleFieldType(fieldName, type)) {
      issues.push({
        type: 'incompatible-field',
        tableId,
        tableName,
        fieldName,
        expected: getExpectedTypeLabel(fieldName),
        actual: type ? `type=${type}` : '未知类型',
        message: `${tableName} 字段 ${fieldName} 类型不兼容，期望 ${getExpectedTypeLabel(fieldName)}，实际 ${type ?? '未知类型'}`,
      });
    }
  }

  return issues;
}

function isCompatibleFieldType(fieldName: FeishuBitableFieldKey, type: number | undefined): boolean {
  if (!type) {
    return true;
  }

  if (fieldName === 'version') {
    return NUMBER_COMPATIBLE_TYPES.has(type);
  }
  if (fieldName === 'status' || fieldName === 'type' || fieldName === 'format') {
    return STATUS_COMPATIBLE_TYPES.has(type);
  }
  if (fieldName === 'dofollow' || fieldName === 'login_required' || fieldName === 'approval_required' || fieldName === 'disabled') {
    return BOOLEAN_COMPATIBLE_TYPES.has(type);
  }

  return TEXT_COMPATIBLE_TYPES.has(type) || NUMBER_COMPATIBLE_TYPES.has(type);
}

function getExpectedTypeLabel(fieldName: FeishuBitableFieldKey): string {
  if (fieldName === 'version') {
    return '数字或可数字化文本';
  }
  if (fieldName === 'status' || fieldName === 'type' || fieldName === 'format') {
    return '单选或文本';
  }
  if (fieldName === 'dofollow' || fieldName === 'login_required' || fieldName === 'approval_required' || fieldName === 'disabled') {
    return '复选框、数字或文本';
  }
  return '文本';
}

function readField(fields: Record<string, unknown> | undefined, fieldName: string): unknown {
  return fields?.[fieldName];
}

function toText(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(toText).filter(Boolean).join('');
  }
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    if (typeof objectValue.text === 'string') {
      return objectValue.text;
    }
    if (typeof objectValue.link === 'string') {
      return objectValue.link;
    }
    if (typeof objectValue.url === 'string') {
      return objectValue.url;
    }
    if (typeof objectValue.name === 'string') {
      return objectValue.name;
    }
    if (typeof objectValue.value === 'string' || typeof objectValue.value === 'number') {
      return String(objectValue.value);
    }
  }

  return String(value);
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number.parseInt(toText(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  const normalized = toText(value).trim().toLowerCase();
  return ['true', '1', 'yes', 'y', '是', '✓', 'checked'].includes(normalized);
}

function toNullableBoolean(value: unknown): boolean | null {
  if (value == null) {
    return null;
  }
  const normalized = toText(value).trim();
  if (normalized === '') {
    return null;
  }
  return toBoolean(value);
}

function normalizeWebPageType(value: unknown): WebPageType {
  const normalized = toText(value).trim().toLowerCase();
  if (normalized === 'profile' || normalized === 'post') {
    return normalized;
  }
  return 'comment';
}

function normalizeWebPageFormat(value: unknown): WebPageFormat {
  const normalized = toText(value).trim().toLowerCase();
  if (normalized === 'html' || normalized === 'markdown' || normalized === 'bbcode' || normalized === 'others') {
    return normalized;
  }
  if (normalized === 'mardown') {
    return 'markdown';
  }
  return 'others';
}

function normalizeStatus(value: unknown): PageStatus {
  const status = toText(value) as PageStatus;
  return status === 'done' || status === 'invalid' || status === 'pending' ? status : 'pending';
}

function createRecordFields(product: Product, record: ProductPageStatusRecord): Record<string, unknown> {
  return {
    product_id: product.id,
    page_key: record.pageKey,
    site_key: record.siteKey,
    status: record.status,
    comment: record.comment || '',
    version: record.version,
    updated_at: record.updatedAt,
  };
}

async function updateWebPageBooleanField(
  config: FeishuBitableDatasourceConfig,
  pageKey: string,
  field: WebPageBooleanField,
  value: boolean,
): Promise<void> {
  const fieldNameByKey: Record<WebPageBooleanField, 'login_required' | 'approval_required' | 'disabled'> = {
    loginRequired: 'login_required',
    approvalRequired: 'approval_required',
    disabled: 'disabled',
  };
  const records = await listRecords(config, config.webPageTableId);
  const existing = records.find((item) => (
    normalizePageKey(toText(readField(item.fields, 'page_key'))) === pageKey
  ));

  if (!existing) {
    throw new Error(`Page not found in Feishu web pages table: ${pageKey}`);
  }

  await feishuFetch(config, `/bitable/v1/apps/${encodePathPart(config.appToken)}/tables/${encodePathPart(config.webPageTableId)}/records/batch_update`, {
    method: 'POST',
    body: JSON.stringify({
      records: [
        {
          record_id: existing.record_id,
          fields: {
            [fieldNameByKey[field]]: value ? '1' : '0',
          },
        },
      ],
    }),
  });
}

export async function validateFeishuDatasource(config: FeishuBitableDatasourceConfig): Promise<DatasourceValidationReport> {
  const configIssues = validateRequiredConfig(config);
  if (configIssues.length > 0) {
    return buildReport(config, configIssues);
  }

  try {
    await connectFeishuAuth(config);
    await getBitableApp(config);
    const tables = await listTables(config);
    const tableIssues = [
      validateTableExists(config.webPageTableId, tables, '网页表'),
      validateTableExists(config.productStatusTableId, tables, '状态表'),
    ].filter((issue): issue is DatasourceValidationIssue => Boolean(issue));

    if (tableIssues.length > 0) {
      return buildReport(config, tableIssues);
    }

    const [webPageFields, statusFields] = await Promise.all([
      listFields(config, config.webPageTableId),
      listFields(config, config.productStatusTableId),
    ]);

    return buildReport(config, [
      ...validateFields(config.webPageTableId, '网页表', webPageFields, WEB_PAGE_FIELDS),
      ...validateFields(config.productStatusTableId, '状态表', statusFields, PRODUCT_STATUS_FIELDS),
    ]);
  } catch (error) {
    return buildReport(config, [{
      type: 'api',
      message: error instanceof Error ? error.message : '飞书数据源校验失败',
    }]);
  }
}

async function createField(config: FeishuBitableDatasourceConfig, tableId: string, fieldName: FeishuBitableFieldKey): Promise<void> {
  await feishuFetch(config, `/bitable/v1/apps/${encodePathPart(config.appToken)}/tables/${encodePathPart(tableId)}/fields`, {
    method: 'POST',
    body: JSON.stringify({
      field_name: fieldName,
      type: DEFAULT_FIELD_TYPES[fieldName],
      field_type: DEFAULT_FIELD_TYPES[fieldName],
    }),
  });
}

export async function ensureFeishuDatasource(config: FeishuBitableDatasourceConfig): Promise<DatasourceValidationReport> {
  const report = await validateFeishuDatasource(config);
  if (report.ok) {
    return report;
  }
  if (!report.canAutoFix) {
    return report;
  }

  const webPageMissing = report.missingFields?.[config.webPageTableId] ?? [];
  const statusMissing = report.missingFields?.[config.productStatusTableId] ?? [];

  for (const fieldName of webPageMissing) {
    await createField(config, config.webPageTableId, fieldName as FeishuBitableFieldKey);
  }
  for (const fieldName of statusMissing) {
    await createField(config, config.productStatusTableId, fieldName as FeishuBitableFieldKey);
  }

  return validateFeishuDatasource(config);
}

export async function fetchFeishuWebPages(config: FeishuBitableDatasourceConfig): Promise<WebPageRecord[]> {
  const report = await validateFeishuDatasource(config);
  if (!report.ok) {
    throw new Error(report.issues[0]?.message || '飞书数据源校验失败');
  }

  const records = await listRecords(config, config.webPageTableId);
  return records.filter((record) => record.fields).map((record) => {
    const normalizedPageKey = normalizePageKey(toText(readField(record.fields, 'page_key')));
    return {
      pageKey: normalizedPageKey,
      siteKey: normalizeSiteKey(toText(readField(record.fields, 'site_key')) || normalizedPageKey),
      category: toText(readField(record.fields, 'category')),
      country: toText(readField(record.fields, 'country')),
      dofollow: toBoolean(readField(record.fields, 'dofollow')),
      loginRequired: toNullableBoolean(readField(record.fields, 'login_required')),
      approvalRequired: toNullableBoolean(readField(record.fields, 'approval_required')),
      type: normalizeWebPageType(readField(record.fields, 'type')),
      format: normalizeWebPageFormat(readField(record.fields, 'format')),
      disabled: toBoolean(readField(record.fields, 'disabled')),
      updatedAt: toText(readField(record.fields, 'updated_at')) || nowIso(),
    };
  });
}

export async function fetchFeishuProductStatuses(
  config: FeishuBitableDatasourceConfig,
  product: Product,
): Promise<ProductPageStatusRecord[]> {
  const report = await validateFeishuDatasource(config);
  if (!report.ok) {
    throw new Error(report.issues[0]?.message || '飞书数据源校验失败');
  }

  const records = await listRecords(config, config.productStatusTableId);
  return records
    .filter((record) => toText(readField(record.fields, 'product_id')) === product.id)
    .map((record) => {
      const pageKey = normalizePageKey(toText(readField(record.fields, 'page_key')));
      return {
        id: createProductPageStatusId(product.id, pageKey),
        productId: product.id,
        pageKey,
        siteKey: normalizeSiteKey(toText(readField(record.fields, 'site_key'))),
        status: normalizeStatus(readField(record.fields, 'status')),
        comment: toText(readField(record.fields, 'comment')) || undefined,
        version: toNumber(readField(record.fields, 'version'), 1),
        updatedAt: toText(readField(record.fields, 'updated_at')) || nowIso(),
        syncState: 'synced',
      };
    });
}

export async function updateFeishuWebPageBooleanField(
  config: FeishuBitableDatasourceConfig,
  pageKey: string,
  field: WebPageBooleanField,
  value: boolean,
): Promise<void> {
  await updateWebPageBooleanField(config, pageKey, field, value);
}

export async function upsertFeishuProductStatus(
  config: FeishuBitableDatasourceConfig,
  product: Product,
  record: ProductPageStatusRecord,
): Promise<void> {
  const report = await validateFeishuDatasource(config);
  if (!report.ok) {
    throw new Error(report.issues[0]?.message || '飞书数据源校验失败');
  }

  const records = await listRecords(config, config.productStatusTableId);
  const existing = records.find((item) => (
    toText(readField(item.fields, 'product_id')) === product.id
    && normalizePageKey(toText(readField(item.fields, 'page_key'))) === record.pageKey
  ));
  const fields = createRecordFields(product, record);

  if (existing) {
    await feishuFetch(config, `/bitable/v1/apps/${encodePathPart(config.appToken)}/tables/${encodePathPart(config.productStatusTableId)}/records/batch_update`, {
      method: 'POST',
      body: JSON.stringify({
        records: [
          {
            record_id: existing.record_id,
            fields,
          },
        ],
      }),
    });
  } else {
    await feishuFetch(config, `/bitable/v1/apps/${encodePathPart(config.appToken)}/tables/${encodePathPart(config.productStatusTableId)}/records`, {
      method: 'POST',
      body: JSON.stringify({ fields }),
    });
  }

  await updateWebPageBooleanField(config, record.pageKey, 'disabled', record.status === 'invalid');
}
