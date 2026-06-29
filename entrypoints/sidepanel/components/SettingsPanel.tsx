import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type {
  DatasourceAuthState,
  DatasourceConfig,
  DatasourceValidationReport,
  FeishuBitableDatasourceConfig,
  GoogleSheetsDatasourceConfig,
  LLMSettings,
} from '../../../src/types';
import { DEFAULT_PROMPT_TEMPLATE } from '../../../src/constants/prompt';

interface SettingsPanelProps {
  llmSettings: LLMSettings | null;
  onSaved: (settings: LLMSettings) => void;
  datasourceConfig?: DatasourceConfig | null;
  onDatasourceSaved?: (config: DatasourceConfig) => void;
}

const DEFAULT_SETTINGS: LLMSettings = {
  provider: null,
  promptTemplate: '',
};

const DEFAULT_GOOGLE_DATASOURCE: GoogleSheetsDatasourceConfig = {
  provider: 'google-sheets',
  spreadsheetId: '',
  sheetName: '',
  connected: false,
};

const DEFAULT_FEISHU_DATASOURCE: FeishuBitableDatasourceConfig = {
  provider: 'feishu-bitable',
  authMode: 'tenant',
  appId: '',
  appSecret: '',
  appToken: '',
  webPageTableId: '',
  productStatusTableId: '',
  connected: false,
};

function isGoogleDatasource(config: DatasourceConfig | null): config is GoogleSheetsDatasourceConfig {
  return config?.provider === 'google-sheets';
}

function isFeishuDatasource(config: DatasourceConfig | null): config is FeishuBitableDatasourceConfig {
  return config?.provider === 'feishu-bitable';
}

function getDatasource(config: DatasourceConfig | null): DatasourceConfig {
  return config ?? DEFAULT_GOOGLE_DATASOURCE;
}

