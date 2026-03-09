import { useState, useEffect } from 'react';
import type { LLMSettings } from '../../src/types';

function App() {
  const [settings, setSettings] = useState<LLMSettings>({
    provider: null,
    promptTemplate: '请对以下内容进行评论：\n\n{content}'
  });
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    browser.storage.local.get('llmSettings').then((result: { llmSettings?: LLMSettings }) => {
      if (result.llmSettings) {
        setSettings(result.llmSettings);
      }
    });
  }, []);

  const handleProviderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newProvider = event.target.value as 'openai' | 'gemini';
    setSettings(prev => ({ ...prev, provider: newProvider }));
  };

  const handleOpenAIChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setSettings(prev => ({
      ...prev,
      openai: {
        ...prev.openai,
        [name]: value,
      },
    }));
  };

  const saveSettings = () => {
    browser.storage.local.set({ llmSettings: settings }).then(() => {
      setStatus('设置已保存');
      setTimeout(() => setStatus(''), 3000);
    }).catch((error: Error) => {
      console.error('Error saving settings:', error);
      setStatus('保存设置失败');
      setTimeout(() => setStatus(''), 3000);
    });
  };

  return (
    <div className="min-h-screen bg-base-100 p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-base-content">LLM 设置</h1>

      <div className="card bg-base-200 mb-4">
        <div className="card-body">
          <h2 className="card-title text-lg mb-4">选择 LLM 提供商</h2>
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
          <div className="card-body">
            <h2 className="card-title text-lg mb-4">OpenAI 配置</h2>

            <div className="form-control mb-4">
              <label className="label" htmlFor="apiKey">
                <span className="label-text">API Key</span>
              </label>
              <input
                type="password"
                id="apiKey"
                name="apiKey"
                className="input input-bordered w-full"
                value={settings.openai?.apiKey || ''}
                onChange={handleOpenAIChange}
                placeholder="sk-..."
              />
            </div>

            <div className="form-control mb-4">
              <label className="label" htmlFor="apiHost">
                <span className="label-text">API Host (可选)</span>
              </label>
              <input
                type="text"
                id="apiHost"
                name="apiHost"
                className="input input-bordered w-full"
                value={settings.openai?.apiHost || ''}
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
                value={settings.openai?.model || ''}
                onChange={handleOpenAIChange}
                placeholder="例如：gpt-4o"
              />
            </div>
          </div>
        </div>
      )}

      {settings.provider === 'gemini' && (
        <div className="card bg-base-200 mb-4">
          <div className="card-body">
            <h2 className="card-title text-lg mb-4">Google Gemini 配置</h2>

            <div className="form-control mb-4">
              <label className="label" htmlFor="geminiApiKey">
                <span className="label-text">API Key</span>
              </label>
              <input
                type="password"
                id="geminiApiKey"
                name="apiKey"
                className="input input-bordered w-full"
                value={settings.gemini?.apiKey || ''}
                onChange={(event) => {
                  const { name, value } = event.target;
                  setSettings(prev => ({
                    ...prev,
                    gemini: {
                      ...prev.gemini,
                      [name]: value,
                    },
                  }));
                }}
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
                value={settings.gemini?.model || ''}
                onChange={(event) => {
                  const { name, value } = event.target;
                  setSettings(prev => ({
                    ...prev,
                    gemini: {
                      ...prev.gemini,
                      [name]: value,
                    },
                  }));
                }}
                placeholder="例如：gemini-pro"
              />
            </div>
          </div>
        </div>
      )}

      <div className="card bg-base-200 mb-4">
        <div className="card-body">
          <h2 className="card-title text-lg mb-4">Prompt 模板设置</h2>
          <div className="form-control">
            <label className="label" htmlFor="promptTemplate">
              <span className="label-text">Prompt 模板</span>
            </label>
            <textarea
              id="promptTemplate"
              className="textarea textarea-bordered w-full"
              value={settings.promptTemplate || ''}
              onChange={(event) => {
                const value = event.target.value;
                setSettings(prev => ({
                  ...prev,
                  promptTemplate: value,
                }));
              }}
              placeholder="请输入 Prompt 模板，使用 {content} 作为网页内容的占位符"
              rows={4}
            />
            <span className="label-text-alt mt-1">使用 {'{content}'} 作为网页内容的占位符</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary"
        onClick={saveSettings}
      >
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

export default App;
