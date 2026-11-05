import {
  PoseLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

import {
  S,
  MAX_POSES,
  MAX_ROUND_SEC,
  IDX,
  RAISE_HOLD_MS,
  LOWER_GRACE_MS,
  RESULT_MS,
  TRACK_DIST,
  LOST_GRACE_MS,
  NEW_PLAYER_DIST_X,
  NEW_PLAYER_DIST_Y,
  OBJECT_TAG_INTERVAL_MS,
  COLOR_THRESHOLD,
  MIRROR_HINT,
} from "./constants.js";
import {
  PHRASE_POOLS,
  isMobileDevice,
  getCalibrationStrategy,
  canRegisterNewPlayer,
  isGameOver,
  shouldEliminate,
  areHandAliasesReady,
  parseManualObjectInput,
  extractHandAliases,
  shouldRetryCalibrationListening,
  buildWinnerRoundEntries,
  hasHandRaised,
  isWristUp,
  applyCommand,
  checkCompliance,
  formatRequiredState,
  holdProgress,
  isCriticalDetectMoment,
  resolveDetectIntervalMs,
  poseAnchor,
  assignPoses,
  smoothVelocity,
  shouldDropLandmarks,
  generateCommandText,
  planRoundStart,
  emptyRequiredState,
} from "./rules.js";
import { createSpeechController } from "./speech.js";
import { createAudioEngine } from "./audio.js";
import { drawScene } from "./render.js";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

const IS_MOBILE = isMobileDevice(navigator.userAgent);
const PHASE_NAME = ["idle", "setup", "gaming", "result", "winner", "paused"];

function detectDeviceDefaults() {
  if (IS_MOBILE) {
    const isTablet = Math.min(screen.width, screen.height) >= 768;
    return isTablet
      ? { fps: 15, confidence: 0.45, label: "平板" }
      : { fps: 10, confidence: 0.4, label: "手機" };
  }
  const cores = navigator.hardwareConcurrency || 4;
  return cores >= 8
    ? { fps: 30, confidence: 0.6, label: "高效能桌機" }
    : { fps: 20, confidence: 0.55, label: "桌機" };
}

const DEVICE_DEFAULTS = detectDeviceDefaults();
let DETECT_INTERVAL_MS = Math.round(1000 / DEVICE_DEFAULTS.fps);

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const cmdHud = document.getElementById("command-hud");
const requiredHud = document.getElementById("required-hud");
const roundBadge = document.getElementById("round-badge");
const timerWrap = document.getElementById("timer-wrap");
const timerNum = document.getElementById("timer-num");
const timerFill = document.getElementById("timer-fill");
const statusEl = document.getElementById("status");
const micEl = document.getElementById("mic");
const holdCue = document.getElementById("hold-cue");
const holdLabel = document.getElementById("hold-label");
const holdFill = document.getElementById("hold-fill");
const fxFlash = document.getElementById("fx-flash");
const runtimeNote = document.getElementById("runtime-note");
const btnSettings = document.getElementById("btn-settings");
const settingsPanel = document.getElementById("settings-panel");
const idlePanel = document.getElementById("idle-panel");
const winnerPanel = document.getElementById("winner-panel");
const winnerName = document.getElementById("winner-name");
const winnerRounds = document.getElementById("winner-rounds");
const resultPanel = document.getElementById("result-panel");
const resultTitle = document.getElementById("result-title");
const resultNames = document.getElementById("result-names");
const resultRemain = document.getElementById("result-remain");
const btnStart = document.getElementById("btn-start");
const btnReset = document.getElementById("btn-reset");
const btnManualInput = document.getElementById("btn-manual-input");
const btnPause = document.getElementById("btn-pause");
const btnResume = document.getElementById("btn-resume");
const btnTutorial = document.getElementById("btn-tutorial");
const btnCloseTutorial = document.getElementById("btn-close-tutorial");
const loadingPanel = document.getElementById("loading-panel");
const loadingText = document.getElementById("loading-text");
const loadingSub = document.getElementById("loading-sub");
const loadingFill = document.getElementById("loading-fill");
const pausePanel = document.getElementById("pause-panel");
const tutorialPanel = document.getElementById("tutorial-panel");
const networkWarning = document.getElementById("network-warning");
const nameInputPanel = document.getElementById("name-input-panel");
const nameInput = document.getElementById("name-input");
const btnNameSubmit = document.getElementById("btn-name-submit");
const calHintEl = document.getElementById("cal-hint");
const calExamplesEl = document.getElementById("cal-examples");
const mirrorHint = document.getElementById("mirror-hint");

mirrorHint.textContent = MIRROR_HINT;

const audioSettings = {
  bgmVolume: 0.234,
  ttsVolume: 1,
  poseConfidence: DEVICE_DEFAULTS.confidence,
  minRoundSec: 1.5,
};

const audio = createAudioEngine();
const sampleCanvas = document.createElement("canvas");
const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });

let state = S.IDLE;
let pausedFromState = null;
let pausedTimerRemaining = 0;
let players = [];
let nextId = 0;
let round = 0;
let lastCmdIdx = -1;
let timerTotal = MAX_ROUND_SEC;
let timerEnd = 0;
let rafTimer = null;
let countdownBeeped = false;
let initialPlayerCount = 0;
let requiredState = emptyRequiredState();
let lastRaiseIdx = -1;
let lastLowerIdx = -1;
let activeDifficulty = "chaotic";
let raisePhrases = [...PHRASE_POOLS.chaotic.raise];
let lowerPhrases = [...PHRASE_POOLS.chaotic.lower];

let listeningId = null;
let raisePlayerId = null;
let raiseStartAt = null;
let lowerSince = null;
let calibratingId = null;
let calibratingPlayer = null;
const colorObjects = [];
const handAliases = { left: null, right: null };
let lastPlayerCreateAt = 0;
let allClearTimer = null;

let landmarker = null;
let detectorDelegate = "GPU";
let cpuFallbackLock = false;
let detectErrorNoted = false;
let lastVideoTime = -1;
let lastDetectAt = 0;
let fpsFrameCount = 0;
let fpsLastTime = performance.now();
let currentFps = 60;
let performanceDegradation = 0;
let cancelResult = null;

