import { useState, useEffect } from 'react';
import './App.css';
import { createLLMService } from '../../services/llm';
import { LLMSettings, ExtractedContent, ExtractResponse, KeywordItem } from '../../types';
import { CopyButton } from './CopyButton';

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageContent, setPageContent] = useState<ExtractedContent | null>(null);
  const [generatedComments, setGeneratedComments] = useState<string[]>();
  const [llmSettings, setLlmSettings] = useState<LLMSettings | null>(null);
  const [isGeneratingComment, setIsGeneratingComment] = useState(false);
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);
  const [newKeyword, setNewKeyword] = useState<KeywordItem>({ keyword: '', url: '' });
  const [editingKeywordIndex, setEditingKeywordIndex] = useState<number | null>(null);
  const [pageLanguage, setPageLanguage] = useState<string>('en');

  // 从存储中加载 LLM 设置和关键词
  useEffect(() => {
    // 加载 LLM 设置
    browser.storage.local.get('llmSettings').then((result: {llmSettings?: LLMSettings}) => {
      if (result.llmSettings) {
        setLlmSettings(result.llmSettings);
      }
    }).catch(err => {
      console.error('Error loading LLM settings:', err);
      setError('加载 LLM 设置失败');
    });
    
    // 加载关键词
    browser.storage.local.get('keywords').then((result: {keywords?: KeywordItem[]}) => {
      if (result.keywords) {
        setKeywords(result.keywords);
      }
    }).catch(err => {
      console.error('Error loading keywords:', err);
      setError('加载关键词失败');
    });
  }, []);

  // 提取页面内容
  const extractPageContent = async () => {
    setIsLoading(true);
    setError(null);
    setPageContent(null);
    
    try {
      const response = await browser.runtime.sendMessage({ action: 'getPageContent' }) as ExtractResponse;
      
      if (!response.success) {
        throw new Error(response.error || '提取内容失败');
      }
      
      setPageContent(response.data!);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发生未知错误');
      console.error('Error extracting content:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 关键词管理函数
  const addKeyword = () => {
    if (!newKeyword.keyword || !newKeyword.url) {
      setError('关键词和URL不能为空');
      return;
    }
    
    const updatedKeywords = [...keywords, newKeyword];
    setKeywords(updatedKeywords);
    setNewKeyword({ keyword: '', url: '' });
    
    // 保存到存储
    browser.storage.local.set({ keywords: updatedKeywords })
      .catch(err => {
        console.error('Error saving keywords:', err);
        setError('保存关键词失败');
      });
  };
  
  const updateKeyword = () => {
    if (editingKeywordIndex === null) return;
    if (!newKeyword.keyword || !newKeyword.url) {
      setError('关键词和URL不能为空');
      return;
    }
    
    const updatedKeywords = [...keywords];
    updatedKeywords[editingKeywordIndex] = newKeyword;
    setKeywords(updatedKeywords);
    setNewKeyword({ keyword: '', url: '' });
    setEditingKeywordIndex(null);
    
    // 保存到存储
    browser.storage.local.set({ keywords: updatedKeywords })
      .catch(err => {
        console.error('Error saving keywords:', err);
        setError('保存关键词失败');
      });
  };
  
  const editKeyword = (index: number) => {
    setNewKeyword(keywords[index]);
    setEditingKeywordIndex(index);
  };
  
  const deleteKeyword = (index: number) => {
    const updatedKeywords = keywords.filter((_, i) => i !== index);
    setKeywords(updatedKeywords);
    
    // 保存到存储
    browser.storage.local.set({ keywords: updatedKeywords })
      .catch(err => {
        console.error('Error saving keywords:', err);
        setError('保存关键词失败');
      });
  };
  
  // 自动提取页面内容并生成评论
  const generateComment = async () => {
    // 先提取页面内容
    setIsLoading(true);
    setError(null);
    
    try {
      // 提取页面内容
      const extractResponse = await browser.runtime.sendMessage({ action: 'getPageContent' }) as ExtractResponse;
      
      if (!extractResponse.success) {
        throw new Error(extractResponse.error || '提取内容失败');
      }
      
      setPageContent(extractResponse.data!);
      
      // 获取页面语言
      const langResponse = await browser.runtime.sendMessage({ action: 'getPageLanguage' });
      if (langResponse && langResponse.success && langResponse.lang) {
        setPageLanguage(langResponse.lang);
      }
      
      // 继续生成评论流程
      await generateCommentWithContent(extractResponse.data!);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提取内容或生成评论失败');
      setIsLoading(false);
      setIsGeneratingComment(false);
    }
  };
  
  // 使用提取的内容生成评论
  const generateCommentWithContent = async (content: ExtractedContent) => {
    if (!content) {
      setError('页面内容为空');
      return;
    }
    
    if (!llmSettings || !llmSettings.provider) {
      setError('请先在选项页面设置 LLM 提供商');
      return;
    }
    
    // 检查是否有 API Key
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
      // 创建 LLM 服务
      const llmService = createLLMService(llmSettings);
      if (!llmService) {
        throw new Error('无法创建 LLM 服务');
      }
      
      // 准备内容
      const contentToSend = `# ${content.title}\n\n${content.content}`;
      
      // 提取关键词列表
      const keywordsList = keywords.map(k => k.keyword);
      
      // 根据页面语言决定是否生成双语评论
      const comments: string[] = [];
      
      console.log('pageLanguage', pageLanguage);
      if (pageLanguage && pageLanguage !== 'en' && pageLanguage !== '') {
        const args = {
          content: contentToSend,
          keywords: keywordsList,
          langcode: pageLanguage
        };
        // 生成英文评论
        const [englishComment, localComment] = await Promise.all([
          llmService.generateComment(contentToSend, llmSettings.promptTemplate, { ...args, langcode: 'en' }),
          llmService.generateComment(contentToSend, llmSettings.promptTemplate, args)
        ]);

        comments.push(englishComment, localComment);
      } else {
        // 只生成英文评论
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

  // 添加关键词链接的辅助函数
  const addLinksToComment = (comment: string, format: 'html' | 'markdown') => {
    let result = comment;
    
    // 按关键词长度排序，优先替换较长的关键词，避免部分替换问题
    const sortedKeywords = [...keywords].sort((a, b) => b.keyword.length - a.keyword.length);
    
    for (const keywordItem of sortedKeywords) {
      const { keyword, url } = keywordItem;
      // 使用正则表达式匹配整个单词
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      
      if (format === 'html') {
        result = result.replace(regex, `<a href="${url}">${keyword}</a>`);
      } else { // markdown
        result = result.replace(regex, `[${keyword}](${url})`);
      }
    }
    
    return result;
  };
  
  // 复制纯文本评论到剪贴板
  const copyToClipboard = (comment: string) => {
    if (comment) {
      navigator.clipboard.writeText(comment).catch(err => {
        setError('复制到剪贴板失败: ' + err.message);
      });
    }
  };
  
  // 复制带HTML链接的评论到剪贴板
  const copyAsHtmlLinks = (comment: string) => {
    if (comment) {
      const commentWithLinks = addLinksToComment(comment, 'html');
      navigator.clipboard.writeText(commentWithLinks).catch(err => {
        setError('复制到剪贴板失败: ' + err.message);
      });
    }
  };
  
  // 复制带Markdown链接的评论到剪贴板
  const copyAsMarkdownLinks = (comment: string) => {
    if (comment) {
      const commentWithLinks = addLinksToComment(comment, 'markdown');
      navigator.clipboard.writeText(commentWithLinks).catch(err => {
        setError('复制到剪贴板失败: ' + err.message);
      });
    }
  };

  // 高亮关键词
  const highlightKeywords = (text: string) => {
    let result = text;
    
    // 按关键词长度排序，优先替换较长的关键词，避免部分替换问题
    const sortedKeywords = [...keywords].sort((a, b) => b.keyword.length - a.keyword.length);
    
    for (const keywordItem of sortedKeywords) {
      const { keyword } = keywordItem;
      // 使用正则表达式匹配整个单词
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      
      result = result.replace(regex, `<span class="text-accent">${keyword}</span>`);
    }
    
    return result;
  };

  return (
    <div className="w-full h-full bg-base-100 p-0">
      <h1 className="text-2xl font-bold text-center mb-8">Commentor.ai</h1>
      
      {/* 错误提示 */}
      {error && (
        <div className="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}
      
      {/* 关键词管理区域 */}
      <div className="mb-6 border rounded-lg p-3 bg-base-200">
        <h2 className="text-lg font-semibold mb-2">关键词管理</h2>
        
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="关键词"
            className="input input-bordered input-sm flex-1"
            value={newKeyword.keyword}
            onChange={(e) => setNewKeyword({...newKeyword, keyword: e.target.value})}
          />
          <input
            type="text"
            placeholder="URL"
            className="input input-bordered input-sm flex-1"
            value={newKeyword.url}
            onChange={(e) => setNewKeyword({...newKeyword, url: e.target.value})}
          />
          {editingKeywordIndex !== null ? (
            <button 
              className="btn btn-sm btn-primary" 
              onClick={updateKeyword}
            >
              更新
            </button>
          ) : (
            <button 
              className="btn btn-sm btn-primary" 
              onClick={addKeyword}
            >
              添加
            </button>
          )}
        </div>
        
        {keywords.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table table-xs">
              <thead>
                <tr>
                  <th>关键词</th>
                  <th>URL</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((item, index) => (
                  <tr key={index}>
                    <td>{item.keyword}</td>
                    <td className="truncate max-w-[150px]">
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="link link-primary">
                        {item.url}
                      </a>
                    </td>
                    <td className="flex gap-1">
                      <button 
                        className="btn btn-xs btn-outline"
                        onClick={() => editKeyword(index)}
                      >
                        编辑
                      </button>
                      <button 
                        className="btn btn-xs btn-outline btn-error"
                        onClick={() => deleteKeyword(index)}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">暂无关键词</p>
        )}
      </div>
      
      {/* 生成评论按钮 */}
      <button 
        className={`btn btn-secondary w-full mb-4`} 
        onClick={generateComment}
        disabled={isGeneratingComment || isLoading || !llmSettings || !llmSettings.provider}
      >
        {isGeneratingComment || isLoading ? (
          <>
            <span className="loading loading-spinner"></span>正在生成
          </>
        ) : '生成评论'}
      </button>
      {!llmSettings?.provider && (
        <div className="text-sm text-warning mt-2 mb-4">
          请先在<a href="#" onClick={(e) => {
            e.preventDefault();
            browser.runtime.sendMessage({ action: 'openOptionsPage' })
              .then(response => {
                if (response && response.action === 'openOptionsInSidepanel') {
                  // 直接在新标签页中打开选项页面
                  window.open('/options.html', '_blank');
                }
              })
              .catch(err => console.error('Error opening options page:', err));
          }} className="text-info underline">选项页面</a>设置 LLM 提供商
        </div>
      )}
      
      {/* 提取的内容 */}
      {/* {pageContent && (
        <div className="w-full mb-4">
          <h2 className="text-lg font-semibold mb-2">页面内容</h2>
          <div className="card bg-base-200">
            <div className="card-body p-3">
              <div className="font-bold">{pageContent.title}</div>
              <p className="text-sm mt-2 line-clamp-3">{pageContent.content.substring(0, 150) + '...'}</p>
            </div>
          </div>
        </div>
      )} */}
      
      {/* 生成的评论 */}
      {generatedComments && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold mb-2">生成的评论</h2>
          {generatedComments.map((comment, index) => (
            <div key={index} className="card bg-base-200 mb-2 p-0">
              <div className="flex justify-between items-center mb-2">
                <div className="flex gap-2 items-center flex-wrap">
                  <CopyButton onClick={() => copyToClipboard(comment)} className="btn btn-sm btn-outline">
                    复制纯文本
                  </CopyButton>
                  <CopyButton onClick={() => copyAsHtmlLinks(comment)} className="btn btn-sm btn-outline btn-primary">
                    HTML链接
                  </CopyButton>
                  <CopyButton onClick={() => copyAsMarkdownLinks(comment)} className="btn btn-sm btn-outline btn-secondary">
                    Markdown
                  </CopyButton>
                </div>
              </div>
              <div className="card-body p-0 text-start">
                <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: highlightKeywords(comment) }}></div>
                { index > 0 && (
                  <span className="badge badge-outline badge-info inline-block mt-2">本地化</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
