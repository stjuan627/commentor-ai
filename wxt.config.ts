import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: [
      "storage", // Needed for saving settings
      "activeTab", // Needed by content script communication
      "scripting", // Potentially needed, good to have
      "sidePanel",
    ],
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
  },
  
});