const speech = createSpeechController({
  SpeechRecognition: window.SpeechRecognition || window.webkitSpeechRecognition,
  isMobile: IS_MOBILE,
  getState: () => state,
  onTrigger: () => {
    if (!btnStart.disabled) startGame();
  },
  onName: (playerId, text) => assignName(playerId, text),
  onNameTimeout: (message) => {
    listeningId = null;
    showStatus(message);
    revealManualInput();
    if (state === S.SETUP) speech.startTrigger();
  },
  onAliasText: (playerId, text) => {
    const player = players.find((p) => p.id === playerId) || calibratingPlayer;
    if (player) void applySpokenAliases(player, text);
  },
  onAliasEnd: (playerId, gotResult) => {
    retryAlias(playerId, gotResult);
  },
  onDegraded: (message) => {
    listeningId = null;
    showStatus(message);
    revealManualInput();
  },
  onStatus: (message) => showStatus(message),
});

function setPhase(next) {
  state = next;
  document.body.dataset.phase = PHASE_NAME[next] || "idle";
  const showPlay = next === S.GAMING || next === S.RESULT || next === S.PAUSED;
  requiredHud.style.display = showPlay ? "block" : "none";
  if (showPlay) requiredHud.textContent = formatRequiredState(requiredState, handAliases);
  if (!showPlay) cmdHud.style.display = "none";
  roundBadge.style.display = showPlay ? "block" : "none";
  if (next !== S.SETUP) {
    holdCue.style.display = "none";
    calHintEl.style.display = "none";
  }
}

function showStatus(msg) {
  statusEl.textContent = msg;
  statusEl.style.display = "block";
}

function hideStatus() {
  statusEl.style.display = "none";
}

function revealManualInput() {
  nameInputPanel.style.display = "flex";
  nameInputPanel.classList.add("degraded");
  btnManualInput.style.display = "inline-block";
  if (state === S.SETUP) nameInput.focus();
}

function flash(kind) {
  fxFlash.className = "";
  void fxFlash.offsetWidth;
  fxFlash.classList.add(kind);
}

function setLoad(percent, step, text, sub) {
  loadingFill.style.width = `${percent}%`;
  loadingText.textContent = text;
  if (sub != null) loadingSub.textContent = sub;
  for (const id of ["camera", "model", "ready"]) {
    const el = document.getElementById(`load-step-${id}`);
    const order = { camera: 1, model: 2, ready: 3 };
    el.classList.toggle("active", id === step);
    el.classList.toggle("done", order[id] < order[step] || (id === step && percent >= 100));
  }
}

function showRuntimeNote(message) {
  runtimeNote.textContent = message;
  runtimeNote.style.display = "block";
}

function speak(text) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    if (!text || !window.speechSynthesis) {
      finish();
      return;
    }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "zh-TW";
    utt.rate = 1.05;
    utt.volume = audioSettings.ttsVolume;
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("zh"));
    if (zhVoice) utt.voice = zhVoice;
    utt.onend = finish;
    utt.onerror = finish;
    setTimeout(finish, text.length * 200 + 800);
    window.speechSynthesis.speak(utt);
  });
}

function playSound(type) {
  try {
    audio.play(type);
  } catch (error) {
    console.warn(error);
  }
}

function positionMicAt(player) {
  if (!player?.lm) return;
  const nose = player.lm[IDX.NOSE];
  micEl.style.left = `${(1 - nose.x) * 100}%`;
  micEl.style.top = `${nose.y * 100}%`;
}

function syncMic() {
  const phase = speech.getPhase();
  if (phase === "name" || phase === "alias") {
    micEl.style.display = "flex";
    const pid = speech.getPlayerId();
    positionMicAt(players.find((p) => p.id === pid));
  } else {
    micEl.style.display = "none";
  }
}

function updateHoldCue(ratio, label) {
  if (ratio > 0 && state === S.SETUP) {
    holdCue.style.display = "flex";
    holdFill.style.width = `${Math.round(ratio * 100)}%`;
    holdLabel.textContent = label;
  } else {
    holdCue.style.display = "none";
    holdFill.style.width = "0%";
  }
}

function clearDebounce() {
  raisePlayerId = null;
  raiseStartAt = null;
  lowerSince = null;
  updateHoldCue(0, "");
}

function poseOptions(delegate) {
  return {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numPoses: MAX_POSES,
    minPoseDetectionConfidence: audioSettings.poseConfidence,
    minPosePresenceConfidence: audioSettings.poseConfidence,
    minTrackingConfidence: audioSettings.poseConfidence,
  };
}

async function buildLandmarker(resolver, delegate) {
  const created = await PoseLandmarker.createFromOptions(resolver, poseOptions(delegate));
  const previous = landmarker;
  landmarker = created;
  detectorDelegate = delegate;
  if (previous && previous !== created && typeof previous.close === "function") {
    try {
      previous.close();
    } catch (_) {
      /* previous detector already closed */
    }
  }
}

async function switchToCpu(reason) {
  if (detectorDelegate === "CPU" || cpuFallbackLock || !fileset) return;
  cpuFallbackLock = true;
  try {
    showRuntimeNote("姿勢偵測已改用 CPU（此裝置的 GPU 模式無法使用）。仍可判斷動作，但延遲可能較高。");
    loadingSub.textContent = "GPU 失敗，已改用 CPU。";
    await buildLandmarker(fileset, "CPU");
    detectErrorNoted = false;
    console.warn("MediaPipe GPU fallback", reason);
  } catch (error) {
    console.error(error);
    showRuntimeNote("姿勢模型改用 CPU 時失敗，請檢查網路後重新整理。");
  } finally {
    cpuFallbackLock = false;
  }
}

let fileset = null;

