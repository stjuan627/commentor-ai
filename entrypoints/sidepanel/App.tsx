import { useState, useEffect } from 'react';
import './App.css';
import { createLLMService } from '../../services/llm';
import { LLMSettings, ExtractedContent, ExtractResponse } from '../../types';

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageContent, setPageContent] = useState<ExtractedContent | null>(null);
  const [generatedComment, setGeneratedComment] = useState<string>('');
  const [llmSettings, setLlmSettings] = useState<LLMSettings | null>(null);
  const [isGeneratingComment, setIsGeneratingComment] = useState(false);

  // 从存储中加载 LLM 设置
  useEffect(() => {
    browser.storage.local.get('llmSettings').then((result: {llmSettings?: LLMSettings}) => {
      if (result.llmSettings) {
        setLlmSettings(result.llmSettings);
      }
    }).catch(err => {
      console.error('Error loading LLM settings:', err);
      setError('加载 LLM 设置失败');
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

  // 生成评论
  const generateComment = async () => {
    if (!pageContent) {
      setError('请先提取页面内容');
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
      const contentToSend = `标题：${pageContent.title}\n\n内容：${pageContent.content}`;
      
      // 调用 LLM 服务生成评论
      const comment = await llmService.generateComment(contentToSend, llmSettings.promptTemplate);
      setGeneratedComment(comment);
    } catch (err) {
      console.error('Error generating comment:', err);
      setError(err instanceof Error ? err.message : '生成评论时发生错误');
    } finally {
      setIsGeneratingComment(false);
    }
  };

  // 复制评论到剪贴板
  const copyToClipboard = () => {
    if (generatedComment) {
      navigator.clipboard.writeText(generatedComment)
        .then(() => {
          alert('评论已复制到剪贴板');
        })
        .catch(err => {
          setError('复制到剪贴板失败: ' + err.message);
        });
    }
  };

  return (
    <div className="p-0 w-full h-full bg-base-100">
      <h1 className="text-2xl font-bold text-center mb-4">Commentor.ai</h1>
      
      {/* 提取内容按钮 */}
      <button 
        className={`btn btn-primary w-full mb-4 ${isLoading ? 'loading' : ''}`} 
        onClick={extractPageContent}
        disabled={isLoading}
      >
        {isLoading ? '正在提取...' : '提取当前页面内容'}
      </button>
      
      {/* 错误提示 */}
      {error && (
        <div className="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}
      
      {/* 提取的内容 */}
      {pageContent && (
        <div className="w-full mb-4">
          <div className="card bg-base-200">
            <div className="card-body">
              <div className="card-title">{pageContent.title}</div>
              <p className="line-clamp-3">{pageContent.excerpt || pageContent.content.substring(0, 150) + '...'}</p>
              {/* <p className="text-sm opacity-70">{pageContent.content}</p> */}
            </div>
          </div>
          
          {/* 生成评论按钮 */}
          <button 
            className={`btn btn-accent w-full mt-4 ${isGeneratingComment ? 'loading' : ''}`} 
            onClick={generateComment}
            disabled={isGeneratingComment || !llmSettings || !llmSettings.provider}
          >
            {isGeneratingComment ? '正在生成...' : '生成评论'}
          </button>
          {!llmSettings?.provider && (
            <div className="text-sm text-warning mt-2">
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
        </div>
      )}
      
      {/* 生成的评论 */}
      {generatedComment && (
        <div className="mt-4">
          <div className="card bg-base-200">
            <div className="card-body">
              <h3 className="card-title text-lg">生成的评论</h3>
              <p>{generatedComment}</p>
              <div className="card-actions justify-end mt-2">
                <button className="btn btn-sm btn-outline" onClick={copyToClipboard}>
                  复制到剪贴板
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
