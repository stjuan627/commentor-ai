import { defineConfig } from 'wxt';

const env = (import.meta as ImportMeta & {
  env: {
    WXT_MANIFEST_KEY?: string;
    WXT_GOOGLE_CLIENT_ID?: string;
  };
}).env;

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: "Commentor AI",
    description: "Extracts webpage content and generates comments with AI.",
    key: browser === 'chrome' ? env.WXT_MANIFEST_KEY : undefined,
    oauth2: browser === 'chrome' ? {
      client_id: env.WXT_GOOGLE_CLIENT_ID,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    } : undefined,
    permissions: [
      "storage",
      "activeTab",
      "scripting",
      "sidePanel",
      ...(browser === 'chrome' ? ['identity'] : []),
    ],
    host_permissions: browser === 'chrome' ? [
      "https://www.googleapis.com/*",
      "https://sheets.googleapis.com/*",
    ] : [],
    "options_ui": {
      "page": "options.html",
      "open_in_tab": true
    },
    action: {
      default_title: "Open Side Panel"
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; script-src-elem *;"
    },
  }),
  
});
