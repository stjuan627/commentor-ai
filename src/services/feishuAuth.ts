import type { DatasourceAuthState, FeishuBitableDatasourceConfig } from '../types';

interface CachedFeishuToken {
  accessToken: string;
  expiresAt: number;
  mode: 'tenant' | 'oauth';
  refreshToken?: string;
}

interface OAuthTokenData {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_expires_in?: number;
  refresh_token_expires_in?: number;
  token_type?: string;
  scope?: string;
}

interface FeishuTokenResponse {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
  data?: OAuthTokenData;
}

const FEISHU_TOKEN_CACHE_KEY = 'feishuAuthToken';
const DATASOURCE_AUTH_STATE_KEY = 'datasourceAuthState';
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const FEISHU_AUTH_BASE_URL = 'https://open.feishu.cn/open-apis';

function now(): number {
  return Date.now();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function readOAuthTokenData(data: FeishuTokenResponse): OAuthTokenData {
  return data.data ?? {
    access_token: (data as { access_token?: string }).access_token,
    expires_in: (data as { expires_in?: number }).expires_in,
    refresh_token: (data as { refresh_token?: string }).refresh_token,
  };
}

async function readCachedToken(): Promise<CachedFeishuToken | null> {
  const result = await browser.storage.local.get(FEISHU_TOKEN_CACHE_KEY);
  return result[FEISHU_TOKEN_CACHE_KEY] ?? null;
}

async function saveCachedToken(token: CachedFeishuToken): Promise<void> {
  await browser.storage.local.set({ [FEISHU_TOKEN_CACHE_KEY]: token });
}

function isTokenUsable(token: CachedFeishuToken | null, mode: 'tenant' | 'oauth'): token is CachedFeishuToken {
  return Boolean(token && token.mode === mode && token.accessToken && token.expiresAt - TOKEN_REFRESH_SKEW_MS > now());
}

export async function getDatasourceAuthState(): Promise<DatasourceAuthState> {
  try {
    const result = await browser.storage.local.get(DATASOURCE_AUTH_STATE_KEY);
    return result[DATASOURCE_AUTH_STATE_KEY] || { status: 'disconnected' };
  } catch {
    return { status: 'disconnected' };
  }
}

export async function setDatasourceAuthState(state: DatasourceAuthState): Promise<void> {
  await browser.storage.local.set({ [DATASOURCE_AUTH_STATE_KEY]: state });
}

export function getFeishuRedirectUri(): string | undefined {
  const identity = typeof chrome !== 'undefined' ? chrome.identity : undefined;
  const getRedirectURL = (identity as { getRedirectURL?: () => string } | undefined)?.getRedirectURL;
  return getRedirectURL ? getRedirectURL.call(identity) : undefined;
}

async function requestTenantToken(config: FeishuBitableDatasourceConfig): Promise<CachedFeishuToken> {
  if (!config.appId || !config.appSecret) {
    throw new Error('请填写飞书 App ID 和 App Secret');
  }

  const response = await fetch(`${FEISHU_AUTH_BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret,
    }),
  });

  const data = await response.json() as FeishuTokenResponse;
  if (!response.ok || data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`飞书 tenant_access_token 获取失败：${data.msg || response.statusText}`);
  }

  const token = {
    accessToken: data.tenant_access_token,
    expiresAt: now() + ((data.expire ?? 7200) * 1000),
    mode: 'tenant' as const,
  };
  await saveCachedToken(token);
  return token;
}

async function exchangeOAuthCode(config: FeishuBitableDatasourceConfig, code: string, redirectUri: string): Promise<CachedFeishuToken> {
  if (!config.appId || !config.appSecret) {
    throw new Error('请填写飞书 App ID 和 App Secret');
  }

  const response = await fetch(`${FEISHU_AUTH_BASE_URL}/authen/v2/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: config.appId,
      client_secret: config.appSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = await response.json() as FeishuTokenResponse;
  const tokenData = readOAuthTokenData(data);
  const accessToken = tokenData.access_token;
  if (!response.ok || data.code !== 0 || !accessToken) {
    throw new Error(`飞书 OAuth 授权失败：${data.msg || response.statusText}`);
  }

  const token = {
    accessToken,
    expiresAt: now() + ((tokenData.expires_in ?? 7200) * 1000),
    mode: 'oauth' as const,
    refreshToken: tokenData.refresh_token,
  };
  await saveCachedToken(token);
  return token;
}

async function refreshOAuthToken(config: FeishuBitableDatasourceConfig, refreshToken: string): Promise<CachedFeishuToken> {
  if (!config.appId || !config.appSecret) {
    throw new Error('请填写飞书 App ID 和 App Secret');
  }

  const response = await fetch(`${FEISHU_AUTH_BASE_URL}/authen/v2/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: config.appId,
      client_secret: config.appSecret,
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json() as FeishuTokenResponse;
  const tokenData = readOAuthTokenData(data);
  const accessToken = tokenData.access_token;
  if (!response.ok || data.code !== 0 || !accessToken) {
    throw new Error(`飞书 OAuth token 刷新失败：${data.msg || response.statusText}`);
  }

  const token = {
    accessToken,
    expiresAt: now() + ((tokenData.expires_in ?? 7200) * 1000),
    mode: 'oauth' as const,
    refreshToken: tokenData.refresh_token ?? refreshToken,
  };
  await saveCachedToken(token);
  return token;
}

async function launchOAuthFlow(config: FeishuBitableDatasourceConfig): Promise<CachedFeishuToken> {
  const identity = typeof chrome !== 'undefined' ? chrome.identity : undefined;
  const launchWebAuthFlow = (identity as { launchWebAuthFlow?: (details: { url: string; interactive: boolean }) => Promise<string> } | undefined)?.launchWebAuthFlow;
  const redirectUri = config.redirectUri || getFeishuRedirectUri();

  if (!launchWebAuthFlow || !redirectUri) {
    throw new Error('当前浏览器不支持 OAuth 授权流程，请改用 app_id/app_secret 或手动 token');
  }
  if (!config.appId) {
    throw new Error('请填写飞书 App ID');
  }

  const authUrl = new URL('https://open.feishu.cn/open-apis/authen/v1/authorize');
  authUrl.searchParams.set('app_id', config.appId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', 'commentor-feishu');

  const callbackUrl = await launchWebAuthFlow.call(identity, {
    url: authUrl.toString(),
    interactive: true,
  });
  const parsed = new URL(callbackUrl);
  const code = parsed.searchParams.get('code');
  const error = parsed.searchParams.get('error');
  if (error) {
    throw new Error(`飞书 OAuth 授权失败：${error}`);
  }
  if (!code) {
    throw new Error('飞书 OAuth 未返回授权码');
  }

  return exchangeOAuthCode(config, code, redirectUri);
}

export async function getFeishuAccessToken(config: FeishuBitableDatasourceConfig): Promise<string> {
  if (config.authMode === 'tenant') {
    const cached = await readCachedToken();
    if (isTokenUsable(cached, 'tenant')) {
      return cached.accessToken;
    }
    return (await requestTenantToken(config)).accessToken;
  }

  const cached = await readCachedToken();
  const cachedRefreshToken = cached?.refreshToken;
  if (isTokenUsable(cached, 'oauth')) {
    return cached.accessToken;
  }

  if (config.userAccessToken && (!config.tokenExpiresAt || config.tokenExpiresAt - TOKEN_REFRESH_SKEW_MS > now())) {
    const token = {
      accessToken: config.userAccessToken,
      expiresAt: config.tokenExpiresAt ?? (now() + 7200 * 1000),
      mode: 'oauth' as const,
      refreshToken: config.refreshToken,
    };
    await saveCachedToken(token);
    return token.accessToken;
  }

  const refreshToken = cachedRefreshToken || config.refreshToken;
  if (refreshToken) {
    return (await refreshOAuthToken(config, refreshToken)).accessToken;
  }

  return (await launchOAuthFlow(config)).accessToken;
}

export async function connectFeishuAuth(config: FeishuBitableDatasourceConfig): Promise<void> {
  try {
    await setDatasourceAuthState({ status: 'connecting', provider: 'feishu-bitable', mode: config.authMode });
    await getFeishuAccessToken(config);
    await setDatasourceAuthState({ status: 'connected', provider: 'feishu-bitable', mode: config.authMode });
  } catch (error) {
    await setDatasourceAuthState({
      status: 'error',
      provider: 'feishu-bitable',
      mode: config.authMode,
      error: getErrorMessage(error),
    });
    throw error;
  }
}

export async function disconnectFeishuAuth(): Promise<void> {
  await browser.storage.local.remove(FEISHU_TOKEN_CACHE_KEY);
  await setDatasourceAuthState({ status: 'disconnected', provider: 'feishu-bitable' });
}
