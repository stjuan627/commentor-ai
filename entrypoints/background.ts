import { defineBackground } from 'wxt/utils/define-background';
import type { FormField } from '../src/types';
import * as authService from '../src/services/auth';
import { getProducts, setActiveProductId } from '../src/services/products';
import {
  createLocalStatusRecord,
  getProductStatuses,
  getWebPageSnapshot,
  mergeProductStatuses,
  saveProductStatuses,
  saveWebPageSnapshot,
} from '../src/services/productMatrix';
import { fetchProductStatuses, fetchWebPages } from '../src/services/sheets';
import { flushSyncQueue, schedulePeriodicSync } from '../src/services/sync';
import type {
  DatasourceConfig,
  ProductLibrarySnapshot,
  ProductSyncQueueItem,
  WebPageRecord,
} from '../src/types';

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
    executeScript(details: { target: { tabId: number; allFrames?: boolean; frameIds?: number[] }; files: string[] }): Promise<unknown>;
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

  void schedulePeriodicSync();

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

  async function getCurrentTabId(): Promise<number> {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0 || !tabs[0].id) {
      throw new Error('No active tab found');
    }

    return tabs[0].id;
  }

  async function buildProductLibraryPayload(): Promise<{
    snapshot: ProductLibrarySnapshot;
    activeProductId: string | null;
    activeContext: unknown;
  }> {
    const [products, webPages, statuses, contextResult, activeProductResult] = await Promise.all([
      getProducts(),
      getWebPageSnapshot(),
      getProductStatuses(),
      browser.storage.local.get('activeProductContext'),
      browser.storage.local.get('activeProductId'),
    ]);

    let activeProductId = activeProductResult.activeProductId ?? null;
    if (!activeProductId && products.length > 0) {
      activeProductId = products[0].id;
      await setActiveProductId(activeProductId);
    }

    return {
      snapshot: {
        products,
        webPages,
        statuses,
        fetchedAt: webPages?.fetchedAt ?? new Date().toISOString(),
      },
      activeProductId,
      activeContext: contextResult.activeProductContext ?? null,
    };
  }

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'openOptionsPage') {
      sendResponse({ success: true, action: 'openOptionsInSidepanel' });
      return true;
    }

    if (message.action === 'getPageLanguage') {
      (async () => {
        try {
          const tabId = await getCurrentTabId();
          const isInjected = await ensureContentScriptInjected(tabId);
          if (!isInjected) {
            sendResponse({ success: false, error: 'Failed to inject content script' });
            return;
          }

          const response = await browser.tabs.sendMessage(tabId, { action: 'getPageLanguage' });
          sendResponse(response);
        } catch (error: unknown) {
          console.error('Error getting page language:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      })();
      return true;
    }

    if (message.action === 'getPageContent') {
      (async () => {
        try {
          const tabId = await getCurrentTabId();
          const isInjected = await ensureContentScriptInjected(tabId);
          if (!isInjected) {
            sendResponse({ success: false, error: 'Failed to inject content script' });
            return;
          }

          const response = await browser.tabs.sendMessage(tabId, { action: 'extractContent' });
          sendResponse(response);
        } catch (error: unknown) {
          console.error('Error getting page content:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      })();
      return true;
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
                return (response.fields as FormField[]).map((f: FormField) => ({
                  ...f,
                  frameId: frame.frameId,
                }));
              }
            } catch {
              // 内容脚本未注入（动态 iframe 等），尝试注入后重试
              try {
                await _browser.scripting.executeScript({
                  target: { tabId: activeTab.id!, frameIds: [frame.frameId] },
                  files: ['content-scripts/content.js'],
                });
                const retryResponse = await _browser.tabs.sendMessage(
                  activeTab.id!,
                  { action: 'scanFormFields' },
                  { frameId: frame.frameId },
                );
                if (retryResponse?.success && retryResponse.fields) {
                  return (retryResponse.fields as FormField[]).map((f: FormField) => ({
                    ...f,
                    frameId: frame.frameId,
                  }));
                }
              } catch {
                // 注入也失败（跨域 iframe、about:blank 等），忽略
              }
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

    if (message.action === 'authConnect') {
      (async () => {
        try {
          const supported = await authService.isAuthSupported();
          if (!supported) {
            sendResponse({ success: false, error: 'Auth not supported in this browser' });
            return;
          }

          await authService.acquireToken(true);
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

    if (message.action === 'productLibraryBootstrap') {
      (async () => {
        try {
          const result = await browser.storage.local.get('datasourceConfig');
          const config: DatasourceConfig | undefined = result.datasourceConfig;
          const payload = await buildProductLibraryPayload();

          if (!config || !config.connected) {
            sendResponse({ success: true, status: 'unconfigured', ...payload });
            return;
          }

          sendResponse({ success: true, status: 'ok', ...payload });
        } catch (error: unknown) {
          console.error('Product library bootstrap failed:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      })();
      return true;
    }

    if (message.action === 'productLibraryRefresh') {
      (async () => {
        try {
          const result = await browser.storage.local.get('datasourceConfig');
          const config: DatasourceConfig | undefined = result.datasourceConfig;
          if (!config || !config.connected) {
            sendResponse({ success: false, error: 'Datasource not configured', status: 'unconfigured' });
            return;
          }

          const products = await getProducts();
          const webPages = await fetchWebPages(config);
          const currentStatuses = await getProductStatuses();
          const remoteStatusesEntries = await Promise.all(
            products.map(async (product) => [product.id, await fetchProductStatuses(config, product)] as const),
          );
          const remoteStatuses = Object.fromEntries(remoteStatusesEntries);
          const mergedStatuses = mergeProductStatuses(currentStatuses, remoteStatuses);
          const webPageSnapshot = {
            records: webPages,
            fetchedAt: new Date().toISOString(),
          };

          await saveWebPageSnapshot(webPageSnapshot);
          await saveProductStatuses(mergedStatuses);

          const payload = await buildProductLibraryPayload();
          sendResponse({ success: true, ...payload });
        } catch (error: unknown) {
          console.error('Product library refresh failed:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error', retryable: true });
        }
      })();
      return true;
    }

    if (message.action === 'productTaskOpenPage') {
      (async () => {
        try {
          const { url, productId, pageKey, siteKey } = message;
          if (!url || !productId || !pageKey || !siteKey) {
            sendResponse({ success: false, error: 'Missing required fields' });
            return;
          }

          const tab = await browser.tabs.create({ url, active: true });
          const activeContext = {
            productId,
            pageKey,
            siteKey,
            tabId: tab.id,
            boundAt: new Date().toISOString(),
          };

          await browser.storage.local.set({
            activeProductContext: activeContext,
            activeProductId: productId,
          });
          sendResponse({ success: true, tabId: tab.id, activeContext });
        } catch (error: unknown) {
          console.error('Product task open page failed:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      })();
      return true;
    }

    if (message.action === 'productTaskUpdate') {
      (async () => {
        try {
          const { productId, pageKey, status, comment } = message as {
            productId: string;
            pageKey: string;
            status: 'pending' | 'done' | 'invalid';
            comment?: string;
          };

          const [products, webPageSnapshot, statuses, queueResult] = await Promise.all([
            getProducts(),
            getWebPageSnapshot(),
            getProductStatuses(),
            browser.storage.local.get('syncQueue'),
          ]);

          const product = products.find((item) => item.id === productId);
          const page = webPageSnapshot?.records.find((item: WebPageRecord) => item.pageKey === pageKey);

          if (!product || !page) {
            sendResponse({ success: false, error: 'Product or page not found' });
            return;
          }

          const existing = (statuses[productId] ?? []).find((item) => item.pageKey === pageKey);
          const nextRecord = createLocalStatusRecord(
            product,
            page,
            status,
            (existing?.version ?? 0) + 1,
            comment ?? existing?.comment,
          );
          const nextStatuses = { ...statuses, [productId]: [...(statuses[productId] ?? []).filter((item) => item.pageKey !== pageKey), nextRecord] };
          const queue: ProductSyncQueueItem[] = queueResult.syncQueue || [];
          const nextQueue = [
            ...queue.filter((item) => item.id !== nextRecord.id),
            {
              id: nextRecord.id,
              productId,
              pageKey,
              siteKey: page.siteKey,
              status,
              comment: nextRecord.comment,
              version: nextRecord.version,
              enqueuedAt: new Date().toISOString(),
              retryCount: 0,
              syncState: 'pending',
            },
          ];

          await saveProductStatuses(nextStatuses);
          await browser.storage.local.set({ syncQueue: nextQueue, activeProductId: productId });
          await flushSyncQueue();

          const refreshedStatuses = await getProductStatuses();
          const updatedRecord = (refreshedStatuses[productId] ?? []).find((item) => item.pageKey === pageKey) ?? nextRecord;
          sendResponse({ success: true, record: updatedRecord });
        } catch (error: unknown) {
          console.error('Product task update failed:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      })();
      return true;
    }

    if (message.action === 'productTaskGetActiveContext') {
      (async () => {
        try {
          const result = await browser.storage.local.get(['activeProductContext', 'activeProductId']);
          sendResponse({
            success: true,
            activeContext: result.activeProductContext || null,
            activeProductId: result.activeProductId || null,
          });
        } catch (error: unknown) {
          console.error('Get active product context failed:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      })();
      return true;
    }

    if (message.action === 'productTaskSetActiveProduct') {
      (async () => {
        try {
          await setActiveProductId(message.productId ?? null);
          sendResponse({ success: true });
        } catch (error: unknown) {
          console.error('Set active product failed:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
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

    if (message.action === 'focusField') {
      (async () => {
        try {
          const tabs = await browser.tabs.query({ active: true, currentWindow: true });
          if (!tabs?.[0]?.id) { sendResponse({ success: false }); return; }
          const tabId = tabs[0].id;

          if (message.frameId != null) {
            const response = await _browser.tabs.sendMessage(
              tabId,
              { action: 'focusField', selector: message.selector },
              { frameId: message.frameId },
            );
            sendResponse(response);
          } else {
            const response = await browser.tabs.sendMessage(
              tabId,
              { action: 'focusField', selector: message.selector },
            );
            sendResponse(response);
          }
        } catch (error: unknown) {
          console.error('Error focusing field:', error);
          sendResponse({ success: false });
        }
      })();

      return true;
    }

    return true; // 保持消息通道开放，以便异步响应
  });

  try {
    const sidePanelApi = (browser as typeof browser & {
      sidePanel?: {
        setPanelBehavior: (options: { openPanelOnActionClick: boolean }) => Promise<void>;
      };
    }).sidePanel;
    if (sidePanelApi) {
      sidePanelApi.setPanelBehavior({
        openPanelOnActionClick: true,
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
