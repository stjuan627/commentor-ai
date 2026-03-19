import { defineBackground } from 'wxt/utils/define-background';
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

export default defineBackground(() => {
  console.log('Commentor.ai background service started', { id: browser.runtime.id });

  void schedulePeriodicSync();

  async function ensureContentScriptInjected(tabId: number): Promise<boolean> {
    try {
      await browser.tabs.sendMessage(tabId, { action: 'ping' }).catch(async () => {
        console.log('Content script not loaded, but we will try to extract content anyway');
      });
      return true;
    } catch (error: unknown) {
      console.error('Failed to check content script:', error);
      return false;
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

    return true;
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
