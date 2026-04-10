# UI Style System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted, Settings-controlled UI style selector with a preserved Classic style, three new styles, and optional glass/transparency controls for TermNest without changing product behavior.

**Architecture:** Extend the existing theme/config pipeline with a second appearance axis called `uiStyle`, then drive the app shell and terminal appearance from shared style tokens and a DOM dataset attribute.

**Tech Stack:** React, Zustand, Tauri, Rust serde config, CSS custom properties, xterm.js

---

### Task 1: Add config support for UI style

**Files:**
- Modify: `src/types.ts`
- Modify: `src-tauri/src/config.rs`

- [ ] **Step 1: Add the frontend type**

Add a `UiStyle` union plus `uiStyle`, `windowGlass`, and `glassStrength` to `AppConfig`.

- [ ] **Step 2: Add the Rust config field**

Add `ui_style`, `window_glass`, and `glass_strength` to Rust `AppConfig`, with fresh-install and legacy-migration defaults.

- [ ] **Step 3: Update migration/default behavior**

Make sure old configs deserialize cleanly, old installs default to `classic`, and fresh installs default to `pro`.

- [ ] **Step 4: Extend Rust tests**

Cover round-trip serialization and legacy config fallback for `uiStyle`.

- [ ] **Step 5: Run Rust config tests**

Run: `cargo test --manifest-path /Users/yskj/termnest/src-tauri/Cargo.toml config -- --nocapture`

Expected: PASS

### Task 2: Add DOM/style application helpers

**Files:**
- Modify: `src/utils/themeManager.ts`
- Modify: `index.html`
- Modify: `src/App.tsx`

- [ ] **Step 1: Introduce style application helper**

Add an `applyUiStyle()` helper that writes `data-ui-style` to the root element and persists the selection to local storage for startup hydration.

- [ ] **Step 2: Hydrate style on first paint**

Teach `index.html` to read the stored style before the React app mounts so the app avoids flashing the wrong shell style.

- [ ] **Step 3: Apply config style during app bootstrap**

When config loads, apply both theme and UI style.

- [ ] **Step 4: React to runtime style changes**

When `config.uiStyle` changes, update the DOM immediately.

### Task 3: Add Settings control for style selection

**Files:**
- Modify: `src/components/SettingsModal.tsx`

- [ ] **Step 1: Add UI style option definitions**

Create a small option list for `classic`, `pro`, `workbench`, and `product`.

- [ ] **Step 2: Add the selection UI**

Insert a new `UI 风格` section under `System` settings using clear selection buttons/cards, then add `Window Glass` and `Glass Strength` controls below it.

- [ ] **Step 3: Save and apply instantly**

Update config state, persist via `save_config`, and call the DOM/terminal update helpers on click.

- [ ] **Step 4: Keep existing theme controls unchanged**

Ensure `theme` and `terminalFollowTheme` behavior still works as before.

### Task 4: Build the style token system

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Define base style-aware tokens**

Add tokens for surface depth, borders, radii, shadows, interactive weight, and glass/translucency.

- [ ] **Step 2: Implement three dark-mode styles**

Keep `Classic` as the base token set, then create `:root[data-ui-style="pro"]`, `workbench`, and `product` overrides for dark mode.

- [ ] **Step 3: Implement compatible light-mode variants**

Layer light-mode token overrides so style switching still feels correct under light theme.

- [ ] **Step 4: Apply tokens to existing global chrome**

Update global shell styling, context menus, prompts, overlays, and shared surfaces to use the new tokens rather than hardcoded “warm carbon” assumptions.

### Task 5: Make terminal appearance style-aware

**Files:**
- Modify: `src/utils/terminalCache.ts`

- [ ] **Step 1: Replace fixed dark/light palettes with a style-aware helper**

Return terminal theme colors based on both resolved theme and current `uiStyle`.

- [ ] **Step 2: Update runtime theme refresh**

Ensure `updateAllTerminalThemes()` picks up classic/new style changes as well as theme-mode changes.

- [ ] **Step 3: Keep behavior unchanged**

Do not change PTY lifecycle, attach order, or terminal functionality.

### Task 6: Verify and document

**Files:**
- Modify if needed: `README.md`

- [ ] **Step 1: Run frontend checks**

Run: `npm run build`

Expected: PASS

- [ ] **Step 2: Run relevant Rust tests**

Run: `cargo test --manifest-path /Users/yskj/termnest/src-tauri/Cargo.toml config -- --nocapture`

Expected: PASS

- [ ] **Step 3: Manually verify style switching**

Check style switching in Settings across at least:
- dark + classic
- dark + pro
- dark + workbench
- dark + product
- light + product
- glass enabled on macOS

- [ ] **Step 4: Update docs only if current README needs the new setting surfaced**

Keep the README concise; only mention the style selector if it materially changes the feature list.
