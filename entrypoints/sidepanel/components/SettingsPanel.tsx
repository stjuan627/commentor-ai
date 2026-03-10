import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { LLMSettings } from '../../../src/types';
import { DEFAULT_PROMPT_TEMPLATE } from '../../../src/constants/prompt';

interface SettingsPanelProps {
  llmSettings: LLMSettings | null;
  onSaved: (settings: LLMSettings) => void;
}

const DEFAULT_SETTINGS: LLMSettings = {
  provider: null,
  promptTemplate: '',
};

export function SettingsPanel({
  llmSettings,
  onSaved,
}: SettingsPanelProps) {
  const [settings, setSettings] = useState<LLMSettings>(llmSettings ?? DEFAULT_SETTINGS);
  const [status, setStatus] = useState<string>('');
  const statusTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setSettings(llmSettings ?? DEFAULT_SETTINGS);
  }, [llmSettings]);

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

  return (
    <div className="mt-4">
      <div className="card bg-base-200 mb-4">
        <div className="card-body p-4">
          <h2 className="card-title text-lg mb-2">选择 LLM 提供商</h2>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value="openai"
                className="radio radio-primary"
                checked={settings.provider === 'openai'}
                onChange={handleProviderChange}
              />
              <span>OpenAI</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value="gemini"
                className="radio radio-primary"
                checked={settings.provider === 'gemini'}
                onChange={handleProviderChange}
              />
              <span>Google Gemini</span>
            </label>
          </div>
        </div>
      </div>

      {settings.provider === 'openai' && (
        <div className="card bg-base-200 mb-4">
          <div className="card-body p-4">
            <h2 className="card-title text-lg mb-3">OpenAI 配置</h2>

            <div className="form-control mb-3">
              <label className="label" htmlFor="apiKey">
                <span className="label-text">API Key</span>
              </label>
              <input
                type="password"
                id="apiKey"
                name="apiKey"
                className="input input-bordered w-full"
                value={settings.openai?.apiKey ?? ''}
                onChange={handleOpenAIChange}
                placeholder="sk-..."
              />
            </div>

            <div className="form-control mb-3">
              <label className="label" htmlFor="apiHost">
                <span className="label-text">API Host (可选)</span>
              </label>
              <input
                type="text"
                id="apiHost"
                name="apiHost"
                className="input input-bordered w-full"
                value={settings.openai?.apiHost ?? ''}
                onChange={handleOpenAIChange}
                placeholder="例如：https://api.openai.com/v1"
              />
            </div>

            <div className="form-control">
              <label className="label" htmlFor="model">
                <span className="label-text">模型 (可选)</span>
              </label>
              <input
                type="text"
                id="model"
                name="model"
                className="input input-bordered w-full"
                value={settings.openai?.model ?? ''}
                onChange={handleOpenAIChange}
                placeholder="例如：gpt-4o"
              />
            </div>

            <div className="form-control mt-3">
              <label className="label" htmlFor="openaiTemperature">
                <span className="label-text">Temperature (可选)</span>
              </label>
              <input
                type="number"
                id="openaiTemperature"
                name="temperature"
                className="input input-bordered w-full"
                value={settings.openai?.temperature ?? ''}
                onChange={handleOpenAIChange}
                placeholder="默认：0.7"
                min={0}
                max={2}
                step={0.1}
              />
            </div>

            <div className="form-control mt-3">
              <label className="label" htmlFor="openaiTopP">
                <span className="label-text">Top P (可选)</span>
              </label>
              <input
                type="number"
                id="openaiTopP"
                name="topP"
                className="input input-bordered w-full"
                value={settings.openai?.topP ?? ''}
                onChange={handleOpenAIChange}
                placeholder="默认：1"
                min={0}
                max={1}
                step={0.1}
              />
            </div>
          </div>
        </div>
      )}

      {settings.provider === 'gemini' && (
        <div className="card bg-base-200 mb-4">
          <div className="card-body p-4">
            <h2 className="card-title text-lg mb-3">Google Gemini 配置</h2>

            <div className="form-control mb-3">
              <label className="label" htmlFor="geminiApiKey">
                <span className="label-text">API Key</span>
              </label>
              <input
                type="password"
                id="geminiApiKey"
                name="apiKey"
                className="input input-bordered w-full"
                value={settings.gemini?.apiKey ?? ''}
                onChange={handleGeminiChange}
                placeholder="输入您的 Gemini API Key"
              />
            </div>

            <div className="form-control">
              <label className="label" htmlFor="geminiModel">
                <span className="label-text">模型 (可选)</span>
              </label>
              <input
                type="text"
                id="geminiModel"
                name="model"
                className="input input-bordered w-full"
                value={settings.gemini?.model ?? ''}
                onChange={handleGeminiChange}
                placeholder="例如：gemini-pro"
              />
            </div>

            <div className="form-control mt-3">
              <label className="label" htmlFor="geminiTemperature">
                <span className="label-text">Temperature (可选)</span>
              </label>
              <input
                type="number"
                id="geminiTemperature"
                name="temperature"
                className="input input-bordered w-full"
                value={settings.gemini?.temperature ?? ''}
                onChange={handleGeminiChange}
                placeholder="默认：0.7"
                min={0}
                max={2}
                step={0.1}
              />
            </div>

            <div className="form-control mt-3">
              <label className="label" htmlFor="geminiTopP">
                <span className="label-text">Top P (可选)</span>
              </label>
              <input
                type="number"
                id="geminiTopP"
                name="topP"
                className="input input-bordered w-full"
                value={settings.gemini?.topP ?? ''}
                onChange={handleGeminiChange}
                placeholder="默认：1"
                min={0}
                max={1}
                step={0.1}
              />
            </div>
          </div>
        </div>
      )}

      <div className="card bg-base-200 mb-4">
        <div className="card-body p-4">
          <h2 className="card-title text-lg mb-3">Prompt 模板设置</h2>
          <div className="form-control">
            <label className="label" htmlFor="promptTemplate">
              <span className="label-text">Prompt 模板</span>
            </label>
            <textarea
              id="promptTemplate"
              className="textarea textarea-bordered w-full"
              value={settings.promptTemplate ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                setSettings((prev) => ({
                  ...prev,
                  promptTemplate: value,
                }));
              }}
              placeholder={DEFAULT_PROMPT_TEMPLATE}
              rows={4}
            />
            <span className="label-text-alt mt-1">使用 {'{content}'} 作为网页内容的占位符</span>
          </div>
        </div>
      </div>

      <button type="button" className="btn btn-primary" onClick={saveSettings}>
        保存设置
      </button>

      {status && (
        <div className={`alert mt-4 ${status.includes('失败') ? 'alert-error' : 'alert-success'}`}>
          <span>{status}</span>
        </div>
      )}
    </div>
  );
}