function updateTracking(allLandmarks) {
  const now = performance.now();
  const anchors = [];
  const landmarks = [];
  for (const lm of allLandmarks) {
    const anchor = poseAnchor(lm);
    const duplicated = anchors.some(
      (other) =>
        Math.abs(other.x - anchor.x) < NEW_PLAYER_DIST_X * 0.5 &&
        Math.abs(other.y - anchor.y) < NEW_PLAYER_DIST_Y * 0.5,
    );
    if (!duplicated) {
      anchors.push(anchor);
      landmarks.push(lm);
    }
  }

  const matches = assignPoses(players, anchors, TRACK_DIST);
  const matched = new Set();
  for (const match of matches) {
    const player = players[match.pi];
    const anchor = anchors[match.ai];
    const velocity = smoothVelocity(player, { x: player.lastX, y: player.lastY }, anchor);
    player.vx = velocity.vx;
    player.vy = velocity.vy;
    player.lastX = anchor.x;
    player.lastY = anchor.y;
    player.lm = landmarks[match.ai];
    player._lostSince = null;
    matched.add(player);
  }

  for (const player of players) {
    if (matched.has(player)) continue;
    if (player._lostSince == null) player._lostSince = now;
    if (shouldDropLandmarks(player._lostSince, now, LOST_GRACE_MS)) player.lm = null;
  }

  if (state !== S.SETUP) return;
  for (let i = 0; i < anchors.length; i++) {
    if (matches.some((match) => match.ai === i)) continue;
    const anchor = anchors[i];
    if (!canRegisterNewPlayer(players, anchor.x, anchor.y, now, lastPlayerCreateAt)) continue;
    players.push({
      id: nextId++,
      name: null,
      lastX: anchor.x,
      lastY: anchor.y,
      vx: 0,
      vy: 0,
      lm: landmarks[i],
      active: true,
      eliminatedRound: null,
      lastDetectedObject: null,
      lastObjectSampleAt: 0,
      _lostSince: null,
      glowUntil: 0,
      outFlashUntil: 0,
    });
    lastPlayerCreateAt = now;
  }
}

function render() {
  const phase = speech.getPhase();
  drawScene(ctx, canvas, players, {
    state,
    now: performance.now(),
    listeningId: phase === "name" ? speech.getPlayerId() : listeningId,
    calibratingId: phase === "alias" ? speech.getPlayerId() : calibratingId,
    raisePlayerId,
    holdRatio: holdProgress(performance.now(), raiseStartAt, RAISE_HOLD_MS),
    objectTag: (player) => (colorObjects.length ? getDetectedObjectTag(player) : null),
  });
}

function loop() {
  requestAnimationFrame(loop);
  fpsFrameCount += 1;
  const fpsNow = performance.now();
  if (fpsNow - fpsLastTime >= 1000) {
    currentFps = Math.round((fpsFrameCount * 1000) / (fpsNow - fpsLastTime));
    fpsFrameCount = 0;
    fpsLastTime = fpsNow;
    if (currentFps < 15 && performanceDegradation === 0) {
      performanceDegradation = 1;
      console.warn(`效能偵測：FPS=${currentFps}，建議調低姿勢準確度或偵測頻率`);
    } else if (currentFps >= 20 && performanceDegradation === 1) {
      performanceDegradation = 0;
    }
  }

  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  if (canvas.width !== vw || canvas.height !== vh) {
    canvas.width = vw;
    canvas.height = vh;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarker || video.readyState < 2) return;

  if (state === S.PAUSED) {
    render();
    return;
  }

  const now = performance.now();
  const remaining = state === S.GAMING ? timerEnd - now : null;
  const critical = isCriticalDetectMoment({
    state,
    trackingRaise: raisePlayerId !== null,
    calibrating: calibratingId !== null || speech.getPhase() === "alias",
    remainingMs: remaining,
  });
  const interval = resolveDetectIntervalMs(DETECT_INTERVAL_MS, {
    critical,
    isMobile: IS_MOBILE,
    fps: currentFps,
  });
  if (video.currentTime !== lastVideoTime && now - lastDetectAt >= interval) {
    lastVideoTime = video.currentTime;
    lastDetectAt = now;
    try {
      const result = landmarker.detectForVideo(video, now);
      updateTracking(result.landmarks || []);
    } catch (error) {
      if (detectorDelegate !== "CPU") void switchToCpu(error);
      else if (!detectErrorNoted) {
        detectErrorNoted = true;
        showRuntimeNote("姿勢偵測暫時中斷，請確認人物在畫面中。");
        console.error(error);
      }
    }
  }

  render();
  syncMic();
  if (state === S.SETUP) tickSetup();
}

