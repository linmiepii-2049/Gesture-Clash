import {
  S,
  RAISE_MARGIN,
  RAISE_HOLD_MS,
  LOWER_GRACE_MS,
  RESULT_MS,
  TRACK_DIST,
  LOST_GRACE_MS,
  NEW_PLAYER_DIST_X,
  NEW_PLAYER_DIST_Y,
  NEW_PLAYER_COOLDOWN_MS,
  DETECT_MIN_MS,
  MOBILE_CRITICAL_DETECT_MS,
  DESKTOP_CRITICAL_DETECT_MS,
  EVAL_BOOST_WINDOW_MS,
  DETECT_BOOST_FPS_FLOOR,
  CAL_RETRY_DELAY_MS,
  TRIGGER_RESTART_MOBILE_MS,
  TRIGGER_RESTART_DESKTOP_MS,
  IDX,
  MIRROR_HINT,
  ALIAS_NOTE,
  ACCUMULATE_NOTE,
} from "./constants.js";

export {
  S,
  RAISE_MARGIN,
  RAISE_HOLD_MS,
  LOWER_GRACE_MS,
  RESULT_MS,
  TRACK_DIST,
  LOST_GRACE_MS,
  EVAL_BOOST_WINDOW_MS,
  IDX,
  MIRROR_HINT,
  ALIAS_NOTE,
  ACCUMULATE_NOTE,
};

export const PHRASE_POOLS = {
  chaotic: {
    raise: [
      "舉起來",
      "不要放下來",
      "不要不舉起來",
      "可以舉起來",
      "不可以放下來",
      "不可以沒舉起來",
      "不舉起來算輸",
      "放下來算輸",
      "舉起來算贏",
      "不放下來算贏",
    ],
    lower: [
      "放下來",
      "不要舉起來",
      "不要不放下來",
      "可以放下來",
      "不可以舉起來",
      "不可以不放下來",
      "不放下來算輸",
      "舉起來算輸",
      "放下來算贏",
      "不舉起來算贏",
    ],
  },
  simple: {
    raise: ["舉起來", "請舉高", "手舉起來"],
    lower: ["放下來", "請放低", "手放下來"],
  },
};

export function isMobileDevice(userAgent) {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    userAgent || "",
  );
}

export function calibrationStrategyFor(isMobile) {
  return {
    continuous: !isMobile,
    retryDelay: isMobile ? 120 : CAL_RETRY_DELAY_MS,
  };
}

export function getCalibrationStrategy(userAgent) {
  return calibrationStrategyFor(isMobileDevice(userAgent));
}

export function voiceTriggerRestartDelayMs(isMobile) {
  return isMobile ? TRIGGER_RESTART_MOBILE_MS : TRIGGER_RESTART_DESKTOP_MS;
}

export function canRegisterNewPlayer(existingPlayers, nx, ny, now, lastCreateAt) {
  const closeToExisting = existingPlayers.some(
    (p) =>
      Math.abs(p.lastX - nx) < NEW_PLAYER_DIST_X &&
      Math.abs(p.lastY - ny) < NEW_PLAYER_DIST_Y,
  );
  const cooldownPassed = now - lastCreateAt > NEW_PLAYER_COOLDOWN_MS;
  return !closeToExisting && cooldownPassed;
}

export function isGameOver(initialPlayerCount, surviveCount) {
  if (initialPlayerCount <= 1) return surviveCount === 0;
  return surviveCount <= 1;
}

export function shouldEliminate({ hasLandmarks, compliant }) {
  if (!hasLandmarks) return true;
  return !compliant;
}

export function areHandAliasesReady(aliases) {
  return Boolean(aliases?.left && aliases?.right);
}

export function parseObjectUtterance(text) {
  const normalized = String(text || "").replace(/\s+/g, "").trim();
  const leftIdx = normalized.indexOf("左手");
  const rightIdx = normalized.indexOf("右手");

  if (leftIdx === -1 && rightIdx === -1) {
    return { side: null, alias: normalized };
  }

  const isLeftFirst = leftIdx !== -1 && (rightIdx === -1 || leftIdx <= rightIdx);
  const side = isLeftFirst ? "left" : "right";
  const marker = isLeftFirst ? "左手" : "右手";
  const otherMarker = isLeftFirst ? "右手" : "左手";
  const markerIdx = isLeftFirst ? leftIdx : rightIdx;

  let aliasRaw = normalized.slice(markerIdx + marker.length);
  const otherIdx = aliasRaw.indexOf(otherMarker);
  if (otherIdx >= 0) aliasRaw = aliasRaw.slice(0, otherIdx);

  const alias = aliasRaw
    .replace(/^[是叫為]/, "")
    .replace(/[，。,.!！?？；;:：]/g, "")
    .trim();

  return { side, alias };
}

