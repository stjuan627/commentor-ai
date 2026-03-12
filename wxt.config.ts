import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: "Commentor AI",
    description: "Extracts webpage content and generates comments with AI.",
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
