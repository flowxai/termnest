const assert = require('node:assert/strict');

const dataset = {};
const storage = new Map();
let mediaQueryListener;
const styleValues = new Map();

global.document = {
  documentElement: {
    dataset,
    style: {
      setProperty(key, value) {
        styleValues.set(key, value);
      },
    },
  },
};

global.localStorage = {
  getItem(key) {
    return storage.get(key) ?? null;
  },
  setItem(key, value) {
    storage.set(key, value);
  },
  removeItem(key) {
    storage.delete(key);
  },
};

global.window = {
  matchMedia() {
    return {
      matches: false,
      addListener(listener) {
        mediaQueryListener = listener;
      },
      removeListener(listener) {
        if (mediaQueryListener === listener) {
          mediaQueryListener = undefined;
        }
      },
    };
  },
  dispatchEvent() {
    return true;
  },
};

const { applyTheme, getResolvedTheme, applyUiStyle, getResolvedUiStyle, applyWindowGlass } = require('../.tmp-tests/utils/themeManager.js');

assert.doesNotThrow(() => applyTheme('auto'));
assert.equal(getResolvedTheme(), 'dark');
assert.equal(dataset.theme, 'dark');
assert.equal(storage.get('termnest-theme'), 'dark');
assert.equal(typeof mediaQueryListener, 'function');

assert.doesNotThrow(() => applyUiStyle('workbench'));
assert.equal(getResolvedUiStyle(), 'workbench');
assert.equal(dataset.uiStyle, 'workbench');
assert.equal(storage.get('termnest-ui-style'), 'workbench');

assert.doesNotThrow(() => applyWindowGlass(true, 48));
assert.equal(dataset.windowGlass, 'on');
assert.equal(storage.get('termnest-window-glass'), '1');
assert.equal(storage.get('termnest-glass-strength'), '48');
assert.equal(styleValues.get('--glass-strength'), '48');