export function SettingsPanel({
  llmSettings,
  onSaved,
  datasourceConfig,
  onDatasourceSaved,
}: SettingsPanelProps) {
  const [settings, setSettings] = useState<LLMSettings>(llmSettings ?? DEFAULT_SETTINGS);
  const [datasource, setDatasource] = useState<DatasourceConfig>(getDatasource(datasourceConfig ?? null));
  const [authState, setAuthState] = useState<DatasourceAuthState>({ status: 'disconnected' });
  const [status, setStatus] = useState<string>('');
  const [datasourceError, setDatasourceError] = useState<string>('');
  const [validationReport, setValidationReport] = useState<DatasourceValidationReport | null>(null);
  const [redirectUri, setRedirectUri] = useState<string>('');
  const [isDatasourceBusy, setIsDatasourceBusy] = useState(false);
  const statusTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setSettings(llmSettings ?? DEFAULT_SETTINGS);
  }, [llmSettings]);

  useEffect(() => {
    setDatasource(getDatasource(datasourceConfig ?? null));

    browser.runtime.sendMessage({ action: 'datasourceGetAuthState' }).then((response: any) => {
      if (response.success && response.state) {
        setAuthState(response.state);
      }
    }).catch((err) => {
      console.error('Failed to get datasource auth state:', err);
    });

    browser.runtime.sendMessage({ action: 'datasourceGetRedirectUri' }).then((response: any) => {
      if (response.success && response.redirectUri) {
        setRedirectUri(response.redirectUri);
      }
    }).catch(() => {
      setRedirectUri('');
    });
  }, [datasourceConfig]);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        window.clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  const parseOptionalNumber = (value: string): number | undefined => {
    if (value === '') {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const showStatus = (message: string) => {
    if (statusTimeoutRef.current) {
      window.clearTimeout(statusTimeoutRef.current);
    }

    setStatus(message);
    statusTimeoutRef.current = window.setTimeout(() => setStatus(''), 3000);
  };

  const handleProviderChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newProvider = event.target.value as 'openai' | 'gemini';
    setSettings((prev) => ({ ...prev, provider: newProvider }));
  };

  const handleOpenAIChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    const parsedValue = name === 'temperature' || name === 'topP'
      ? parseOptionalNumber(value)
      : value;

    setSettings((prev) => ({
      ...prev,
      openai: {
        ...prev.openai,
        [name]: parsedValue,
      },
    }));
  };

  const handleGeminiChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    const parsedValue = name === 'temperature' || name === 'topP'
      ? parseOptionalNumber(value)
      : value;

    setSettings((prev) => ({
      ...prev,
      gemini: {
        ...prev.gemini,
        [name]: parsedValue,
      },
    }));
  };

  const saveSettings = () => {
    browser.storage.local
      .set({ llmSettings: settings })
      .then(() => {
        onSaved(settings);
        showStatus('设置已保存');
      })
      .catch((error: Error) => {
        console.error('Error saving settings:', error);
        showStatus('保存设置失败');
      });
  };

  const setDatasourceProvider = (provider: DatasourceConfig['provider']) => {
    setDatasource(provider === 'google-sheets'
      ? { ...DEFAULT_GOOGLE_DATASOURCE, connected: false }
      : { ...DEFAULT_FEISHU_DATASOURCE, redirectUri });
    setDatasourceError('');
    setValidationReport(null);
  };

  const updateGoogleDatasource = (field: keyof GoogleSheetsDatasourceConfig, value: string | boolean) => {
    setDatasource((prev) => ({
      ...DEFAULT_GOOGLE_DATASOURCE,
      ...(isGoogleDatasource(prev) ? prev : {}),
      [field]: value,
      connected: field === 'connected' ? Boolean(value) : false,
    }));
    setDatasourceError('');
    setValidationReport(null);
  };

  const updateFeishuDatasource = (field: keyof FeishuBitableDatasourceConfig, value: string | boolean | number | undefined) => {
    setDatasource((prev) => ({
      ...DEFAULT_FEISHU_DATASOURCE,
      ...(isFeishuDatasource(prev) ? prev : {}),
      [field]: value,
      connected: field === 'connected' ? Boolean(value) : false,
    }));
    setDatasourceError('');
    setValidationReport(null);
  };

  const validateCurrentDatasource = async (): Promise<DatasourceValidationReport | null> => {
    const response = await browser.runtime.sendMessage({ action: 'datasourceValidate', config: datasource });
    if (!response.success) {
      throw new Error(response.error || '数据源校验失败');
    }
    setValidationReport(response.report);
    return response.report as DatasourceValidationReport;
  };

  const validateDatasourceInputs = () => {
    if (isGoogleDatasource(datasource)) {
      if (!datasource.spreadsheetId || !datasource.sheetName) {
        throw new Error('请填写 Spreadsheet ID 和 Sheet 名称');
      }
      return;
    }

    if (!datasource.appToken || !datasource.webPageTableId || !datasource.productStatusTableId) {
      throw new Error('请填写 app_token、网页表 table_id 和状态表 table_id');
    }
    if (datasource.authMode === 'tenant' && (!datasource.appId || !datasource.appSecret)) {
      throw new Error('请填写飞书 App ID 和 App Secret');
    }
  };

  const saveDatasource = async () => {
    try {
      validateDatasourceInputs();
      setIsDatasourceBusy(true);
      setDatasourceError('');

      const report = await validateCurrentDatasource();
      if (report && !report.ok) {
        setDatasourceError('数据源校验未通过，请查看下方问题列表');
        return;
      }

      const authResponse = await browser.runtime.sendMessage({ action: 'datasourceConnect', config: datasource });
      if (!authResponse.success) {
        setDatasourceError(authResponse.error || '认证失败');
        if (authResponse.state) {
          setAuthState(authResponse.state);
        }
        return;
      }
      if (authResponse.state) {
        setAuthState(authResponse.state);
      }

      const updatedDatasource = {
        ...datasource,
        connected: true,
        connectedAt: new Date().toISOString(),
        ...(isFeishuDatasource(datasource) && redirectUri ? { redirectUri } : {}),
      } as DatasourceConfig;

      await browser.storage.local.set({ datasourceConfig: updatedDatasource });
      onDatasourceSaved?.(updatedDatasource);
      setDatasource(updatedDatasource);
      showStatus('数据源配置已保存并连接成功');
    } catch (error: unknown) {
      console.error('Error saving datasource config:', error);
      setDatasourceError(error instanceof Error ? error.message : '保存数据源配置失败');
    } finally {
      setIsDatasourceBusy(false);
    }
  };

  const ensureDatasourceSchema = async () => {
    try {
      validateDatasourceInputs();
      setIsDatasourceBusy(true);
      setDatasourceError('');
      const response = await browser.runtime.sendMessage({ action: 'datasourceEnsureSchema', config: datasource });
      if (!response.success) {
        throw new Error(response.error || '自动补齐字段失败');
      }
      setValidationReport(response.report);
      showStatus(response.report?.ok ? '字段已补齐，校验通过' : '字段补齐后仍有问题');
    } catch (error: unknown) {
      setDatasourceError(error instanceof Error ? error.message : '自动补齐字段失败');
    } finally {
      setIsDatasourceBusy(false);
    }
  };

  const disconnectDatasource = async () => {
    try {
      setIsDatasourceBusy(true);
      const response = await browser.runtime.sendMessage({ action: 'datasourceDisconnect', config: datasource });
      if (!response.success) {
        throw new Error(response.error || '断开连接失败');
      }
      setAuthState(response.state ?? { status: 'disconnected' });
      const updated = { ...datasource, connected: false } as DatasourceConfig;
      await browser.storage.local.set({ datasourceConfig: updated });
      setDatasource(updated);
      onDatasourceSaved?.(updated);
      showStatus('已断开连接');
    } catch (error) {
      console.error('Disconnect failed:', error);
      setDatasourceError(error instanceof Error ? error.message : '断开连接失败');
    } finally {
      setIsDatasourceBusy(false);
    }
  };

  const renderValidationReport = () => {
    if (!validationReport) {
      return null;
    }

    return (
      <div className={`alert mb-3 ${validationReport.ok ? 'alert-success' : 'alert-warning'}`} data-testid="datasource-validation-report">
        <div className="space-y-2">
          <div className="font-semibold">{validationReport.ok ? '校验通过' : '校验发现问题'}</div>
          {validationReport.issues.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {validationReport.issues.map((issue, index) => (
                <li key={`${issue.type}-${issue.tableId ?? ''}-${issue.fieldName ?? ''}-${index}`}>{issue.message}</li>
              ))}
            </ul>
          )}
          {validationReport.warnings.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-warning-content">
              {validationReport.warnings.map((issue, index) => (
                <li key={`warning-${index}`}>{issue.message}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-4">
      <div className="card bg-base-200 mb-4">
        <div className="card-body p-4">
          <h2 className="card-title text-lg mb-2">选择 LLM 提供商</h2>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="provider" value="openai" className="radio radio-primary" checked={settings.provider === 'openai'} onChange={handleProviderChange} />
              <span>OpenAI</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="provider" value="gemini" className="radio radio-primary" checked={settings.provider === 'gemini'} onChange={handleProviderChange} />
              <span>Google Gemini</span>
            </label>
          </div>
        </div>
      </div>

      {settings.provider === 'openai' && (
        <div className="card bg-base-200 mb-4">
          <div className="card-body p-4">
            <h2 className="card-title text-lg mb-3">OpenAI 配置</h2>
            <div className="form-control mb-3"><label className="label" htmlFor="apiKey"><span className="label-text">API Key</span></label><input type="password" id="apiKey" name="apiKey" className="input input-bordered w-full" value={settings.openai?.apiKey ?? ''} onChange={handleOpenAIChange} placeholder="sk-..." /></div>
            <div className="form-control mb-3"><label className="label" htmlFor="apiHost"><span className="label-text">API Host (可选)</span></label><input type="text" id="apiHost" name="apiHost" className="input input-bordered w-full" value={settings.openai?.apiHost ?? ''} onChange={handleOpenAIChange} placeholder="例如：https://api.openai.com/v1" /></div>
            <div className="form-control"><label className="label" htmlFor="model"><span className="label-text">模型 (可选)</span></label><input type="text" id="model" name="model" className="input input-bordered w-full" value={settings.openai?.model ?? ''} onChange={handleOpenAIChange} placeholder="例如：gpt-4o" /></div>
            <div className="form-control mt-3"><label className="label" htmlFor="openaiTemperature"><span className="label-text">Temperature (可选)</span></label><input type="number" id="openaiTemperature" name="temperature" className="input input-bordered w-full" value={settings.openai?.temperature ?? ''} onChange={handleOpenAIChange} placeholder="默认：0.7" min={0} max={2} step={0.1} /></div>
            <div className="form-control mt-3"><label className="label" htmlFor="openaiTopP"><span className="label-text">Top P (可选)</span></label><input type="number" id="openaiTopP" name="topP" className="input input-bordered w-full" value={settings.openai?.topP ?? ''} onChange={handleOpenAIChange} placeholder="默认：1" min={0} max={1} step={0.1} /></div>
          </div>
        </div>
      )}

      {settings.provider === 'gemini' && (
        <div className="card bg-base-200 mb-4">
          <div className="card-body p-4">
            <h2 className="card-title text-lg mb-3">Google Gemini 配置</h2>
            <div className="form-control mb-3"><label className="label" htmlFor="geminiApiKey"><span className="label-text">API Key</span></label><input type="password" id="geminiApiKey" name="apiKey" className="input input-bordered w-full" value={settings.gemini?.apiKey ?? ''} onChange={handleGeminiChange} placeholder="输入您的 Gemini API Key" /></div>
            <div className="form-control"><label className="label" htmlFor="geminiModel"><span className="label-text">模型 (可选)</span></label><input type="text" id="geminiModel" name="model" className="input input-bordered w-full" value={settings.gemini?.model ?? ''} onChange={handleGeminiChange} placeholder="例如：gemini-pro" /></div>
            <div className="form-control mt-3"><label className="label" htmlFor="geminiTemperature"><span className="label-text">Temperature (可选)</span></label><input type="number" id="geminiTemperature" name="temperature" className="input input-bordered w-full" value={settings.gemini?.temperature ?? ''} onChange={handleGeminiChange} placeholder="默认：0.7" min={0} max={2} step={0.1} /></div>
            <div className="form-control mt-3"><label className="label" htmlFor="geminiTopP"><span className="label-text">Top P (可选)</span></label><input type="number" id="geminiTopP" name="topP" className="input input-bordered w-full" value={settings.gemini?.topP ?? ''} onChange={handleGeminiChange} placeholder="默认：1" min={0} max={1} step={0.1} /></div>
          </div>
        </div>
      )}

      <div className="card bg-base-200 mb-4">
        <div className="card-body p-4">
          <h2 className="card-title text-lg mb-3">Prompt 模板设置</h2>
          <div className="form-control">
            <label className="label" htmlFor="promptTemplate"><span className="label-text">Prompt 模板</span></label>
            <textarea id="promptTemplate" className="textarea textarea-bordered w-full" value={settings.promptTemplate ?? ''} onChange={(event) => setSettings((prev) => ({ ...prev, promptTemplate: event.target.value }))} placeholder={DEFAULT_PROMPT_TEMPLATE} rows={4} />
            <span className="label-text-alt mt-1">使用 {'{content}'} 作为网页内容的占位符</span>
          </div>
        </div>
      </div>

      <button type="button" className="btn btn-primary" onClick={saveSettings}>保存设置</button>
      {status && <div className={`alert mt-4 ${status.includes('失败') ? 'alert-error' : 'alert-success'}`}><span>{status}</span></div>}

      <div className="card bg-base-200 mt-6 mb-4">
        <div className="card-body p-4">
          <h2 className="card-title text-lg mb-3">数据源配置</h2>
          <div className="form-control mb-3">
            <span className="label-text mb-1 block">数据源类型</span>
            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="datasource-provider" value="google-sheets" className="radio radio-primary" data-testid="datasource-provider-google" checked={datasource.provider === 'google-sheets'} onChange={() => setDatasourceProvider('google-sheets')} /><span>Google Sheets</span></label>
            <label className="flex items-center gap-2 cursor-pointer mt-2"><input type="radio" name="datasource-provider" value="feishu-bitable" className="radio radio-primary" data-testid="datasource-provider-feishu" checked={datasource.provider === 'feishu-bitable'} onChange={() => setDatasourceProvider('feishu-bitable')} /><span>飞书多维表格</span></label>
          </div>

          {isGoogleDatasource(datasource) && (
            <>
              <div className="form-control mb-3"><label className="label" htmlFor="spreadsheetId"><span className="label-text">Spreadsheet ID</span></label><input type="text" id="spreadsheetId" className="input input-bordered w-full" data-testid="datasource-spreadsheet-id" value={datasource.spreadsheetId} onChange={(e) => updateGoogleDatasource('spreadsheetId', e.target.value)} placeholder="例如：1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" /></div>
              <div className="form-control mb-3"><label className="label" htmlFor="sheetName"><span className="label-text">Sheet 名称</span></label><input type="text" id="sheetName" className="input input-bordered w-full" value={datasource.sheetName} onChange={(e) => updateGoogleDatasource('sheetName', e.target.value)} placeholder="例如：Sheet1" /></div>
            </>
          )}

          {isFeishuDatasource(datasource) && (
            <div className="space-y-3">
              <div className="alert alert-info text-sm"><span>飞书密钥与 token 仅保存在当前浏览器扩展本地存储中。请确保多维表格已授予应用相应读写权限。</span></div>
              <div className="form-control"><span className="label-text mb-1 block">鉴权方式</span><label className="flex items-center gap-2 cursor-pointer"><input type="radio" className="radio radio-primary" checked={datasource.authMode === 'tenant'} onChange={() => updateFeishuDatasource('authMode', 'tenant')} /><span>自建应用 app_id/app_secret（推荐）</span></label><label className="flex items-center gap-2 cursor-pointer mt-2"><input type="radio" className="radio radio-primary" checked={datasource.authMode === 'oauth'} onChange={() => updateFeishuDatasource('authMode', 'oauth')} /><span>OAuth / user access token</span></label></div>
              <div className="form-control"><label className="label" htmlFor="feishuAppId"><span className="label-text">App ID</span></label><input id="feishuAppId" type="text" className="input input-bordered w-full" value={datasource.appId ?? ''} onChange={(e) => updateFeishuDatasource('appId', e.target.value)} placeholder="cli_xxx" /></div>
              <div className="form-control"><label className="label" htmlFor="feishuAppSecret"><span className="label-text">App Secret</span></label><input id="feishuAppSecret" type="password" className="input input-bordered w-full" value={datasource.appSecret ?? ''} onChange={(e) => updateFeishuDatasource('appSecret', e.target.value)} placeholder="输入飞书 App Secret" /></div>
              {datasource.authMode === 'oauth' && (
                <div className="rounded-lg border border-base-300 p-3 text-sm space-y-2">
                  <div>OAuth Redirect URI：<code className="break-all">{redirectUri || '当前浏览器未提供 redirect URI'}</code></div>
                  <button type="button" className="btn btn-xs btn-outline" onClick={() => redirectUri && navigator.clipboard.writeText(redirectUri)}>复制 Redirect URI</button>
                  <div className="form-control"><label className="label" htmlFor="feishuUserToken"><span className="label-text">User Access Token（可选，高级）</span></label><input id="feishuUserToken" type="password" className="input input-bordered w-full" value={datasource.userAccessToken ?? ''} onChange={(e) => updateFeishuDatasource('userAccessToken', e.target.value)} /></div>
                  <div className="form-control"><label className="label" htmlFor="feishuRefreshToken"><span className="label-text">Refresh Token（可选，高级）</span></label><input id="feishuRefreshToken" type="password" className="input input-bordered w-full" value={datasource.refreshToken ?? ''} onChange={(e) => updateFeishuDatasource('refreshToken', e.target.value)} /></div>
                </div>
              )}
              <div className="form-control"><label className="label" htmlFor="feishuAppToken"><span className="label-text">多维表格 app_token</span></label><input id="feishuAppToken" type="text" className="input input-bordered w-full" value={datasource.appToken} onChange={(e) => updateFeishuDatasource('appToken', e.target.value)} placeholder="例如：bascnxxxx" /></div>
              <div className="form-control"><label className="label" htmlFor="feishuWebPageTableId"><span className="label-text">网页表 table_id</span></label><input id="feishuWebPageTableId" type="text" className="input input-bordered w-full" value={datasource.webPageTableId} onChange={(e) => updateFeishuDatasource('webPageTableId', e.target.value)} placeholder="tblxxxx" /></div>
              <div className="form-control"><label className="label" htmlFor="feishuStatusTableId"><span className="label-text">状态表 table_id</span></label><input id="feishuStatusTableId" type="text" className="input input-bordered w-full" value={datasource.productStatusTableId} onChange={(e) => updateFeishuDatasource('productStatusTableId', e.target.value)} placeholder="tblxxxx" /></div>
            </div>
          )}

          {datasourceError && <div className="alert alert-error mt-3 mb-3" data-testid="datasource-error"><span>{datasourceError}</span></div>}
          <div className="mt-3">{renderValidationReport()}</div>
          {authState.status === 'connected' && <div className="badge badge-success mb-3" data-testid="datasource-status">已连接</div>}
          {authState.status === 'error' && <div className="badge badge-error mb-3">认证错误: {authState.error}</div>}
          {authState.status === 'connecting' && <div className="badge badge-warning mb-3">正在连接...</div>}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-outline" onClick={() => void validateCurrentDatasource().catch((error) => setDatasourceError(error instanceof Error ? error.message : '数据源校验失败'))} disabled={isDatasourceBusy}>校验连接</button>
            {isFeishuDatasource(datasource) && <button type="button" className="btn btn-outline" onClick={() => void ensureDatasourceSchema()} disabled={isDatasourceBusy || !validationReport?.canAutoFix}>自动补齐缺失字段</button>}
            <button type="button" className="btn btn-secondary" data-testid="datasource-connect" onClick={saveDatasource} disabled={isDatasourceBusy}>{isDatasourceBusy ? '处理中...' : datasource.connected ? '重新连接' : '保存并连接'}</button>
            {datasource.connected && <button type="button" className="btn btn-outline" onClick={() => void disconnectDatasource()} disabled={isDatasourceBusy}>断开连接</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
