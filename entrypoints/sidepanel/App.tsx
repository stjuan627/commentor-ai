import { useState, useEffect } from 'react';
import './App.css';
import { createLLMService } from '../../src/services/llm';
import { LLMSettings, ExtractedContent, ExtractResponse, KeywordItem, SiteItem } from '../../src/types';
import { SiteKeywordSelector, SiteManager, CommentOutput, SettingsPanel } from './components';

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedComments, setGeneratedComments] = useState<string[]>();
  const [llmSettings, setLlmSettings] = useState<LLMSettings | null>(null);
  const [isGeneratingComment, setIsGeneratingComment] = useState(false);
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [activeTab, setActiveTab] = useState<'comment' | 'sites' | 'settings'>('comment');

  const hasValidProviderConfig = (settings: LLMSettings | null) => {
    if (!settings?.provider) {
      return false;
    }

    if (settings.provider === 'openai') {
      return Boolean(settings.openai?.apiKey);
    }

    if (settings.provider === 'gemini') {
      return Boolean(settings.gemini?.apiKey);
    }

    return false;
  };

  useEffect(() => {
    browser.storage.local.get('llmSettings').then((result: { llmSettings?: LLMSettings }) => {
      if (result.llmSettings) {
        setLlmSettings(result.llmSettings);
      }
    }).catch(err => {
      console.error('Error loading LLM settings:', err);
      setError('加载 LLM 设置失败');
    });

    browser.storage.local.get(['sites', 'keywords']).then((result: { sites?: SiteItem[]; keywords?: KeywordItem[] }) => {
      if (Array.isArray(result.sites)) {
        setSites(result.sites);
        return;
      }

      if (Array.isArray(result.keywords) && result.keywords.length > 0) {
        const migratedSites: SiteItem[] = [
          {
            id: 'default-site',
            name: '默认站点',
            keywords: result.keywords,
          },
        ];
        setSites(migratedSites);
        browser.storage.local.set({ sites: migratedSites }).catch((err) => {
          console.error('Error persisting migrated sites:', err);
        });
      }
    }).catch(err => {
      console.error('Error loading sites:', err);
      setError('加载站点失败');
    });

    const refreshLlmSettings = () => {
      browser.storage.local.get('llmSettings').then((result: { llmSettings?: LLMSettings }) => {
        setLlmSettings(result.llmSettings ?? null);
      }).catch(err => {
        console.error('Error refreshing LLM settings:', err);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshLlmSettings();
      }
    };

    window.addEventListener('focus', refreshLlmSettings);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', refreshLlmSettings);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const getPageLanguage = async (): Promise<string> => {
    try {
      const response = await browser.runtime.sendMessage({ action: 'getPageLanguage' });
      if (response?.success && response.lang) {
        return response.lang;
      }
      return 'en';
    } catch (err) {
      console.error('Error getting page language:', err);
      return 'en';
    }
  };

  const allKeywords = sites.flatMap((site) => site.keywords);
  const enabledKeywords = allKeywords.filter((item) => item.enabled);

  const persistSites = async (nextSites: SiteItem[]) => {
    setSites(nextSites);
    await browser.storage.local.set({ sites: nextSites });
  };

  const generateComment = async () => {
    if (!llmSettings?.provider) {
      setError('请先在设置页配置 LLM 提供商');
      return;
    }

    if (!hasValidProviderConfig(llmSettings)) {
      setError('请先在设置页配置 API Key');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const extractResponse = await browser.runtime.sendMessage({ action: 'getPageContent' }) as ExtractResponse;

      if (!extractResponse.success) {
        throw new Error(extractResponse.error || '提取内容失败');
      }

      const pageLanguage = await getPageLanguage();
      await generateCommentWithContent(extractResponse.data!, pageLanguage);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提取内容或生成评论失败');
      setIsLoading(false);
      setIsGeneratingComment(false);
    }
  };

  const generateCommentWithContent = async (content: ExtractedContent, langcode: string) => {
    if (!content) {
      setError('页面内容为空');
      return;
    }

    if (!llmSettings?.provider) {
      setError('请先在选项页面设置 LLM 提供商');
      return;
    }

    if (
      (llmSettings.provider === 'openai' && !llmSettings.openai?.apiKey) ||
      (llmSettings.provider === 'gemini' && !llmSettings.gemini?.apiKey)
    ) {
      setError('请先在选项页面设置 API Key');
      return;
    }

    setIsGeneratingComment(true);
    setError(null);

    try {
      const llmService = createLLMService(llmSettings);
      if (!llmService) {
        throw new Error('无法创建 LLM 服务');
      }

      const contentToSend = `# ${content.title}\n\n${content.content}`;
      const keywordsList = enabledKeywords.map((item) => item.keyword);
      const comments: string[] = [];

      if (langcode && langcode !== 'en' && langcode !== '') {
        const args = {
          content: contentToSend,
          keywords: keywordsList,
          langcode: langcode
        };
        const [englishComment, localComment] = await Promise.all([
          llmService.generateComment(contentToSend, llmSettings.promptTemplate, { ...args, langcode: 'en' }),
          llmService.generateComment(contentToSend, llmSettings.promptTemplate, args)
        ]);
        comments.push(englishComment, localComment);
      } else {
        const comment = await llmService.generateComment(contentToSend, llmSettings.promptTemplate, {
          content: contentToSend,
          keywords: keywordsList,
          langcode: 'en'
        });
        comments.push(comment);
      }

      setGeneratedComments(comments);
    } catch (err) {
      console.error('Error generating comment:', err);
      setError(err instanceof Error ? err.message : '生成评论时发生错误');
    } finally {
      setIsGeneratingComment(false);
      setIsLoading(false);
    }
  };

  const handleAddSite = async (name: string) => {
    const nextSites: SiteItem[] = [
      ...sites,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name,
        keywords: [],
      },
    ];
    await persistSites(nextSites);
  };

  const handleUpdateSite = async (siteId: string, name: string) => {
    const nextSites = sites.map((site) => (site.id === siteId ? { ...site, name } : site));
    await persistSites(nextSites);
  };

  const handleDeleteSite = async (siteId: string) => {
    const nextSites = sites.filter((site) => site.id !== siteId);
    await persistSites(nextSites);
  };

  const handleAddKeyword = async (siteId: string, keyword: Omit<KeywordItem, 'enabled'>) => {
    const nextSites = sites.map((site) => {
      if (site.id !== siteId) return site;
      return {
        ...site,
        keywords: [...site.keywords, { ...keyword, enabled: true }],
      };
    });
    await persistSites(nextSites);
  };

  const handleUpdateKeyword = async (siteId: string, keywordIndex: number, keyword: Omit<KeywordItem, 'enabled'>) => {
    const nextSites = sites.map((site) => {
      if (site.id !== siteId) return site;
      if (keywordIndex < 0 || keywordIndex >= site.keywords.length) return site;

      const nextKeywords = [...site.keywords];
      nextKeywords[keywordIndex] = {
        ...nextKeywords[keywordIndex],
        keyword: keyword.keyword,
        url: keyword.url,
      };

      return {
        ...site,
        keywords: nextKeywords,
      };
    });
    await persistSites(nextSites);
  };

  const handleDeleteKeyword = async (siteId: string, keywordIndex: number) => {
    const nextSites = sites.map((site) => {
      if (site.id !== siteId) return site;
      return {
        ...site,
        keywords: site.keywords.filter((_, index) => index !== keywordIndex),
      };
    });
    await persistSites(nextSites);
  };

  const handleToggleKeyword = async (siteId: string, keywordIndex: number) => {
    const nextSites = sites.map((site) => {
      if (site.id !== siteId) return site;
      if (keywordIndex < 0 || keywordIndex >= site.keywords.length) return site;

      const nextKeywords = [...site.keywords];
      nextKeywords[keywordIndex] = {
        ...nextKeywords[keywordIndex],
        enabled: !nextKeywords[keywordIndex].enabled,
      };

      return {
        ...site,
        keywords: nextKeywords,
      };
    });

    await persistSites(nextSites);
  };

  const handleCopy = (comment: string, format: 'txt' | 'html' | 'markdown' | 'bbcode') => {
    if (format === 'txt') {
      navigator.clipboard.writeText(comment).catch(err => {
        setError('复制到剪贴板失败: ' + err.message);
      });
    } else {
      let result = comment;
      const sortedKeywords = [...enabledKeywords]
        .sort((a, b) => b.keyword.length - a.keyword.length);

      for (const { keyword, url } of sortedKeywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        if (format === 'html') {
          result = result.replace(regex, `<a href="${url}">${keyword}</a>`);
        } else if (format === 'markdown') {
          result = result.replace(regex, `[${keyword}](${url})`);
        } else if (format === 'bbcode') {
          result = result.replace(regex, `[url=${url}]${keyword}[/url]`);
        }
      }

      navigator.clipboard.writeText(result).catch(err => {
        setError('复制到剪贴板失败: ' + err.message);
      });
    }
  };

  return (
    <div className="w-full h-full bg-base-100 p-4">
      <h1 className="text-3xl uppercase tracking-tight font-bold text-center mb-8">Commentor.AI</h1>

      <div className="tabs tabs-boxed mb-4">
        <button
          type="button"
          className={`tab ${activeTab === 'comment' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('comment')}
        >
          评论
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'sites' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('sites')}
        >
          站点
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'settings' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          设置
        </button>
      </div>

      {error && (
        <div className="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}

      <div className={activeTab === 'comment' ? 'block' : 'hidden'}>
          <SiteKeywordSelector
            sites={sites}
            onToggle={handleToggleKeyword}
          />

          <button
            type="button"
            className="btn btn-warning w-full mb-4"
            onClick={generateComment}
            disabled={isGeneratingComment || isLoading || !hasValidProviderConfig(llmSettings)}
          >
            {isGeneratingComment || isLoading ? (
              <>
                <span className="loading loading-spinner"></span>正在生成
              </>
            ) : '生成评论'}
          </button>

          {!llmSettings?.provider && (
            <div className="text-sm text-warning mt-2 mb-4">
              请先前往
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="text-info underline"
              >
                设置
              </button>
              标签页配置 LLM 提供商与 API Key
            </div>
          )}

          <CommentOutput
            comments={generatedComments || []}
            keywords={allKeywords}
            onCopy={handleCopy}
          />
      </div>

      <div className={activeTab === 'sites' ? 'block' : 'hidden'}>
        <SiteManager
          sites={sites}
          onAddSite={handleAddSite}
          onUpdateSite={handleUpdateSite}
          onDeleteSite={handleDeleteSite}
          onAddKeyword={handleAddKeyword}
          onUpdateKeyword={handleUpdateKeyword}
          onDeleteKeyword={handleDeleteKeyword}
          onToggleKeyword={handleToggleKeyword}
        />
      </div>

      <div className={activeTab === 'settings' ? 'block' : 'hidden'}>
        <SettingsPanel
          llmSettings={llmSettings}
          onSaved={setLlmSettings}
        />
      </div>
    </div>
  );
}

export default App;
