const assert = require('node:assert/strict');

const { getEffectiveProxyState } = require('../.tmp-tests/utils/proxyStatus.js');

const baseConfig = {
  projects: [],
  proxy: {
    enabled: false,
    allProxy: '',
    httpProxy: '',
    httpsProxy: '',
  },
};

{
  const state = getEffectiveProxyState(baseConfig, null);
  assert.equal(state.enabled, false);
  assert.equal(state.empty, false);
}

{
  const state = getEffectiveProxyState({
    ...baseConfig,
    proxy: {
      enabled: true,
      allProxy: '',
      httpProxy: '',
      httpsProxy: '',
    },
  }, null);
  assert.equal(state.enabled, true);
  assert.equal(state.empty, true);
}

{
  const state = getEffectiveProxyState({
    ...baseConfig,
    proxy: {
      enabled: true,
      allProxy: 'socks5://127.0.0.1:7897',
      httpProxy: '',
      httpsProxy: '',
    },
  }, null);
  assert.equal(state.enabled, true);
  assert.equal(state.empty, false);
}

{
  const state = getEffectiveProxyState({
    ...baseConfig,
    projects: [
      {
        id: 'p1',
        name: 'proj',
        path: '/tmp/proj',
        proxyMode: 'enabled',
      },
    ],
  }, 'p1');
  assert.equal(state.enabled, true);
  assert.equal(state.empty, true);
}

{
  const state = getEffectiveProxyState({
    ...baseConfig,
    projects: [
      {
        id: 'p1',
        name: 'proj',
        path: '/tmp/proj',
        proxyMode: 'enabled',
        proxyOverride: {
          allProxy: 'socks5://127.0.0.1:7898',
          httpProxy: '',
          httpsProxy: '',
        },
      },
    ],
  }, 'p1');
  assert.equal(state.enabled, true);
  assert.equal(state.empty, false);
}

{
  const state = getEffectiveProxyState({
    ...baseConfig,
    proxy: {
      enabled: true,
      allProxy: 'socks5://127.0.0.1:7897',
      httpProxy: '',
      httpsProxy: '',
    },
    projects: [
      {
        id: 'p1',
        name: 'proj',
        path: '/tmp/proj',
        proxyMode: 'disabled',
      },
    ],
  }, 'p1');
  assert.equal(state.enabled, false);
  assert.equal(state.empty, false);
}

console.log('proxyStatus tests passed');
