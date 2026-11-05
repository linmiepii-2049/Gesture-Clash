import test from "node:test";
import assert from "node:assert/strict";
import { createSpeechController } from "./js/speech.js";
import { S } from "./js/constants.js";

class FakeSR {
  constructor() {
    this.started = 0;
    FakeSR.instances.push(this);
  }
  start() {
    this.started += 1;
  }
  abort() {}
  emitEnd() {
    this.onend?.();
  }
  emitError(error) {
    this.onerror?.({ error });
  }
  emitFinal(text) {
    const result = [{ transcript: text }];
    result.isFinal = true;
    this.onresult?.({ results: [result] });
  }
}

function harness({ isMobile = true, state = S.SETUP } = {}) {
  FakeSR.instances = [];
  const timers = new Map();
  let seq = 0;
  let now = 1_000;
  let gameState = state;
  const events = {
    triggers: 0,
    names: [],
    timeouts: [],
    alias: [],
    aliasEnd: [],
    degraded: [],
  };
  const controller = createSpeechController({
    SpeechRecognition: FakeSR,
    isMobile,
    getState: () => gameState,
    setTimeoutFn(fn) {
      const id = ++seq;
      timers.set(id, fn);
      return id;
    },
    clearTimeoutFn(id) {
      timers.delete(id);
    },
    nowFn: () => now,
    nameStartDelayMs: 0,
    aliasStartDelayMs: 0,
    nameWindowMs: 6000,
    onTrigger: () => {
      events.triggers += 1;
    },
    onName: (id, text) => events.names.push({ id, text }),
    onNameTimeout: (message) => events.timeouts.push(message),
    onAliasText: (id, text) => events.alias.push({ id, text }),
    onAliasEnd: (id, got) => events.aliasEnd.push({ id, got }),
    onDegraded: (message) => events.degraded.push(message),
  });
  function flush() {
    const batch = [...timers.values()];
    timers.clear();
    for (const fn of batch) fn();
  }
  return {
    controller,
    events,
    flush,
    setState(next) {
      gameState = next;
    },
    setNow(value) {
      now = value;
    },
  };
}

test("voice trigger restarts once when error and end both fire", () => {
  const { controller, flush } = harness();
  controller.startTrigger();
  flush();
  assert.equal(FakeSR.instances.length, 1);
  assert.equal(FakeSR.instances[0].continuous, false);
  FakeSR.instances[0].emitError("no-speech");
  FakeSR.instances[0].emitEnd();
  flush();
  assert.equal(FakeSR.instances.length, 2);
  assert.equal(controller.getPhase(), "trigger");
});

test("desktop trigger sessions stay continuous", () => {
  const { controller, flush } = harness({ isMobile: false });
  controller.startTrigger();
  flush();
  assert.equal(FakeSR.instances[0].continuous, true);
});

test("microphone denial degrades to manual input and does not restart", () => {
  const { controller, events, flush } = harness();
  controller.startTrigger();
  flush();
  FakeSR.instances[0].emitError("not-allowed");
  FakeSR.instances[0].emitEnd();
  flush();
  assert.equal(controller.getPhase(), "degraded");
  assert.equal(events.degraded.length, 1);
  assert.match(events.degraded[0], /輸入框/);
  assert.equal(FakeSR.instances.length, 1);
  controller.startName(4);
  assert.equal(FakeSR.instances.length, 1);
  assert.equal(controller.getPhase(), "degraded");
});

test("a final name result is delivered once", () => {
  const { controller, events, flush } = harness();
  controller.startName(7);
  flush();
  FakeSR.instances[0].emitFinal("小明");
  FakeSR.instances[0].emitEnd();
  assert.deepEqual(events.names, [{ id: 7, text: "小明" }]);
  assert.equal(events.timeouts.length, 0);
  assert.equal(controller.getPhase(), "off");
});

test("name listening retries inside the window and then gives up", () => {
  const { controller, events, flush, setNow } = harness();
  controller.startName(2);
  flush();
  FakeSR.instances[0].emitEnd();
  flush();
  assert.equal(FakeSR.instances.length, 2);
  assert.equal(controller.getPhase(), "name");
  setNow(20_000);
  FakeSR.instances[1].emitEnd();
  flush();
  assert.equal(events.timeouts.length, 1);
  assert.match(events.timeouts[0], /輸入/);
  assert.equal(controller.getPhase(), "off");
});

test("alias end without a result is reported once", () => {
  const { controller, events, flush } = harness();
  controller.startAlias(9);
  flush();
  FakeSR.instances[0].emitEnd();
  FakeSR.instances[0].emitEnd();
  assert.deepEqual(events.aliasEnd, [{ id: 9, got: false }]);
  assert.equal(events.alias.length, 0);
});

test("alias text does not also emit an empty end", () => {
  const { controller, events, flush } = harness();
  controller.startAlias(9);
  flush();
  FakeSR.instances[0].emitFinal("左手番茄右手手機");
  FakeSR.instances[0].emitEnd();
  assert.deepEqual(events.alias, [{ id: 9, text: "左手番茄右手手機" }]);
  assert.equal(events.aliasEnd.length, 0);
});

test("trigger stays down outside setup and after stop", () => {
  const { controller, flush, setState } = harness();
  setState(S.GAMING);
  controller.startTrigger();
  flush();
  assert.equal(FakeSR.instances.length, 0);
  setState(S.SETUP);
  controller.startTrigger();
  flush();
  const started = FakeSR.instances.length;
  controller.stop();
  FakeSR.instances.at(-1).emitEnd();
  flush();
  assert.equal(FakeSR.instances.length, started);
  assert.equal(controller.getPhase(), "off");
});
