import test from "node:test";
import assert from "node:assert/strict";
import {
  RAISE_HOLD_MS,
  LOWER_GRACE_MS,
  RESULT_MS,
  LOST_GRACE_MS,
  EVAL_BOOST_WINDOW_MS,
  IDX,
} from "./js/constants.js";
import {
  PHRASE_POOLS,
  formatRequiredState,
  holdProgress,
  resolveDetectIntervalMs,
  isCriticalDetectMoment,
  S,
  assignPoses,
  shouldDropLandmarks,
  applyCommand,
  checkCompliance,
  generateCommandText,
  planRoundStart,
  extractHandAliases,
  emptyRequiredState,
  MIRROR_HINT,
  ALIAS_NOTE,
  ACCUMULATE_NOTE,
} from "./js/rules.js";
import { bgmIntensity, effectiveBgmGain } from "./js/audio.js";

test("round plan starts the timer without waiting for speech", () => {
  const plan = planRoundStart();
  assert.equal(plan.showHudImmediately, true);
  assert.equal(plan.startTimerImmediately, true);
  assert.equal(plan.awaitSpeech, false);
  assert.equal(plan.resultMs, RESULT_MS);
  assert.ok(RESULT_MS < 3500);
  assert.equal(RESULT_MS, 1800);
});

test("setup hold is shorter than the old 800/400 timings", () => {
  assert.equal(RAISE_HOLD_MS, 450);
  assert.equal(LOWER_GRACE_MS, 220);
  assert.equal(holdProgress(1000, 550, RAISE_HOLD_MS), 1);
  assert.equal(holdProgress(775, 550, RAISE_HOLD_MS), 0.5);
  assert.equal(holdProgress(775, null, RAISE_HOLD_MS), 0);
});

test("required pose accumulates and uses aliases", () => {
  let required = emptyRequiredState();
  required = applyCommand(required, { set: { left: "up" } });
  required = applyCommand(required, { set: { right: "down" } });
  assert.deepEqual(required, { left: "up", right: "down" });
  assert.equal(
    formatRequiredState(required, { left: "番茄", right: null }),
    "目前必須狀態：番茄 舉高、右手 放下",
  );
  assert.match(ACCUMULATE_NOTE, /累積/);
  assert.match(MIRROR_HINT, /左手在畫面右側/);
  assert.match(ALIAS_NOTE, /不看道具顏色/);
});

test("compliance uses wrist versus shoulder, not color", () => {
  const lm = [];
  lm[IDX.L_WRIST] = { y: 0.2 };
  lm[IDX.L_SHOULDER] = { y: 0.45 };
  lm[IDX.R_WRIST] = { y: 0.6 };
  lm[IDX.R_SHOULDER] = { y: 0.45 };
  const required = { left: "up", right: "down" };
  assert.equal(checkCompliance(lm, required), true);
  assert.equal(checkCompliance(lm, { left: "up", right: "up" }), false);
  assert.equal(checkCompliance(null, required), false);
});

test("detect boost is only for critical moments and backs off when fps is low", () => {
  assert.equal(resolveDetectIntervalMs(100, { critical: false, isMobile: true, fps: 30 }), 100);
  assert.equal(resolveDetectIntervalMs(100, { critical: true, isMobile: true, fps: 30 }), 50);
  assert.equal(resolveDetectIntervalMs(50, { critical: true, isMobile: false, fps: 40 }), 33);
  assert.equal(resolveDetectIntervalMs(100, { critical: true, isMobile: true, fps: 12 }), 100);
  assert.equal(
    isCriticalDetectMoment({ state: S.SETUP, trackingRaise: true }),
    true,
  );
  assert.equal(
    isCriticalDetectMoment({ state: S.GAMING, remainingMs: EVAL_BOOST_WINDOW_MS }),
    true,
  );
  assert.equal(
    isCriticalDetectMoment({ state: S.GAMING, remainingMs: EVAL_BOOST_WINDOW_MS + 1 }),
    false,
  );
});

test("pose matching uses the body, so a crossed x does not steal the id", () => {
  const players = [
    { lastX: 0.4, lastY: 0.3, vx: 0, vy: 0 },
    { lastX: 0.48, lastY: 0.7, vx: 0, vy: 0 },
  ];
  const matches = assignPoses(players, [{ x: 0.5, y: 0.32 }], 0.28);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].pi, 0);
});

test("landmarks survive a short miss and drop after the grace", () => {
  assert.equal(LOST_GRACE_MS, 450);
  assert.equal(shouldDropLandmarks(1000, 1300, LOST_GRACE_MS), false);
  assert.equal(shouldDropLandmarks(1000, 1450, LOST_GRACE_MS), true);
  assert.equal(shouldDropLandmarks(null, 1450, LOST_GRACE_MS), false);
});

test("simple phrases stay literal and chaotic phrases keep double negatives", () => {
  assert.ok(PHRASE_POOLS.chaotic.raise.includes("不要不舉起來"));
  assert.ok(PHRASE_POOLS.simple.raise.every((line) => !line.includes("不")));
  const simple = generateCommandText({
    cmd: { set: { left: "up", right: "down" } },
    round: 2,
    handAliases: { left: "番茄", right: "手機" },
    raisePhrases: PHRASE_POOLS.simple.raise,
    lowerPhrases: PHRASE_POOLS.simple.lower,
    rng: () => 0,
  });
  assert.equal(simple.text, "番茄舉起來，手機放下來");
  const swapped = generateCommandText({
    cmd: { set: { left: "up", right: "down" } },
    round: 12,
    handAliases: {},
    raisePhrases: ["舉起來"],
    lowerPhrases: ["放下來"],
    rng: () => 0,
  });
  assert.equal(swapped.text, "右手放下來，左手舉起來");
});

test("one utterance can carry both aliases", () => {
  assert.deepEqual(extractHandAliases("左手番茄右手手機"), {
    leftAlias: "番茄",
    rightAlias: "手機",
  });
  assert.deepEqual(extractHandAliases("右手完成"), {
    leftAlias: null,
    rightAlias: "完成",
  });
});

test("later rounds speed the beat up without leaving the procedural mix", () => {
  assert.deepEqual(bgmIntensity(1), { steps: 0, bpm: 128, gainMul: 1 });
  const later = bgmIntensity(6);
  assert.equal(later.bpm, 148);
  assert.ok(later.gainMul > 1);
  assert.equal(effectiveBgmGain(0.2, 6), 0.2 * later.gainMul);
  assert.equal(bgmIntensity(99).steps, 8);
});
