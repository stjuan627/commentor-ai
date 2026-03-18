import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: "Commentor AI",
    description: "Extracts webpage content and generates comments with AI.",
    permissions: [
      "storage", // Needed for saving settings
      "activeTab", // Needed by content script communication
      "scripting", // Potentially needed, good to have
      "sidePanel",
      "debugger", // Needed for CDP accessibility tree queries
      "webNavigation", // Needed for enumerating frames (iframe support)
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