export function parseManualObjectInput(input) {
  const normalized = String(input || "").replace(/\s+/g, "");
  const leftIdx = normalized.indexOf("左手");
  const rightIdx = normalized.indexOf("右手");

  let leftAlias = null;
  let rightAlias = null;

  if (leftIdx !== -1) {
    const leftEnd = rightIdx !== -1 && rightIdx > leftIdx ? rightIdx : normalized.length;
    leftAlias = normalized.slice(leftIdx + 2, leftEnd).trim();
  }
  if (rightIdx !== -1) {
    const rightEnd = leftIdx !== -1 && leftIdx > rightIdx ? leftIdx : normalized.length;
    rightAlias = normalized.slice(rightIdx + 2, rightEnd).trim();
  }

  return { leftAlias, rightAlias };
}

/** Voice may name one side or both. Manual one-liners use the same both-sides parse. */
export function extractHandAliases(text) {
  const both = parseManualObjectInput(text);
  if (both.leftAlias && both.rightAlias) return both;
  const one = parseObjectUtterance(text);
  if (one.side === "left" && one.alias) {
    return { leftAlias: one.alias, rightAlias: null };
  }
  if (one.side === "right" && one.alias) {
    return { leftAlias: null, rightAlias: one.alias };
  }
  return { leftAlias: null, rightAlias: null };
}

export function shouldRestartVoiceTrigger(state, listeningId, calibratingId) {
  return state === S.SETUP && listeningId === null && calibratingId === null;
}

export function shouldRetryCalibrationListening({
  state,
  calibratingId,
  playerId,
  gotResult,
}) {
  return state === S.SETUP && calibratingId === playerId && !gotResult;
}

export function buildWinnerRoundEntries(players, round) {
  return players.map((p, idx) => {
    const name = p.name || `玩家${idx + 1}`;
    if (p.active) {
      return {
        name,
        winner: true,
        text: `${name}：存活至第 ${round} 回合（勝利）`,
      };
    }
    const outRound = Number.isFinite(p.eliminatedRound) ? p.eliminatedRound : "?";
    return {
      name,
      winner: false,
      round: outRound,
      text: `${name}：第 ${outRound} 回合淘汰`,
    };
  });
}

export function buildWinnerRoundBoard(players, round) {
  if (players.length === 0) return "尚無玩家資料";
  return buildWinnerRoundEntries(players, round)
    .map((entry) => entry.text)
    .join("\n");
}

export function isWristUp(lm, side, margin = RAISE_MARGIN) {
  if (!lm) return false;
  const wrist = lm[side === "left" ? IDX.L_WRIST : IDX.R_WRIST];
  const shoulder = lm[side === "left" ? IDX.L_SHOULDER : IDX.R_SHOULDER];
  if (!wrist || !shoulder) return false;
  return wrist.y < shoulder.y - margin;
}

export function hasHandRaised(lm, margin = RAISE_MARGIN) {
  return isWristUp(lm, "left", margin) || isWristUp(lm, "right", margin);
}

export function applyCommand(requiredState, cmd) {
  const prev = requiredState || { left: null, right: null };
  return {
    left: cmd?.set && "left" in cmd.set ? cmd.set.left : prev.left,
    right: cmd?.set && "right" in cmd.set ? cmd.set.right : prev.right,
  };
}

export function checkCompliance(lm, requiredState, margin = RAISE_MARGIN) {
  if (!lm || !requiredState) return false;
  if (requiredState.left === "up" && !isWristUp(lm, "left", margin)) return false;
  if (requiredState.left === "down" && isWristUp(lm, "left", margin)) return false;
  if (requiredState.right === "up" && !isWristUp(lm, "right", margin)) return false;
  if (requiredState.right === "down" && isWristUp(lm, "right", margin)) return false;
  return true;
}

export function formatHandRequirement(pose, alias, fallback) {
  const name = alias || fallback;
  if (pose === "up") return `${name} 舉高`;
  if (pose === "down") return `${name} 放下`;
  return `${name} 不限`;
}

export function formatRequiredState(requiredState, handAliases = {}) {
  const left = formatHandRequirement(requiredState?.left, handAliases.left, "左手");
  const right = formatHandRequirement(
    requiredState?.right,
    handAliases.right,
    "右手",
  );
  return `目前必須狀態：${left}、${right}`;
}

export function holdProgress(now, raiseStartAt, holdMs = RAISE_HOLD_MS) {
  if (raiseStartAt == null || !Number.isFinite(now)) return 0;
  if (holdMs <= 0) return 1;
  return Math.max(0, Math.min(1, (now - raiseStartAt) / holdMs));
}

export function isCriticalDetectMoment({
  state,
  trackingRaise = false,
  calibrating = false,
  remainingMs = null,
}) {
  if (state === S.SETUP && (trackingRaise || calibrating)) return true;
  if (
    state === S.GAMING &&
    Number.isFinite(remainingMs) &&
    remainingMs > 0 &&
    remainingMs <= EVAL_BOOST_WINDOW_MS
  ) {
    return true;
  }
  return false;
}

