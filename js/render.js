import { EDGES, IDX, S } from "./constants.js";
import { isWristUp } from "./rules.js";

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function drawLabel(ctx, x, y, text, color) {
  ctx.font = "bold 26px Microsoft JhengHei, Arial";
  const width = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  roundRectPath(ctx, x - width / 2 - 10, y - 28, width + 20, 34, 7);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(text, x, y);
}

function drawSkeleton(ctx, lm, px, py, { active, leftUp, rightUp, celebrate, eliminated }) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = active ? 0.95 : 0.32;
  ctx.lineWidth = active ? 5 : 2;
  ctx.strokeStyle = eliminated ? "rgba(255,80,80,0.55)" : celebrate ? "#ffd700" : "#3dff9a";
  for (const [a, b] of EDGES) {
    const pa = lm[a];
    const pb = lm[b];
    if (!pa || !pb) continue;
    const va = pa.visibility;
    const vb = pb.visibility;
    if ((va != null && va < 0.3) || (vb != null && vb < 0.3)) continue;
    ctx.beginPath();
    ctx.moveTo(px(pa), py(pa));
    ctx.lineTo(px(pb), py(pb));
    ctx.stroke();
  }
  for (const [index, up] of [
    [IDX.L_WRIST, leftUp],
    [IDX.R_WRIST, rightUp],
  ]) {
    const wrist = lm[index];
    if (!wrist) continue;
    ctx.beginPath();
    ctx.fillStyle = up ? "#ffd700" : "rgba(79,195,247,0.85)";
    ctx.arc(px(wrist), py(wrist), up ? 16 : 8, 0, Math.PI * 2);
    ctx.fill();
    if (up) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,215,0,0.9)";
      ctx.stroke();
    }
  }
  const nose = lm[IDX.NOSE];
  if (nose) {
    ctx.beginPath();
    ctx.fillStyle = active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)";
    ctx.arc(px(nose), py(nose), 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawScene(ctx, canvas, players, view) {
  const width = canvas.width;
  const height = canvas.height;
  const px = (lm) => (1 - lm.x) * width;
  const py = (lm) => lm.y * height;
  const now = view.now || 0;

  for (const player of players) {
    if (!player.lm) continue;
    const leftUp = isWristUp(player.lm, "left");
    const rightUp = isWristUp(player.lm, "right");
    const celebrate = player.glowUntil != null && player.glowUntil > now;
    drawSkeleton(ctx, player.lm, px, py, {
      active: player.active,
      leftUp,
      rightUp,
      celebrate,
      eliminated: !player.active,
    });

    const nose = player.lm[IDX.NOSE];
    if (!nose) continue;
    const hx = px(nose);
    const hy = py(nose) - 50;
    const label = player.name || (view.state === S.SETUP ? "請舉手" : "?");
    const labelColor = player.active ? (player.name ? "#4FC3F7" : "#FFD700") : "#888";
    drawLabel(ctx, hx, hy, label, labelColor);

    if (player.name && view.objectTag) {
      const obj = view.objectTag(player);
      if (obj) {
        const tag = `色 ${obj}`;
        ctx.font = "bold 18px Microsoft JhengHei, Arial";
        const ow = ctx.measureText(tag).width;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        roundRectPath(ctx, hx - ow / 2 - 8, hy + 4, ow + 16, 26, 5);
        ctx.fill();
        ctx.fillStyle = "#FFD700";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(tag, hx, hy + 8);
      }
    }

    if (view.state === S.SETUP && player.id === view.raisePlayerId && view.holdRatio > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(hx, py(nose), 72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(
        hx,
        py(nose),
        72,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * view.holdRatio,
      );
      ctx.stroke();
      ctx.restore();
    }

    if (
      view.state === S.SETUP &&
      (player.id === view.listeningId || player.id === view.calibratingId)
    ) {
      ctx.save();
      ctx.strokeStyle = player.id === view.calibratingId ? "#FFD700" : "#FF4444";
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.arc(hx, py(nose), 78, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
