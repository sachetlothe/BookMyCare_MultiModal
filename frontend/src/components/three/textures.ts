import * as THREE from "three";
import { langPack, type LangCode } from "../../lib/languages";

export type ReportFace = "hero" | "complex" | "upload" | "analysis" | "simple" | "screening" | "plan" | "language";

// Only web fonts + generic families: naming local fonts (e.g. "Nirmala UI", Consolas) makes Chrome
// enumerate system fonts on the first canvas draw (~450 ms). Indic scripts still render via the
// browser's automatic font fallback.
const SANS = '"Inter Variable", sans-serif';
const DISPLAY = '"Plus Jakarta Sans Variable", "Inter Variable", sans-serif';
const MONO = "monospace";

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
}

function wrap(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, maxW: number, lineH: number, font: string, color: string) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  const words = s.split(" ");
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineH;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
  return yy;
}

export function toTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ------------------------------------------------------------ report faces */

export const REPORT_W = 1024;
export const REPORT_H = 1350;

function header(ctx: CanvasRenderingContext2D, title: string, tag: string) {
  const g = ctx.createLinearGradient(64, 64, 160, 160);
  g.addColorStop(0, "#fb7185");
  g.addColorStop(1, "#dc2626");
  rr(ctx, 64, 64, 104, 104, 28);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(116, 88);
  ctx.bezierCurveTo(140, 118, 146, 130, 146, 140);
  ctx.arc(116, 140, 30, 0, Math.PI, false);
  ctx.bezierCurveTo(86, 130, 92, 118, 116, 88);
  ctx.fill();
  text(ctx, title, 196, 116, `800 50px ${DISPLAY}`, "#0f172a");
  text(ctx, "BookMyCare · Lab report", 196, 160, `500 30px ${SANS}`, "#94a3b8");
  ctx.font = `700 24px ${SANS}`;
  const tw = ctx.measureText(tag).width + 44;
  rr(ctx, REPORT_W - 64 - tw, 78, tw, 46, 23);
  ctx.fillStyle = "#e0f2fe";
  ctx.fill();
  text(ctx, tag, REPORT_W - 64 - tw / 2, 110, `700 24px ${SANS}`, "#0369a1", "center");
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(64, 200, REPORT_W - 128, 3);
}

const CBC = [
  ["Hemoglobin", "11.2", "g/dL", "12.0 – 15.5", "L"],
  ["WBC count", "7.8", "×10³/µL", "4.0 – 11.0", ""],
  ["Platelets", "245", "×10³/µL", "150 – 450", ""],
  ["RBC count", "4.6", "×10⁶/µL", "4.2 – 5.4", ""],
  ["Hematocrit", "34.8", "%", "36 – 46", "L"],
];
const JARGON = [
  ["MCV", "76.4", "fL", "80–100", "L"], ["MCH", "24.9", "pg", "27–33", "L"], ["MCHC", "30.1", "g/dL", "32–36", "L"],
  ["RDW-CV", "16.8", "%", "11.5–14.5", "H"], ["Neutrophils", "62", "%", "40–75", ""], ["Lymphocytes", "29", "%", "20–45", ""],
  ["Eosinophils", "6.2", "%", "1–6", "H"], ["Monocytes", "7", "%", "2–10", ""], ["MPV", "10.1", "fL", "7.5–11.5", ""],
  ["PDW", "16.3", "fL", "9–17", ""], ["Hematocrit", "34.8", "%", "36–46", "L"], ["ESR", "24", "mm/h", "0–20", "H"],
];

function meter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, pos: number) {
  const seg = [["#fecdd3", 0.25], ["#a7f3d0", 0.5], ["#fed7aa", 0.25]] as const;
  let xx = x;
  for (const [c, f] of seg) {
    rr(ctx, xx, y, w * f - 4, 16, 8);
    ctx.fillStyle = c;
    ctx.fill();
    xx += w * f;
  }
  ctx.fillStyle = "#0f172a";
  rr(ctx, x + w * pos - 5, y - 8, 10, 32, 5);
  ctx.fill();
}

