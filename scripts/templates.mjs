/**
 * Cartas-editor: every template the editor offers.
 *   raster  a PNG whose flat key colour marks the picture area (the GM's own templates and imports)
 *   vetor   a style drawn by svg-frames.mjs (presets and styles the GM saved as templates)
 *
 * prepare() turns a template into canvases at a given scale: { w, h, scale, frame, mask, box }.
 * w/h/box are in template units (raster = image pixels, vetor = card units); the canvases are w*scale.
 */
import { PATH, hash } from "./constants.mjs";
import { extractKey } from "./chroma.mjs";
import { PRESETS, buildFrameSVG, buildMaskSVG, normalizeStyle, windowOf } from "./svg-frames.mjs";
import { getCustomTemplates } from "./store.mjs";

/** The three templates made by the GM (flat pink / blue picture areas). */
export const GM_TEMPLATES = [
  { id: "r-jogadores", kind: "raster", builtin: true, name: "Jogadores", category: "jogador", src: `${PATH}/assets/templates/modelo-jogadores.png`, key: "#1430e8", tol: 60 },
  { id: "r-npc", kind: "raster", builtin: true, name: "NPC", category: "npc", src: `${PATH}/assets/templates/card-npc.png`, key: "#f61aff", tol: 60 },
  { id: "r-inimigo", kind: "raster", builtin: true, name: "Inimigo", category: "criatura", src: `${PATH}/assets/templates/card-inimigo.png`, key: "#f61aff", tol: 60 }
];

/** In the gallery order: the GM's templates, the imported ones, then the module's styles. */
export function allTemplates() {
  return [...GM_TEMPLATES, ...getCustomTemplates(), ...PRESETS];
}

export function findTemplate(id) {
  return allTemplates().find(t => t.id === id) ?? null;
}

/* ---------------------------------------------------------------------------------------------- */
/* Images                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

const images = new Map();

/** Load an image once (same src = same promise). External http(s) images ask for CORS. */
export function loadImage(src) {
  if ( !src ) return Promise.reject(new Error("sem imagem"));
  if ( images.has(src) ) return images.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    if ( /^https?:\/\//i.test(src) && !src.startsWith(window.location.origin) ) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`não consegui abrir a imagem "${src}"`));
    img.src = src;
  });
  images.set(src, p);
  p.catch(() => images.delete(src));
  return p;
}

export function forgetImage(src) {
  images.delete(src);
}

/** Rasterise an SVG string (not cached: styles change all the time while editing). */
export function svgImage(svg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("o navegador não desenhou a moldura (SVG)"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function scaled(source, w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

/* ---------------------------------------------------------------------------------------------- */
/* Preparing a template                                                                             */
/* ---------------------------------------------------------------------------------------------- */

const keyed = new Map(); /* raster: src|key|tol -> { w, h, frame, mask, box, coverage } at scale 1 */
const prepared = new Map(); /* full key -> Promise<prep>, least recently used first */
const pixels = new Map(); /* full key -> canvas pixels held by that prep */
const MAX_PIXELS = 24e6; /* ~100 MB of canvases: big frames are evicted first, small thumbnails stay */

/** Split a raster template (cached by src, key and tolerance). */
export async function keyTemplate(src, key, tol = 60) {
  const id = `${src}|${key}|${tol}`;
  if ( keyed.has(id) ) return keyed.get(id);
  const job = (async () => {
    const img = await loadImage(src);
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = makeCanvas(w, h);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const res = extractKey(data, key, { tol, soft: Math.max(tol + 60, 150) });
    const frame = makeCanvas(w, h);
    frame.getContext("2d").putImageData(res.frame, 0, 0);
    const mask = makeCanvas(w, h);
    mask.getContext("2d").putImageData(res.mask, 0, 0);
    return { w, h, frame, mask, box: res.box, coverage: res.coverage };
  })();
  keyed.set(id, job);
  job.catch(() => keyed.delete(id));
  return job;
}

/** Style actually used for a template + card (vector templates can be customised per card). */
export function styleFor(def, cardStyle) {
  if ( def?.kind !== "vetor" ) return null;
  return normalizeStyle(cardStyle ?? def.style);
}

/**
 * Canvases of a template at `scale` output pixels per template unit.
 * @returns {Promise<{w:number,h:number,scale:number,frame:HTMLCanvasElement,mask:HTMLCanvasElement,box:object,kind:string}>}
 */
export function prepare(def, cardStyle, scale = 1) {
  if ( !def ) return Promise.reject(new Error("modelo não encontrado"));
  const sc = Math.max(0.1, Math.round(scale * 100) / 100);
  const style = styleFor(def, cardStyle);
  const id = def.kind === "vetor" ? `v|${hash(style)}|${sc}` : `r|${def.src}|${def.key}|${def.tol}|${sc}`;
  if ( prepared.has(id) ) {
    const p = prepared.get(id);
    prepared.delete(id);
    prepared.set(id, p); /* most recently used last */
    return p;
  }
  const job = (async () => {
    if ( def.kind === "vetor" ) {
      const geo = windowOf(style);
      const [frameImg, maskImg] = await Promise.all([svgImage(buildFrameSVG(style, sc)), svgImage(buildMaskSVG(style, sc))]);
      const w = geo.W, h = geo.H;
      const frame = scaled(frameImg, w * sc, h * sc);
      const mask = scaled(maskImg, w * sc, h * sc);
      return { kind: "vetor", w, h, scale: sc, frame, mask, box: geo.box, key: id };
    }
    const base = await keyTemplate(def.src, def.key, def.tol);
    const frame = sc === 1 ? base.frame : scaled(base.frame, base.w * sc, base.h * sc);
    const mask = sc === 1 ? base.mask : scaled(base.mask, base.w * sc, base.h * sc);
    return { kind: "raster", w: base.w, h: base.h, scale: sc, frame, mask, box: base.box, key: id, coverage: base.coverage };
  })();
  prepared.set(id, job);
  job.then(prep => {
    pixels.set(id, prep.frame.width * prep.frame.height * 3);
    trimCache(id);
  }, () => prepared.delete(id));
  return job;
}

/** Drop the least recently used preps until the canvases fit in MAX_PIXELS (never the newest one). */
function trimCache(keep) {
  let total = 0;
  for ( const v of pixels.values() ) total += v;
  for ( const key of [...prepared.keys()] ) {
    if ( total <= MAX_PIXELS ) break;
    if ( key === keep || !pixels.has(key) ) continue;
    total -= pixels.get(key);
    pixels.delete(key);
    prepared.delete(key);
  }
}

/** Inner shadow of a prepared template (dark at the window edge, cached on the prep). */
export function innerShadow(prep) {
  if ( prep.shadow ) return prep.shadow;
  const { width, height } = prep.mask;
  const blur = Math.max(2, Math.round(Math.min(prep.box.w, prep.box.h) * 0.06 * prep.scale));
  const outside = makeCanvas(width, height);
  let ctx = outside.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(prep.mask, 0, 0);
  const soft = makeCanvas(width, height);
  ctx = soft.getContext("2d");
  if ( "filter" in ctx ) {
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(outside, 0, 0);
    ctx.filter = "none";
  }
  else ctx.drawImage(outside, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(prep.mask, 0, 0);
  prep.shadow = soft;
  return soft;
}
