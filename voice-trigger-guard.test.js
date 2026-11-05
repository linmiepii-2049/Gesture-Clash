import assert from "node:assert/strict";
import { shouldRestartVoiceTrigger, S } from "./js/rules.js";

function runTests() {
  assert.equal(shouldRestartVoiceTrigger(S.SETUP, null, null), true);
  assert.equal(shouldRestartVoiceTrigger(S.SETUP, 2, null), false);
  assert.equal(shouldRestartVoiceTrigger(S.SETUP, null, 5), false);
  assert.equal(shouldRestartVoiceTrigger(S.GAMING, null, null), false);
}

runTests();
