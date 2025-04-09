// 不再需要为 wxt/utils 模块提供类型声明，因为我们直接从 wxt/utils 导入

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
  };
};
