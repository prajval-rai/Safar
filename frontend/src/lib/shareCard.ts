import { MAP_H, MAP_W, percent, statePaths, TOTAL_STATES, type Tier } from "./indiaMap";
import type { ActivityCategory } from "./types";
import { CATEGORY_ICONS } from "./utils";

export interface ShareCardInput {
  name: string;
  username: string;
  visited: string[];
  tier: Tier;
  pins?: { x: number; y: number; verified: boolean; category?: ActivityCategory | null }[];
}

const W = 1080;
const H = 1350; // 4:5 — the tallest ratio Instagram's feed shows uncropped

/** Draws the "my India" card to a PNG. Colours are fixed on purpose: the card should
 *  look the same in every theme, wherever it gets posted. */
export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't draw the share image.");

  // Background: warm paper with a saffron glow behind the map.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#fff4e4");
  bg.addColorStop(1, "#fbe3c6");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 640, 60, W / 2, 640, 620);
  glow.addColorStop(0, "rgba(255,255,255,0.85)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = "#8a3204";
  ctx.font = "800 44px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("SAFAR", 72, 100);
  ctx.textAlign = "right";
  ctx.font = "600 34px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillStyle = "#6b625a";
  ctx.fillText(`@${input.username}`, W - 72, 100);

  ctx.textAlign = "left";
  ctx.fillStyle = "#1c1917";
  ctx.font = "800 64px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText(fit(ctx, `${input.name}'s India`, W - 144), 72, 200);

  // The map
  const visited = new Set(input.visited);
  const boxW = W - 160;
  const boxH = 720;
  const scale = Math.min(boxW / MAP_W, boxH / MAP_H);
  const ox = (W - MAP_W * scale) / 2;
  const oy = 250 + (boxH - MAP_H * scale) / 2;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.lineJoin = "round";
  const paths = statePaths().map((s) => ({ ...s, p: new Path2D(s.d) }));
  // Soft shadow so the whole country lifts off the page.
  ctx.shadowColor = "rgba(138,50,4,0.18)";
  ctx.shadowBlur = 24 / scale;
  ctx.shadowOffsetY = 8 / scale;
  ctx.fillStyle = "#e6d8c4";
  for (const s of paths) ctx.fill(s.p);
  ctx.shadowColor = "transparent";
  for (const s of paths) {
    const done = visited.has(s.name);
    ctx.fillStyle = done ? "#e2761b" : "#efe4d2";
    ctx.strokeStyle = done ? "#e2761b" : "#efe4d2";
    ctx.lineWidth = 1.2 / scale;
    ctx.fill(s.p);
    ctx.stroke(s.p);
  }
  for (const pin of input.pins ?? []) {
    const r = ((pin.verified ? 9 : 7) / scale) * 1.6;
    ctx.beginPath();
    ctx.arc(pin.x, pin.y, r, 0, Math.PI * 2);
    ctx.fillStyle = pin.verified ? "#8a3204" : "#ffffff";
    ctx.fill();
    ctx.lineWidth = 4 / scale;
    ctx.strokeStyle = pin.verified ? "#ffffff" : "#8a3204";
    ctx.stroke();
    // A stop stood at shows what kind of stop it was — same icon set as the app.
    if (pin.verified && pin.category) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${r * 1.5}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
      ctx.fillText(CATEGORY_ICONS[pin.category], pin.x, pin.y);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  }
  ctx.restore();

  // Percentage — the number people screenshot for.
  const count = input.visited.length;
  ctx.textAlign = "left";
  ctx.fillStyle = "#8a3204";
  ctx.font = "800 150px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText(`${percent(count)}%`, 72, 1116);
  const numW = ctx.measureText(`${percent(count)}%`).width;

  ctx.fillStyle = "#1c1917";
  ctx.font = "700 40px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText("of India explored", 72 + numW + 28, 1078);
  ctx.fillStyle = "#6b625a";
  ctx.font = "600 34px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText(`${count} of ${TOTAL_STATES} states & UTs`, 72 + numW + 28, 1124);

  // Tier pill
  const pill = `${input.tier.emoji}  ${input.tier.title}`;
  ctx.font = "800 38px system-ui, -apple-system, 'Segoe UI', sans-serif";
  const pw = ctx.measureText(pill).width + 64;
  roundRect(ctx, 72, 1170, pw, 76, 38);
  ctx.fillStyle = "#8a3204";
  ctx.fill();
  ctx.fillStyle = "#fff4e4";
  ctx.fillText(pill, 104, 1221);

  // Progress bar
  const barX = 72 + pw + 32;
  const barW = W - 72 - barX;
  if (barW > 120) {
    roundRect(ctx, barX, 1196, barW, 24, 12);
    ctx.fillStyle = "rgba(138,50,4,0.15)";
    ctx.fill();
    if (count > 0) {
      roundRect(ctx, barX, 1196, Math.max(24, (barW * count) / TOTAL_STATES), 24, 12);
      ctx.fillStyle = "#e2761b";
      ctx.fill();
    }
  }

  ctx.fillStyle = "#6b625a";
  ctx.font = "600 30px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText("Plan your own Indian journey on Safar", 72, 1300);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't create the image."))), "image/png"),
  );
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 4 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
