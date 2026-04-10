import assert from 'node:assert/strict';

function shouldRetryCalibrationListening({ state, calibratingId, playerId, gotResult }) {
  return state === 1 && calibratingId === playerId && !gotResult;
}

function runTests() {
  assert.equal(
    shouldRetryCalibrationListening({
      state: 1,
      calibratingId: 3,
      playerId: 3,
      gotResult: false,
    }),
    true,
    'SETUP 中且同一位校正玩家、無結果時應重試聆聽',
  );

  assert.equal(
    shouldRetryCalibrationListening({
      state: 1,
      calibratingId: 3,
      playerId: 3,
      gotResult: true,
    }),
    false,
    '已有語音結果時不應由 onend 觸發重試',
  );

  assert.equal(
    shouldRetryCalibrationListening({
      state: 2,
      calibratingId: 3,
      playerId: 3,
      gotResult: false,
    }),
    false,
    '非 SETUP 狀態不應重試聆聽',
  );

  assert.equal(
    shouldRetryCalibrationListening({
      state: 1,
      calibratingId: null,
      playerId: 3,
      gotResult: false,
    }),
    false,
    '校正玩家已清空時不應重試聆聽',
  );
}

runTests();
