import type { LucideIcon } from "lucide-react";
import { Compass, Gift, Map, Share2, Sparkles, Trophy, UserPlus, Wallet } from "lucide-react";
import QRCode from "qrcode";
import { createElement } from "react";

import { fit, roundRect } from "./inviteCard";

export type ReferralCardFormat = "post" | "story";

const W = 1080;
/** Post 4:5 sits well in a WhatsApp chat; story 9:16 fills a WhatsApp status. */
const HEIGHT: Record<ReferralCardFormat, number> = { post: 1350, story: 1920 };

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

// The Safar logo's forest green with a warm gold, same as the reward card.
const C = {
  deep: "#0c2a1e",
  forest: "#17402d",
  leaf: "#2f6b4f",
  cream: "#fbf7ee",
  mist: "rgba(251,247,238,0.75)",
  faint: "rgba(255,255,255,0.08)",
  gold: "#f4c152",
  goldLight: "#ffe29a",
  goldDeep: "#d99a1e",
  goldInk: "#3b2a05",
  white: "#ffffff",
};

/** How the referral works — the heart of the card. */
const STEPS: [LucideIcon, string, string][] = [
  [Share2, "Share your link", "WhatsApp, Insta, anywhere"],
  [UserPlus, "Friend joins free", "One tap with Google"],
  [Gift, "You get +10 XP", "For every friend. No limit."],
];

/** What Safar is, in four icons. */
const FEATURES: [LucideIcon, string][] = [
  [Map, "Plan trips"],
  [Compass, "Live trip mode"],
  [Wallet, "Split & settle"],
  [Trophy, "Real rewards"],
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load an image for the card."));
    img.src = src;
  });
}

/** A Lucide icon — the same crisp line icons the app uses — as an image the
 *  canvas can draw, at any size and colour. */
async function iconImage(Icon: LucideIcon, color: string, px: number, strokeWidth = 2): Promise<HTMLImageElement> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const svg = renderToStaticMarkup(createElement(Icon, { size: px, color, strokeWidth }));
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
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

/** A gold coin with "+10 XP" on it, the card's hero. */
function drawMedal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, xp: number) {
  // Soft rays behind the coin.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "rgba(244,193,82,0.10)";
  for (let i = 0; i < 16; i++) {
    ctx.rotate((Math.PI * 2) / 16);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-r * 0.22, -r * 1.75);
    ctx.lineTo(r * 0.22, -r * 1.75);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  const rim = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  rim.addColorStop(0, C.goldLight);
  rim.addColorStop(0.5, C.gold);
  rim.addColorStop(1, C.goldDeep);
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const face = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r * 0.86);
  face.addColorStop(0, C.goldLight);
  face.addColorStop(1, C.gold);
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(59,42,5,0.25)";
  ctx.lineWidth = r * 0.03;
  ctx.stroke();

  ctx.fillStyle = C.goldInk;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `900 ${r * 0.78}px ${FONT}`;
  ctx.fillText(`+${xp}`, cx, cy + r * 0.2);
  ctx.font = `900 ${r * 0.3}px ${FONT}`;
  ctx.fillText("XP", cx, cy + r * 0.56);
}

/**
 * The invite card people share on WhatsApp. It sells the referral itself —
 * invite a friend, earn +10 XP — shows what Safar is, and carries the
 * sharer's code and a QR code so whoever sees it joins through them.
 */
