import assert from "node:assert/strict";
import { parseManualObjectInput } from "./js/rules.js";

function runTests() {
  assert.deepEqual(parseManualObjectInput("左手沒有 右手完成"), {
    leftAlias: "沒有",
    rightAlias: "完成",
  });
  assert.deepEqual(parseManualObjectInput("左手番茄右手手機"), {
    leftAlias: "番茄",
    rightAlias: "手機",
  });
  assert.deepEqual(parseManualObjectInput("右手完成 左手沒有"), {
    leftAlias: "沒有",
    rightAlias: "完成",
  });
  assert.deepEqual(parseManualObjectInput("左手 沒有 右手 完成"), {
    leftAlias: "沒有",
    rightAlias: "完成",
  });
}

runTests();
