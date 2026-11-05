/** Timing, pose indices, and detect budgets. Values are the tuned ones (see BEFORE_AFTER.md). */

export const S = {
  IDLE: 0,
  SETUP: 1,
  GAMING: 2,
  RESULT: 3,
  WINNER: 4,
  PAUSED: 5,
};

export const MAX_POSES = 8;
export const MAX_ROUND_SEC = 8;

/** Wrist must sit this far above the shoulder (normalized y, smaller = higher). */
export const RAISE_MARGIN = 0.05;

/** How long a raised hand must hold before name capture. Was 800. */
export const RAISE_HOLD_MS = 450;

/** How long a hand must stay down before the raise timer resets. Was 400. */
export const LOWER_GRACE_MS = 220;

/** Round-result panel duration. Was 3500. Pointer / key can skip sooner. */
export const RESULT_MS = 1800;

/** Nose-x match radius used to be 0.13. Matching is now a 2D body anchor. */
export const TRACK_DIST = 0.28;

/** Keep the last pose this long after a miss so IDs and skeletons don't flicker. Was 0 (cleared immediately). */
export const LOST_GRACE_MS = 450;

export const NEW_PLAYER_DIST_X = 0.16;
export const NEW_PLAYER_DIST_Y = 0.22;
export const NEW_PLAYER_COOLDOWN_MS = 900;

export const OBJECT_TAG_INTERVAL_MS = 220;
export const COLOR_THRESHOLD = 80;
export const CAL_RETRY_DELAY_MS = 280;

/** Never detect faster than this, so a boost cannot pin a weak device at 60fps. */
export const DETECT_MIN_MS = 33;

/** Mobile critical-moment target (~20fps). Desktop target is DETECT_MIN_MS (~30fps). */
export const MOBILE_CRITICAL_DETECT_MS = 50;
export const DESKTOP_CRITICAL_DETECT_MS = 33;

/** Last portion of a round, plus an active setup raise, counts as a critical detect window. */
export const EVAL_BOOST_WINDOW_MS = 1500;

/** Below this rendered fps, skip the detect boost. */
export const DETECT_BOOST_FPS_FLOOR = 18;

export const NAME_LISTEN_WINDOW_MS = 6000;
export const NAME_START_DELAY_MS = 400;
export const ALIAS_START_DELAY_MS = 300;

/** Gap before restarting the "開始遊戲" listener. Stops Chrome error+end double starts. */
export const TRIGGER_RESTART_MOBILE_MS = 350;
export const TRIGGER_RESTART_DESKTOP_MS = 200;

export const IDX = {
  NOSE: 0,
  L_EYE: 2,
  R_EYE: 5,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
};

export const EDGES = [
  [IDX.L_SHOULDER, IDX.R_SHOULDER],
  [IDX.L_SHOULDER, IDX.L_ELBOW],
  [IDX.L_ELBOW, IDX.L_WRIST],
  [IDX.R_SHOULDER, IDX.R_ELBOW],
  [IDX.R_ELBOW, IDX.R_WRIST],
  [IDX.L_SHOULDER, IDX.L_HIP],
  [IDX.R_SHOULDER, IDX.R_HIP],
  [IDX.L_HIP, IDX.R_HIP],
  [IDX.L_HIP, IDX.L_KNEE],
  [IDX.L_KNEE, IDX.L_ANKLE],
  [IDX.R_HIP, IDX.R_KNEE],
  [IDX.R_KNEE, IDX.R_ANKLE],
];

export const TRIGGER_WORDS = ["開始遊戲", "開始", "start"];

export const MIRROR_HINT = "鏡像：你的左手在畫面右側、右手在畫面左側";
export const ALIAS_NOTE =
  "代名詞只改口令稱呼，判定仍看手腕是否高過肩膀，不看道具顏色。";
export const ACCUMULATE_NOTE =
  "姿勢會逐回合累積，之前回合的手勢要繼續保持。";
