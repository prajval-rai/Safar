import { drawJali, drawScene, fit, qrImage, roundRect, themePalette, wrap } from "./inviteCard";
import type { TravelPost } from "./types";

const W = 1080;
const H = 1920; // 9:16 — a full-screen Instagram / WhatsApp story

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

/** The shareable link for a post — opens its public page, no login needed. */
export function postLink(postId: string): string {
  return `${window.location.origin}/p/${postId}`;
}

/** Draws a post as a story-sized card: a short excerpt that stops mid-story
 *  with "Read the full story", plus a QR code and the link to the full post.
 *  Coloured in the post's trip theme. */
export async function renderStoryCard(post: TravelPost, link: string): Promise<Blob> {
  const p = themePalette(post.theme);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't draw the story.");

  // Full-bleed theme gradient with the place's scene behind everything.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, p.brandStrong);
  bg.addColorStop(0.5, p.brand);
  bg.addColorStop(1, p.brandBright);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  drawJali(ctx, H);
  drawScene(ctx, post.cover_key, 560);

  // Header
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText("SAFAR", 80, 150);
  const pill = "TRAVEL STORY";
  ctx.font = `800 28px ${FONT}`;
  const pillW = ctx.measureText(pill).width + 60;
  roundRect(ctx, W - 80 - pillW, 108, pillW, 58, 29);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();
  ctx.fillStyle = p.brand;
  ctx.fillText(pill, W - 80 - pillW + 30, 147);

  if (post.place) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 76px ${FONT}`;
    const placeLines = wrap(ctx, post.place, W - 160, 2);
    placeLines.forEach((line, i) => ctx.fillText(line, 80, 330 + i * 86));
  }

  // --- The story card ------------------------------------------------------
  const cardX = 64;
  const cardY = 560;
  const cardW = W - 128;
  const cardH = 900;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  roundRect(ctx, cardX, cardY, cardW, cardH, 44);
  ctx.fillStyle = p.surface;
  ctx.fill();
  ctx.restore();

  // Author
  const ax = cardX + 56;
  const ay = cardY + 70;
  ctx.beginPath();
  ctx.arc(ax + 40, ay + 20, 44, 0, Math.PI * 2);
  ctx.fillStyle = p.brandSoft;
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `44px ${FONT}`;
  ctx.fillStyle = p.ink;
  ctx.fillText(post.author.avatar_emoji || "🧳", ax + 40, ay + 22);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = p.ink;
  ctx.font = `800 38px ${FONT}`;
  ctx.fillText(fit(ctx, post.author.name, cardW - 200), ax + 108, ay + 12);
  ctx.fillStyle = p.muted;
  ctx.font = `600 28px ${FONT}`;
  const sub = post.trip_title ? `From ${post.trip_title}` : `Level ${post.author.level} traveller`;
  ctx.fillText(fit(ctx, sub, cardW - 200), ax + 108, ay + 54);

  // Opening quote mark, then the excerpt — cut short on purpose.
  ctx.fillStyle = p.brandSoft;
  ctx.font = `800 180px Georgia, serif`;
  ctx.fillText("“", cardX + 36, cardY + 330);

  ctx.fillStyle = p.ink;
  ctx.font = `500 44px ${FONT}`;
  const textW = cardW - 112;
  // Ends well above the button (and the song line) so the fade never runs into them.
  const maxLines = post.soundtrack ? 7 : 8;
  const all = wrap(ctx, post.caption.replace(/\s+/g, " ").trim(), textW, 999);
  const lines = all.slice(0, maxLines);
  const truncated = all.length > maxLines;
  if (truncated) {
    const last = fit(ctx, `${lines[maxLines - 1]} ${all[maxLines]}`, textW);
    lines[maxLines - 1] = last.endsWith("…") ? last : `${last}…`;
  }
  lines.forEach((line, i) => ctx.fillText(line, cardX + 56, cardY + 290 + i * 62));

  // Fade the last lines into the card so it reads as "there's more".
  const textBottom = cardY + 290 + (lines.length - 1) * 62 + 20;
  if (truncated) {
    const fade = ctx.createLinearGradient(0, textBottom - 180, 0, textBottom + 10);
    fade.addColorStop(0, "rgba(255,255,255,0)");
    fade.addColorStop(1, p.surface);
    ctx.fillStyle = fade;
    ctx.fillRect(cardX + 20, textBottom - 180, cardW - 40, 190);
  }

  // The trip's soundtrack, so people can add the same song on Instagram.
  if (post.soundtrack) {
    ctx.fillStyle = p.brand;
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(fit(ctx, `♫  ${post.soundtrack.title} · ${post.soundtrack.artist}`, cardW - 112), cardX + 56, cardY + cardH - 176);
  }

  // "Read the full story" button
  const cta = "Read the full story  →";
  ctx.font = `800 36px ${FONT}`;
  const ctaW = ctx.measureText(cta).width + 80;
  const ctaY = cardY + cardH - 140;
  roundRect(ctx, cardX + 56, ctaY, ctaW, 84, 42);
  ctx.fillStyle = p.brand;
  ctx.fill();
  ctx.fillStyle = p.onBrand;
  ctx.fillText(cta, cardX + 56 + 40, ctaY + 55);

  // --- Link + QR -------------------------------------------------------------
  const qrSize = 250;
  const qrX = W - 80 - qrSize;
  const qrY = cardY + cardH + 90;
  roundRect(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 30);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  const qr = await qrImage(link, qrSize, p.brandStrong);
  ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText("Scan to read it all", 80, qrY + 70);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText("or open the link:", 80, qrY + 120);
  ctx.font = `700 30px ${FONT}`;
  breakAnywhere(ctx, link.replace(/^https?:\/\//, ""), qrX - 120, 2).forEach((line, i) =>
    ctx.fillText(line, 80, qrY + 170 + i * 40),
  );

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText("Plan your own Indian journey on Safar", 80, H - 70);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't create the image."))), "image/png"),
  );
}

/** Wraps text with no spaces (a URL) by characters rather than words. */
function breakAnywhere(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
    if (line && ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = fit(ctx, lines.slice(maxLines - 1).join(""), maxWidth);
  return kept;
}