export async function renderReferralCard(
  opts: { name: string; code: string; link: string; xp: number },
  format: ReferralCardFormat,
): Promise<Blob> {
  const H = HEIGHT[format];
  const story = format === "story";
  const v = (post: number, tall: number) => (story ? tall : post);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't draw the card.");

  const stepIcon = v(56, 72);
  const featIcon = v(40, 52);
  const [logo, qr, sparkle, stepIcons, featIcons] = await Promise.all([
    loadImage("/brand/safar-logo.png").catch(() => null),
    QRCode.toDataURL(opts.link, { margin: 1, width: 360, color: { dark: C.deep, light: C.white } }).then(loadImage),
    iconImage(Sparkles, C.goldLight, v(64, 80), 1.75),
    Promise.all(STEPS.map(([Icon]) => iconImage(Icon, C.goldInk, stepIcon, 2.25))),
    Promise.all(FEATURES.map(([Icon]) => iconImage(Icon, C.gold, featIcon, 2))),
  ]);

  // --- Background: forest gradient, mountains along the bottom ---
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, C.leaf);
  bg.addColorStop(0.45, C.forest);
  bg.addColorStop(1, C.deep);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  drawMountains(ctx, H);

  let y = v(52, 110);

  // --- Logo on a white plate ---
  if (logo) {
    const lh = v(84, 124);
    const lw = (logo.width / logo.height) * lh;
    ctx.fillStyle = C.white;
    roundRect(ctx, W / 2 - lw / 2 - 22, y, lw + 44, lh + 20, 26);
    ctx.fill();
    ctx.drawImage(logo, W / 2 - lw / 2, y + 10, lw, lh);
    y += lh + 20;
  }

  // --- Hero: the +10 XP coin ---
  const r = v(118, 158);
  const cy = y + v(34, 60) + r;
  drawMedal(ctx, W / 2, cy, r, opts.xp);
  const sp = v(64, 80);
  ctx.drawImage(sparkle, W / 2 + r * 0.72, cy - r * 1.08, sp, sp);
  ctx.drawImage(sparkle, W / 2 - r * 1.2, cy + r * 0.35, sp * 0.6, sp * 0.6);
  y = cy + r + v(30, 56);

  // --- Headline ---
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const head = v(68, 90);
  ctx.font = `900 ${head}px ${FONT}`;
  y += head;
  ctx.fillStyle = C.cream;
  ctx.fillText("Invite friends.", W / 2, y);
  y += head * 1.08;
  ctx.fillStyle = C.gold;
  ctx.fillText(`Earn +${opts.xp} XP each.`, W / 2, y);
  y += v(44, 60);
  ctx.fillStyle = C.mist;
  ctx.font = `600 ${v(28, 36)}px ${FONT}`;
  ctx.fillText(fit(ctx, "Every friend who joins Safar with your link levels you up.", W - 140), W / 2, y);
  y += v(34, 56);

  // --- How it works: three steps ---
  const gap = v(20, 24);
  const rowX = 70;
  const cardW = (W - rowX * 2 - gap * 2) / 3;
  const cardH = v(222, 300);
  STEPS.forEach(([, title, line], i) => {
    const x = rowX + i * (cardW + gap);
    ctx.fillStyle = C.faint;
    roundRect(ctx, x, y, cardW, cardH, 30);
    ctx.fill();
    ctx.strokeStyle = "rgba(244,193,82,0.28)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Step number, top-left.
    ctx.fillStyle = C.gold;
    ctx.font = `900 ${v(22, 28)}px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`0${i + 1}`, x + 20, y + 18);

    // Icon on a gold disc.
    const disc = v(92, 122);
    const dcx = x + cardW / 2;
    const dcy = y + v(24, 34) + disc / 2;
    const discFill = ctx.createLinearGradient(dcx - disc / 2, dcy - disc / 2, dcx + disc / 2, dcy + disc / 2);
    discFill.addColorStop(0, C.goldLight);
    discFill.addColorStop(1, C.gold);
    ctx.fillStyle = discFill;
    ctx.beginPath();
    ctx.arc(dcx, dcy, disc / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(stepIcons[i], dcx - stepIcon / 2, dcy - stepIcon / 2, stepIcon, stepIcon);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.cream;
    ctx.font = `800 ${v(28, 36)}px ${FONT}`;
    const ty = dcy + disc / 2 + v(46, 62);
    ctx.fillText(fit(ctx, title, cardW - 24), dcx, ty);
    ctx.fillStyle = C.mist;
    ctx.font = `500 ${v(20, 26)}px ${FONT}`;
    ctx.fillText(fit(ctx, line, cardW - 24), dcx, ty + v(32, 42));

    // A chevron between steps.
    if (i < STEPS.length - 1) {
      ctx.fillStyle = C.gold;
      ctx.font = `900 ${v(30, 36)}px ${FONT}`;
      ctx.textBaseline = "middle";
      ctx.fillText("›", x + cardW + gap / 2, dcy);
    }
  });
  y += cardH + v(26, 44);

  // --- What Safar is: four icons ---
  const featW = (W - rowX * 2) / FEATURES.length;
  FEATURES.forEach(([, label], i) => {
    const fx = rowX + i * featW + featW / 2;
    ctx.drawImage(featIcons[i], fx - featIcon / 2, y, featIcon, featIcon);
    ctx.fillStyle = C.cream;
    ctx.font = `700 ${v(22, 28)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(fit(ctx, label, featW - 12), fx, y + featIcon + v(34, 44));
  });

  // --- Footer: QR, the sharer's code, the link ---
  const qrSize = v(170, 236);
  const footerY = H - qrSize - v(44, 110);
  const panelX = 70;
  const panelW = W - 140;
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  roundRect(ctx, panelX, footerY - 26, panelW, qrSize + 52, 36);
  ctx.fill();
  ctx.fillStyle = C.white;
  roundRect(ctx, panelX + 26, footerY, qrSize, qrSize, 22);
  ctx.fill();
  ctx.drawImage(qr, panelX + 38, footerY + 12, qrSize - 24, qrSize - 24);

  const textX = panelX + 26 + qrSize + 36;
  const textW = panelX + panelW - 30 - textX;
  const first = opts.name.split(" ")[0] || opts.name;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.cream;
  ctx.font = `800 ${v(30, 40)}px ${FONT}`;
  ctx.fillText(fit(ctx, `Scan to join ${first} on Safar`, textW), textX, footerY + v(40, 54));
  ctx.fillStyle = C.mist;
  ctx.font = `700 ${v(18, 24)}px ${FONT}`;
  ctx.fillText("INVITE CODE", textX, footerY + v(78, 104));
  ctx.fillStyle = C.gold;
  ctx.font = `900 ${v(46, 62)}px ${FONT}`;
  ctx.fillText(fit(ctx, opts.code.split("").join(" "), textW), textX, footerY + v(128, 172));
  ctx.fillStyle = C.mist;
  ctx.font = `600 ${v(19, 25)}px ${FONT}`;
  ctx.fillText(fit(ctx, opts.link.replace(/^https?:\/\//, ""), textW), textX, footerY + v(160, 216));

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't create the card."))), "image/png"),
  );
}
