import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground(() => {
  console.log('Commentor.ai background service started', { id: browser.runtime.id });

  // 检查内容脚本是否已注入
  async function ensureContentScriptInjected(tabId: number): Promise<boolean> {
    try {
      // 尝试发送测试消息检查内容脚本是否已加载
      await browser.tabs.sendMessage(tabId, { action: 'ping' })
        .catch(async () => {
          // 如果发送消息失败，说明内容脚本未加载
          console.log('Content script not loaded, but we will try to extract content anyway');
          // 注意：在WXT中，内容脚本应该已经自动注入
          // 我们不需要手动注入，因为它已经在manifest中配置
        });
      return true;
    } catch (error: unknown) {
      console.error('Failed to check content script:', error);
      return false;
    }
  }

  // 监听来自 popup 或侧边栏的消息
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'openOptionsPage') {
      // 打开选项页面
      console.log('Opening options page');
      // 使用 window.open 来打开选项页面
      // 在 WXT 中，我们可以使用简单的方式来处理
      // 向 sidepanel 发送消息，让它自己打开选项页面
      sendResponse({ success: true, action: 'openOptionsInSidepanel' });
      return true;
    }
    
    if (message.action === 'getPageContent') {
      // 使用立即执行函数处理异步操作
      (async () => {
        try {
          // 获取当前活动标签页
          const tabs = await browser.tabs.query({ active: true, currentWindow: true });
          if (!tabs || tabs.length === 0) {
            sendResponse({ success: false, error: 'No active tab found' });
            return;
          }

          const activeTab = tabs[0];
          if (!activeTab.id) {
            sendResponse({ success: false, error: 'Tab ID is undefined' });
            return;
          }
          
          // 确保内容脚本已注入
          const isInjected = await ensureContentScriptInjected(activeTab.id);
          if (!isInjected) {
            sendResponse({ success: false, error: 'Failed to inject content script' });
            return;
          }
          
          // 向 content script 发送消息，请求提取内容
          try {
            const response = await browser.tabs.sendMessage(activeTab.id, { action: 'extractContent' });
            // 将内容返回给发送者
            sendResponse(response);
          } catch (error: unknown) {
            console.error('Error communicating with content script:', error);
            sendResponse({ 
              success: false, 
              error: 'Failed to communicate with content script: ' + (error instanceof Error ? error.message : 'Unknown error')
            });
          }
        } catch (error: unknown) {
          console.error('Error in background script:', error);
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      })();
      
      return true; // 保持消息通道开放
    }
    
    return true; // 保持消息通道开放，以便异步响应
  });

  // 设置侧边栏行为
  try {
    // @ts-ignore - 忽略TypeScript错误，因为类型定义可能不完整
    if (browser.sidePanel) {
      // @ts-ignore - 忽略TypeScript错误
      browser.sidePanel.setPanelBehavior({
        openPanelOnActionClick: true
      }).catch((error: unknown) => {
        console.error('Error setting side panel behavior:', error);
      });
    } else {
      console.warn('Side panel API not available in this browser');
    }
  } catch (error: unknown) {
    console.warn('Error accessing sidePanel API:', error);
  }
});
