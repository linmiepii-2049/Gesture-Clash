import assert from 'node:assert/strict';

function isGameOver(initialPlayerCount, surviveCount) {
  if (initialPlayerCount <= 1) return surviveCount === 0;
  return surviveCount <= 1;
}

function runTests() {
  assert.equal(isGameOver(1, 1), false, '單人仍存活時不結束');
  assert.equal(isGameOver(1, 0), true, '單人被淘汰時結束');
  assert.equal(isGameOver(2, 2), false, '多人剩兩人時不結束');
  assert.equal(isGameOver(2, 1), true, '多人剩一人時結束');
  assert.equal(isGameOver(4, 1), true, '多人剩一人時結束（任意初始人數）');
}

runTests();
