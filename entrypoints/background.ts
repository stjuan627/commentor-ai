import { defineBackground } from 'wxt/utils/define-background';
import * as authService from '../src/services/auth';
import * as sheetsService from '../src/services/sheets';
import { schedulePeriodicSync } from '../src/services/sync';
import type { DatasourceConfig, LibrarySnapshot } from '../src/types';

export default defineBackground(() => {
  console.log('Commentor.ai background service started', { id: browser.runtime.id });

  schedulePeriodicSync();

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
          
          try {
            const response = await browser.tabs.sendMessage(activeTab.id, { action: 'extractContent' });
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
      
      return true;
    }

    if (message.action === 'authConnect') {
      (async () => {
        try {
          const supported = await authService.isAuthSupported();
          if (!supported) {
            sendResponse({ success: false, error: 'Auth not supported in this browser' });
            return;
          }

          const token = await authService.acquireToken(true);
          const state = await authService.getAuthState();
          sendResponse({ success: true, state });
        } catch (error: unknown) {
          console.error('Auth connect failed:', error);
          const state = await authService.getAuthState();
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error', state });
        }
      })();
      return true;
    }

    if (message.action === 'authDisconnect') {
      (async () => {
        try {
          await authService.revokeToken();
          const state = await authService.getAuthState();
          sendResponse({ success: true, state });
        } catch (error: unknown) {
          console.error('Auth disconnect failed:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      })();
      return true;
    }

    if (message.action === 'authGetState') {
      (async () => {
        try {
          const state = await authService.getAuthState();
          sendResponse({ success: true, state });
        } catch (error: unknown) {
          console.error('Get auth state failed:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      })();
      return true;
    }

    if (message.action === 'libraryBootstrap') {
      (async () => {
        try {
          const result = await browser.storage.local.get(['datasourceConfig', 'librarySnapshot']);
          const config: DatasourceConfig | undefined = result.datasourceConfig;
          const cached: LibrarySnapshot | undefined = result.librarySnapshot;

          if (!config || !config.connected) {
            sendResponse({ success: true, snapshot: cached || null, status: 'unconfigured' });
            return;
          }

          sendResponse({ success: true, snapshot: cached || null, status: 'ok' });
        } catch (error: unknown) {
          console.error('Library bootstrap failed:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      })();
      return true;
    }

    if (message.action === 'libraryRefresh') {
      (async () => {
        try {
          const result = await browser.storage.local.get('datasourceConfig');
          const config: DatasourceConfig | undefined = result.datasourceConfig;

          if (!config || !config.connected) {
            sendResponse({ success: false, error: 'Datasource not configured', status: 'unconfigured' });
            return;
          }

          const records = await sheetsService.fetchPageRecords(config);
          const snapshot: LibrarySnapshot = {
            records,
            fetchedAt: new Date().toISOString(),
          };

          await browser.storage.local.set({ librarySnapshot: snapshot });
          sendResponse({ success: true, snapshot });
        } catch (error: unknown) {
          console.error('Library refresh failed:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error', retryable: true });
        }
      })();
      return true;
    }

    if (message.action === 'libraryOpenPage') {
      (async () => {
        try {
          const { url, pageKey, siteKey } = message;
          if (!url) {
            sendResponse({ success: false, error: 'URL is required' });
            return;
          }

          const tab = await browser.tabs.create({ url, active: true });
          const activeContext = {
            pageKey,
            siteKey,
            tabId: tab.id,
            boundAt: new Date().toISOString(),
          };
          await browser.storage.local.set({ activeLibraryContext: activeContext });
          sendResponse({ success: true, tabId: tab.id, activeContext });
        } catch (error: unknown) {
          console.error('Library open page failed:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      })();
      return true;
    }

    if (message.action === 'libraryStatusUpdate') {
      (async () => {
        try {
          const { pageKey, siteKey, status, version } = message;
          const result = await browser.storage.local.get(['datasourceConfig', 'librarySnapshot', 'syncQueue']);
          const config: DatasourceConfig | undefined = result.datasourceConfig;
          const snapshot: LibrarySnapshot | undefined = result.librarySnapshot;
          const queue: any[] = result.syncQueue || [];
          const nextVersion = version + 1;
          const updatedAt = new Date().toISOString();

          let updatedRecord = null;

          if (snapshot) {
            const updatedRecords = snapshot.records.map(r =>
              r.pageKey === pageKey && r.siteKey === siteKey
                ? (() => {
                    updatedRecord = { ...r, status, version: nextVersion, updatedAt, syncState: 'pending' as const };
                    return updatedRecord;
                  })()
                : r
            );
            await browser.storage.local.set({ librarySnapshot: { ...snapshot, records: updatedRecords } });
          }

          const queueItem = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            pageKey,
            siteKey,
            status,
            version: nextVersion,
            enqueuedAt: updatedAt,
            retryCount: 0,
            syncState: 'pending' as const,
          };
          queue.push(queueItem);
          await browser.storage.local.set({ syncQueue: queue });

          if (config && config.connected) {
            try {
              await sheetsService.batchUpdateStatus(config, [{ pageKey, status, version: nextVersion }]);
              const updatedQueue = queue.filter(q => q.id !== queueItem.id);

              if (snapshot) {
                const syncedRecords = snapshot.records.map(r =>
                  r.pageKey === pageKey && r.siteKey === siteKey
                    ? { ...r, status, version: nextVersion, updatedAt, syncState: 'synced' as const }
                    : r
                );
                updatedRecord = syncedRecords.find(r => r.pageKey === pageKey && r.siteKey === siteKey) || updatedRecord;
                await browser.storage.local.set({
                  syncQueue: updatedQueue,
                  librarySnapshot: { ...snapshot, records: syncedRecords },
                });
              } else {
                await browser.storage.local.set({ syncQueue: updatedQueue });
              }

              sendResponse({ success: true, syncState: 'synced', updatedRecord });
            } catch (syncError: unknown) {
              console.error('Sync failed, queued for retry:', syncError);
              sendResponse({ success: true, syncState: 'pending', error: syncError instanceof Error ? syncError.message : 'Sync failed', updatedRecord });
            }
          } else {
            sendResponse({ success: true, syncState: 'pending', updatedRecord });
          }
        } catch (error: unknown) {
          console.error('Library status update failed:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      })();
      return true;
    }

    if (message.action === 'libraryGetActiveContext') {
      (async () => {
        try {
          const result = await browser.storage.local.get('activeLibraryContext');
          sendResponse({ success: true, activeContext: result.activeLibraryContext || null });
        } catch (error: unknown) {
          console.error('Get active context failed:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      })();
      return true;
    }
    
    return true;
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
