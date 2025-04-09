// 为 wxt/sandbox 模块提供类型声明
declare module 'wxt/sandbox' {
  export function defineBackground(callback: () => void): any;
  export function defineContentScript(options: {
    matches?: string[];
    main: () => void;
  }): any;
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
  };
};
