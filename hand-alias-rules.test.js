import assert from 'node:assert/strict';

function parseObjectUtterance(text) {
  if (text.startsWith('左手')) {
    return { side: 'left', alias: text.slice(2).trim() };
  }
  if (text.startsWith('右手')) {
    return { side: 'right', alias: text.slice(2).trim() };
  }
  return { side: null, alias: text.trim() };
}

function areHandAliasesReady(aliases) {
  return Boolean(aliases.left && aliases.right);
}

function runTests() {
  assert.deepEqual(parseObjectUtterance('左手沒有'), {
    side: 'left',
    alias: '沒有',
  });
  assert.deepEqual(parseObjectUtterance('右手完成'), {
    side: 'right',
    alias: '完成',
  });
  assert.deepEqual(parseObjectUtterance('跳過'), {
    side: null,
    alias: '跳過',
  });

  assert.equal(areHandAliasesReady({ left: '沒有', right: '完成' }), true);
  assert.equal(areHandAliasesReady({ left: '沒有', right: '' }), false);
  assert.equal(areHandAliasesReady({ left: '', right: '完成' }), false);
}

runTests();