function tickSetup() {
  const unnamed = players.filter((p) => !p.name && p.lm && p.active);
  const named = players.filter((p) => p.name && p.active);
  const aliasesReady = areHandAliasesReady(handAliases);
  const phase = speech.getPhase();
  btnStart.disabled = named.length < 1 || unnamed.length > 0 || !aliasesReady;

  const needInput =
    phase === "degraded" || unnamed.length > 0 || (!aliasesReady && named.length > 0);
  if (needInput) {
    nameInputPanel.style.display = "flex";
    if (named.length > 0 && unnamed.length === 0 && !aliasesReady) {
      nameInput.placeholder = "左手OO 右手XX（如：左手沒有 右手完成）";
    } else if (phase === "degraded" && unnamed.length === 0) {
      nameInput.placeholder = "偵測到人後，在這裡輸入名字";
    } else {
      nameInput.placeholder =
        phase === "degraded" ? "語音不可用，輸入名字後按 Enter" : "輸入名字後按 Enter";
    }
  } else {
    nameInputPanel.style.display = "none";
  }

  if (phase === "name" || phase === "alias" || calibratingId !== null) {
    updateHoldCue(0, "");
    return;
  }

  const raised = unnamed.filter((p) => p.lm && hasHandRaised(p.lm));
  const now = performance.now();
  let candidate = raised.find((p) => p.id === raisePlayerId) || null;
  if (!candidate && raised.length === 1) candidate = raised[0];

  if (candidate) {
    if (candidate.id !== raisePlayerId) {
      raisePlayerId = candidate.id;
      raiseStartAt = now;
    }
    lowerSince = null;
    const ratio = holdProgress(now, raiseStartAt, RAISE_HOLD_MS);
    updateHoldCue(ratio, `保持舉手 ${Math.round(ratio * 100)}%`);
    showStatus(`偵測到舉手，保持 ${Math.round(ratio * 100)}% 後開始聽名字`);
    if (now - raiseStartAt >= RAISE_HOLD_MS) {
      const pid = raisePlayerId;
      clearDebounce();
      startListening(pid);
    }
    return;
  }

  updateHoldCue(0, "");
  if (raisePlayerId !== null) {
    const tracked = players.find((p) => p.id === raisePlayerId);
    const handExplicitlyDown = tracked?.lm && !hasHandRaised(tracked.lm);
    if (!tracked || !tracked.active) clearDebounce();
    else if (handExplicitlyDown) {
      if (lowerSince == null) lowerSince = now;
      if (now - lowerSince >= LOWER_GRACE_MS) clearDebounce();
    }
  }

  if (raised.length > 1) {
    showStatus("一次一個人舉手！");
  } else if (unnamed.length > 0) {
    if (raisePlayerId === null) {
      showStatus(
        phase === "degraded"
          ? `還有 ${unnamed.length} 人未命名。請在下方輸入名字。`
          : `還有 ${unnamed.length} 人未命名，請舉手並保持，再說你的名字`,
      );
    }
  } else if (named.length > 0 && !aliasesReady) {
    if (phase === "degraded") {
      showStatus("請在下方輸入「左手OO 右手XX」。代名詞只改口令稱呼。");
      return;
    }
    showStatus("尚未設定共用代名詞，請舉手說「左手XX」或「右手OO」");
    const raisedNamed = named.filter((p) => p.lm && hasHandRaised(p.lm));
    if (raisedNamed.length === 1) {
      const person = raisedNamed[0];
      calibratingId = person.id;
      calibratingPlayer = person;
      speech.stop();
      showCalHint();
      speak(`${person.name}，請設定共用代名詞。可以說左手加名字，或一次說左手和右手。`).then(() => {
        if (state === S.SETUP && calibratingPlayer?.id === person.id) speech.startAlias(person.id);
      });
    } else if (raisedNamed.length > 1) {
      showStatus("請一次一位玩家舉手設定共用代名詞");
    }
  } else if (named.length >= 1) {
    showStatus(`${named.length} 人已就緒，可以開始！也可說「開始遊戲」。`);
  } else {
    showStatus(phase === "degraded" ? "請站到鏡頭前，再用輸入框報名。" : "請站到鏡頭前...");
  }
}

function startListening(playerId) {
  if (speech.getPhase() === "degraded") {
    showStatus("請在下方輸入名字。");
    revealManualInput();
    return;
  }
  listeningId = playerId;
  speech.startName(playerId);
  if (speech.getPhase() === "degraded") {
    listeningId = null;
    return;
  }
  showStatus("🎤 請說出你的名字...");
}

function assignName(playerId, name) {
  const player = players.find((p) => p.id === playerId);
  listeningId = null;
  speech.stop();
  if (player && !player.name && name) {
    player.name = name;
    playSound("success");
    showStatus(`${name} 已完成命名`);
    nameInput.value = "";
  }
  if (state === S.SETUP) speech.startTrigger();
}

function submitNameInput() {
  if (state !== S.SETUP) return;
  const text = nameInput.value.trim();
  if (!text) return;
  const unnamed = players.filter((p) => !p.name && p.active);
  const named = players.filter((p) => p.name && p.active);
  if (unnamed.length > 0) {
    const target =
      (listeningId != null && unnamed.find((p) => p.id === listeningId)) ||
      unnamed.find((p) => p.lm) ||
      unnamed[0];
    nameInput.value = "";
    assignName(target.id, text);
    return;
  }
  if (!areHandAliasesReady(handAliases) && named.length > 0) {
    nameInput.value = "";
    processManualObjectInput(named[0], text);
  }
}

function processManualObjectInput(player, input) {
  const { leftAlias, rightAlias } = parseManualObjectInput(input);
  if (!leftAlias || !rightAlias) {
    playSound("fail");
    showStatus("格式錯誤，請同時包含左手與右手代名詞");
    return;
  }
  const person = players.find((p) => p.id === player.id);
  if (!person?.lm) {
    playSound("fail");
    showStatus("找不到該玩家位置，請站在畫面中再送出");
    return;
  }
  const leftColor = sampleWristColorSide(person.lm, "left");
  const rightColor = sampleWristColorSide(person.lm, "right");
  if (!leftColor || !rightColor) {
    playSound("fail");
    showStatus("找不到手部位置，請確認雙手在鏡頭內");
    return;
  }
  rememberColor(leftAlias, leftColor);
  rememberColor(rightAlias, rightColor);
  handAliases.left = leftAlias;
  handAliases.right = rightAlias;
  playSound("success");
  const message = `已記錄：左手「${leftAlias}」、右手「${rightAlias}」。這只會改變口令稱呼。`;
  showStatus(message);
  finishCalibration();
  void speak(message);
}

function rememberColor(name, color) {
  const idx = colorObjects.findIndex((obj) => obj.name === name);
  const next = { name, ...color };
  if (idx >= 0) colorObjects[idx] = next;
  else colorObjects.push(next);
}

async function applySpokenAliases(player, text) {
  const { leftAlias, rightAlias } = extractHandAliases(text);
  if (!leftAlias && !rightAlias) {
    playSound("fail");
    await speak("請說「左手」或「右手」加代名詞，例如左手沒有、右手完成");
    if (state === S.SETUP && calibratingId === player.id) speech.startAlias(player.id);
    return;
  }
  const person = players.find((p) => p.id === player.id);
  if (!person?.lm) {
    playSound("fail");
    showStatus("找不到手部位置，請確認雙手在鏡頭內");
    if (state === S.SETUP && calibratingId === player.id) speech.startAlias(player.id);
    return;
  }

  const saved = [];
  if (leftAlias) {
    const color = sampleWristColorSide(person.lm, "left");
    if (color) {
      rememberColor(leftAlias, color);
      handAliases.left = leftAlias;
      saved.push(`左手「${leftAlias}」`);
    }
  }
  if (rightAlias) {
    const color = sampleWristColorSide(person.lm, "right");
    if (color) {
      rememberColor(rightAlias, color);
      handAliases.right = rightAlias;
      saved.push(`右手「${rightAlias}」`);
    }
  }
  if (saved.length === 0) {
    playSound("fail");
    await speak("找不到對應手部位置，請把手放進畫面再說一次");
    if (state === S.SETUP && calibratingId === player.id) speech.startAlias(player.id);
    return;
  }

  playSound("success");
  const done = areHandAliasesReady(handAliases);
  const message = done
    ? `已記錄${saved.join("、")}，共用設定完成。代名詞只改口令稱呼。`
    : `已記錄${saved.join("、")}，請繼續設定另一隻手`;
  showStatus(message);
  showCalHint();
  await speak(message);
  if (done) finishCalibration();
  else if (state === S.SETUP && calibratingId === player.id) speech.startAlias(player.id);
}

