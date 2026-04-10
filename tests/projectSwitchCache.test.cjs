const assert = require('assert');

const {
  clearProjectPanelCache,
  getFileTreeCache,
  setFileTreeCache,
  getGitHistoryCache,
  setGitHistoryCache,
} = require('../.tmp-tests/utils/projectSwitchCache.js');

clearProjectPanelCache();

assert.strictEqual(getFileTreeCache('/tmp/a'), null, 'empty file tree cache should return null');
assert.strictEqual(getGitHistoryCache('/tmp/a'), null, 'empty git history cache should return null');

setFileTreeCache('/tmp/a', {
  rootEntries: [{ name: 'src', path: '/tmp/a/src', isDir: true }],
  gitStatuses: [{ path: 'src/index.ts', status: 'modified', statusLabel: 'M' }],
});

setGitHistoryCache('/tmp/a', {
  repos: [{ name: 'repo-a', path: '/tmp/a', branch: 'main' }],
  expandedRepoPaths: ['/tmp/a'],
});

const fileTreeCache = getFileTreeCache('/tmp/a');
const gitHistoryCache = getGitHistoryCache('/tmp/a');

assert.ok(fileTreeCache, 'file tree cache should exist after write');
assert.ok(gitHistoryCache, 'git history cache should exist after write');
assert.deepStrictEqual(fileTreeCache.rootEntries, [{ name: 'src', path: '/tmp/a/src', isDir: true }]);
assert.deepStrictEqual(fileTreeCache.gitStatuses, [{ path: 'src/index.ts', status: 'modified', statusLabel: 'M' }]);
assert.deepStrictEqual(gitHistoryCache.repos, [{ name: 'repo-a', path: '/tmp/a', branch: 'main' }]);
assert.deepStrictEqual(gitHistoryCache.expandedRepoPaths, ['/tmp/a']);

fileTreeCache.rootEntries.push({ name: 'mutated', path: '/tmp/a/mutated', isDir: false });
gitHistoryCache.expandedRepoPaths.push('/tmp/a/extra');

assert.deepStrictEqual(getFileTreeCache('/tmp/a').rootEntries, [{ name: 'src', path: '/tmp/a/src', isDir: true }], 'cache reads should be defensive copies');
assert.deepStrictEqual(getGitHistoryCache('/tmp/a').expandedRepoPaths, ['/tmp/a'], 'git cache reads should be defensive copies');

clearProjectPanelCache();
assert.strictEqual(getFileTreeCache('/tmp/a'), null, 'clear should remove file tree cache');
assert.strictEqual(getGitHistoryCache('/tmp/a'), null, 'clear should remove git cache');

console.log('projectSwitchCache tests passed');
