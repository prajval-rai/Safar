import QRCode from "qrcode";

import type { CoverKey, ThemeId, TripDetail } from "./types";
import { COVER_LABELS, TRIP_TYPE_LABELS, dateRange, rupees } from "./utils";

const W = 1080;
const H = 1350; // 4:5 — shows uncropped in Instagram's feed and fits a WhatsApp preview

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

interface Palette {
  canvas: string;
  surface: string;
  raised: string;
  line: string;
  ink: string;
  muted: string;
  brand: string;
  brandStrong: string;
  brandBright: string;
  brandSoft: string;
  onBrand: string;
  accent: string;
}

/** The trip's own theme colours, read from the same CSS custom properties the
 *  app uses — so the card always matches the theme the trip wears, and a new
 *  theme added to globals.css needs no change here. Always the light variant:
 *  a shared image shouldn't depend on the sender's dark mode. */
export function themePalette(theme: ThemeId): Palette {
  const probe = document.createElement("div");
  probe.setAttribute("data-theme", theme);
  probe.setAttribute("data-mode", "light");
  probe.style.display = "none";
  document.body.appendChild(probe);
  const css = getComputedStyle(probe);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const palette = {
    canvas: read("--canvas", "#fbf9f6"),
    surface: read("--surface", "#ffffff"),
    raised: read("--raised", "#f4f0ea"),
    line: read("--line", "#e9e3da"),
    ink: read("--ink", "#1c1917"),
    muted: read("--muted", "#6b625a"),
    brand: read("--brand", "#8a3204"),
    brandStrong: read("--brand-strong", "#6b2503"),
    brandBright: read("--brand-bright", "#d9772b"),
    brandSoft: read("--brand-soft", "#f6ebe1"),
    onBrand: read("--on-brand", "#ffffff"),
    accent: read("--accent", "#0f766e"),
  };
  probe.remove();
  return palette;
}

export function inviteLink(code: string): string {
  return `${window.location.origin}/join/${code}`;
}

/** Draws the trip invitation card to a PNG: who's inviting, where, when, who's
 *  going, the invite code and a QR code for the join link. */