export function resolveDetectIntervalMs(
  baseMs,
  { critical = false, isMobile = false, fps = 60 } = {},
) {
  const base = Math.max(DETECT_MIN_MS, baseMs);
  if (!critical) return base;
  if (fps > 0 && fps < DETECT_BOOST_FPS_FLOOR) return base;
  const target = isMobile ? MOBILE_CRITICAL_DETECT_MS : DESKTOP_CRITICAL_DETECT_MS;
  return Math.min(base, Math.max(DETECT_MIN_MS, target));
}

export function poseAnchor(lm) {
  const nose = lm?.[IDX.NOSE];
  if (!nose || !Number.isFinite(nose.x) || !Number.isFinite(nose.y)) {
    return { x: 0.5, y: 0.5 };
  }
  const pts = [nose, lm[IDX.L_SHOULDER], lm[IDX.R_SHOULDER], lm[IDX.L_HIP], lm[IDX.R_HIP]]
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  const x = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
  const y = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
  return { x, y };
}

export function assignPoses(players, anchors, trackDist = TRACK_DIST) {
  const pairs = [];
  for (let pi = 0; pi < players.length; pi++) {
    const p = players[pi];
    const predX = p.lastX + (p.vx || 0);
    const predY = p.lastY + (p.vy || 0);
    for (let ai = 0; ai < anchors.length; ai++) {
      const anchor = anchors[ai];
      const d = Math.hypot(predX - anchor.x, (predY - anchor.y) * 0.9);
      if (d < trackDist) pairs.push({ pi, ai, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  const usedP = new Set();
  const usedA = new Set();
  const matches = [];
  for (const pair of pairs) {
    if (usedP.has(pair.pi) || usedA.has(pair.ai)) continue;
    usedP.add(pair.pi);
    usedA.add(pair.ai);
    matches.push(pair);
  }
  return matches;
}

export function smoothVelocity(player, from, to) {
  const rawVx = to.x - from.x;
  const rawVy = to.y - from.y;
  const k = 0.65;
  return {
    vx: (player.vx || 0) * (1 - k) + rawVx * k,
    vy: (player.vy || 0) * (1 - k) + rawVy * k,
  };
}

export function shouldDropLandmarks(lostSince, now, graceMs = LOST_GRACE_MS) {
  if (lostSince == null || !Number.isFinite(lostSince) || !Number.isFinite(now)) {
    return false;
  }
  return now - lostSince >= graceMs;
}

export function handLabel(side, handAliases = {}) {
  const alias = handAliases[side];
  return alias || (side === "left" ? "左手" : "右手");
}

export function pickPhrase(pool, lastIdx, rng = Math.random) {
  if (!pool || pool.length === 0) return { phrase: "", idx: -1 };
  if (pool.length === 1) return { phrase: pool[0], idx: 0 };
  let i = lastIdx;
  let guard = 0;
  do {
    i = Math.floor(rng() * pool.length);
    guard += 1;
  } while (i === lastIdx && guard < 8);
  return { phrase: pool[i], idx: i };
}

export function generateCommandText({
  cmd,
  round,
  handAliases = {},
  raisePhrases,
  lowerPhrases,
  lastRaiseIdx = -1,
  lastLowerIdx = -1,
  rng = Math.random,
}) {
  const upSubjects = [];
  const downSubjects = [];
  if (cmd?.set?.left === "up") upSubjects.push(handLabel("left", handAliases));
  if (cmd?.set?.right === "up") upSubjects.push(handLabel("right", handAliases));
  if (cmd?.set?.left === "down") downSubjects.push(handLabel("left", handAliases));
  if (cmd?.set?.right === "down") downSubjects.push(handLabel("right", handAliases));

  const bothUp = cmd?.set?.left === "up" && cmd?.set?.right === "up";
  const bothDown = cmd?.set?.left === "down" && cmd?.set?.right === "down";
  const upSubj =
    bothUp && upSubjects[0] === "左手" && upSubjects[1] === "右手"
      ? "雙手"
      : upSubjects.join("和");
  const downSubj =
    bothDown && downSubjects[0] === "左手" && downSubjects[1] === "右手"
      ? "雙手"
      : downSubjects.join("和");

  const parts = [];
  let nextRaise = lastRaiseIdx;
  let nextLower = lastLowerIdx;
  if (upSubj) {
    const picked = pickPhrase(raisePhrases, lastRaiseIdx, rng);
    nextRaise = picked.idx;
    parts.push(`${upSubj}${picked.phrase}`);
  }
  if (downSubj) {
    const picked = pickPhrase(lowerPhrases, lastLowerIdx, rng);
    nextLower = picked.idx;
    parts.push(`${downSubj}${picked.phrase}`);
  }
  if (round >= 12 && parts.length === 2 && rng() < 0.5) parts.reverse();
  return { text: parts.join("，"), lastRaiseIdx: nextRaise, lastLowerIdx: nextLower };
}

/** Contract for the round loop: HUD and timer start before TTS finishes. */
export function planRoundStart() {
  return {
    showHudImmediately: true,
    startTimerImmediately: true,
    awaitSpeech: false,
    resultMs: RESULT_MS,
  };
}

export function emptyRequiredState() {
  return { left: null, right: null };
}
