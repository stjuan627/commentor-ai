import { defineContentScript } from 'wxt/utils/define-content-script';
import { Readability } from '@mozilla/readability';

export default defineContentScript({
  matches: ['<all_urls>'], // 匹配所有网页
  main() {
    console.log('Content extractor script loaded');

    // 创建提取内容的函数
    function extractContent() {
      try {
        // 克隆当前文档，避免修改原始DOM
        const documentClone = document.cloneNode(true) as Document;
        
        // 创建Readability实例并解析内容
        const reader = new Readability(documentClone);
        const article = reader.parse();
        
        if (!article) {
          console.error('Failed to extract content from the page');
          return { success: false, error: 'Failed to extract content' };
        }
        
        return {
          success: true,
          data: {
            title: article.title,
            content: article.textContent,
            excerpt: article.excerpt,
            byline: article.byline,
            siteName: article.siteName,
            url: window.location.href
          }
        };
      } catch (error) {
        console.error('Error extracting content:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    }

    // 监听来自扩展其他部分的消息
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'extractContent') {
        const result = extractContent();
        sendResponse(result);
      }
      return true; // 保持消息通道开放，以便异步响应
    });
  },
});