function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.shadowColor = "rgba(15,23,42,0.08)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  rr(ctx, x, y, w, h, 28);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  rr(ctx, x, y, w, h, 28);
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function chip(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, glyph: string) {
  rr(ctx, x, y, 84, 84, 22);
  ctx.fillStyle = color;
  ctx.fill();
  text(ctx, glyph, x + 42, y + 58, `700 40px ${SANS}`, "#0f172a", "center");
}

export function drawReport(face: ReportFace, lang: LangCode = "en"): HTMLCanvasElement {
  const [c, ctx] = canvas(REPORT_W, REPORT_H);
  const bg = ctx.createLinearGradient(0, 0, REPORT_W, REPORT_H);
  bg.addColorStop(0, "#ffffff");
  bg.addColorStop(1, "#eef8fb");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, REPORT_W, REPORT_H);

  if (face === "complex") {
    header(ctx, "Haematology Profile", "SAMPLE");
    let y = 280;
    for (const [n, v, u, r, f] of JARGON) {
      text(ctx, n, 64, y, `500 34px ${MONO}`, "#334155");
      text(ctx, v + (f ? ` ${f}` : ""), 600, y, `700 34px ${MONO}`, f === "L" ? "#0369a1" : f === "H" ? "#ea580c" : "#0f172a", "right");
      text(ctx, u, 630, y, `400 28px ${MONO}`, "#64748b");
      text(ctx, r, REPORT_W - 64, y, `400 30px ${MONO}`, "#94a3b8", "right");
      y += 76;
    }
    for (const w of [0.9, 0.7, 0.82]) {
      rr(ctx, 64, y, (REPORT_W - 128) * w, 14, 7);
      ctx.fillStyle = "#e2e8f0";
      ctx.fill();
      y += 34;
    }
    return c;
  }

  if (face === "simple" || face === "language") {
    const pack = langPack(face === "language" ? lang : "en");
    header(ctx, face === "language" ? pack.native : "Your report, simplified", face === "language" ? "PREVIEW" : "SIMPLE MODE");
    const colors = ["#ffe4e6", "#e0f2fe", "#fef3c7"];
    const glyphs = ["O₂", "🛡", "+"];
    const pos = [0.22, 0.5, 0.46];
    pack.items.forEach((it, i) => {
      const y = 260 + i * 330;
      card(ctx, 64, y, REPORT_W - 128, 290);
      chip(ctx, 104, y + 40, colors[i], glyphs[i]);
      text(ctx, it.name, 220, y + 86, `700 42px ${SANS}`, "#0f172a");
      wrap(ctx, it.text, 104, y + 178, REPORT_W - 230, 46, `500 34px ${SANS}`, "#475569");
      if (face === "simple") meter(ctx, 104, y + 236, REPORT_W - 208, pos[i]);
    });
    return c;
  }

  if (face === "screening") {
    header(ctx, "Screening summary", "EXAMPLE");
    const rows = [["Iron-deficiency anaemia", 0.72, "Moderate"], ["Vitamin B12 deficiency", 0.38, "Low"]] as const;
    rows.forEach(([n, s, conf], i) => {
      const y = 260 + i * 300;
      card(ctx, 64, y, REPORT_W - 128, 260);
      text(ctx, n, 104, y + 76, `700 40px ${SANS}`, "#0f172a");
      text(ctx, `${Math.round(s * 100)}%`, REPORT_W - 104, y + 76, `800 40px ${MONO}`, "#0369a1", "right");
      rr(ctx, 104, y + 116, REPORT_W - 208, 22, 11);
      ctx.fillStyle = "#e2e8f0";
      ctx.fill();
      const g = ctx.createLinearGradient(104, 0, REPORT_W - 104, 0);
      g.addColorStop(0, "#38bdf8");
      g.addColorStop(1, "#14b8a6");
      rr(ctx, 104, y + 116, (REPORT_W - 208) * s, 22, 11);
      ctx.fillStyle = g;
      ctx.fill();
      text(ctx, `Confidence: ${conf} · possible match`, 104, y + 200, `500 30px ${SANS}`, "#64748b");
    });
    rr(ctx, 64, 900, REPORT_W - 128, 300, 28);
    ctx.fillStyle = "#f1f5f9";
    ctx.fill();
    text(ctx, "Why", 104, 970, `700 32px ${SANS}`, "#0f172a");
    wrap(ctx, "Low hemoglobin, tiredness and low MCV support the first match. Ferritin was not reported.", 104, 1024, REPORT_W - 208, 44, `500 30px ${SANS}`, "#475569");
    text(ctx, "Not a diagnosis.", 104, 1160, `700 30px ${SANS}`, "#be123c");
    return c;
  }

  if (face === "plan") {
    header(ctx, "Your care plan", "EXAMPLE");
    const items = [["Foods that support healthy blood", "#d1fae5"], ["Stay active every day", "#e0f2fe"], ["Questions to ask your doctor", "#ede9fe"], ["When to recheck your values", "#fef3c7"]];
    items.forEach(([t, col], i) => {
      const y = 260 + i * 250;
      card(ctx, 64, y, REPORT_W - 128, 210);
      rr(ctx, 104, y + 55, 100, 100, 26);
      ctx.fillStyle = col;
      ctx.fill();
      wrap(ctx, t, 240, y + 98, REPORT_W - 420, 46, `600 38px ${SANS}`, "#1e293b");
      ctx.beginPath();
      ctx.arc(REPORT_W - 140, y + 105, 26, 0, Math.PI * 2);
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 7;
      ctx.stroke();
    });
    return c;
  }

  header(ctx, face === "analysis" ? "Analysing report" : "Complete Blood Count", face === "upload" ? "UPLOADING" : face === "analysis" ? "EXAMPLE" : "SAMPLE");
  text(ctx, "TEST", 64, 270, `700 24px ${SANS}`, "#94a3b8");
  text(ctx, "RESULT", 470, 270, `700 24px ${SANS}`, "#94a3b8");
  text(ctx, face === "analysis" ? "CHECK" : "RANGE", 720, 270, `700 24px ${SANS}`, "#94a3b8");
  CBC.forEach(([n, v, u, r, f], i) => {
    const y = 350 + i * 96;
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(64, y - 62, REPORT_W - 128, 2);
    text(ctx, n, 64, y, `600 38px ${SANS}`, "#1e293b");
    text(ctx, v, 470, y, `700 38px ${MONO}`, f ? "#0369a1" : "#0f172a");
    text(ctx, u, 470 + ctx.measureText(v).width + 16, y, `400 24px ${SANS}`, "#94a3b8");
    if (face === "analysis") {
      const g = ctx.createLinearGradient(720, 0, 960, 0);
      g.addColorStop(0, "#67e8f9");
      g.addColorStop(1, "#0ea5e9");
      rr(ctx, 720, y - 24, 240 * (0.55 + 0.09 * i), 18, 9);
      ctx.fillStyle = g;
      ctx.fill();
    } else {
      text(ctx, r, 720, y, `400 32px ${SANS}`, "#94a3b8");
    }
  });
  if (face === "analysis") {
    ["Reading the text in your file", "Recognising known lab tests", "Comparing with printed ranges", "Checking warning signs"].forEach((s, i) => {
      const y = 900 + i * 80;
      ctx.beginPath();
      ctx.arc(88, y - 12, 22, 0, Math.PI * 2);
      ctx.fillStyle = "#d1fae5";
      ctx.fill();
      text(ctx, "✓", 88, y, `800 28px ${SANS}`, "#059669", "center");
      text(ctx, s, 130, y, `500 32px ${SANS}`, "#475569");
    });
  } else {
    rr(ctx, 64, 900, REPORT_W - 128, 120, 20);
    ctx.fillStyle = "#ecfdf5";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(64, 1000);
    for (let x = 0; x <= REPORT_W - 128; x += 8) ctx.lineTo(64 + x, 980 - Math.sin(x / 90) * 30 - x / 30);
    ctx.strokeStyle = "#0ea5e9";
    ctx.lineWidth = 7;
    ctx.stroke();
    if (face === "upload") {
      rr(ctx, 64, 1110, REPORT_W - 128, 26, 13);
      ctx.fillStyle = "#e0f2fe";
      ctx.fill();
      rr(ctx, 64, 1110, (REPORT_W - 128) * 0.64, 26, 13);
      ctx.fillStyle = "#0ea5e9";
      ctx.fill();
      text(ctx, "Uploading securely…", 64, 1200, `600 32px ${SANS}`, "#0369a1");
    } else {
      text(ctx, "Sample report · illustrative values", 64, 1150, `500 28px ${SANS}`, "#94a3b8");
    }
  }
  return c;
}

