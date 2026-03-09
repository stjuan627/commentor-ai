import { useState, useEffect } from 'react';
import './App.css';
import { createLLMService } from '../../src/services/llm';
import { LLMSettings, ExtractedContent, ExtractResponse, KeywordItem } from '../../src/types';
import { KeywordManager, CommentOutput } from './components';

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedComments, setGeneratedComments] = useState<string[]>();
  const [llmSettings, setLlmSettings] = useState<LLMSettings | null>(null);
  const [isGeneratingComment, setIsGeneratingComment] = useState(false);
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);

  useEffect(() => {
    browser.storage.local.get('llmSettings').then((result: { llmSettings?: LLMSettings }) => {
      if (result.llmSettings) {
        setLlmSettings(result.llmSettings);
      }
    }).catch(err => {
      console.error('Error loading LLM settings:', err);
      setError('加载 LLM 设置失败');
    });

    browser.storage.local.get('keywords').then((result: { keywords?: KeywordItem[] }) => {
      if (result.keywords) {
        setKeywords(result.keywords);
      }
    }).catch(err => {
      console.error('Error loading keywords:', err);
      setError('加载关键词失败');
    });
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

  const generateComment = async () => {
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
      const keywordsList = keywords.filter(k => k.enabled).map(k => k.keyword);
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

  const handleAddKeyword = async (keyword: Omit<KeywordItem, 'enabled'>) => {
    const newKeyword: KeywordItem = { ...keyword, enabled: true };
    const updatedKeywords = [...keywords, newKeyword];
    setKeywords(updatedKeywords);
    await browser.storage.local.set({ keywords: updatedKeywords });
  };

  const handleUpdateKeyword = async (index: number, keyword: KeywordItem) => {
    const updatedKeywords = [...keywords];
    updatedKeywords[index] = keyword;
    setKeywords(updatedKeywords);
    await browser.storage.local.set({ keywords: updatedKeywords });
  };

  const handleDeleteKeyword = async (index: number) => {
    const updatedKeywords = keywords.filter((_, i) => i !== index);
    setKeywords(updatedKeywords);
    await browser.storage.local.set({ keywords: updatedKeywords });
  };

  const handleToggleKeyword = async (index: number) => {
    const updatedKeywords = [...keywords];
    updatedKeywords[index] = {
      ...updatedKeywords[index],
      enabled: !updatedKeywords[index].enabled
    };
    setKeywords(updatedKeywords);
    await browser.storage.local.set({ keywords: updatedKeywords });
  };

  const handleCopy = (comment: string, format: 'txt' | 'html' | 'markdown' | 'bbcode') => {
    if (format === 'txt') {
      navigator.clipboard.writeText(comment).catch(err => {
        setError('复制到剪贴板失败: ' + err.message);
      });
    } else {
      let result = comment;
      const sortedKeywords = [...keywords]
        .filter(k => k.enabled)
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

  const openOptionsPage = () => {
    browser.runtime.sendMessage({ action: 'openOptionsPage' })
      .then(response => {
        if (response?.action === 'openOptionsInSidepanel') {
          window.open('/options.html', '_blank');
        }
      })
      .catch(err => console.error('Error opening options page:', err));
  };

  return (
    <div className="w-full h-full bg-base-100 p-4">
      <h1 className="text-3xl uppercase tracking-tight font-bold text-center mb-8">Commentor.AI</h1>

      {error && (
        <div className="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}

      <KeywordManager
        keywords={keywords}
        onAdd={handleAddKeyword}
        onUpdate={handleUpdateKeyword}
        onDelete={handleDeleteKeyword}
        onToggle={handleToggleKeyword}
      />

      <button
        type="button"
        className="btn btn-warning w-full mb-4"
        onClick={generateComment}
        disabled={isGeneratingComment || isLoading || !llmSettings?.provider}
      >
        {isGeneratingComment || isLoading ? (
          <>
            <span className="loading loading-spinner"></span>正在生成
          </>
        ) : '生成评论'}
      </button>

      {!llmSettings?.provider && (
        <div className="text-sm text-warning mt-2 mb-4">
          请先在
          <button
            type="button"
            onClick={openOptionsPage}
            className="text-info underline"
          >
            选项页面
          </button>
          设置 LLM 提供商
        </div>
      )}

      <CommentOutput
        comments={generatedComments || []}
        keywords={keywords}
        onCopy={handleCopy}
      />
    </div>
  );
}

export default App;
