import assert from 'node:assert/strict';

function shouldRestartVoiceTrigger(state, listeningId, calibratingId) {
  return state === 1 && listeningId === null && calibratingId === null;
}

function runTests() {
  assert.equal(shouldRestartVoiceTrigger(1, null, null), true);
  assert.equal(shouldRestartVoiceTrigger(1, 2, null), false);
  assert.equal(shouldRestartVoiceTrigger(1, null, 5), false);
  assert.equal(shouldRestartVoiceTrigger(2, null, null), false);
}

runTests();
