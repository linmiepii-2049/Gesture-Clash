import assert from 'node:assert/strict';

function canRegisterNewPlayer(existingPlayers, nx, ny, now, lastCreateAt) {
  const NEW_PLAYER_DIST_X = 0.16;
  const NEW_PLAYER_DIST_Y = 0.22;
  const NEW_PLAYER_COOLDOWN_MS = 900;
  const closeToExisting = existingPlayers.some(
    (p) =>
      Math.abs(p.lastX - nx) < NEW_PLAYER_DIST_X &&
      Math.abs(p.lastY - ny) < NEW_PLAYER_DIST_Y,
  );
  const cooldownPassed = now - lastCreateAt > NEW_PLAYER_COOLDOWN_MS;
  return !closeToExisting && cooldownPassed;
}

function runTests() {
  assert.equal(
    canRegisterNewPlayer([{ lastX: 0.5, lastY: 0.5 }], 0.53, 0.57, 2000, 0),
    false,
    '接近既有玩家位置時不可重複註冊',
  );
  assert.equal(
    canRegisterNewPlayer([], 0.5, 0.5, 500, 0),
    false,
    '冷卻時間內不可連續新增玩家',
  );
  assert.equal(
    canRegisterNewPlayer([], 0.5, 0.5, 2000, 0),
    true,
    '無近鄰且冷卻結束可新增玩家',
  );
}

runTests();
