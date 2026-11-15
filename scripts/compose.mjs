/**
 * Cartas-editor: drawing a card = window background + picture (moved, zoomed, turned) + inner shadow,
 * cut by the template mask, then the frame on top and the optional name label.
 */
import { hash, shade } from "./constants.mjs";
import { innerShadow, makeCanvas, prepare } from "./templates.mjs";
import { windowOf } from "./svg-frames.mjs";

const NEUTRAL_IMAGE = { x: 0, y: 0, scale: 1, rot: 0, flip: false, brightness: 1, contrast: 1, saturation: 1 };

/** Where the picture goes, in template units. scale 1 = the picture just covers the window. */
export function placement(prep, img, im = NEUTRAL_IMAGE) {
  const b = prep.box;
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const cover = Math.max(b.w / iw, b.h / ih);
  return {
    cx: b.x + b.w / 2 + im.x * b.w,
    cy: b.y + b.h / 2 + im.y * b.h,
    k: cover * im.scale,
    cover,
    rot: (im.rot * Math.PI) / 180,
    flip: im.flip ? -1 : 1,
    iw,
    ih
  };
}

/** The picture scale (relative to "cover") at which the whole picture fits inside the window. */
export function containScale(prep, img) {
  const b = prep.box;
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  return Math.min(b.w / iw, b.h / ih) / Math.max(b.w / iw, b.h / ih);
}

export function drawPicture(ctx, img, pl, s, filter = "none") {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if ( filter !== "none" && "filter" in ctx ) ctx.filter = filter;
  ctx.scale(s, s);
  ctx.translate(pl.cx, pl.cy);
  ctx.rotate(pl.rot);
  ctx.scale(pl.k * pl.flip, pl.k);
  ctx.drawImage(img, -pl.iw / 2, -pl.ih / 2);
  ctx.restore();
}

export function pictureFilter(im) {
  const parts = [];
  if ( Math.abs(im.brightness - 1) > 0.005 ) parts.push(`brightness(${im.brightness})`);
  if ( Math.abs(im.contrast - 1) > 0.005 ) parts.push(`contrast(${im.contrast})`);
  if ( Math.abs(im.saturation - 1) > 0.005 ) parts.push(`saturate(${im.saturation})`);
  return parts.length ? parts.join(" ") : "none";
}

export function tintFilter(t) {
  if ( !t ) return "none";
  const parts = [];
  if ( Math.abs(t.hue) > 0.5 ) parts.push(`hue-rotate(${t.hue}deg)`);
  if ( Math.abs(t.sat - 1) > 0.005 ) parts.push(`saturate(${t.sat})`);
  if ( Math.abs(t.light - 1) > 0.005 ) parts.push(`brightness(${t.light})`);
  return parts.length ? parts.join(" ") : "none";
}

/* ---------------------------------------------------------------------------------------------- */
/* Placeholder picture (thumbnails and empty cards): a soft bust silhouette                        */
/* ---------------------------------------------------------------------------------------------- */

let placeholder = null;
export function placeholderImage() {
  if ( placeholder ) return placeholder;
  const c = makeCanvas(400, 520);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 520);
  g.addColorStop(0, "#6d6578");
  g.addColorStop(1, "#2c2633");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 400, 520);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.arc(200, 215, 82, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(48, 520);
  ctx.bezierCurveTo(52, 380, 120, 330, 200, 330);
  ctx.bezierCurveTo(280, 330, 348, 380, 352, 520);
  ctx.closePath();
  ctx.fill();
  placeholder = c;
  return c;
}

/* ---------------------------------------------------------------------------------------------- */
/* Name label                                                                                       */
/* ---------------------------------------------------------------------------------------------- */

export function labelText(card) {
  const L = card.label;
  let text = String(L.text || card.name || "").trim();
  if ( L.caps ) text = text.toLocaleUpperCase("pt-BR");
  return text;
}

export function labelFont(L, px) {
  return `${L.bold ? "700" : "400"} ${Math.max(1, px).toFixed(2)}px "${L.font}", "Signika", "Palatino Linotype", serif`;
}

