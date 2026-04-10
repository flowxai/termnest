const assert = require('node:assert/strict');

function createElement(tagName) {
  return {
    tagName,
    children: [],
    className: '',
    textContent: '',
    placeholder: '',
    spellcheck: true,
    value: '',
    onclick: null,
    onkeydown: null,
    focus() {},
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
    },
    remove() {
      if (this.parentNode && this.parentNode.children) {
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      }
      this.removed = true;
    },
  };
}

const listeners = new Map();
const body = createElement('body');

global.document = {
  body,
  createElement,
  addEventListener(type, handler) {
    listeners.set(type, handler);
  },
  removeEventListener(type, handler) {
    if (listeners.get(type) === handler) {
      listeners.delete(type);
    }
  },
};

const { showConfirm } = require('../.tmp-tests/utils/prompt.js');

(async () => {
  const promise = showConfirm('关闭', '确认关闭吗');
  assert.equal(listeners.has('keydown'), true);
  assert.equal(body.children.length, 1);

  const overlay = body.children[0];
  const dialog = overlay.children[0];
  const buttons = dialog.children[2];
  const cancelBtn = buttons.children[0];

  cancelBtn.onclick();
  const result = await promise;

  assert.equal(result, false);
  assert.equal(listeners.has('keydown'), false);
  assert.equal(body.children.length, 0);
})();