function retryAlias(playerId, gotResult) {
  const player = players.find((p) => p.id === playerId);
  if (!player) return;
  if (!shouldRetryCalibrationListening({ state, calibratingId, playerId, gotResult })) return;
  const delay = getCalibrationStrategy(navigator.userAgent).retryDelay;
  setTimeout(() => {
    if (
      shouldRetryCalibrationListening({
        state,
        calibratingId,
        playerId,
        gotResult: false,
      })
    ) {
      showStatus(`🎤 ${player.name || "玩家"}：沒聽清楚，請再說一次`);
      speech.startAlias(playerId);
    }
  }, delay);
}

function sampleRegion(pt) {
  if (!pt) return null;
  sampleCanvas.width = video.videoWidth || 1280;
  sampleCanvas.height = video.videoHeight || 720;
  sampleCtx.drawImage(video, 0, 0);
  const cx = Math.round(pt.x * sampleCanvas.width);
  const cy = Math.round(pt.y * sampleCanvas.height);
  const radius = 20;
  const imageData = sampleCtx.getImageData(
    Math.max(0, cx - radius),
    Math.max(0, cy - radius),
    radius * 2,
    radius * 2,
  );
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;
  for (let i = 0; i < imageData.data.length; i += 4) {
    totalR += imageData.data[i];
    totalG += imageData.data[i + 1];
    totalB += imageData.data[i + 2];
    count += 1;
  }
  return count ? { r: totalR / count, g: totalG / count, b: totalB / count } : null;
}

function sampleWristColorSide(lm, side) {
  const wrist = side === "left" ? lm[IDX.L_WRIST] : lm[IDX.R_WRIST];
  return sampleRegion(wrist);
}

function sampleWristColor(lm) {
  const points = [];
  if (isWristUp(lm, "left")) points.push(lm[IDX.L_WRIST]);
  if (isWristUp(lm, "right")) points.push(lm[IDX.R_WRIST]);
  if (!points.length && lm[IDX.L_WRIST]) points.push(lm[IDX.L_WRIST]);
  if (!points.length && lm[IDX.R_WRIST]) points.push(lm[IDX.R_WRIST]);
  if (!points.length) return null;
  const colors = points.map((pt) => sampleRegion(pt)).filter(Boolean);
  if (!colors.length) return null;
  return {
    r: colors.reduce((sum, c) => sum + c.r, 0) / colors.length,
    g: colors.reduce((sum, c) => sum + c.g, 0) / colors.length,
    b: colors.reduce((sum, c) => sum + c.b, 0) / colors.length,
  };
}

function colorDist(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function detectHeldObject(lm) {
  if (!colorObjects.length) return null;
  const color = sampleWristColor(lm);
  if (!color) return null;
  let best = null;
  let bestDist = COLOR_THRESHOLD;
  for (const obj of colorObjects) {
    const dist = colorDist(color, obj);
    if (dist < bestDist) {
      bestDist = dist;
      best = obj;
    }
  }
  return best ? best.name : null;
}

function getDetectedObjectTag(player) {
  const now = performance.now();
  if (now - player.lastObjectSampleAt < OBJECT_TAG_INTERVAL_MS) {
    return player.lastDetectedObject;
  }
  const obj = detectHeldObject(player.lm);
  player.lastDetectedObject = obj;
  player.lastObjectSampleAt = now;
  return obj;
}

function showCalHint() {
  const examples = [];
  if (!handAliases.left) examples.push("左手番茄");
  if (!handAliases.right) examples.push("右手手機");
  if (!examples.length) {
    calHintEl.style.display = "none";
    return;
  }
  calExamplesEl.innerHTML = examples
    .map((label) => `<div class="cal-chip">${label}</div>`)
    .join("");
  calHintEl.style.display = "flex";
}

function finishCalibration() {
  calibratingId = null;
  calibratingPlayer = null;
  calHintEl.style.display = "none";
  if (state === S.SETUP && speech.getPhase() !== "degraded") speech.startTrigger();
}

function isSetupReadyToStart() {
  const named = players.filter((p) => p.name && p.active);
  return named.length >= 1 && areHandAliasesReady(handAliases);
}

function clearResultWait() {
  if (cancelResult) cancelResult();
  cancelResult = null;
  resultPanel.style.display = "none";
}

function armResult(after) {
  clearResultWait();
  let settled = false;
  let timer = null;
  const cleanup = () => {
    resultPanel.onclick = null;
    document.removeEventListener("keydown", onKey);
  };
  const go = () => {
    if (settled) return;
    settled = true;
    cleanup();
    clearTimeout(timer);
    resultPanel.style.display = "none";
    after();
  };
  const onKey = (event) => {
    if (!event.key) return;
    if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
      event.preventDefault();
      go();
    }
  };
  resultPanel.style.display = "flex";
  resultPanel.onclick = go;
  document.addEventListener("keydown", onKey);
  timer = setTimeout(go, RESULT_MS);
  cancelResult = () => {
    if (settled) return;
    settled = true;
    cleanup();
    clearTimeout(timer);
    resultPanel.style.display = "none";
  };
}

