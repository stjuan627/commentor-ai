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

    // 获取页面语言代码
    function getPageLanguage() {
      try {
        // 尝试从 html 标签的 lang 属性获取语言代码
        let langCode = document.documentElement.lang || '';
        
        // 如果没有找到语言代码，尝试从 meta 标签获取
        if (!langCode) {
          const metaLang = document.querySelector('meta[http-equiv="Content-Language"]');
          if (metaLang && metaLang.getAttribute('content')) {
            langCode = metaLang.getAttribute('content') || '';
          }
        }
        
        // 如果仍然没有找到语言代码，尝试从其他可能的来源获取
        if (!langCode) {
          // 可能的其他来源，如 body 的 lang 属性
          langCode = document.body.lang || '';
        }
        
        // 如果找到了语言代码，只保留主要部分（如 'zh-CN' 变为 'zh'）
        if (langCode) {
          langCode = langCode.split('-')[0].toLowerCase();
        }
        
        return {
          success: true,
          lang: langCode || 'en' // 如果没有找到语言代码，默认为英语
        };
      } catch (error) {
        console.error('Error getting page language:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error',
          lang: 'en' // 出错时默认为英语
        };
      }
    }

    // 监听来自扩展其他部分的消息
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Content script received message:', message);
      
      // 响应ping消息，用于检测内容脚本是否已加载
      if (message.action === 'ping') {
        console.log('Responding to ping');
        sendResponse({ success: true, message: 'Content script is loaded' });
        return true;
      }
      
      // 提取内容
      if (message.action === 'extractContent') {
        console.log('Extracting content...');
        const result = extractContent();
        console.log('Extraction result:', result);
        sendResponse(result);
      }
      
      // 获取页面语言
      if (message.action === 'getPageLanguage') {
        console.log('Getting page language...');
        const result = getPageLanguage();
        console.log('Language result:', result);
        sendResponse(result);
      }
      
      return true; // 保持消息通道开放，以便异步响应
    });
  },
});
