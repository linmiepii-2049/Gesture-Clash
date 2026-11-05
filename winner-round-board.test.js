import assert from "node:assert/strict";
import { buildWinnerRoundBoard } from "./js/rules.js";

function runTests() {
  assert.equal(buildWinnerRoundBoard([], 3), "尚無玩家資料");
  assert.equal(
    buildWinnerRoundBoard(
      [
        { name: "A", active: false, eliminatedRound: 2 },
        { name: "B", active: true, eliminatedRound: null },
      ],
      4,
    ),
    "A：第 2 回合淘汰\nB：存活至第 4 回合（勝利）",
  );
}

runTests();