/** Draw the label; returns its box in template units (for dragging) or null. */
function drawLabel(ctx, prep, card, s) {
  const L = card.label;
  if ( !L?.on ) return null;
  const text = labelText(card);
  if ( !text ) return null;
  const unit = prep.w / 450;
  const fontPx = L.size * unit;
  ctx.save();
  ctx.font = labelFont(L, fontPx * s);
  const tw = ctx.measureText(text).width / s;
  const cx = L.x * prep.w, cy = L.y * prep.h;
  const padX = fontPx * 0.75, bandH = fontPx * 1.32;
  const bw = tw + padX * 2;
  const x0 = cx - bw / 2, y0 = cy - bandH / 2;
  let box = { x: x0, y: y0, w: bw, h: bandH };
  ctx.scale(s, s);
  ctx.lineJoin = "round";
  const edge = L.bandEdge, fill = L.bandColor;
  const grad = ctx.createLinearGradient(0, y0, 0, y0 + bandH);
  grad.addColorStop(0, shade(fill, 0.22));
  grad.addColorStop(0.5, fill);
  grad.addColorStop(1, shade(fill, -0.3));
  const ew = Math.max(1, fontPx * 0.08);
  if ( L.band === "fita" ) {
    const tail = bandH * 0.9, drop = bandH * 0.28, notch = bandH * 0.32;
    /* back tails */
    ctx.fillStyle = shade(fill, -0.35);
    ctx.strokeStyle = shade(edge, -0.55);
    ctx.lineWidth = ew;
    for ( const dir of [-1, 1] ) {
      const xa = dir < 0 ? x0 + bandH * 0.25 : x0 + bw - bandH * 0.25;
      const xb = xa + dir * (tail + bandH * 0.25);
      ctx.beginPath();
      ctx.moveTo(xa, y0 + drop);
      ctx.lineTo(xb, y0 + drop);
      ctx.lineTo(xb - dir * notch, y0 + drop + bandH / 2);
      ctx.lineTo(xb, y0 + drop + bandH);
      ctx.lineTo(xa, y0 + drop + bandH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      /* fold */
      ctx.fillStyle = shade(fill, -0.55);
      ctx.beginPath();
      const xf = dir < 0 ? x0 : x0 + bw;
      ctx.moveTo(xf, y0 + bandH);
      ctx.lineTo(xa, y0 + drop + bandH);
      ctx.lineTo(xf, y0 + drop + bandH);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(fill, -0.35);
    }
    box = { x: x0 - tail, y: y0, w: bw + 2 * tail, h: bandH + drop };
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.rect(x0, y0, bw, bandH);
    ctx.fill();
    ctx.strokeStyle = shade(edge, -0.55);
    ctx.lineWidth = ew * 1.6;
    ctx.stroke();
    ctx.strokeStyle = edge;
    ctx.lineWidth = ew;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + ew * 2.2);
    ctx.lineTo(x0 + bw, y0 + ew * 2.2);
    ctx.moveTo(x0, y0 + bandH - ew * 2.2);
    ctx.lineTo(x0 + bw, y0 + bandH - ew * 2.2);
    ctx.stroke();
  }
  else if ( L.band === "placa" ) {
    const r = bandH * 0.32;
    ctx.fillStyle = grad;
    ctx.strokeStyle = shade(edge, -0.6);
    ctx.lineWidth = ew * 3.2;
    roundRectPath(ctx, x0, y0, bw, bandH, r);
    ctx.stroke();
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = ew * 1.6;
    roundRectPath(ctx, x0, y0, bw, bandH, r);
    ctx.stroke();
    ctx.fillStyle = edge;
    for ( const dx of [x0 + bandH * 0.32, x0 + bw - bandH * 0.32] ) {
      ctx.beginPath();
      ctx.arc(dx, cy, bandH * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.font = labelFont(L, fontPx);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if ( L.strokeW > 0 ) {
    ctx.strokeStyle = L.stroke;
    ctx.lineWidth = L.strokeW * unit;
    ctx.strokeText(text, cx, cy + fontPx * 0.04);
  }
  ctx.fillStyle = L.color;
  ctx.fillText(text, cx, cy + fontPx * 0.04);
  ctx.restore();
  return box;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------------------------------------------------------------------------------------------- */
/* The card                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

const scratch = { canvas: null };
function layerCanvas(w, h) {
  if ( !scratch.canvas ) scratch.canvas = makeCanvas(w, h);
  const c = scratch.canvas;
  if ( c.width !== w || c.height !== h ) {
    c.width = w;
    c.height = h;
  }
  return c;
}

/**
 * Draw a card into `canvas` (created when missing), at the prep's scale.
 * @param {object} prep     from templates.prepare()
 * @param {object} card     normalized card
 * @param {object} opts     image: loaded picture or null; placeholder: draw the silhouette when no picture
 * @returns {{canvas: HTMLCanvasElement, labelBox: object|null}}
 */
export function composeCard(prep, card, { image = null, placeholder: usePlaceholder = true, canvas = null } = {}) {
  const W = prep.frame.width, H = prep.frame.height;
  const s = prep.scale;
  const out = canvas ?? makeCanvas(W, H);
  if ( out.width !== W || out.height !== H ) {
    out.width = W;
    out.height = H;
  }
  const ctx = out.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, W, H);

  const layer = layerCanvas(W, H);
  const lc = layer.getContext("2d");
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.globalCompositeOperation = "source-over";
  lc.globalAlpha = 1;
  lc.clearRect(0, 0, W, H);

  const b = prep.box;
  const wb = card.windowBg;
  if ( wb.mode === "cor" ) {
    lc.fillStyle = wb.color;
    lc.fillRect(0, 0, W, H);
  }
  else if ( wb.mode === "gradiente" ) {
    const cx = (b.x + b.w / 2) * s, cy = (b.y + b.h * 0.42) * s;
    const g = lc.createRadialGradient(cx, cy, 0, cx, cy, Math.max(b.w, b.h) * 0.72 * s);
    g.addColorStop(0, wb.color);
    g.addColorStop(1, wb.color2);
    lc.fillStyle = g;
    lc.fillRect(0, 0, W, H);
  }

  const pic = image ?? (usePlaceholder ? placeholderImage() : null);
  if ( pic ) {
    const im = image ? card.image : NEUTRAL_IMAGE;
    drawPicture(lc, pic, placement(prep, pic, im), s, image ? pictureFilter(card.image) : "none");
  }
  if ( card.shadow > 0 ) {
    lc.globalAlpha = card.shadow;
    lc.drawImage(innerShadow(prep), 0, 0);
    lc.globalAlpha = 1;
  }
  lc.globalCompositeOperation = "destination-in";
  lc.drawImage(prep.mask, 0, 0);
  lc.globalCompositeOperation = "source-over";
  ctx.drawImage(layer, 0, 0);

  const tint = prep.kind === "raster" ? tintFilter(card.tint) : "none";
  if ( tint !== "none" && "filter" in ctx ) ctx.filter = tint;
  ctx.drawImage(prep.frame, 0, 0);
  ctx.filter = "none";

  const labelBox = drawLabel(ctx, prep, card, s);
  return { canvas: out, labelBox };
}

/** canvas -> Blob. Falls back to PNG when the browser cannot write WebP. */
export function canvasToBlob(canvas, format = "webp") {
  const type = format === "png" ? "image/png" : "image/webp";
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if ( blob ) resolve(blob);
        else reject(new Error("o navegador não gerou a imagem"));
      }, type, 0.92);
    }
    catch ( err ) {
      if ( err?.name === "SecurityError" ) {
        reject(new Error("a imagem veio de outro site e o navegador bloqueou a gravação. Envie o arquivo para o Foundry (arraste-o para o editor) e tente de novo."));
      }
      else reject(err);
    }
  });
}

/* ---------------------------------------------------------------------------------------------- */
/* Template thumbnails                                                                              */
/* ---------------------------------------------------------------------------------------------- */

const thumbs = new Map();
let thumbChain = Promise.resolve();

/** Small preview of a template with the placeholder silhouette (data URL, cached). */
export function templateThumb(def, width = 140) {
  const id = `${def.id}|${hash(def.kind === "vetor" ? def.style : [def.src, def.key, def.tol])}|${width}`;
  if ( thumbs.has(id) ) return thumbs.get(id);
  const job = thumbChain.then(async () => {
    const baseW = def.kind === "vetor" ? windowOf(def.style).W : (await prepare(def, null, 1)).w;
    const prep = await prepare(def, def.style ?? null, width / baseW);
    const card = { image: NEUTRAL_IMAGE, windowBg: { mode: "nenhum" }, shadow: 0.3, tint: null, label: { on: false } };
    const { canvas } = composeCard(prep, card, { image: null, placeholder: true });
    return canvas.toDataURL("image/png");
  });
  thumbChain = job.catch(() => null);
  thumbs.set(id, job);
  job.catch(() => thumbs.delete(id));
  return job;
}
