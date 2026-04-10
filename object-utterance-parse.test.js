import assert from 'node:assert/strict';

function parseObjectUtterance(text) {
  const normalized = text.replace(/\s+/g, '').trim();
  const leftIdx = normalized.indexOf('左手');
  const rightIdx = normalized.indexOf('右手');

  if (leftIdx === -1 && rightIdx === -1) {
    return { side: null, alias: normalized };
  }

  const isLeftFirst =
    leftIdx !== -1 && (rightIdx === -1 || leftIdx <= rightIdx);
  const side = isLeftFirst ? 'left' : 'right';
  const marker = isLeftFirst ? '左手' : '右手';
  const otherMarker = isLeftFirst ? '右手' : '左手';
  const markerIdx = isLeftFirst ? leftIdx : rightIdx;

  let aliasRaw = normalized.slice(markerIdx + marker.length);
  const otherIdx = aliasRaw.indexOf(otherMarker);
  if (otherIdx >= 0) aliasRaw = aliasRaw.slice(0, otherIdx);

  const alias = aliasRaw
    .replace(/^[是叫為]/, '')
    .replace(/[，。,.!！?？；;:：]/g, '')
    .trim();

  return { side, alias };
}

function runTests() {
  assert.deepEqual(parseObjectUtterance('左手沒有'), {
    side: 'left',
    alias: '沒有',
  });

  assert.deepEqual(parseObjectUtterance('右 手 完成'), {
    side: 'right',
    alias: '完成',
  });

  assert.deepEqual(parseObjectUtterance('我的左手是番茄'), {
    side: 'left',
    alias: '番茄',
  });

  assert.deepEqual(parseObjectUtterance('右手叫手機。'), {
    side: 'right',
    alias: '手機',
  });

  assert.deepEqual(parseObjectUtterance('左手番茄右手手機'), {
    side: 'left',
    alias: '番茄',
  });
}

runTests();