/* ------------------------------------------------------------ x-ray */

export function drawXRay(): HTMLCanvasElement {
  const [c, ctx] = canvas(512, 640);
  const g = ctx.createRadialGradient(256, 300, 40, 256, 320, 380);
  g.addColorStop(0, "#334155");
  g.addColorStop(1, "#020617");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 640);
  ctx.fillStyle = "rgba(2,6,23,0.85)";
  ctx.beginPath();
  ctx.ellipse(170, 330, 92, 190, 0.05, 0, Math.PI * 2);
  ctx.ellipse(342, 330, 92, 190, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = "blur(1.4px)";
  ctx.strokeStyle = "rgba(226,232,240,0.62)";
  ctx.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const y = 150 + i * 46;
    ctx.lineWidth = 9 - i * 0.4;
    ctx.beginPath();
    ctx.moveTo(248, y);
    ctx.bezierCurveTo(190, y - 22, 110, y + 6, 76, y + 60);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(264, y);
    ctx.bezierCurveTo(322, y - 22, 402, y + 6, 436, y + 60);
    ctx.stroke();
  }
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(244, 120);
  ctx.bezierCurveTo(190, 96, 130, 104, 70, 130);
  ctx.moveTo(268, 120);
  ctx.bezierCurveTo(322, 96, 382, 104, 442, 130);
  ctx.stroke();
  ctx.fillStyle = "rgba(226,232,240,0.55)";
  ctx.fillRect(244, 40, 24, 600);
  ctx.fillStyle = "rgba(148,163,184,0.28)";
  ctx.beginPath();
  ctx.ellipse(278, 420, 80, 92, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = "none";
  text(ctx, "EXAMPLE IMAGE", 256, 612, `700 22px ${SANS}`, "rgba(165,243,252,0.75)", "center");
  return c;
}

