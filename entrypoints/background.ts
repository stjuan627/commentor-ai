import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground(() => {
  console.log('Commentor.ai background service started', { id: browser.runtime.id });

  // 监听来自 popup 的消息
  browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === 'getPageContent') {
      try {
        // 获取当前活动标签页
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) {
          sendResponse({ success: false, error: 'No active tab found' });
          return;
        }

        const activeTab = tabs[0];
        
        // 向 content script 发送消息，请求提取内容
        const response = await browser.tabs.sendMessage(activeTab.id, { action: 'extractContent' });
        
        // 将内容返回给 popup
        sendResponse(response);
      } catch (error) {
        console.error('Error in background script:', error);
        sendResponse({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }
    
    return true; // 保持消息通道开放，以便异步响应
  });
});
