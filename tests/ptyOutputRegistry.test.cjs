const assert = require('node:assert/strict');

const {
  subscribePtyOutput,
  dispatchPtyOutput,
  hasPtyOutputSubscribers,
} = require('../.tmp-tests/utils/ptyOutputRegistry.js');

const receivedA = [];
const receivedB = [];

const unsubscribeA = subscribePtyOutput(1, (data) => receivedA.push(data));
const unsubscribeB = subscribePtyOutput(2, (data) => receivedB.push(data));

assert.equal(hasPtyOutputSubscribers(), true);

dispatchPtyOutput({ ptyId: 1, data: 'hello' });
dispatchPtyOutput({ ptyId: 2, data: 'world' });
dispatchPtyOutput({ ptyId: 3, data: 'ignored' });

assert.deepEqual(receivedA, ['hello']);
assert.deepEqual(receivedB, ['world']);

unsubscribeA();
dispatchPtyOutput({ ptyId: 1, data: 'after-unsub' });
assert.deepEqual(receivedA, ['hello']);

unsubscribeB();
assert.equal(hasPtyOutputSubscribers(), false);

console.log('ptyOutputRegistry tests passed');