/* ------------------------------------------------------------ holograms, labels, sprites */

export type HoloKind = "bars" | "ring" | "pulse" | "glyph";

export function drawHolo(kind: HoloKind, glyph = "अ"): HTMLCanvasElement {
  const [c, ctx] = canvas(512, 384);
  rr(ctx, 6, 6, 500, 372, 40);
  ctx.fillStyle = "rgba(34,211,238,0.10)";
  ctx.fill();
  ctx.strokeStyle = "rgba(103,232,249,0.85)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = "#a5f3fc";
  ctx.fillStyle = "#a5f3fc";
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 18;
  if (kind === "bars") {
    [0.5, 0.8, 0.35, 0.65, 0.9, 0.55].forEach((h, i) => {
      rr(ctx, 70 + i * 66, 320 - 230 * h, 40, 230 * h, 10);
      ctx.fill();
    });
  } else if (kind === "ring") {
    ctx.lineWidth = 26;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(256, 196, 120, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(256, 196, 120, -Math.PI / 2, Math.PI * 0.95);
    ctx.stroke();
  } else if (kind === "pulse") {
    ctx.lineWidth = 9;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(40, 200);
    [[150, 200], [190, 120], [230, 290], [270, 80], [310, 230], [340, 200], [472, 200]].forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.stroke();
  } else {
    text(ctx, glyph, 256, 270, `700 200px ${SANS}`, "#cffafe", "center");
  }
  return c;
}

export function drawLabel(s: string): HTMLCanvasElement {
  const [c, ctx] = canvas(512, 128);
  ctx.font = `700 52px ${MONO}`;
  const w = Math.min(500, ctx.measureText(s).width + 70);
  rr(ctx, (512 - w) / 2, 18, w, 92, 46);
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.fill();
  text(ctx, s, 256, 82, `700 52px ${MONO}`, "#334155", "center");
  return c;
}

export function drawGlow(): HTMLCanvasElement {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return c;
}

export function drawDoc(): HTMLCanvasElement {
  const [c, ctx] = canvas(256, 330);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 256, 330);
  ctx.fillStyle = "#14b8a6";
  ctx.fillRect(0, 0, 256, 40);
  ctx.fillStyle = "#cbd5e1";
  for (let i = 0; i < 9; i++) ctx.fillRect(24, 70 + i * 26, 208 * (i % 3 === 2 ? 0.6 : 0.9), 10);
  return c;
}
