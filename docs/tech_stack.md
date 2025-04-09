# Technology Stack

This document outlines the core technologies chosen for the Commentor.ai browser extension project.

-   **Framework:** [wxt](https://wxt.dev/)
    -   A next-generation framework for building browser extensions, offering excellent developer experience, TypeScript support, and optimized builds.
-   **Language:** [TypeScript](https://www.typescriptlang.org/)
    -   Provides static typing, improving code quality, maintainability, and developer productivity through better tooling (intellisense, refactoring). Chosen over JavaScript for enhanced robustness.
-   **CSS Framework:** [Tailwind CSS](https://tailwindcss.com/)
    -   A utility-first CSS framework for rapidly building custom user interfaces. `wxt` provides built-in support.
-   **UI Component Library:** [DaisyUI](https://daisyui.com/)
    -   A plugin for Tailwind CSS that provides pre-styled components (buttons, cards, modals, etc.), accelerating UI development while leveraging Tailwind's utility classes.
-   **Content Extraction Library:** [Readability.js](https://github.com/mozilla/readability)
    -   Mozilla's library for extracting the primary readable content from web pages. Used within the content script to isolate article text.
-   **Package Manager:** [pnpm](https://pnpm.io/) (Recommended by `wxt`, but npm or yarn can also be used)