function startGame() {
  if (state !== S.SETUP) return;
  if (!isSetupReadyToStart()) {
    showStatus("尚未完成共用代名詞：請先設定左手與右手");
    return;
  }
  playSound("button");
  round = 0;
  lastCmdIdx = -1;
  requiredState = emptyRequiredState();
  for (const player of players) {
    if (!player.name) player.active = false;
  }
  initialPlayerCount = players.filter((p) => p.active).length;
  setPhase(S.GAMING);
  finishCalibration();
  speech.stop();
  clearDebounce();
  listeningId = null;
  btnStart.style.display = "none";
  btnManualInput.style.display = "none";
  nameInputPanel.style.display = "none";
  nameInput.value = "";
  btnPause.style.display = "inline-block";
  btnReset.style.display = "inline-block";
  btnSettings.style.display = "none";
  settingsPanel.style.display = "none";
  hideStatus();
  audio.startBgm(() => round);
  nextRound();
}

function nextRound() {
  round += 1;
  timerTotal = Math.max(
    audioSettings.minRoundSec,
    Math.round(MAX_ROUND_SEC * 0.8 ** (round - 1) * 10) / 10,
  );
  let idx = lastCmdIdx;
  do {
    idx = Math.floor(Math.random() * COMMANDS.length);
  } while (idx === lastCmdIdx && COMMANDS.length > 1);
  lastCmdIdx = idx;
  const command = COMMANDS[idx];
  requiredState = applyCommand(requiredState, command);
  const spoken = generateCommandText({
    cmd: command,
    round,
    handAliases,
    raisePhrases,
    lowerPhrases,
    lastRaiseIdx,
    lastLowerIdx,
  });
  lastRaiseIdx = spoken.lastRaiseIdx;
  lastLowerIdx = spoken.lastLowerIdx;

  const plan = planRoundStart();
  roundBadge.textContent = `第 ${round} 回合`;
  if (plan.showHudImmediately) {
    cmdHud.textContent = spoken.text;
    cmdHud.style.display = "block";
    cmdHud.classList.remove("pop");
    void cmdHud.offsetWidth;
    cmdHud.classList.add("pop");
    requiredHud.textContent = formatRequiredState(requiredState, handAliases);
    requiredHud.style.display = "block";
  }
  if (plan.startTimerImmediately) beginTimer();
  const utterance = speak(spoken.text);
  if (plan.awaitSpeech) return utterance;
  return null;
}

const COMMANDS = [
  { set: { left: "up" } },
  { set: { right: "up" } },
  { set: { left: "up", right: "up" } },
  { set: { left: "down", right: "down" } },
  { set: { left: "down" } },
  { set: { right: "down" } },
  { set: { left: "up", right: "down" } },
  { set: { left: "down", right: "up" } },
];

function beginTimer() {
  countdownBeeped = false;
  timerEnd = performance.now() + timerTotal * 1000;
  timerWrap.style.display = "flex";
  timerWrap.classList.remove("urgent");
  if (rafTimer) cancelAnimationFrame(rafTimer);
  countdownTick();
}

function countdownTick() {
  if (state !== S.GAMING) return;
  const remaining = Math.max(0, timerEnd - performance.now());
  const pct = timerTotal > 0 ? remaining / (timerTotal * 1000) : 0;
  timerNum.textContent = `${(remaining / 1000).toFixed(1)}s`;
  timerFill.style.width = `${(pct * 100).toFixed(1)}%`;
  timerWrap.classList.toggle("urgent", remaining <= 1000);
  if (!countdownBeeped && remaining <= 1000 && remaining > 0) {
    countdownBeeped = true;
    playSound("countdown");
  }
  if (remaining <= 0) {
    evaluateRound();
    return;
  }
  rafTimer = requestAnimationFrame(countdownTick);
}

function evaluateRound() {
  if (rafTimer) {
    cancelAnimationFrame(rafTimer);
    rafTimer = null;
  }
  timerWrap.style.display = "none";
  const now = performance.now();
  const eliminated = [];
  for (const player of players.filter((p) => p.active)) {
    const hasLandmarks = Boolean(player.lm);
    const compliant = hasLandmarks && checkCompliance(player.lm, requiredState);
    if (shouldEliminate({ hasLandmarks, compliant })) {
      player.active = false;
      player.eliminatedRound = round;
      player.outFlashUntil = now + 1000;
      eliminated.push(player.name || "未命名");
    } else {
      player.glowUntil = now + 1000;
    }
  }
  const survive = players.filter((p) => p.active);
  setPhase(S.RESULT);
  if (eliminated.length > 0) {
    playSound("eliminate");
    flash("eliminate");
    resultTitle.textContent = "❌ 本回合淘汰";
    resultNames.textContent = eliminated.join("、");
    resultRemain.textContent = `剩餘 ${survive.length} 人存活`;
    void speak(`${eliminated.join("、")} 被淘汰`);
    armResult(() => afterResult(survive));
    return;
  }
  playSound("allclear");
  flash("survive");
  showStatus(`全員過關！${survive.length} 人繼續`);
  clearTimeout(allClearTimer);
  allClearTimer = setTimeout(() => {
    if (statusEl.textContent.startsWith("全員過關")) hideStatus();
  }, 1200);
  afterResult(survive);
}

function afterResult(survive) {
  if (isGameOver(initialPlayerCount, survive.length)) showWinner(survive[0] || null);
  else {
    setPhase(S.GAMING);
    nextRound();
  }
}

function showWinner(player) {
  clearResultWait();
  setPhase(S.WINNER);
  audio.stopBgm();
  speech.stop();
  window.speechSynthesis?.cancel();
  btnSettings.style.display = "none";
  btnManualInput.style.display = "none";
  nameInputPanel.style.display = "none";
  btnPause.style.display = "none";
  settingsPanel.style.display = "none";
  pausePanel.style.display = "none";
  timerWrap.style.display = "none";
  winnerPanel.style.display = "flex";
  renderWinnerBoard(players.filter((p) => p.name));
  flash("win");
  playSound("win");
  spawnConfetti();
  if (player) {
    winnerName.textContent = player.name || "神秘勝利者";
    void speak(`恭喜 ${player.name || "神秘勝利者"} 獲得最終勝利！`);
  } else {
    winnerName.textContent = "無人倖存";
    void speak("所有人一起被淘汰！沒有勝利者！");
  }
}

