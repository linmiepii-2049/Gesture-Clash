import assert from 'node:assert/strict';

function buildWinnerRoundBoard(players, round) {
  if (players.length === 0) return '尚無玩家資料';
  const lines = players.map((p, idx) => {
    const name = p.name || `玩家${idx + 1}`;
    if (p.active) return `${name}：存活至第 ${round} 回合（勝利）`;
    const outRound = Number.isFinite(p.eliminatedRound) ? p.eliminatedRound : '?';
    return `${name}：第 ${outRound} 回合淘汰`;
  });
  return lines.join('\n');
}

function runTests() {
  assert.equal(buildWinnerRoundBoard([], 3), '尚無玩家資料');
  assert.equal(
    buildWinnerRoundBoard(
      [
        { name: 'A', active: false, eliminatedRound: 2 },
        { name: 'B', active: true, eliminatedRound: null },
      ],
      4,
    ),
    'A：第 2 回合淘汰\nB：存活至第 4 回合（勝利）',
  );
}

runTests();
