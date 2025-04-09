# Feature Request Document: Webpage Content Extraction

## 1. Requirement Description

Implement a module within the browser extension responsible for extracting the main textual content from the currently active webpage. This extracted content will serve as the primary input for the downstream Large Language Model (LLM) to generate comments.

The extraction should prioritize the core article/post content, filtering out boilerplate elements like headers, footers, navigation menus, advertisements, and sidebars.

## 2. Implementation Approach

-   **Method:** Utilize a Content Script injected into the active webpage.
-   **Core Logic:** Integrate and use the `Readability.js` library ([https://github.com/mozilla/readability](https://github.com/mozilla/readability)) within the content script.
-   **Process:**
    1.  The content script will execute on the target webpage.
    2.  It will clone the document's DOM to avoid interfering with the live page.
    3.  It will instantiate `Readability` with the cloned DOM.
    4.  It will call the `parse()` method of the `Readability` instance.
    5.  The result of `parse()` contains the extracted article title, content (as HTML and text), excerpt, etc. We will primarily use the `textContent` (plain text version of the main content).
-   **Output:** The module should provide the extracted plain text content to other parts of the extension (e.g., the background script) when requested.
-   **Error Handling:** Implement handling for cases where `Readability.js` fails to parse or extract meaningful content from a page.

## 3. TODO List

-   [x] **Integrate Readability.js:** Add `Readability.js` library to the project (e.g., as a bundled asset or via npm if using a bundler with `wxt`).
-   [x] **Develop Content Script:** Create a `content/extractor.js` (or similar) script.
-   [x] **Implement Extraction Logic:**
    -   [x] Write code in the content script to clone `document.body`.
    -   [x] Instantiate `Readability` with the cloned body and `window.location.href`.
    -   [x] Call `readability.parse()`.
    -   [x] Handle potential errors during parsing.
-   [x] **Communication:** Set up messaging (using `browser.runtime.sendMessage` or `wxt/messaging`) for other parts of the extension (like the popup or background script) to request the extracted content from the content script.
-   [ ] **Refine Extraction (Optional):** Test on various websites and potentially add pre- or post-processing steps if `Readability.js` alone isn't sufficient for certain edge cases (though usually it's quite good).
-   [ ] **Testing:** Test content extraction on diverse websites (news articles, blogs, forums, static pages, simple dynamic pages).