export async function renderInviteCard(trip: TripDetail, link: string): Promise<Blob> {
  const p = themePalette(trip.theme);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't draw the invitation.");

  ctx.fillStyle = p.canvas;
  ctx.fillRect(0, 0, W, H);

  // --- Hero: the theme's gradient with a scene for the kind of place -------
  const heroH = 640;
  const hero = ctx.createLinearGradient(0, 0, W, heroH);
  hero.addColorStop(0, p.brandStrong);
  hero.addColorStop(0.55, p.brand);
  hero.addColorStop(1, p.brandBright);
  ctx.fillStyle = hero;
  ctx.fillRect(0, 0, W, heroH);
  drawJali(ctx, heroH);
  drawScene(ctx, trip.cover_key, heroH);

  // Wordmark and the "invited" pill
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText("SAFAR", 72, 104);
  const pillText = "YOU'RE INVITED";
  ctx.font = `800 26px ${FONT}`;
  const pillW = ctx.measureText(pillText).width + 56;
  roundRect(ctx, W - 72 - pillW, 66, pillW, 54, 27);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();
  ctx.fillStyle = p.brand;
  ctx.fillText(pillText, W - 72 - pillW + 28, 102);

  // Who, what, where
  const organiser = trip.created_by.name.split(" ")[0] || trip.created_by.username;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText(`${organiser} is planning a trip — come along!`, 72, 250);

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 84px ${FONT}`;
  const titleLines = wrap(ctx, trip.title, W - 144, 2);
  titleLines.forEach((line, i) => ctx.fillText(line, 72, 352 + i * 92));
  const afterTitle = 352 + (titleLines.length - 1) * 92;

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `600 36px ${FONT}`;
  const where = [trip.destination, trip.region && !trip.destination.includes(trip.region) ? trip.region : ""]
    .filter(Boolean)
    .join(", ");
  ctx.fillText(fit(ctx, `📍 ${where}`, W - 144), 72, afterTitle + 70);

  // --- Details card, overlapping the hero -----------------------------------
  const cardX = 56;
  const cardY = 560;
  const cardW = W - 112;
  const cardH = 430;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.16)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  roundRect(ctx, cardX, cardY, cardW, cardH, 40);
  ctx.fillStyle = p.surface;
  ctx.fill();
  ctx.restore();

  const stops = trip.days.reduce((n, d) => n + d.activities.length, 0);
  const facts: [string, string, string][] = [
    ["📅", "When", dateRange(trip.start_date, trip.end_date)],
    ["⏳", "How long", `${trip.duration_days} ${trip.duration_days === 1 ? "day" : "days"}`],
    ["🧭", "Kind of trip", TRIP_TYPE_LABELS[trip.trip_type] ?? COVER_LABELS[trip.cover_key] ?? "Trip"],
    [
      trip.budget_per_person ? "💰" : "🗺️",
      trip.budget_per_person ? "Budget" : "Plan",
      trip.budget_per_person
        ? `${rupees(trip.budget_per_person)} / person`
        : stops
          ? `${stops} ${stops === 1 ? "stop" : "stops"} planned`
          : "Being planned",
    ],
  ];
  const colW = (cardW - 96) / 2;
  facts.forEach(([icon, label, value], i) => {
    const x = cardX + 48 + (i % 2) * colW;
    const y = cardY + 60 + Math.floor(i / 2) * 124;
    roundRect(ctx, x, y, 76, 76, 22);
    ctx.fillStyle = p.brandSoft;
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `40px ${FONT}`;
    ctx.fillText(icon, x + 38, y + 40);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = p.muted;
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(label, x + 100, y + 30);
    ctx.fillStyle = p.ink;
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText(fit(ctx, value, colW - 116), x + 100, y + 70);
  });

  // Who's going: avatar bubbles plus a count
  const peopleY = cardY + 330;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cardX + 48, peopleY - 36);
  ctx.lineTo(cardX + cardW - 48, peopleY - 36);
  ctx.stroke();
  const shown = trip.members.slice(0, 5);
  shown.forEach((m, i) => {
    const cx = cardX + 84 + i * 52;
    ctx.beginPath();
    ctx.arc(cx, peopleY + 16, 34, 0, Math.PI * 2);
    ctx.fillStyle = p.brandSoft;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = p.surface;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `34px ${FONT}`;
    ctx.fillStyle = p.ink;
    ctx.fillText(m.user.avatar_emoji || "🧳", cx, peopleY + 18);
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const count = trip.members.length;
  const textX = cardX + 84 + shown.length * 52 + 16;
  ctx.fillStyle = p.ink;
  ctx.font = `800 32px ${FONT}`;
  ctx.fillText(`${count} ${count === 1 ? "traveller" : "travellers"} going`, textX, peopleY + 8);
  ctx.fillStyle = p.muted;
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(fit(ctx, `Organised by ${trip.created_by.name}`, cardX + cardW - 48 - textX), textX, peopleY + 44);

  // --- Join: code on the left, QR on the right --------------------------------
  const joinY = 1040;
  const qrSize = 230;
  const qrX = W - 72 - qrSize;
  roundRect(ctx, qrX - 14, joinY - 14, qrSize + 28, qrSize + 28, 28);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  const qr = await qrImage(link, qrSize, p.brandStrong);
  ctx.drawImage(qr, qrX, joinY, qrSize, qrSize);

  ctx.fillStyle = p.muted;
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText("INVITE CODE", 72, joinY + 30);
  const codeW = qrX - 14 - 72 - 40;
  roundRect(ctx, 72, joinY + 50, codeW, 110, 26);
  ctx.fillStyle = p.brandSoft;
  ctx.fill();
  ctx.setLineDash([12, 10]);
  ctx.strokeStyle = p.brand;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = p.brand;
  ctx.textAlign = "center";
  ctx.font = `800 72px ${FONT}`;
  ctx.fillText(spaced(trip.join_code), 72 + codeW / 2, joinY + 131);
  ctx.textAlign = "left";

  ctx.fillStyle = p.ink;
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText("Scan the code or open", 72, joinY + 206);
  ctx.fillStyle = p.brand;
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText(fit(ctx, link.replace(/^https?:\/\//, ""), codeW), 72, joinY + 244);

  // Footer strip in the theme colour
  ctx.fillStyle = p.brand;
  ctx.fillRect(0, H - 34, W, 34);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't create the image."))), "image/png"),
  );
}

async function qrImage(text: string, size: number, dark: string): Promise<HTMLImageElement> {
  const url = await QRCode.toDataURL(text, {
    width: size * 2,
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: toHex(dark), light: "#ffffff" },
  });
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/** qrcode only accepts hex colours; CSS variables are hex in globals.css, but be safe. */
function toHex(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#1c1917";
}

/** A faint lattice of dots, like the jali pattern used across the app. */
function drawJali(ctx: CanvasRenderingContext2D, height: number) {
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  for (let y = 24; y < height; y += 48) {
    for (let x = (y / 48) % 2 ? 24 : 48; x < W; x += 48) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** A simple silhouette for the kind of place, drawn in translucent white so it
 *  takes on whatever theme colour sits behind it. */
function drawScene(ctx: CanvasRenderingContext2D, cover: CoverKey, height: number) {
  // Sun
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.arc(W - 190, 250, 110, 0, Math.PI * 2);
  ctx.fill();

  const base = height;
  if (cover === "beach" || cover === "backwater" || cover === "river") {
    for (let layer = 0; layer < 3; layer++) {
      const y = base - 150 + layer * 45;
      ctx.fillStyle = `rgba(255,255,255,${0.1 + layer * 0.05})`;
      ctx.beginPath();
      ctx.moveTo(0, base);
      ctx.lineTo(0, y);
      for (let x = 0; x <= W; x += 120) {
        ctx.quadraticCurveTo(x + 30, y - 22, x + 60, y);
        ctx.quadraticCurveTo(x + 90, y + 22, x + 120, y);
      }
      ctx.lineTo(W, base);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }
  if (cover === "mountain" || cover === "snow" || cover === "valley") {
    const ranges: [number, number[][]][] = [
      [0.1, [[0, 470], [180, 330], [360, 450], [560, 300], [760, 440], [930, 340], [W, 420]]],
      [0.16, [[0, 540], [240, 410], [470, 530], [700, 390], [900, 520], [W, 470]]],
    ];
    for (const [alpha, pts] of ranges) {
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(0, base);
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.lineTo(W, base);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }
  // Everything else: soft rolling hills.
  for (let layer = 0; layer < 2; layer++) {
    const y = base - 130 + layer * 50;
    ctx.fillStyle = `rgba(255,255,255,${0.1 + layer * 0.06})`;
    ctx.beginPath();
    ctx.moveTo(0, base);
    ctx.lineTo(0, y);
    ctx.bezierCurveTo(W * 0.25, y - 90, W * 0.45, y + 60, W * 0.7, y - 40);
    ctx.bezierCurveTo(W * 0.85, y - 90, W * 0.95, y - 10, W, y - 30);
    ctx.lineTo(W, base);
    ctx.closePath();
    ctx.fill();
  }
}

function spaced(code: string): string {
  return code.split("").join(" ");
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = fit(ctx, lines.slice(maxLines - 1).join(" "), maxWidth);
  return kept;
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
