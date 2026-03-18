import { defineBackground } from 'wxt/utils/define-background';
import type { FormField } from '../src/types';

// chrome.debugger API 类型声明（Chrome 扩展特有，不在 webextension-polyfill 中）
interface ChromeDebuggee { tabId?: number }
interface ChromeDebuggerAPI {
  attach(target: ChromeDebuggee, requiredVersion: string): Promise<void>;
  detach(target: ChromeDebuggee): Promise<void>;
  sendCommand(target: ChromeDebuggee, method: string, params?: object): Promise<unknown>;
}
declare const chrome: { debugger: ChromeDebuggerAPI };

// WXT browser 类型扩展（scripting / webNavigation / tabs.sendMessage frameId 未在最小类型中声明）
interface FrameInfo { frameId: number; url: string }
const _browser = browser as typeof browser & {
  scripting: {
    executeScript(details: { target: { tabId: number; allFrames?: boolean }; files: string[] }): Promise<unknown>;
  };
  webNavigation: {
    getAllFrames(details: { tabId: number }): Promise<FrameInfo[] | null>;
  };
  tabs: typeof browser.tabs & {
    sendMessage(tabId: number, message: unknown, options: { frameId: number }): Promise<any>;
  };
};

interface CDPAXNode {
  nodeId: string;
  role: { value: string };
  name?: { value: string };
  backendDOMNodeId?: number;
}

const CDP_TEXTFIELD_ROLES = new Set([
  'textField', 'searchBox', 'textBox', 'comboBox', 'spinButton',
  // Lowercase variants from some CDP versions
  'textfield', 'searchbox', 'textbox', 'combobox', 'spinbutton',
]);

export default defineBackground(() => {
  console.log('Commentor.ai background service started', { id: browser.runtime.id });

  // 检查内容脚本是否已注入，若未注入则主动注入
  async function ensureContentScriptInjected(tabId: number): Promise<boolean> {
    try {
      await browser.tabs.sendMessage(tabId, { action: 'ping' });
      return true;
    } catch {
      // 内容脚本未加载，尝试通过 scripting API 主动注入
      console.log('Content script not loaded, injecting via scripting API...');
      try {
        await _browser.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ['content-scripts/content.js'],
        });
        return true;
      } catch (injectError: unknown) {
        console.error('Failed to inject content script:', injectError);
        return false;
      }
    }
  }

  // 通过 CDP 无障碍树获取表单字段信息
  async function getCDPAccessibilityFields(tabId: number): Promise<{ backendDOMNodeId?: number; a11yName?: string; a11yRole?: string }[]> {
    const debugTarget = { tabId };
    try {
      await chrome.debugger.attach(debugTarget, '1.3');
      await chrome.debugger.sendCommand(debugTarget, 'Accessibility.enable');
      const result = await chrome.debugger.sendCommand(debugTarget, 'Accessibility.getFullAXTree') as { nodes: CDPAXNode[] };

      const fields = (result.nodes || [])
        .filter(node => CDP_TEXTFIELD_ROLES.has(node.role?.value || ''))
        .map(node => ({
          backendDOMNodeId: node.backendDOMNodeId,
          a11yName: node.name?.value,
          a11yRole: node.role?.value,
        }));

      await chrome.debugger.sendCommand(debugTarget, 'Accessibility.disable');
      await chrome.debugger.detach(debugTarget);
      return fields;
    } catch (error) {
      console.warn('CDP accessibility query failed, falling back to TreeWalker only:', error);
      // 尝试清理 debugger 连接
      try { await chrome.debugger.detach(debugTarget); } catch { /* ignore */ }
      return [];
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
    
    if (message.action === 'getPageLanguage') {
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
          
          // 向 content script 发送消息，请求获取页面语言
          try {
            const response = await browser.tabs.sendMessage(activeTab.id, { action: 'getPageLanguage' });
            // 将语言代码返回给发送者
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

    if (message.action === 'scanFormFields') {
      (async () => {
        try {
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

          const isInjected = await ensureContentScriptInjected(activeTab.id);
          if (!isInjected) {
            sendResponse({ success: false, error: 'Failed to inject content script' });
            return;
          }

          // 1. 获取所有 frame（主页面 + iframe）
          let frames: FrameInfo[] = [{ frameId: 0, url: '' }];
          try {
            const allFrames = await _browser.webNavigation.getAllFrames({ tabId: activeTab.id });
            if (allFrames && allFrames.length > 0) {
              frames = allFrames;
            }
          } catch {
            console.warn('webNavigation.getAllFrames failed, scanning top frame only');
          }

          // 2. 向每个 frame 发送 scanFormFields，收集所有结果
          let allFields: FormField[] = [];
          const scanPromises = frames.map(async (frame) => {
            try {
              const response = await _browser.tabs.sendMessage(
                activeTab.id!,
                { action: 'scanFormFields' },
                { frameId: frame.frameId },
              );
              if (response?.success && response.fields) {
                // 为每个字段标记来源 frameId
                return (response.fields as FormField[]).map((f: FormField) => ({
                  ...f,
                  frameId: frame.frameId,
                }));
              }
            } catch {
              // 某些 frame 可能无法通信（about:blank、跨域限制等），忽略
            }
            return [] as FormField[];
          });

          const results = await Promise.all(scanPromises);
          allFields = results.flat();

          // 3. 从 CDP 获取无障碍树信息（增强结果）
          try {
            const cdpFields = await getCDPAccessibilityFields(activeTab.id);
            if (cdpFields.length > 0) {
              const cdpByIndex = new Map(cdpFields.map((f, i) => [i, f]));
              allFields.forEach((field, index) => {
                const cdpField = cdpByIndex.get(index);
                if (cdpField) {
                  if (cdpField.a11yName) field.a11yName = cdpField.a11yName;
                  if (cdpField.a11yRole) field.a11yRole = cdpField.a11yRole;
                }
              });
            }
          } catch (error: unknown) {
            console.warn('CDP enrichment failed, using TreeWalker results only:', error);
          }

          sendResponse({ success: true, fields: allFields });
        } catch (error: unknown) {
          console.error('Error scanning form fields:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })();

      return true;
    }

    if (message.action === 'focusAndFillField') {
      (async () => {
        try {
          const tabs = await browser.tabs.query({ active: true, currentWindow: true });
          if (!tabs || tabs.length === 0) {
            sendResponse({ success: false });
            return;
          }

          const activeTab = tabs[0];
          if (!activeTab.id) {
            sendResponse({ success: false });
            return;
          }

          // 使用 frameId 定位到正确的 frame
          if (message.frameId != null) {
            const response = await _browser.tabs.sendMessage(
              activeTab.id,
              { action: 'focusAndFillField', selector: message.selector, text: message.text },
              { frameId: message.frameId },
            );
            sendResponse(response);
          } else {
            const response = await browser.tabs.sendMessage(
              activeTab.id,
              { action: 'focusAndFillField', selector: message.selector, text: message.text },
            );
            sendResponse(response);
          }
        } catch (error: unknown) {
          console.error('Error focusing/filling field:', error);
          sendResponse({ success: false });
        }
      })();

      return true;
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
