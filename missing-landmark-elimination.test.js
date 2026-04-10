import assert from 'node:assert/strict';

function shouldEliminate({ hasLandmarks, compliant }) {
  if (!hasLandmarks) return true;
  return !compliant;
}

function runTests() {
  assert.equal(
    shouldEliminate({ hasLandmarks: false, compliant: true }),
    true,
    '未偵測到姿勢時應淘汰，避免自動過關',
  );
  assert.equal(
    shouldEliminate({ hasLandmarks: true, compliant: false }),
    true,
    '有姿勢但不符合指令應淘汰',
  );
  assert.equal(
    shouldEliminate({ hasLandmarks: true, compliant: true }),
    false,
    '有姿勢且符合指令不淘汰',
  );
}

runTests();
