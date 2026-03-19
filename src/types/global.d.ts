// 不再需要为 wxt/utils 模块提供类型声明，因为我们直接从 wxt/utils 导入

interface ImportMetaEnv {
  readonly WXT_MANIFEST_KEY?: string;
  readonly WXT_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// 声明全局 browser 对象
declare const browser: {
  runtime: {
    id: string;
    onMessage: {
      addListener: (
        callback: (
          message: any,
          sender: any,
          sendResponse: (response?: any) => void
        ) => boolean | void
      ) => void;
    };
    sendMessage: (message: any) => Promise<any>;
  };
  tabs: {
    query: (queryInfo: {
      active?: boolean;
      currentWindow?: boolean;
    }) => Promise<Array<{
      id: number;
      url?: string;
      title?: string;
    }>>;
    sendMessage: (tabId: number, message: any) => Promise<any>;
    create: (createProperties: { url: string; active?: boolean }) => Promise<{ id?: number; url?: string }>;
  };
  storage: {
    local: {
      get: <T = any>(keys?: string | string[] | null) => Promise<T>;
      set: (items: Record<string, any>) => Promise<void>;
      remove: (keys: string | string[]) => Promise<void>;
      clear: () => Promise<void>;
    };
    sync?: {
      get: <T = any>(keys?: string | string[] | null) => Promise<T>;
      set: (items: Record<string, any>) => Promise<void>;
      remove: (keys: string | string[]) => Promise<void>;
      clear: () => Promise<void>;
    };
  };
};

declare const chrome: {
  identity?: {
    getAuthToken: (details: { interactive: boolean }) => Promise<string | { token?: string; grantedScopes?: string[] } | undefined>;
    removeCachedAuthToken: (details: { token: string }) => Promise<void>;
    clearAllCachedAuthTokens: () => Promise<void>;
  };
};
