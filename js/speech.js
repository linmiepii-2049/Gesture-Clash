import {
  calibrationStrategyFor,
  shouldRestartVoiceTrigger,
  voiceTriggerRestartDelayMs,
} from "./rules.js";
import {
  NAME_LISTEN_WINDOW_MS,
  NAME_START_DELAY_MS,
  ALIAS_START_DELAY_MS,
  TRIGGER_WORDS,
} from "./constants.js";

const DEGRADE_UNSUPPORTED = "此瀏覽器不支援語音辨識，請改用下方輸入框。";
const DEGRADE_MIC = "麥克風無法使用，請允許權限，或改用下方輸入框。";

/**
 * One recognizer at a time: off → trigger | name | alias, or degraded (manual input).
 * Chrome fires onerror and onend for the same failure; restart is scheduled once.
 */
export function createSpeechController({
  SpeechRecognition,
  isMobile = false,
  getState = () => 0,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  nowFn = () => Date.now(),
  nameStartDelayMs = NAME_START_DELAY_MS,
  aliasStartDelayMs = ALIAS_START_DELAY_MS,
  nameWindowMs = NAME_LISTEN_WINDOW_MS,
  triggerWords = TRIGGER_WORDS,
  onTrigger = () => {},
  onName = () => {},
  onNameTimeout = () => {},
  onAliasText = () => {},
  onAliasEnd = () => {},
  onDegraded = () => {},
  onStatus = () => {},
} = {}) {
  const strategy = calibrationStrategyFor(isMobile);
  const restartDelay = voiceTriggerRestartDelayMs(isMobile);

  let phase = "off";
  let token = 0;
  let rec = null;
  let timer = null;
  let playerId = null;
  let gotResult = false;
  let nameDeadline = 0;
  let restartPending = false;

  function clearTimer() {
    if (timer != null) {
      clearTimeoutFn(timer);
      timer = null;
    }
  }

  function detach(session) {
    if (!session) return;
    session.onresult = null;
    session.onerror = null;
    session.onend = null;
    try {
      session.abort();
    } catch (_) {
      /* already stopped */
    }
  }

  function hardStopRec() {
    token += 1;
    clearTimer();
    restartPending = false;
    const current = rec;
    rec = null;
    detach(current);
  }

  function degrade(message) {
    hardStopRec();
    phase = "degraded";
    onDegraded(message);
    onStatus(message);
  }

  function schedule(delay, gen, fn) {
    clearTimer();
    timer = setTimeoutFn(() => {
      timer = null;
      if (gen !== token) return;
      fn();
    }, delay);
  }

  function scheduleTriggerRestart(gen) {
    if (restartPending) return;
    if (phase !== "trigger") return;
    if (!shouldRestartVoiceTrigger(getState(), null, null)) {
      phase = "off";
      return;
    }
    restartPending = true;
    schedule(restartDelay, gen, () => {
      restartPending = false;
      if (gen !== token || phase !== "trigger") return;
      if (!shouldRestartVoiceTrigger(getState(), null, null)) {
        phase = "off";
        return;
      }
      openSession(gen, "trigger");
    });
  }

  function openSession(gen, kind) {
    if (gen !== token) return;
    if (!SpeechRecognition) {
      degrade(DEGRADE_UNSUPPORTED);
      return;
    }
    if (rec) {
      const old = rec;
      rec = null;
      detach(old);
    }

    const session = new SpeechRecognition();
    rec = session;
    session.lang = "zh-TW";
    session.continuous = strategy.continuous;
    session.interimResults = kind !== "trigger";
    session.maxAlternatives = 1;
    gotResult = false;

    session.onresult = (event) => {
      if (gen !== token || rec !== session) return;
      const results = event?.results;
      if (!results || results.length === 0) return;
      const last = results[results.length - 1];
      const text = String(last?.[0]?.transcript || "").trim();
      if (kind === "trigger") {
        const folded = text.toLowerCase();
        if (triggerWords.some((word) => folded.includes(String(word).toLowerCase()))) {
          onTrigger(text);
        }
        return;
      }
      if (!last?.isFinal) return;
      gotResult = true;
      const pid = playerId;
      hardStopRec();
      phase = "off";
      if (kind === "name") {
        if (text) onName(pid, text);
        else onNameTimeout("沒聽到名字，請再舉手一次，或在下方輸入。");
        return;
      }
      onAliasText(pid, text);
    };

    session.onerror = (event) => {
      if (gen !== token || rec !== session) return;
      const error = event?.error || "";
      if (error === "aborted") return;
      if (
        error === "not-allowed" ||
        error === "audio-capture" ||
        error === "service-not-allowed"
      ) {
        degrade(DEGRADE_MIC);
      }
    };

    session.onend = () => {
      if (gen !== token || rec !== session) return;
      rec = null;
      if (kind === "trigger" && phase === "trigger") {
        scheduleTriggerRestart(gen);
        return;
      }
      if (kind === "name" && phase === "name" && !gotResult) {
        if (nowFn() < nameDeadline) {
          schedule(strategy.retryDelay, gen, () => openSession(gen, "name"));
          return;
        }
        phase = "off";
        onNameTimeout("沒聽到，請再舉手一次，或在下方輸入名字。");
        return;
      }
      if (kind === "alias" && phase === "alias" && !gotResult) {
        const pid = playerId;
        phase = "off";
        onAliasEnd(pid, false);
      }
    };

    try {
      session.start();
    } catch (_) {
      rec = null;
      if (kind === "trigger" && phase === "trigger") {
        scheduleTriggerRestart(gen);
      } else if (kind === "name") {
        phase = "off";
        onNameTimeout("語音辨識啟動失敗，請改用下方輸入框。");
      } else if (kind === "alias") {
        const pid = playerId;
        phase = "off";
        onAliasEnd(pid, false);
      }
    }
  }

  function begin(kind, delay) {
    const gen = token;
    if (!SpeechRecognition) {
      degrade(kind === "name" ? "此瀏覽器不支援語音辨識，請在下方輸入名字。" : DEGRADE_UNSUPPORTED);
      return;
    }
    schedule(delay, gen, () => openSession(gen, kind));
  }

  return {
    getPhase: () => phase,
    getPlayerId: () => (phase === "name" || phase === "alias" ? playerId : null),
    stop() {
      hardStopRec();
      if (phase !== "degraded") phase = "off";
    },
    startTrigger() {
      if (phase === "degraded") return;
      if (phase === "name" || phase === "alias") return;
      if (phase === "trigger" && (rec || timer || restartPending)) return;
      if (!shouldRestartVoiceTrigger(getState(), null, null)) return;
      hardStopRec();
      phase = "trigger";
      begin("trigger", 0);
    },
    startName(id) {
      if (phase === "degraded") {
        onStatus("請在下方輸入名字。");
        return;
      }
      hardStopRec();
      phase = "name";
      playerId = id;
      nameDeadline = nowFn() + nameWindowMs;
      begin("name", nameStartDelayMs);
    },
    startAlias(id) {
      if (phase === "degraded") {
        onStatus("請在下方輸入「左手OO 右手XX」。");
        return;
      }
      hardStopRec();
      phase = "alias";
      playerId = id;
      begin("alias", aliasStartDelayMs);
    },
  };
}
