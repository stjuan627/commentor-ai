import { useState, useEffect } from 'react';
import './App.css';

interface ExtractedContent {
  title: string;
  content: string;
  excerpt: string;
  byline: string;
  siteName: string;
  url: string;
}

interface ExtractResponse {
  success: boolean;
  data?: ExtractedContent;
  error?: string;
}

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageContent, setPageContent] = useState<ExtractedContent | null>(null);
  const [generatedComment, setGeneratedComment] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [isGeneratingComment, setIsGeneratingComment] = useState(false);

  // 从存储中加载 API key
  useEffect(() => {
    // 这里应该从浏览器存储中加载 API key
    // 暂时留空，后续实现
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
    
    if (!apiKey) {
      setError('请先设置 API Key');
      return;
    }
    
    setIsGeneratingComment(true);
    setError(null);
    
    try {
      // 这里应该调用 LLM API 生成评论
      // 暂时模拟一个生成的评论
      setTimeout(() => {
        setGeneratedComment(`这是一个关于"${pageContent.title}"的模拟评论。实际开发中，这里应该调用 LLM API 生成真实的评论。`);
        setIsGeneratingComment(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成评论时发生错误');
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
    <div className="p-4 max-w-md mx-auto bg-base-100 rounded-lg shadow-lg">
      <h1 className="text-2xl font-bold text-center mb-4">Commentor.ai</h1>
      
      {/* API Key 输入 */}
      <div className="mb-4">
        <label className="label">
          <span className="label-text">API Key</span>
        </label>
        <input 
          type="password" 
          className="input input-bordered w-full" 
          value={apiKey} 
          onChange={(e) => setApiKey(e.target.value)} 
          placeholder="输入你的 API Key"
        />
      </div>
      
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
        <div className="mb-4">
          <div className="card bg-base-200">
            <div className="card-body">
              <h2 className="card-title">{pageContent.title}</h2>
              <p className="text-sm opacity-70 mb-2">{pageContent.url}</p>
              <p className="line-clamp-3">{pageContent.excerpt || pageContent.content.substring(0, 150) + '...'}</p>
            </div>
          </div>
          
          {/* 生成评论按钮 */}
          <button 
            className={`btn btn-accent w-full mt-4 ${isGeneratingComment ? 'loading' : ''}`} 
            onClick={generateComment}
            disabled={isGeneratingComment}
          >
            {isGeneratingComment ? '正在生成...' : '生成评论'}
          </button>
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