function renderWinnerBoard(listed = players) {
  winnerRounds.replaceChildren();
  const entries = buildWinnerRoundEntries(listed, round);
  if (entries.length === 0) {
    winnerRounds.textContent = "尚無玩家資料";
    return;
  }
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = `board-row ${entry.winner ? "winner" : "out"}`;
    row.textContent = entry.text;
    winnerRounds.appendChild(row);
  }
}

function spawnConfetti() {
  document.querySelectorAll(".confetti").forEach((node) => node.remove());
  const colors = ["#ffd700", "#ff5a7a", "#3dff9a", "#7ec8ff", "#fff"];
  for (let i = 0; i < 14; i++) {
    const bit = document.createElement("span");
    bit.className = "confetti";
    bit.style.left = `${8 + Math.random() * 84}%`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDelay = `${Math.random() * 0.6}s`;
    bit.style.animationDuration = `${2.2 + Math.random()}s`;
    winnerPanel.appendChild(bit);
  }
}

function enterSetup() {
  playSound("button");
  idlePanel.style.display = "none";
  setPhase(S.SETUP);
  btnStart.style.display = "";
  btnReset.style.display = "inline-block";
  btnManualInput.style.display = speech.getPhase() === "degraded" ? "inline-block" : "none";
  btnSettings.style.display = "block";
  settingsPanel.style.display = "none";
  showStatus("請站到鏡頭前，舉手報名或直接輸入名字");
  void speak("請站到鏡頭前，舉手或輸入名字完成報名");
  speech.startTrigger();
}

function resetAll() {
  if (rafTimer) cancelAnimationFrame(rafTimer);
  rafTimer = null;
  clearTimeout(allClearTimer);
  clearResultWait();
  clearDebounce();
  finishCalibration();
  speech.stop();
  listeningId = null;
  window.speechSynthesis?.cancel();
  players = [];
  nextId = 0;
  round = 0;
  lastCmdIdx = -1;
  requiredState = emptyRequiredState();
  colorObjects.length = 0;
  handAliases.left = null;
  handAliases.right = null;
  initialPlayerCount = 0;
  audio.stopBgm();
  setPhase(S.SETUP);
  idlePanel.style.display = "none";
  winnerPanel.style.display = "none";
  resultPanel.style.display = "none";
  pausePanel.style.display = "none";
  timerWrap.style.display = "none";
  btnStart.style.display = "";
  btnStart.disabled = true;
  btnManualInput.style.display = speech.getPhase() === "degraded" ? "inline-block" : "none";
  nameInputPanel.style.display = "none";
  nameInput.value = "";
  btnPause.style.display = "none";
  btnReset.style.display = "inline-block";
  btnSettings.style.display = "block";
  settingsPanel.style.display = "none";
  document.querySelectorAll(".confetti").forEach((node) => node.remove());
  playSound("button");
  showStatus("已重設，請輸入名字或舉手報名");
  if (speech.getPhase() !== "degraded") speech.startTrigger();
}

function pauseGame() {
  if (state !== S.GAMING) return;
  playSound("button");
  pausedFromState = state;
  if (rafTimer) {
    cancelAnimationFrame(rafTimer);
    rafTimer = null;
  }
  pausedTimerRemaining = Math.max(0, timerEnd - performance.now());
  setPhase(S.PAUSED);
  pausePanel.style.display = "flex";
  window.speechSynthesis?.pause();
}

function resumeGame() {
  if (state !== S.PAUSED) return;
  playSound("button");
  pausePanel.style.display = "none";
  setPhase(pausedFromState || S.GAMING);
  pausedFromState = null;
  if (state === S.GAMING && pausedTimerRemaining > 0) {
    timerEnd = performance.now() + pausedTimerRemaining;
    countdownTick();
  }
  window.speechSynthesis?.resume();
}

function showTutorial() {
  playSound("button");
  tutorialPanel.style.display = "flex";
}

function closeTutorial() {
  playSound("button");
  tutorialPanel.style.display = "none";
}

function initCsvEditor() {
  const taRaise = document.getElementById("csv-raise");
  const taLower = document.getElementById("csv-lower");
  const msg = document.getElementById("csv-msg");
  const difficulty = document.getElementById("phrase-difficulty");
  const fill = () => {
    taRaise.value = raisePhrases.join("\n");
    taLower.value = lowerPhrases.join("\n");
  };
  fill();
  difficulty.value = activeDifficulty;
  difficulty.onchange = () => {
    const mode = PHRASE_POOLS[difficulty.value] ? difficulty.value : "chaotic";
    activeDifficulty = mode;
    raisePhrases = [...PHRASE_POOLS[mode].raise];
    lowerPhrases = [...PHRASE_POOLS[mode].lower];
    lastRaiseIdx = -1;
    lastLowerIdx = -1;
    fill();
    msg.style.color = "#ffd700";
    msg.textContent = mode === "simple" ? "已換成單純句型" : "已換成混沌句型";
  };
  document.getElementById("btn-csv-apply").onclick = () => {
    const raise = taRaise.value.split("\n").map((line) => line.trim()).filter(Boolean);
    const lower = taLower.value.split("\n").map((line) => line.trim()).filter(Boolean);
    if (raise.length === 0 || lower.length === 0) {
      msg.style.color = "#ff4444";
      msg.textContent = "兩欄都不能為空！";
      return;
    }
    raisePhrases = raise;
    lowerPhrases = lower;
    lastRaiseIdx = -1;
    lastLowerIdx = -1;
    msg.style.color = "#00ff88";
    msg.textContent = `已套用（舉起 ${raise.length} 條 / 放下 ${lower.length} 條）`;
  };
  document.getElementById("btn-csv-reset").onclick = () => {
    const pool = PHRASE_POOLS[activeDifficulty];
    raisePhrases = [...pool.raise];
    lowerPhrases = [...pool.lower];
    lastRaiseIdx = -1;
    lastLowerIdx = -1;
    fill();
    msg.style.color = "#aaa";
    msg.textContent = "已恢復此難度的預設句子";
  };
}

