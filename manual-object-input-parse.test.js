import assert from 'node:assert/strict';

function parseManualObjectInput(input) {
  const normalized = input.replace(/\s+/g, '');
  const leftIdx = normalized.indexOf('左手');
  const rightIdx = normalized.indexOf('右手');

  let leftAlias = null;
  let rightAlias = null;

  if (leftIdx !== -1) {
    let leftEnd = rightIdx !== -1 && rightIdx > leftIdx ? rightIdx : normalized.length;
    leftAlias = normalized.slice(leftIdx + 2, leftEnd).trim();
  }
  if (rightIdx !== -1) {
    let rightEnd = leftIdx !== -1 && leftIdx > rightIdx ? leftIdx : normalized.length;
    rightAlias = normalized.slice(rightIdx + 2, rightEnd).trim();
  }

  return { leftAlias, rightAlias };
}

function runTests() {
  assert.deepEqual(parseManualObjectInput('左手沒有 右手完成'), {
    leftAlias: '沒有',
    rightAlias: '完成',
  });
  assert.deepEqual(parseManualObjectInput('左手番茄右手手機'), {
    leftAlias: '番茄',
    rightAlias: '手機',
  });
  assert.deepEqual(parseManualObjectInput('右手完成 左手沒有'), {
    leftAlias: '沒有',
    rightAlias: '完成',
  });
  assert.deepEqual(parseManualObjectInput('左手 沒有 右手 完成'), {
    leftAlias: '沒有',
    rightAlias: '完成',
  });
}

runTests();
