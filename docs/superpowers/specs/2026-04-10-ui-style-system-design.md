# TermNest UI Style System Design

**Date:** 2026-04-10  
**Status:** Approved for implementation

## Goal

Add a user-selectable UI style system to `TermNest` so the product no longer feels locked into the current light, thin, overly soft visual direction. The change must preserve existing features and layout, while allowing the user to switch between a preserved original style plus three distinct new chrome styles from Settings, and optionally enable glass/transparency.

## User Problem

The current interface works, but its visual weight is inconsistent with the product’s purpose. It feels too light and slightly generic for a terminal-first AI workbench. The user wants multiple UI directions available from Settings without forking the app into separate skins or breaking current workflows.

## In Scope

- Add persisted `uiStyle`, `windowGlass`, and `glassStrength` config fields.
- Add a Settings control to switch among four built-in UI styles:
  - `classic`
  - `pro`
  - `workbench`
  - `product`
- Add a Settings control for:
  - `Window Glass`
  - `Glass Strength`
- Keep existing `theme` (`dark` / `light` / `auto`) behavior.
- Apply style changes through shared design tokens instead of duplicating component markup.
- Allow style selection to affect:
  - app chrome
  - background layers
  - borders and shadows
  - radii
  - tab and button weight
  - terminal palette accents/background so the terminal still feels integrated

## Out of Scope

- Major layout rewrites
- Per-style component branching across the entire app
- New themes beyond the approved `classic / pro / workbench / product` styles
- Reworking product behavior or terminal workflows

## Design Approach

Use a two-axis appearance model:

1. **Theme mode**
   Controls light/dark resolution and remains responsible for luminance.

2. **UI style**
   Controls visual character and component weight.

This keeps the current theme logic intact while introducing a second layer of design tokens for personality.

## UI Styles

### 0. Classic

Preserved original TermNest styling.

- Warm Carbon palette
- Current visual identity
- Safe choice for existing users

### 1. Pro Tool

Default style. Heavier, steadier, more restrained.

- Stronger panel separation
- Lower saturation accents
- Slightly tighter radii
- More desktop-tool feeling

### 2. Terminal Workbench

Darker, harder-edged, more operator-like.

- Stronger contrast
- More terminal-forward accenting
- Slightly denser surfaces
- More obvious active states

### 3. Modern Product

Cleaner and more polished without becoming airy.

- Slightly more layered surfaces
- More refined highlights
- Softer but still grounded panel treatment
- Better for outward-facing screenshots

## Architecture

### Config Layer

Persist `uiStyle` alongside the existing theme settings in:

- frontend `AppConfig`
- Rust `AppConfig`
- config migration/default logic

Default value: `pro`
Legacy migration default: `classic`

### DOM Application Layer

Apply style selection by setting:

- `document.documentElement.dataset.theme`
- `document.documentElement.dataset.uiStyle`
- `document.documentElement.dataset.windowGlass`

The style system should be driven by CSS custom properties rather than conditional class trees.

### CSS Token Layer

Keep current base tokens, then add style-dependent tokens such as:

- `--bg-*`
- `--accent-*`
- `--border-*`
- `--shadow-*`
- `--radius-*`
- `--panel-*`
- `--tab-*`
- `--interactive-*`

Each style overrides token values for both dark and light modes where needed.

### Terminal Layer

Terminal theme generation should stop being hardcoded as only `dark` vs `light`. Instead, compute terminal theme from:

- resolved theme
- current `uiStyle`

This allows the terminal to visually match the surrounding shell without changing terminal behavior.

### Window Glass Layer

Glass is a separate appearance axis from theme and style.

- On macOS: real transparent window + vibrancy + translucent panel tokens
- On other platforms: graceful CSS-only translucency fallback

## Settings UX

Add a `UI 风格` section in `System` settings.

Requirements:

- four obvious buttons/cards
- current selection is clearly marked
- instant preview on click
- persistence to config immediately after selection

No extra explanatory modal is needed. The labels should be enough:

- `Classic`
- `Pro Tool`
- `Terminal Workbench`
- `Modern Product`

Glass settings sit in the same `System` page as:

- one toggle
- one strength slider

## Files Expected To Change

- `src/types.ts`
- `src-tauri/src/config.rs`
- `src/utils/themeManager.ts`
- `src/utils/terminalCache.ts`
- `src/components/SettingsModal.tsx`
- `src/App.tsx`
- `src/styles.css`
- `index.html`
- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json`

## Risks

### 1. Token drift

If style logic leaks into individual components, maintenance cost will rise quickly. Mitigation: keep the first pass token-driven.

### 2. Terminal mismatch

If terminal colors remain fixed while outer UI changes, the result will feel broken. Mitigation: move terminal palette selection behind a style-aware helper.

### 3. Light theme regressions

The current app is mostly tuned for dark mode. Mitigation: keep style overrides narrow and verify both light and dark for each style.

## Testing Strategy

- config serialization/deserialization for `uiStyle`, `windowGlass`, and `glassStrength`
- build passes for frontend and Rust
- manual visual validation in:
- dark + classic
- dark + pro
- dark + workbench
- dark + product
- light + at least one non-default style
- glass enabled on macOS

## Success Criteria

- User can switch UI style from Settings.
- User can keep the original look via `Classic`.
- User can enable/disable window glass and adjust strength.
- Choice persists across restart.
- App feels visually heavier and more intentional.
- No feature behavior changes.
- Terminal remains visually coherent with the selected style.
