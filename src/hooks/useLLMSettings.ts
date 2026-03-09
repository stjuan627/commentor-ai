import { useState, useEffect, useCallback } from 'react';
import type { LLMSettings } from '../types';

export function useLLMSettings() {
  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    browser.storage.local.get('llmSettings')
      .then((result: { llmSettings?: LLMSettings }) => {
        if (result.llmSettings) {
          setSettings(result.llmSettings);
        }
      })
      .catch(err => {
        console.error('Error loading LLM settings:', err);
        setError('加载 LLM 设置失败');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const saveSettings = useCallback(async (newSettings: LLMSettings) => {
    try {
      await browser.storage.local.set({ llmSettings: newSettings });
      setSettings(newSettings);
      return true;
    } catch (err) {
      console.error('Error saving LLM settings:', err);
      setError('保存 LLM 设置失败');
      return false;
    }
  }, []);

  const setProvider = useCallback(async (provider: 'openai' | 'gemini' | null) => {
    const newSettings = { ...settings, provider } as LLMSettings;
    return saveSettings(newSettings);
  }, [settings, saveSettings]);

  const setOpenAIConfig = useCallback(async (config: NonNullable<LLMSettings['openai']>) => {
    const newSettings = { ...settings, openai: config } as LLMSettings;
    return saveSettings(newSettings);
  }, [settings, saveSettings]);

  const setGeminiConfig = useCallback(async (config: NonNullable<LLMSettings['gemini']>) => {
    const newSettings = { ...settings, gemini: config } as LLMSettings;
    return saveSettings(newSettings);
  }, [settings, saveSettings]);

  const setPromptTemplate = useCallback(async (template: string) => {
    const newSettings = { ...settings, promptTemplate: template } as LLMSettings;
    return saveSettings(newSettings);
  }, [settings, saveSettings]);

  const isConfigValid = useCallback(() => {
    if (!settings?.provider) return false;
    
    if (settings.provider === 'openai') {
      return !!settings.openai?.apiKey;
    }
    
    if (settings.provider === 'gemini') {
      return !!settings.gemini?.apiKey;
    }
    
    return false;
  }, [settings]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    settings,
    isLoading,
    error,
    saveSettings,
    setProvider,
    setOpenAIConfig,
    setGeminiConfig,
    setPromptTemplate,
    isConfigValid,
    clearError,
  };
}
