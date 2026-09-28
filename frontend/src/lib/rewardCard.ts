import QRCode from "qrcode";

import { API_BASE, tokens } from "./api";
import { fit, roundRect, wrap } from "./inviteCard";
import type { RewardOffer } from "./types";
import { formatNumber } from "./utils";

export type RewardCardFormat = "story" | "post";

const W = 1080;
/** Story 9:16 fills an Instagram/WhatsApp story; post 4:5 shows uncropped in the feed. */
const HEIGHT: Record<RewardCardFormat, number> = { story: 1920, post: 1350 };

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

// Drawn from the Safar logo: its forest green, with a warm gold for the prize.
const C = {
  deep: "#0c2a1e",
  forest: "#17402d",
  leaf: "#2f6b4f",
  cream: "#fbf7ee",
  mist: "rgba(251,247,238,0.72)",
  gold: "#f4c152",
  goldInk: "#3b2a05",
  white: "#ffffff",
};

export function rewardsLink(): string {
  return `${window.location.origin}/rewards`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load an image for the card."));
    img.src = src;
  });
}

/** The reward's picture, fetched through the API (not the bucket link) so the
 *  canvas stays exportable. Null when there's no picture or it won't load. */
async function rewardPicture(offer: RewardOffer): Promise<HTMLImageElement | null> {
  if (!offer.image) return null;
  try {
    const token = tokens.access();
    const res = await fetch(`${API_BASE}/api/rewards/catalog/${offer.id}/image/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    const url = URL.createObjectURL(await res.blob());
    try {
      return await loadImage(url);
    } finally {
      // The decoded image stays usable after the object URL is released.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  } catch {
    return null;
  }
}

/** Draws `img` whole inside the box (like CSS object-fit: contain). */
function drawContained(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Draws `img` filling the box, cropped to fit (like object-fit: cover). */
function drawCovered(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawMountains(ctx: CanvasRenderingContext2D, base: number) {
  const ranges: [string, number[][]][] = [
    ["rgba(255,255,255,0.05)", [[0, -260], [170, -420], [330, -300], [540, -520], [760, -330], [930, -450], [W, -300]]],
    ["rgba(255,255,255,0.08)", [[0, -150], [240, -300], [470, -170], [700, -330], [900, -190], [W, -250]]],
  ];
  for (const [fill, pts] of ranges) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(0, base);
    for (const [x, dy] of pts) ctx.lineTo(x, base + dy);
    ctx.lineTo(W, base);
    ctx.closePath();
    ctx.fill();
  }
}

function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  opts: { bg: string; fg: string; size: number; padX?: number; h?: number },
): number {
  ctx.font = `800 ${opts.size}px ${FONT}`;
  const padX = opts.padX ?? 34;
  const h = opts.h ?? opts.size * 2.1;
  const w = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = opts.bg;
  roundRect(ctx, cx - w / 2, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = opts.fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, y + h / 2 + 1);
  return w;
}

/**
 * An Instagram-ready card announcing a reward: the Safar logo, the reward's
 * picture shown whole, what it takes to unlock, how many spots there are, and
 * a QR code to the Rewards page.
 */
export async function renderRewardCard(offer: RewardOffer, format: RewardCardFormat): Promise<Blob> {
  const H = HEIGHT[format];
  const story = format === "story";
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't draw the card.");

  const [picture, logo, qr] = await Promise.all([
    rewardPicture(offer),
    loadImage("/brand/safar-logo.png").catch(() => null),
    QRCode.toDataURL(rewardsLink(), { margin: 1, width: 360, color: { dark: C.deep, light: C.white } }).then(loadImage),
  ]);

  // --- Background: deep forest, a glow behind the prize, mountains below ---
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, C.leaf);
  bg.addColorStop(0.45, C.forest);
  bg.addColorStop(1, C.deep);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glowY = story ? 760 : 560;
  const glow = ctx.createRadialGradient(W / 2, glowY, 40, W / 2, glowY, 620);
  glow.addColorStop(0, "rgba(244,193,82,0.28)");
  glow.addColorStop(1, "rgba(244,193,82,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  drawMountains(ctx, H);

  let y = story ? 110 : 64;

  // --- Logo on a white plate ---
  if (logo) {
    const lh = story ? 150 : 118;
    const lw = (logo.width / logo.height) * lh;
    ctx.fillStyle = C.white;
    roundRect(ctx, W / 2 - lw / 2 - 26, y, lw + 52, lh + 24, 30);
    ctx.fill();
    ctx.drawImage(logo, W / 2 - lw / 2, y + 12, lw, lh);
    y += lh + 24 + (story ? 50 : 30);
  }

  pill(ctx, "🎁  NEW REWARD", W / 2, y, { bg: C.gold, fg: C.goldInk, size: story ? 34 : 30 });
  y += (story ? 34 : 30) * 2.1 + (story ? 44 : 28);

  // --- The prize: picture shown whole in a framed card ---
  const frameW = story ? 880 : 760;
  const frameH = story ? 660 : 470;
  const fx = (W - frameW) / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = C.cream;
  roundRect(ctx, fx, y, frameW, frameH, 44);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, fx, y, frameW, frameH, 44);
  ctx.clip();
  if (picture) {
    // A blurred, enlarged copy fills the frame; the real picture sits on top, uncropped.
    ctx.save();
    ctx.filter = "blur(40px) saturate(1.2)";
    ctx.globalAlpha = 0.75;
    drawCovered(ctx, picture, fx - 60, y - 60, frameW + 120, frameH + 120);
    ctx.restore();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 30;
    drawContained(ctx, picture, fx + 36, y + 36, frameW - 72, frameH - 72);
  } else {
    const plain = ctx.createLinearGradient(fx, y, fx + frameW, y + frameH);
    plain.addColorStop(0, "#fff4d6");
    plain.addColorStop(1, "#f7e2b0");
    ctx.fillStyle = plain;
    ctx.fillRect(fx, y, frameW, frameH);
    ctx.font = `${frameH * 0.42}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🎁", W / 2, y + frameH / 2);
  }
  ctx.restore();

  // XP price tag pinned to the frame's corner.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 20;
  ctx.font = `900 ${story ? 44 : 38}px ${FONT}`;
  const tag = `${formatNumber(offer.xp_required)} XP`;
  const tagW = ctx.measureText(tag).width + 64;
  const tagH = story ? 88 : 76;
  ctx.fillStyle = C.gold;
  roundRect(ctx, fx + frameW - tagW + 20, y - tagH / 2, tagW, tagH, tagH / 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = C.goldInk;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${story ? 44 : 38}px ${FONT}`;
  ctx.fillText(tag, fx + frameW - tagW / 2 + 20, y + 2);

  // Scarcity, pinned across the frame's bottom edge.
  const spots = offer.max_claims === 1 ? "Only 1 spot" : `Only ${formatNumber(offer.max_claims)} spots`;
  const spotSize = story ? 32 : 27;
  const spotH = spotSize * 2.1;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 18;
  pill(ctx, `⏳  ${spots} · first come, first served`, W / 2, y + frameH - spotH / 2, {
    bg: C.deep,
    fg: C.cream,
    size: spotSize,
  });
  ctx.restore();

  y += frameH + spotH / 2 + (story ? 60 : 34);

  // --- Title and description ---
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.cream;
  // A long title steps down in size until it fits on two lines.
  let titleSize = story ? 84 : 66;
  ctx.font = `900 ${titleSize}px ${FONT}`;
  while (titleSize > 48 && wrap(ctx, offer.title, W - 160, 9).length > 2) {
    titleSize -= 6;
    ctx.font = `900 ${titleSize}px ${FONT}`;
  }
  for (const line of wrap(ctx, offer.title, W - 160, 2)) {
    y += titleSize;
    ctx.fillText(line, W / 2, y);
    y += 12;
  }
  // --- Footer position first, so the description only uses the room left ---
  const qrSize = story ? 230 : 190;
  const footerY = H - qrSize - (story ? 140 : 70);

  if (offer.description) {
    const bodySize = story ? 38 : 32;
    const lineH = bodySize * 1.3;
    y += story ? 22 : 10;
    const room = Math.floor((footerY - 30 - 24 - y) / lineH);
    const lines = Math.min(story ? 3 : 2, room);
    if (lines > 0) {
      ctx.font = `500 ${bodySize}px ${FONT}`;
      ctx.fillStyle = C.mist;
      for (const line of wrap(ctx, offer.description, W - 200, lines)) {
        y += lineH;
        ctx.fillText(line, W / 2, y);
      }
    }
  }

  // --- Footer: QR + call to action ---
  const panelX = 90;
  const panelW = W - 180;
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  roundRect(ctx, panelX, footerY - 30, panelW, qrSize + 60, 40);
  ctx.fill();
  ctx.fillStyle = C.white;
  roundRect(ctx, panelX + 30, footerY, qrSize, qrSize, 24);
  ctx.fill();
  ctx.drawImage(qr, panelX + 42, footerY + 12, qrSize - 24, qrSize - 24);

  const textX = panelX + 30 + qrSize + 40;
  const textW = panelX + panelW - 40 - textX;
  ctx.textAlign = "left";
  ctx.fillStyle = C.cream;
  ctx.font = `900 ${story ? 46 : 40}px ${FONT}`;
  ctx.fillText(fit(ctx, "Travel. Earn XP.", textW), textX, footerY + qrSize * 0.36);
  ctx.fillStyle = C.gold;
  ctx.fillText(fit(ctx, "Claim it.", textW), textX, footerY + qrSize * 0.36 + (story ? 56 : 48));
  ctx.fillStyle = C.mist;
  ctx.font = `600 ${story ? 28 : 24}px ${FONT}`;
  ctx.fillText(fit(ctx, rewardsLink().replace(/^https?:\/\//, ""), textW), textX, footerY + qrSize * 0.36 + (story ? 110 : 94));

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't create the card."))), "image/png"),
  );
}
