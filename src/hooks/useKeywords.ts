import { useState, useEffect, useCallback } from 'react';
import type { KeywordItem } from '../types';

export function useKeywords() {
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    browser.storage.local.get('keywords')
      .then((result: { keywords?: KeywordItem[] }) => {
        if (result.keywords) {
          setKeywords(result.keywords);
        }
      })
      .catch(err => {
        console.error('Error loading keywords:', err);
        setError('加载关键词失败');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const saveKeywords = useCallback(async (newKeywords: KeywordItem[]) => {
    try {
      await browser.storage.local.set({ keywords: newKeywords });
      setKeywords(newKeywords);
      return true;
    } catch (err) {
      console.error('Error saving keywords:', err);
      setError('保存关键词失败');
      return false;
    }
  }, []);

  const addKeyword = useCallback(async (keyword: Omit<KeywordItem, 'enabled'> & { enabled?: boolean }) => {
    if (!keyword.keyword || !keyword.url) {
      setError('关键词和URL不能为空');
      return false;
    }

    const newKeyword: KeywordItem = {
      keyword: keyword.keyword,
      url: keyword.url,
      enabled: keyword.enabled ?? true,
    };

    const updatedKeywords = [...keywords, newKeyword];
    return saveKeywords(updatedKeywords);
  }, [keywords, saveKeywords]);

  const updateKeyword = useCallback(async (index: number, updates: Partial<KeywordItem>) => {
    if (index < 0 || index >= keywords.length) return false;

    const updatedKeywords = [...keywords];
    updatedKeywords[index] = { ...updatedKeywords[index], ...updates };
    return saveKeywords(updatedKeywords);
  }, [keywords, saveKeywords]);

  const deleteKeyword = useCallback(async (index: number) => {
    if (index < 0 || index >= keywords.length) return false;

    const updatedKeywords = keywords.filter((_, i) => i !== index);
    return saveKeywords(updatedKeywords);
  }, [keywords, saveKeywords]);

  const toggleKeyword = useCallback(async (index: number) => {
    if (index < 0 || index >= keywords.length) return false;

    const updatedKeywords = [...keywords];
    updatedKeywords[index] = {
      ...updatedKeywords[index],
      enabled: !updatedKeywords[index].enabled,
    };
    return saveKeywords(updatedKeywords);
  }, [keywords, saveKeywords]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    keywords,
    isLoading,
    error,
    addKeyword,
    updateKeyword,
    deleteKeyword,
    toggleKeyword,
    clearError,
  };
}
