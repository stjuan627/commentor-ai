import React, { useState, useEffect } from 'react';

interface LLMSettings {
  provider: 'openai' | 'gemini' | null;
  promptTemplate?: string;
  openai?: {
    apiKey?: string;
    apiHost?: string;
    model?: string;
  };
  gemini?: {
    apiKey?: string;
    model?: string;
  };
}

function App() {
  const [settings, setSettings] = useState<LLMSettings>({
    provider: null,
    promptTemplate: '请对以下内容进行评论：\n\n{content}'
  });
  const [status, setStatus] = useState<string>('');

  // Load settings on component mount
  useEffect(() => {
    browser.storage.local.get('llmSettings').then((result: {llmSettings?: LLMSettings}) => {
      if (result.llmSettings) {
        setSettings(result.llmSettings);
      }
    });
  }, []);

  // Handle form changes
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

  // Save settings
  const saveSettings = () => {
    browser.storage.local.set({ llmSettings: settings }).then(() => {
      setStatus('设置已保存');
      setTimeout(() => setStatus(''), 3000); // Clear status after 3 seconds
    }).catch((error: Error) => {
      console.error('Error saving settings:', error);
      setStatus('保存设置失败');
      setTimeout(() => setStatus(''), 3000);
    });
  };

  return (
    <div>
      <h1>LLM 设置</h1>
      
      <div className="section">
        <h2>选择 LLM 提供商</h2>
        <div>
          <label>
            <input
              type="radio"
              name="provider"
              value="openai"
              checked={settings.provider === 'openai'}
              onChange={handleProviderChange}
            />
            OpenAI
          </label>
          <label>
            <input
              type="radio"
              name="provider"
              value="gemini"
              checked={settings.provider === 'gemini'}
              onChange={handleProviderChange}
            />
            Google Gemini
          </label>
        </div>
      </div>

      {settings.provider === 'openai' && (
        <div className="section">
          <h2>OpenAI 配置</h2>
          
          <div className="field">
            <label className="field-label" htmlFor="apiKey">API Key</label>
            <input
              type="password"
              id="apiKey"
              name="apiKey"
              value={settings.openai?.apiKey || ''}
              onChange={handleOpenAIChange}
              placeholder="sk-..."
            />
          </div>
          
          <div className="field">
            <label className="field-label" htmlFor="apiHost">API Host (可选)</label>
            <input
              type="text"
              id="apiHost"
              name="apiHost"
              value={settings.openai?.apiHost || ''}
              onChange={handleOpenAIChange}
              placeholder="例如：https://api.openai.com/v1"
            />
          </div>
          
          <div className="field">
            <label className="field-label" htmlFor="model">模型 (可选)</label>
            <input
              type="text"
              id="model"
              name="model"
              value={settings.openai?.model || ''}
              onChange={handleOpenAIChange}
              placeholder="例如：gpt-4o"
            />
          </div>
        </div>
      )}

      {/* Gemini 设置 */}
      {settings.provider === 'gemini' && (
        <div className="section">
          <h2>Google Gemini 配置</h2>
          
          <div className="field">
            <label className="field-label" htmlFor="geminiApiKey">API Key</label>
            <input
              type="password"
              id="geminiApiKey"
              name="apiKey"
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
          
          <div className="field">
            <label className="field-label" htmlFor="geminiModel">模型 (可选)</label>
            <input
              type="text"
              id="geminiModel"
              name="model"
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
      )}

      {/* Prompt 模板设置 */}
      <div className="section">
        <h2>Prompt 模板设置</h2>
        <div className="field">
          <label className="field-label" htmlFor="promptTemplate">Prompt 模板</label>
          <textarea
            id="promptTemplate"
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
            className="textarea"
          />
          <p className="field-help">使用 {'{content}'} 作为网页内容的占位符</p>
        </div>
      </div>

      <button onClick={saveSettings}>保存设置</button>
      {status && <div className="status-message">{status}</div>}
    </div>
  );
}

export default App;
