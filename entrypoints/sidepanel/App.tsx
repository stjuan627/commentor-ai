import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import { createLLMService } from '../../src/services/llm';
import { createProductId, saveProducts } from '../../src/services/products';
import { buildTaskRecords } from '../../src/services/productMatrix';
import type {
  ActiveProductContext,
  DatasourceConfig,
  PageStatus,
  Product,
  ProductPageStatusRecord,
  ProductStatusSnapshot,
  ProductTaskRecord,
  WebPageSnapshot,
} from '../../src/types/library';
import { normalizePageKey } from '../../src/types/library';
import type { ExtractResponse, ExtractedContent } from '../../src/types/content';
import type { LLMSettings } from '../../src/types/llm';
import type { FormField } from '../../src/types/form';
import { CommentOutput, FormFieldList, ProductTaskPanel, SettingsPanel, SiteKeywordSelector, SiteManager } from './components';

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedComments, setGeneratedComments] = useState<string[]>();
  const [llmSettings, setLlmSettings] = useState<LLMSettings | null>(null);
  const [isGeneratingComment, setIsGeneratingComment] = useState(false);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<'comment' | 'products' | 'settings' | 'tasks'>('comment');
  const [datasourceConfig, setDatasourceConfig] = useState<DatasourceConfig | null>(null);
  const [webPageSnapshot, setWebPageSnapshot] = useState<WebPageSnapshot | null>(null);
  const [productStatuses, setProductStatuses] = useState<ProductStatusSnapshot>({});
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [activeProductContext, setActiveProductContext] = useState<ActiveProductContext | null>(null);
  const [activeTaskRecord, setActiveTaskRecord] = useState<ProductTaskRecord | null>(null);
  const [selectedCommentTaskKey, setSelectedCommentTaskKey] = useState<string | null>(null);
  const [currentTabPageKey, setCurrentTabPageKey] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskUnconfigured, setTaskUnconfigured] = useState(false);

  const hasValidProviderConfig = (settings: LLMSettings | null) => {
    if (!settings?.provider) {
      return false;
    }

    if (settings.provider === 'openai') {
      return Boolean(settings.openai?.apiKey);
    }

    if (settings.provider === 'gemini') {
      return Boolean(settings.gemini?.apiKey);
    }

    return false;
  };

  const tasksByProduct = useMemo(() => {
    const pages = webPageSnapshot?.records ?? [];

    return Object.fromEntries(products.map((product) => [
      product.id,
      buildTaskRecords(product, pages, productStatuses[product.id] ?? []),
    ]));
  }, [productStatuses, products, webPageSnapshot]);

  const activeProduct = useMemo(
    () => products.find((product) => product.id === activeProductId) ?? products[0] ?? null,
    [activeProductId, products],
  );

  const activeKeywords = activeProduct?.keywords ?? [];
  const activeProjectTasks = useMemo(() => {
    if (!activeProduct) {
      return [] as ProductTaskRecord[];
    }

    return tasksByProduct[activeProduct.id] ?? [];
  }, [activeProduct, tasksByProduct]);

  const defaultActiveTask = useMemo(() => {
    if (activeProjectTasks.length === 0) {
      return null;
    }

    return activeProjectTasks.find((task) => task.status === 'pending') ?? activeProjectTasks[0] ?? null;
  }, [activeProjectTasks]);

  const currentCommentTask = useMemo(() => {
    const selectedTask = selectedCommentTaskKey
      ? activeProjectTasks.find((task) => task.pageKey === selectedCommentTaskKey) ?? null
      : null;

    if (selectedTask) {
      return selectedTask;
    }

    const hasLiveTaskBinding = Boolean(
      activeTaskRecord
      && activeProductContext
      && activeTaskRecord.productId === activeProductId
      && activeTaskRecord.pageKey === activeProductContext.pageKey
      && currentTabPageKey === activeTaskRecord.pageKey,
    );

    if (hasLiveTaskBinding && activeTaskRecord) {
      return activeTaskRecord;
    }

    return defaultActiveTask;
  }, [activeProductContext, activeProductId, activeTaskRecord, activeProjectTasks, currentTabPageKey, defaultActiveTask, selectedCommentTaskKey]);

  const currentCommentTaskIndex = useMemo(() => {
    if (!currentCommentTask) {
      return -1;
    }

    return activeProjectTasks.findIndex((task) => task.pageKey === currentCommentTask.pageKey);
  }, [activeProjectTasks, currentCommentTask]);

  const refreshLlmSettings = useCallback(() => {
    browser.storage.local.get('llmSettings').then((result: { llmSettings?: LLMSettings }) => {
      setLlmSettings(result.llmSettings ?? null);
    }).catch((err) => {
      console.error('Error refreshing LLM settings:', err);
    });
  }, []);

  const refreshCurrentTabPageKey = useCallback(() => {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const activeTabUrl = tabs[0]?.url;
      setCurrentTabPageKey(activeTabUrl ? normalizePageKey(activeTabUrl) : null);
    }).catch((err) => {
      console.error('Error reading current tab URL:', err);
      setCurrentTabPageKey(null);
    });
  }, []);

  const deriveActiveTask = useCallback((
    context: ActiveProductContext | null,
    nextProducts: Product[],
    nextWebPageSnapshot: WebPageSnapshot | null,
    nextStatuses: ProductStatusSnapshot,
  ) => {
    if (!context) {
      return null;
    }

    const product = nextProducts.find((item) => item.id === context.productId);
    const page = nextWebPageSnapshot?.records.find((item) => item.pageKey === context.pageKey);
    if (!product || !page) {
      return null;
    }

    return buildTaskRecords(product, [page], nextStatuses[product.id] ?? [])[0] ?? null;
  }, []);

  const loadProductLibrary = useCallback(async (refresh: boolean) => {
    setTaskLoading(true);
    setTaskError(null);

    try {
      const response = await browser.runtime.sendMessage({
        action: refresh ? 'productLibraryRefresh' : 'productLibraryBootstrap',
      });

      if (!response.success) {
        throw new Error(response.error || '加载项目任务失败');
      }

      const snapshot = response.snapshot as {
        products: Product[];
        webPages: WebPageSnapshot | null;
        statuses: ProductStatusSnapshot;
      };
      const nextProducts = snapshot.products || [];
      const nextWebPageSnapshot = snapshot.webPages || null;
      const nextStatuses = snapshot.statuses || {};
      const nextContext = (response.activeContext as ActiveProductContext | null) ?? null;

      setProducts(nextProducts);
      setWebPageSnapshot(nextWebPageSnapshot);
      setProductStatuses(nextStatuses);
      setActiveProductId(response.activeProductId ?? nextProducts[0]?.id ?? null);
      setActiveProductContext(nextContext);
      setActiveTaskRecord(deriveActiveTask(nextContext, nextProducts, nextWebPageSnapshot, nextStatuses));
      setTaskUnconfigured(response.status === 'unconfigured');
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : '加载项目任务失败');
    } finally {
      setTaskLoading(false);
    }
  }, [deriveActiveTask]);

  useEffect(() => {
    refreshLlmSettings();
    refreshCurrentTabPageKey();

    browser.storage.local.get('datasourceConfig').then((result: { datasourceConfig?: DatasourceConfig }) => {
      setDatasourceConfig(result.datasourceConfig ?? null);
    }).catch((err) => {
      console.error('Error loading datasource config:', err);
    });

    void loadProductLibrary(false);

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          refreshLlmSettings();
          refreshCurrentTabPageKey();
        }
      };

    const handleWindowFocus = () => {
      refreshLlmSettings();
      refreshCurrentTabPageKey();
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadProductLibrary, refreshCurrentTabPageKey, refreshLlmSettings]);

  useEffect(() => {
    setActiveTaskRecord(deriveActiveTask(activeProductContext, products, webPageSnapshot, productStatuses));
  }, [activeProductContext, deriveActiveTask, productStatuses, products, webPageSnapshot]);

  const persistProducts = async (nextProducts: Product[]) => {
    setProducts(nextProducts);
    await saveProducts(nextProducts);
  };

  const getPageLanguage = async (): Promise<string> => {
    try {
      const response = await browser.runtime.sendMessage({ action: 'getPageLanguage' });
      if (response?.success && response.lang) {
        return response.lang;
      }
      return 'en';
    } catch (err) {
      console.error('Error getting page language:', err);
      return 'en';
    }
  };

  const generateComment = async () => {
    if (!activeProduct) {
      setError('请先选择一个项目');
      return;
    }

    if (!llmSettings?.provider) {
      setError('请先在设置页配置 LLM 提供商');
      return;
    }

    if (!hasValidProviderConfig(llmSettings)) {
      setError('请先在设置页配置 API Key');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const extractResponse = await browser.runtime.sendMessage({ action: 'getPageContent' }) as ExtractResponse;

      if (!extractResponse.success) {
        throw new Error(extractResponse.error || '提取内容失败');
      }

      const pageLanguage = await getPageLanguage();
      await generateCommentWithContent(extractResponse.data!, pageLanguage);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提取内容或生成评论失败');
      setIsLoading(false);
      setIsGeneratingComment(false);
    }
  };

  const generateCommentWithContent = async (content: ExtractedContent, langcode: string) => {
    if (!content) {
      setError('页面内容为空');
      return;
    }

    if (!activeProduct) {
      setError('请先选择一个项目');
      return;
    }

    if (!llmSettings?.provider) {
      setError('请先在设置页配置 LLM 提供商');
      return;
    }

    if (
      (llmSettings.provider === 'openai' && !llmSettings.openai?.apiKey) ||
      (llmSettings.provider === 'gemini' && !llmSettings.gemini?.apiKey)
    ) {
      setError('请先在设置页配置 API Key');
      return;
    }

    setIsGeneratingComment(true);
    setError(null);

    try {
      const llmService = createLLMService(llmSettings);
      if (!llmService) {
        throw new Error('无法创建 LLM 服务');
      }

      const contentToSend = `# ${content.title}\n\n${content.content}`;
      const keywordsList = activeKeywords.filter((item) => item.enabled).map((item) => item.keyword);
      const comments: string[] = [];

      if (langcode && langcode !== 'en' && langcode !== '') {
        const args = {
          content: contentToSend,
          keywords: keywordsList,
          langcode,
        };
        const [englishComment, localComment] = await Promise.all([
          llmService.generateComment(contentToSend, llmSettings.promptTemplate, { ...args, langcode: 'en' }),
          llmService.generateComment(contentToSend, llmSettings.promptTemplate, args),
        ]);
        comments.push(englishComment, localComment);
      } else {
        const comment = await llmService.generateComment(contentToSend, llmSettings.promptTemplate, {
          content: contentToSend,
          keywords: keywordsList,
          langcode: 'en',
        });
        comments.push(comment);
      }

      setGeneratedComments(comments);
    } catch (err) {
      console.error('Error generating comment:', err);
      setError(err instanceof Error ? err.message : '生成评论时发生错误');
    } finally {
      setIsGeneratingComment(false);
      setIsLoading(false);
    }
  };

  const handleAddSite = async (name: string) => {
    const now = new Date().toISOString();
    const nextProducts: Product[] = [
      ...products,
      {
        id: createProductId(name),
        name,
        keywords: [],
        createdAt: now,
        updatedAt: now,
      },
    ];
    await persistProducts(nextProducts);
    const nextActiveProductId = nextProducts[nextProducts.length - 1]?.id ?? null;
    resetProductScopedState(nextActiveProductId);
    setActiveProductId(nextActiveProductId);
    await browser.runtime.sendMessage({ action: 'productTaskSetActiveProduct', productId: nextActiveProductId });
  };

  const handleUpdateSite = async (siteId: string, name: string) => {
    const nextProducts = products.map((product) => (
      product.id === siteId
        ? { ...product, name, updatedAt: new Date().toISOString() }
        : product
    ));
    await persistProducts(nextProducts);
  };

  const handleDeleteSite = async (siteId: string) => {
    const nextProducts = products.filter((product) => product.id !== siteId);
    await persistProducts(nextProducts);
    if (activeProductId === siteId) {
      const nextActiveProductId = nextProducts[0]?.id ?? null;
      resetProductScopedState(nextActiveProductId);
      setActiveProductId(nextActiveProductId);
      await browser.runtime.sendMessage({ action: 'productTaskSetActiveProduct', productId: nextActiveProductId });
    }
  };

  const handleAddKeyword = async (siteId: string, keyword: Omit<Product['keywords'][number], 'enabled'>) => {
    const nextProducts = products.map((product) => {
      if (product.id !== siteId) {
        return product;
      }

      return {
        ...product,
        updatedAt: new Date().toISOString(),
        keywords: [...product.keywords, { ...keyword, enabled: true }],
      };
    });
    await persistProducts(nextProducts);
  };

  const handleUpdateKeyword = async (siteId: string, keywordIndex: number, keyword: Omit<Product['keywords'][number], 'enabled'>) => {
    const nextProducts = products.map((product) => {
      if (product.id !== siteId || keywordIndex < 0 || keywordIndex >= product.keywords.length) {
        return product;
      }

      const nextKeywords = [...product.keywords];
      nextKeywords[keywordIndex] = {
        ...nextKeywords[keywordIndex],
        keyword: keyword.keyword,
        url: keyword.url,
      };

      return {
        ...product,
        updatedAt: new Date().toISOString(),
        keywords: nextKeywords,
      };
    });

    await persistProducts(nextProducts);
  };

  const handleDeleteKeyword = async (siteId: string, keywordIndex: number) => {
    const nextProducts = products.map((product) => {
      if (product.id !== siteId) {
        return product;
      }

      return {
        ...product,
        updatedAt: new Date().toISOString(),
        keywords: product.keywords.filter((_, index) => index !== keywordIndex),
      };
    });

    await persistProducts(nextProducts);
  };

  const handleToggleKeyword = async (siteId: string, keywordIndex: number) => {
    const nextProducts = products.map((product) => {
      if (product.id !== siteId || keywordIndex < 0 || keywordIndex >= product.keywords.length) {
        return product;
      }

      const nextKeywords = [...product.keywords];
      nextKeywords[keywordIndex] = {
        ...nextKeywords[keywordIndex],
        enabled: !nextKeywords[keywordIndex].enabled,
      };

      return {
        ...product,
        updatedAt: new Date().toISOString(),
        keywords: nextKeywords,
      };
    });

    await persistProducts(nextProducts);
  };

  const handleCopy = (comment: string, format: 'txt' | 'html' | 'markdown' | 'bbcode') => {
    if (format === 'txt') {
      navigator.clipboard.writeText(comment).catch((err) => {
        setError('复制到剪贴板失败: ' + err.message);
      });
      return;
    }

    let result = comment;
    const sortedKeywords = [...activeKeywords]
      .filter((item) => item.enabled)
      .sort((a, b) => b.keyword.length - a.keyword.length);

    for (const { keyword, url } of sortedKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      if (format === 'html') {
        result = result.replace(regex, `<a href="${url}">${keyword}</a>`);
      } else if (format === 'markdown') {
        result = result.replace(regex, `[${keyword}](${url})`);
      } else if (format === 'bbcode') {
        result = result.replace(regex, `[url=${url}]${keyword}[/url]`);
      }
    }

    navigator.clipboard.writeText(result).catch((err) => {
      setError('复制到剪贴板失败: ' + err.message);
    });
  };

  const clearCommentWorkspaceState = () => {
    setGeneratedComments(undefined);
    setFormFields([]);
    setError(null);
    setTaskError(null);
  };

  const resetProductScopedState = (nextProductId: string | null) => {
    clearCommentWorkspaceState();
    setSelectedCommentTaskKey(null);
    setActiveTaskRecord((prev) => {
      if (!prev || prev.productId === nextProductId) {
        return prev;
      }

      return null;
    });
    setActiveProductContext((prev) => {
      if (!prev || prev.productId === nextProductId) {
        return prev;
      }

      return null;
    });
  };

  const handleSelectProduct = async (productId: string) => {
    if (productId === activeProductId) {
      return;
    }

    resetProductScopedState(productId);
    setActiveProductId(productId);
    await browser.runtime.sendMessage({ action: 'productTaskSetActiveProduct', productId });
  };

  const navigateToTaskInCurrentTab = async (task: ProductTaskRecord) => {
    const url = task.canonicalUrl || task.sourceUrl;
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];

    if (!currentTab?.id) {
      throw new Error('未找到当前标签页');
    }

    clearCommentWorkspaceState();
    await browser.tabs.update(currentTab.id, { url });

    const activeContext: ActiveProductContext = {
      productId: task.productId,
      pageKey: task.pageKey,
      siteKey: task.siteKey,
      tabId: currentTab.id,
      boundAt: new Date().toISOString(),
    };

    await browser.storage.local.set({
      activeProductContext: activeContext,
      activeProductId: task.productId,
    });

    setCurrentTabPageKey(task.pageKey);
    setSelectedCommentTaskKey(task.pageKey);
    setActiveProductId(task.productId);
    setActiveProductContext(activeContext);
    setActiveTaskRecord(task);
  };

  const handleCommentTaskSelection = (task: ProductTaskRecord | null) => {
    if (!task) {
      return;
    }

    setSelectedCommentTaskKey(task.pageKey);
    setActiveTaskRecord(task);
  };

  const handleCommentTaskOpen = async (task: ProductTaskRecord | null) => {
    if (!task) {
      return;
    }

    try {
      await navigateToTaskInCurrentTab(task);
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换任务失败');
    }
  };

  const updateTaskRecord = (record: ProductPageStatusRecord) => {
    setProductStatuses((prev) => ({
      ...prev,
      [record.productId]: [
        ...(prev[record.productId] ?? []).filter((item) => item.pageKey !== record.pageKey),
        record,
      ],
    }));

    setActiveTaskRecord((prev) => {
      if (!prev || prev.productId !== record.productId || prev.pageKey !== record.pageKey) {
        return prev;
      }

      return {
        ...prev,
        status: record.status,
        taskVersion: record.version,
        taskUpdatedAt: record.updatedAt,
        comment: record.comment,
        syncState: record.syncState,
      };
    });
  };

  const handleTaskStatusChange = async (task: ProductTaskRecord, status: PageStatus) => {
    setTaskError(null);
    const response = await browser.runtime.sendMessage({
      action: 'productTaskUpdate',
      productId: task.productId,
      pageKey: task.pageKey,
      status,
      comment: task.comment,
    });

    if (!response.success) {
      throw new Error(response.error || '更新任务状态失败');
    }

    updateTaskRecord(response.record as ProductPageStatusRecord);
  };

  const handleScanFields = async () => {
    setIsScanning(true);
    setFormFields([]);
    try {
      const response = await browser.runtime.sendMessage({ action: 'scanFormFields' });
      if (response?.success) {
        setFormFields(response.fields || []);
      } else {
        setError(response?.error || '扫描表单字段失败');
      }
    } catch (err) {
      console.error('Error scanning form fields:', err);
      setError('扫描表单字段失败');
    } finally {
      setIsScanning(false);
    }
  };

  const handleFillField = async (field: FormField) => {
    const text = generatedComments?.[0];
    if (!text) {
      setError('请先生成评论');
      return;
    }
    try {
      const response = await browser.runtime.sendMessage({
        action: 'focusAndFillField',
        selector: field.selector,
        frameId: field.frameId,
        text,
      });
      if (!response?.success) {
        setError('填入失败，可能目标元素已不存在');
      }
    } catch (err) {
      console.error('Error filling field:', err);
      setError('填入表单字段失败');
    }
  };

  const handleLocateField = async (field: FormField) => {
    try {
      await browser.runtime.sendMessage({
        action: 'focusField',
        selector: field.selector,
        frameId: field.frameId,
      });
    } catch (err) {
      console.error('Error locating field:', err);
    }
  };

  const handleFillAll = async () => {
    const text = generatedComments?.[0];
    if (!text) {
      setError('请先生成评论');
      return;
    }
    let filled = 0;
    for (const field of formFields) {
      try {
        const response = await browser.runtime.sendMessage({
          action: 'focusAndFillField',
          selector: field.selector,
          frameId: field.frameId,
          text,
        });
        if (response?.success) filled++;
      } catch { /* skip failed fields */ }
    }
    if (filled === 0) {
      setError('所有字段填入失败');
    }
  };

  return (
    <div className="w-full h-full bg-base-100 p-4">
      <div className="mb-4">
        <select
          className="select select-bordered w-full text-base font-semibold"
          value={activeProductId ?? ''}
          onChange={(event) => {
            const nextProductId = event.target.value;
            if (nextProductId) {
              void handleSelectProduct(nextProductId);
            }
          }}
          disabled={products.length === 0}
        >
          {products.length === 0 ? (
            <option value="">暂无项目</option>
          ) : (
            products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="tabs tabs-boxed mb-4">
        <button type="button" className={`tab ${activeTab === 'comment' ? 'tab-active' : ''}`} onClick={() => setActiveTab('comment')}>
          评论
        </button>
        <button type="button" className={`tab ${activeTab === 'tasks' ? 'tab-active' : ''}`} onClick={() => setActiveTab('tasks')}>
          任务
        </button>
        <button type="button" className={`tab ${activeTab === 'products' ? 'tab-active' : ''}`} onClick={() => setActiveTab('products')}>
          项目
        </button>
        <button type="button" className={`tab ${activeTab === 'settings' ? 'tab-active' : ''}`} onClick={() => setActiveTab('settings')}>
          设置
        </button>
      </div>

      {error && (
        <div className="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}

      <div className={activeTab === 'comment' ? 'block' : 'hidden'}>
        {currentCommentTask && activeProduct && (
          <div className="card bg-base-200 mb-4" data-testid="active-product-task">
            <div className="card-body p-3 gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{currentCommentTask.siteKey}</p>
                    <span className={`badge badge-sm ${currentCommentTask.status === 'done' ? 'badge-success' : currentCommentTask.status === 'invalid' ? 'badge-error' : 'badge-warning'}`}>
                      {currentCommentTask.status === 'done' ? '已完成' : currentCommentTask.status === 'invalid' ? '无效' : '未完成'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="mt-1 block truncate text-left text-xs text-base-content/70"
                    title={currentCommentTask.canonicalUrl || currentCommentTask.sourceUrl}
                  >
                    {currentCommentTask.canonicalUrl || currentCommentTask.sourceUrl}
                  </button>
                </div>

              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {currentCommentTask.status !== 'done' && (
                    <button
                      type="button"
                      className="btn btn-xs btn-success"
                      onClick={() => {
                        void handleTaskStatusChange(currentCommentTask, 'done').catch((err) => {
                          setError(err instanceof Error ? err.message : '更新任务状态失败');
                        });
                      }}
                    >
                      标记完成
                    </button>
                  )}
                  {currentCommentTask.status !== 'invalid' && (
                    <button
                      type="button"
                      className="btn btn-xs btn-error"
                      onClick={() => {
                        void handleTaskStatusChange(currentCommentTask, 'invalid').catch((err) => {
                          setError(err instanceof Error ? err.message : '更新任务状态失败');
                        });
                      }}
                    >
                      标记无效
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost"
                    onClick={() => {
                      handleCommentTaskSelection(activeProjectTasks[currentCommentTaskIndex - 1] ?? null);
                    }}
                    disabled={currentCommentTaskIndex <= 0}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-primary"
                    onClick={() => {
                      void handleCommentTaskOpen(currentCommentTask);
                    }}
                  >
                    打开
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost"
                    onClick={() => {
                      handleCommentTaskSelection(activeProjectTasks[currentCommentTaskIndex + 1] ?? null);
                    }}
                    disabled={currentCommentTaskIndex < 0 || currentCommentTaskIndex >= activeProjectTasks.length - 1}
                  >
                    →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <SiteKeywordSelector
          sites={activeProduct ? [activeProduct] : []}
          onToggle={handleToggleKeyword}
        />

        <button
          type="button"
          className="btn btn-warning w-full mb-4"
          onClick={generateComment}
          disabled={isGeneratingComment || isLoading || !hasValidProviderConfig(llmSettings) || !activeProduct}
        >
          {isGeneratingComment || isLoading ? (
            <>
              <span className="loading loading-spinner"></span>正在生成
            </>
          ) : '生成评论'}
        </button>

        {!activeProduct && (
          <div className="text-sm text-warning mt-2 mb-4">请先到项目页创建并选择一个项目</div>
        )}

        {!llmSettings?.provider && (
          <div className="text-sm text-warning mt-2 mb-4">
            请先前往
            <button type="button" onClick={() => setActiveTab('settings')} className="text-info underline">
              设置
            </button>
            标签页配置 LLM 提供商与 API Key
          </div>
        )}

        <CommentOutput comments={generatedComments || []} keywords={activeKeywords} onCopy={handleCopy} />

        <FormFieldList
          fields={formFields}
          isScanning={isScanning}
          hasComment={Boolean(generatedComments && generatedComments.length > 0)}
          onScan={handleScanFields}
          onLocate={handleLocateField}
          onFill={handleFillField}
          onFillAll={handleFillAll}
        />
      </div>

      <div className={activeTab === 'tasks' ? 'block' : 'hidden'}>
        <ProductTaskPanel
          products={products}
          tasksByProduct={tasksByProduct}
          activeProductId={activeProductId}
          loading={taskLoading}
          error={taskError}
          unconfigured={taskUnconfigured}
          onRefresh={async () => {
            await loadProductLibrary(true);
          }}
          onOpenTask={async (task) => {
            try {
              setTaskError(null);
              clearCommentWorkspaceState();
              const response = await browser.runtime.sendMessage({
                action: 'productTaskOpenPage',
                url: task.canonicalUrl || task.sourceUrl,
                productId: task.productId,
                pageKey: task.pageKey,
                siteKey: task.siteKey,
              });

               if (!response.success) {
                 throw new Error(response.error || '打开页面失败');
               }

               setSelectedCommentTaskKey(task.pageKey);
               setActiveProductId(task.productId);
               setActiveProductContext(response.activeContext as ActiveProductContext);
               setActiveTaskRecord(task);
              setActiveTab('comment');
            } catch (err) {
              setTaskError(err instanceof Error ? err.message : '打开页面失败');
            }
          }}
          onStatusChange={async (task, status) => {
            try {
              await handleTaskStatusChange(task, status);
            } catch (err) {
              setTaskError(err instanceof Error ? err.message : '更新任务状态失败');
            }
          }}
        />
      </div>

      <div className={activeTab === 'products' ? 'block' : 'hidden'}>
        <SiteManager
          sites={products}
          onAddSite={handleAddSite}
          onUpdateSite={handleUpdateSite}
          onDeleteSite={handleDeleteSite}
          onAddKeyword={handleAddKeyword}
          onUpdateKeyword={handleUpdateKeyword}
          onDeleteKeyword={handleDeleteKeyword}
          onToggleKeyword={handleToggleKeyword}
        />
      </div>

      <div className={activeTab === 'settings' ? 'block' : 'hidden'}>
        <SettingsPanel
          llmSettings={llmSettings}
          onSaved={setLlmSettings}
          datasourceConfig={datasourceConfig}
          onDatasourceSaved={(config) => {
            setDatasourceConfig(config);
            void loadProductLibrary(false);
          }}
        />
      </div>
    </div>
  );
}

export default App;
