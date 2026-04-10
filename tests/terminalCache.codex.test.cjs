const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'utils', 'terminalCache.ts'),
  'utf8',
);

assert.ok(
  !source.includes("registerCsiHandler({ prefix: '?', final: 'h' }, (params) => {\n    return params.length > 0 && params[0] === 2026;"),
  'terminalCache should not intercept DECSET 2026 enable sequence',
);

assert.ok(
  !source.includes("registerCsiHandler({ prefix: '?', final: 'l' }, (params) => {\n    return params.length > 0 && params[0] === 2026;"),
  'terminalCache should not intercept DECSET 2026 disable sequence',
);

console.log('terminalCache.codex: ok');
