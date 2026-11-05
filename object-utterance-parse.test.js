import assert from "node:assert/strict";
import { parseObjectUtterance } from "./js/rules.js";

function runTests() {
  assert.deepEqual(parseObjectUtterance("左手沒有"), {
    side: "left",
    alias: "沒有",
  });

  assert.deepEqual(parseObjectUtterance("右 手 完成"), {
    side: "right",
    alias: "完成",
  });

  assert.deepEqual(parseObjectUtterance("我的左手是番茄"), {
    side: "left",
    alias: "番茄",
  });

  assert.deepEqual(parseObjectUtterance("右手叫手機。"), {
    side: "right",
    alias: "手機",
  });

  assert.deepEqual(parseObjectUtterance("左手番茄右手手機"), {
    side: "left",
    alias: "番茄",
  });
}

runTests();