function initSettingsPanel() {
  const bgmSlider = document.getElementById("bgm-volume");
  const ttsSlider = document.getElementById("tts-volume");
  const poseSlider = document.getElementById("pose-confidence");
  const minRoundSlider = document.getElementById("min-round-sec");
  const fpsSlider = document.getElementById("detect-fps");
  const bgmValue = document.getElementById("bgm-volume-value");
  const ttsValue = document.getElementById("tts-volume-value");
  const poseValue = document.getElementById("pose-confidence-value");
  const minRoundValue = document.getElementById("min-round-sec-value");
  const fpsValue = document.getElementById("detect-fps-value");

  const syncBgm = (percent) => {
    audioSettings.bgmVolume = (percent / 100) * 1.2;
    bgmValue.textContent = `${percent}%`;
    audio.setUserGain(audioSettings.bgmVolume);
  };
  const syncTts = (percent) => {
    audioSettings.ttsVolume = percent / 100;
    ttsValue.textContent = `${percent}%`;
  };
  const syncPose = (value) => {
    audioSettings.poseConfidence = value / 100;
    poseValue.textContent = String(value);
  };
  const syncMinRound = (value) => {
    audioSettings.minRoundSec = value / 10;
    minRoundValue.textContent = `${audioSettings.minRoundSec.toFixed(1)}s`;
  };
  const syncFps = (fps) => {
    DETECT_INTERVAL_MS = Math.round(1000 / fps);
    fpsValue.textContent = `${fps}fps`;
  };

  bgmSlider.value = String(Math.round((audioSettings.bgmVolume / 1.2) * 100));
  ttsSlider.value = String(Math.round(audioSettings.ttsVolume * 100));
  poseSlider.value = String(Math.round(audioSettings.poseConfidence * 100));
  minRoundSlider.value = String(Math.round(audioSettings.minRoundSec * 10));
  fpsSlider.value = String(Math.round(1000 / DETECT_INTERVAL_MS));
  document.getElementById("device-label").textContent = DEVICE_DEFAULTS.label;
  syncBgm(Number(bgmSlider.value));
  syncTts(Number(ttsSlider.value));
  syncPose(Number(poseSlider.value));
  syncMinRound(Number(minRoundSlider.value));
  syncFps(Number(fpsSlider.value));
  bgmSlider.oninput = () => syncBgm(Number(bgmSlider.value));
  ttsSlider.oninput = () => syncTts(Number(ttsSlider.value));
  poseSlider.oninput = () => syncPose(Number(poseSlider.value));
  minRoundSlider.oninput = () => syncMinRound(Number(minRoundSlider.value));
  fpsSlider.oninput = () => syncFps(Number(fpsSlider.value));

  btnSettings.onclick = (event) => {
    event.stopPropagation();
    playSound("button");
    const opened = settingsPanel.style.display !== "none";
    settingsPanel.style.display = opened ? "none" : "block";
  };
  document.addEventListener("click", (event) => {
    if (
      settingsPanel.style.display !== "none" &&
      !settingsPanel.contains(event.target) &&
      !btnSettings.contains(event.target)
    ) {
      settingsPanel.style.display = "none";
    }
  });
  settingsPanel.onclick = (event) => event.stopPropagation();
}

function initNetworkMonitor() {
  window.addEventListener("offline", () => {
    networkWarning.style.display = "block";
    if (state === S.GAMING) pauseGame();
  });
  window.addEventListener("online", () => {
    networkWarning.style.display = "none";
  });
}

async function init() {
  setLoad(8, "camera", "正在啟動攝影機", "需要攝影機權限。請按允許。");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: 1280, height: 720 },
      audio: false,
    });
    video.srcObject = stream;
    await new Promise((resolve) => {
      video.onloadedmetadata = resolve;
    });
    await video.play();
    setLoad(42, "camera", "攝影機已開啟", "接著載入姿勢模型。");
    document.getElementById("load-step-camera").classList.add("done");
  } catch (error) {
    loadingPanel.style.display = "none";
    alert(`無法存取攝影機：${error.message}\n請使用 localhost 或 HTTPS 開啟本頁面。`);
    return;
  }

  setLoad(58, "model", "正在載入姿勢模型", "優先嘗試 GPU，失敗會自動改用 CPU。");
  try {
    fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    try {
      await buildLandmarker(fileset, "GPU");
      setLoad(88, "model", "模型已用 GPU 載入", "即將可以開始。");
    } catch (gpuError) {
      setLoad(74, "model", "GPU 無法使用，改載入 CPU", gpuError.message || "");
      await buildLandmarker(fileset, "CPU");
      showRuntimeNote("姿勢偵測已改用 CPU（此裝置的 GPU 模式無法使用）。仍可判斷動作，但延遲可能較高。");
    }
  } catch (error) {
    loadingPanel.style.display = "none";
    alert(`姿勢偵測模型載入失敗，請檢查網路連線。\n\n${error.message}`);
    return;
  }

  setLoad(100, "ready", "準備完成", "按「進入遊戲」開始報名。");
  document.getElementById("btn-enter").onclick = enterSetup;
  document.getElementById("btn-again").onclick = resetAll;
  btnStart.onclick = startGame;
  btnReset.onclick = resetAll;
  btnManualInput.onclick = () => {
    revealManualInput();
    nameInput.focus();
  };
  btnNameSubmit.onclick = submitNameInput;
  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitNameInput();
    }
  });
  btnPause.onclick = pauseGame;
  btnResume.onclick = resumeGame;
  btnTutorial.onclick = showTutorial;
  btnCloseTutorial.onclick = closeTutorial;
  initCsvEditor();
  initSettingsPanel();
  initNetworkMonitor();
  window.speechSynthesis?.getVoices();
  window.speechSynthesis?.addEventListener("voiceschanged", () => {
    window.speechSynthesis.getVoices();
  });
  requestAnimationFrame(loop);
  setTimeout(() => {
    loadingPanel.style.display = "none";
  }, 500);
}

init().catch((error) => {
  console.error(error);
  alert(`啟動失敗：${error.message}`);
});
