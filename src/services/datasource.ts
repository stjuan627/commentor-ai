import type {
  DatasourceConfig,
  DatasourceValidationReport,
  Product,
  ProductPageStatusRecord,
  WebPageBooleanField,
  WebPageRecord,
} from '../types';
import {
  fetchWebPages as fetchGoogleWebPages,
  fetchProductStatuses as fetchGoogleProductStatuses,
  updateGoogleWebPageBooleanField,
  upsertProductStatus as upsertGoogleProductStatus,
} from './sheets';
import {
  ensureFeishuDatasource,
  fetchFeishuProductStatuses,
  fetchFeishuWebPages,
  updateFeishuWebPageBooleanField,
  upsertFeishuProductStatus,
  validateFeishuDatasource,
} from './feishuBitable';

export async function fetchDatasourceWebPages(config: DatasourceConfig): Promise<WebPageRecord[]> {
  switch (config.provider) {
    case 'google-sheets':
      return fetchGoogleWebPages(config);
    case 'feishu-bitable':
      return fetchFeishuWebPages(config);
    default:
      return [];
  }
}

export async function fetchDatasourceProductStatuses(
  config: DatasourceConfig,
  product: Product,
): Promise<ProductPageStatusRecord[]> {
  switch (config.provider) {
    case 'google-sheets':
      return fetchGoogleProductStatuses(config, product);
    case 'feishu-bitable':
      return fetchFeishuProductStatuses(config, product);
    default:
      return [];
  }
}

export async function upsertDatasourceProductStatus(
  config: DatasourceConfig,
  product: Product,
  record: ProductPageStatusRecord,
): Promise<void> {
  switch (config.provider) {
    case 'google-sheets':
      return upsertGoogleProductStatus(config, product, record);
    case 'feishu-bitable':
      return upsertFeishuProductStatus(config, product, record);
    default:
      throw new Error(`Unsupported datasource provider: ${(config as { provider?: string }).provider ?? 'unknown'}`);
  }
}

export async function updateDatasourceWebPageBooleanField(
  config: DatasourceConfig,
  pageKey: string,
  field: WebPageBooleanField,
  value: boolean,
): Promise<void> {
  switch (config.provider) {
    case 'google-sheets':
      return updateGoogleWebPageBooleanField(config, pageKey, field, value);
    case 'feishu-bitable':
      return updateFeishuWebPageBooleanField(config, pageKey, field, value);
    default:
      throw new Error(`Unsupported datasource provider: ${(config as { provider?: string }).provider ?? 'unknown'}`);
  }
}

export async function validateDatasource(config: DatasourceConfig): Promise<DatasourceValidationReport> {
  switch (config.provider) {
    case 'google-sheets':
      return {
        provider: config.provider,
        ok: Boolean(config.spreadsheetId && config.sheetName),
        canAutoFix: false,
        checkedAt: new Date().toISOString(),
        issues: [],
        warnings: [],
      };
    case 'feishu-bitable':
      return validateFeishuDatasource(config);
    default:
      return {
        provider: 'google-sheets',
        ok: false,
        canAutoFix: false,
        checkedAt: new Date().toISOString(),
        issues: [{ type: 'config', message: '不支持的数据源类型' }],
        warnings: [],
      };
  }
}

export async function ensureDatasourceSchema(config: DatasourceConfig): Promise<DatasourceValidationReport> {
  switch (config.provider) {
    case 'google-sheets':
      return validateDatasource(config);
    case 'feishu-bitable':
      return ensureFeishuDatasource(config);
    default:
      return validateDatasource(config);
  }
}

export async function connectDatasource(config: DatasourceConfig): Promise<void> {
  if (config.provider === 'feishu-bitable') {
    const { connectFeishuAuth } = await import('./feishuAuth');
    await connectFeishuAuth(config);
    return;
  }

  const { acquireToken, setAuthState } = await import('./auth');
  const { setDatasourceAuthState } = await import('./feishuAuth');
  await setDatasourceAuthState({ status: 'connecting', provider: 'google-sheets', mode: 'google-oauth' });
  await setAuthState({ status: 'connecting' });
  await acquireToken(true);
  await setAuthState({ status: 'connected' });
  await setDatasourceAuthState({ status: 'connected', provider: 'google-sheets', mode: 'google-oauth' });
}

export async function disconnectDatasource(config: DatasourceConfig): Promise<void> {
  if (config.provider === 'feishu-bitable') {
    const { disconnectFeishuAuth } = await import('./feishuAuth');
    await disconnectFeishuAuth();
    return;
  }

  const { revokeToken, setAuthState } = await import('./auth');
  const { setDatasourceAuthState } = await import('./feishuAuth');
  await revokeToken();
  await setAuthState({ status: 'disconnected' });
  await setDatasourceAuthState({ status: 'disconnected', provider: 'google-sheets', mode: 'google-oauth' });
}
