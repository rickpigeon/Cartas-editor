/**
 * Cartas-editor: card frames drawn by the module (vector). A style = card size + window shape + metal +
 * ornaments + background. buildFrameSVG() draws everything except the picture; buildMaskSVG() draws the
 * window (where the picture shows). Both use the same coordinates, so they line up at any scale.
 */
import { color, mix, rng, shade } from "./constants.mjs";

export const CARD_TYPES = {
  retrato: { label: "Carta em pé", w: 450, h: 750 },
  quadrado: { label: "Quadrada", w: 600, h: 600 },
  redondo: { label: "Redonda (token)", w: 600, h: 600 }
};

export const SHAPES = {
  arco: "Arco",
  capsula: "Cápsula",
  retangulo: "Retângulo",
  ogiva: "Ogiva gótica",
  oval: "Oval",
  escudo: "Escudo",
  cartucho: "Cartucho barroco",
  octogono: "Octógono",
  hexagono: "Hexágono",
  circulo: "Círculo"
};

export const METALS = {
  ouro: { label: "Ouro", base: "#f2b33d", light: "#ffe7a3", dark: "#b8741a", outline: "#5c1f05", accent: "#b59a5a", gem: "#d8263b" },
  prata: { label: "Prata", base: "#c3cad4", light: "#f7f9fb", dark: "#7d8794", outline: "#26303d", accent: "#8fa3b8", gem: "#3d7bf0" },
  bronze: { label: "Bronze", base: "#c98146", light: "#f3c08d", dark: "#86491d", outline: "#3b1906", accent: "#9b8457", gem: "#2fa36b" },
  rose: { label: "Ouro rosé", base: "#e8a598", light: "#ffe0d8", dark: "#b06a5c", outline: "#4d1d18", accent: "#c9a07a", gem: "#8f3fd1" },
  obsidiana: { label: "Obsidiana", base: "#4a3f5c", light: "#9a8ab3", dark: "#211a2c", outline: "#0b0710", accent: "#6b4d7a", gem: "#d42a4a" },
  ferro: { label: "Ferro", base: "#6f747c", light: "#b4bac2", dark: "#3c4047", outline: "#15171a", accent: "#7d6a55", gem: "#e0761a" },
  jade: { label: "Jade", base: "#4fae7b", light: "#b5ecc9", dark: "#2a7150", outline: "#0e3221", accent: "#c8b46a", gem: "#f2c12e" },
  rubi: { label: "Rubi", base: "#cf3a45", light: "#ff9fa3", dark: "#7e1622", outline: "#36060c", accent: "#e0a04a", gem: "#ffd34d" },
  safira: { label: "Safira", base: "#3f74db", light: "#a9c8ff", dark: "#1d3f8c", outline: "#0a1838", accent: "#c0c8d8", gem: "#f0f4ff" },
  ametista: { label: "Ametista", base: "#9b5fd9", light: "#dcbcff", dark: "#5c2e96", outline: "#250f40", accent: "#d4af37", gem: "#3fe0d0" },
  osso: { label: "Osso", base: "#e6d8b8", light: "#fffaee", dark: "#ad9a72", outline: "#463822", accent: "#8c7a5c", gem: "#b3202a" },
  madeira: { label: "Madeira", base: "#9c6b3d", light: "#d1a26c", dark: "#62401f", outline: "#2a1707", accent: "#6f8a3c", gem: "#e3a72f" },
  gelo: { label: "Gelo", base: "#a8def2", light: "#f2fcff", dark: "#5aa3c4", outline: "#173f52", accent: "#d5ecf5", gem: "#5fd0ff" },
  custom: { label: "Cor própria", base: "#888888", light: "#cccccc", dark: "#555555", outline: "#1a1a1a", accent: "#999999", gem: "#ffffff" }
};

export const ORNAMENTS = {
  volutas: "Volutas e folhas",
  joias: "Joias e cravos",
  espinhos: "Espinhos e chifres",
  runas: "Runas brilhantes",
  louros: "Louros e laço",
  estrelas: "Estrelas e lua",
  cantoneiras: "Cantoneiras de metal",
  nenhum: "Nenhum"
};

export const BACKGROUNDS = {
  pergaminho: "Pergaminho",
  liso: "Cor lisa",
  gradiente: "Degradê",
  estrelado: "Céu estrelado",
  pedra: "Pedra",
  madeira: "Madeira",
  marmore: "Mármore",
  damasco: "Tecido adamascado",
  losangos: "Losangos",
  raios: "Raios de sol",
  transparente: "Transparente"
};

export const DEFAULT_STYLE = {
  card: "retrato",
  shape: "arco",
  metal: "ouro",
  metalColor: "#8a6a3a",
  accent: null,
  gem: null,
  ornament: "volutas",
  background: "pergaminho",
  bg1: "#f3e2b9",
  bg2: "#b98a4e",
  border: 14,
  double: true,
  margin: 40,
  seed: 7,
  ornScale: 1,
  vignette: true,
  edge: true
};

/* ---------------------------------------------------------------------------------------------- */
/* Small helpers                                                                                    */
/* ---------------------------------------------------------------------------------------------- */

const f = n => +Number(n).toFixed(2);
const pt = (x, y) => `${f(x)},${f(y)}`;
const rgbF = hex => {
  const n = parseInt(color(hex, "#000000").slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(v => +v.toFixed(4));
};
const esc = v => String(v).replace(/[<>&"]/g, "");

/** The colours of a style (metal + optional custom colours). */
export function paletteOf(style) {
  let p = METALS[style.metal] ?? METALS.ouro;
  if ( style.metal === "custom" ) {
    const base = color(style.metalColor, "#8a6a3a");
    p = { base, light: shade(base, 0.55), dark: shade(base, -0.38), outline: shade(base, -0.78), accent: mix(base, "#6f7f4f", 0.45), gem: "#ffffff" };
  }
  return { ...p, accent: color(style.accent, p.accent), gem: color(style.gem, p.gem) };
}

/** Card size and the window (picture) box of a style. */
export function geometry(style) {
  const type = CARD_TYPES[style.card] ?? CARD_TYPES.retrato;
  const W = type.w, H = type.h;
  const s = Math.min(W, H) / 450;
  const m = Math.max(10, Number(style.margin) || 40) * s;
  let box;
  if ( style.card === "redondo" ) {
    const r = W / 2 - m * 1.35;
    box = { x: W / 2 - r, y: H / 2 - r, w: 2 * r, h: 2 * r };
  }
  else if ( style.card === "quadrado" ) box = { x: m, y: m, w: W - 2 * m, h: H - 2 * m };
  else box = { x: m, y: m + 16 * s, w: W - 2 * m, h: H - 2 * m - 32 * s };
  const shape = style.card === "redondo" ? "circulo" : (SHAPES[style.shape] ? style.shape : "arco");
  return { W, H, s, box, shape };
}

function roundRect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${pt(x + r, y)} H${f(x + w - r)} A${f(r)},${f(r)} 0 0 1 ${pt(x + w, y + r)} V${f(y + h - r)} `
    + `A${f(r)},${f(r)} 0 0 1 ${pt(x + w - r, y + h)} H${f(x + r)} A${f(r)},${f(r)} 0 0 1 ${pt(x, y + h - r)} `
    + `V${f(y + r)} A${f(r)},${f(r)} 0 0 1 ${pt(x + r, y)} Z`;
}

function circlePath(cx, cy, r) {
  return `M${pt(cx - r, cy)} A${f(r)},${f(r)} 0 1 1 ${pt(cx + r, cy)} A${f(r)},${f(r)} 0 1 1 ${pt(cx - r, cy)} Z`;
}

/** SVG path of a window shape inside box b. */
export function shapePath(shape, b) {
  const { x, y, w, h } = b;
  const cx = x + w / 2, cy = y + h / 2;
  const rb = w * 0.05;
  switch ( shape ) {
    case "retangulo": return roundRect(x, y, w, h, w * 0.05);
    case "arco": {
      const r = w / 2;
      return `M${pt(x, y + r)} A${f(r)},${f(r)} 0 0 1 ${pt(x + w, y + r)} V${f(y + h - rb)} A${f(rb)},${f(rb)} 0 0 1 ${pt(x + w - rb, y + h)} `
        + `H${f(x + rb)} A${f(rb)},${f(rb)} 0 0 1 ${pt(x, y + h - rb)} Z`;
    }
    case "capsula": {
      const r = Math.min(w, h) / 2;
      return `M${pt(x, y + r)} A${f(r)},${f(r)} 0 0 1 ${pt(x + w, y + r)} V${f(y + h - r)} A${f(r)},${f(r)} 0 0 1 ${pt(x, y + h - r)} Z`;
    }
    case "ogiva": {
      const k = w * 0.7;
      return `M${pt(x, y + h - rb)} V${f(y + k)} C${pt(x, y + k * 0.42)} ${pt(x + w * 0.26, y + k * 0.1)} ${pt(cx, y)} `
        + `C${pt(x + w * 0.74, y + k * 0.1)} ${pt(x + w, y + k * 0.42)} ${pt(x + w, y + k)} V${f(y + h - rb)} `
        + `A${f(rb)},${f(rb)} 0 0 1 ${pt(x + w - rb, y + h)} H${f(x + rb)} A${f(rb)},${f(rb)} 0 0 1 ${pt(x, y + h - rb)} Z`;
    }
    case "oval": return `M${pt(x, cy)} A${f(w / 2)},${f(h / 2)} 0 1 1 ${pt(x + w, cy)} A${f(w / 2)},${f(h / 2)} 0 1 1 ${pt(x, cy)} Z`;
    case "escudo": {
      const t = w * 0.07;
      return `M${pt(x, y + t)} Q${pt(x + w * 0.25, y - t * 0.6)} ${pt(cx, y + t * 0.5)} Q${pt(x + w * 0.75, y - t * 0.6)} ${pt(x + w, y + t)} `
        + `V${f(y + h * 0.58)} C${pt(x + w, y + h * 0.8)} ${pt(x + w * 0.72, y + h * 0.9)} ${pt(cx, y + h)} `
        + `C${pt(x + w * 0.28, y + h * 0.9)} ${pt(x, y + h * 0.8)} ${pt(x, y + h * 0.58)} Z`;
    }
    case "cartucho": {
      const c = w * 0.15, k = w * 0.035;
      return `M${pt(x + c, y)} Q${pt(cx, y + k)} ${pt(x + w - c, y)} A${f(c)},${f(c)} 0 0 0 ${pt(x + w, y + c)} `
        + `Q${pt(x + w - k, cy)} ${pt(x + w, y + h - c)} A${f(c)},${f(c)} 0 0 0 ${pt(x + w - c, y + h)} `
        + `Q${pt(cx, y + h - k)} ${pt(x + c, y + h)} A${f(c)},${f(c)} 0 0 0 ${pt(x, y + h - c)} `
        + `Q${pt(x + k, cy)} ${pt(x, y + c)} A${f(c)},${f(c)} 0 0 0 ${pt(x + c, y)} Z`;
    }
    case "octogono": {
      const c = w * 0.17;
      return `M${pt(x + c, y)} H${f(x + w - c)} L${pt(x + w, y + c)} V${f(y + h - c)} L${pt(x + w - c, y + h)} `
        + `H${f(x + c)} L${pt(x, y + h - c)} V${f(y + c)} Z`;
    }
    case "hexagono": {
      const t = w * 0.3;
      return `M${pt(cx, y)} L${pt(x + w, y + t)} V${f(y + h - t)} L${pt(cx, y + h)} L${pt(x, y + h - t)} V${f(y + t)} Z`;
    }
    case "circulo":
    default: {
      const r = Math.min(w, h) / 2;
      return circlePath(cx, cy, r);
    }
  }
}

function cardPath(style, W, H, inset = 0) {
  if ( style.card === "redondo" ) return circlePath(W / 2, H / 2, W / 2 - inset);
  const r = (style.card === "quadrado" ? 26 : 18) * (Math.min(W, H) / 450);
  return roundRect(inset, inset, W - 2 * inset, H - 2 * inset, Math.max(2, r - inset * 0.6));
}

/* ---------------------------------------------------------------------------------------------- */
/* Sampling a path (points + outward normals) with an off-screen SVG element                       */
/* ---------------------------------------------------------------------------------------------- */

let probe = null;
function probePath() {
  if ( probe?.isConnected ) return probe;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;visibility:hidden;";
  probe = document.createElementNS(ns, "path");
  svg.append(probe);
  document.body.append(svg);
  return probe;
}

/** Points every `step` units along a closed path, each with the outward unit normal (away from c). */
function samplePath(d, step, c) {
  const p = probePath();
  p.setAttribute("d", d);
  const len = p.getTotalLength();
  const n = Math.max(8, Math.round(len / step));
  const out = [];
  for ( let i = 0; i < n; i++ ) {
    const l = (i / n) * len;
    const a = p.getPointAtLength(l);
    const b = p.getPointAtLength((l + 1) % len);
    let tx = b.x - a.x, ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    let nx = ty, ny = -tx;
    if ( (a.x - c.x) * nx + (a.y - c.y) * ny < 0 ) {
      nx = -nx;
      ny = -ny;
    }
    out.push({ x: a.x, y: a.y, nx, ny, l });
  }
  return { points: out, length: len };
}

/** The point of a sampled path nearest to (x, y). */
function nearest(samples, x, y) {
  let best = samples[0], bd = Infinity;
  for ( const q of samples ) {
    const d = (q.x - x) ** 2 + (q.y - y) ** 2;
    if ( d < bd ) {
      bd = d;
      best = q;
    }
  }
  return best;
}

/* ---------------------------------------------------------------------------------------------- */
/* Ornament pieces (local coordinates; placed with transforms)                                      */
/* ---------------------------------------------------------------------------------------------- */

/** A tapered spiral (C-scroll) whose eye is at 0,0. Returns { body, eye: {x, y, r}, rib }. */
function scrollShape(R, turns, w0, tail) {
  const T = turns * Math.PI * 2;
  const k = Math.log(1 / 0.2) / T;
  const N = 64;
  const left = [], right = [], rib = [];
  let end = null;
  for ( let i = 0; i <= N; i++ ) {
    const t = (i / N) * T;
    const r = R * Math.exp(-k * t);
    const x = r * Math.cos(t), y = r * Math.sin(t);
    let tx = -k * Math.cos(t) - Math.sin(t), ty = -k * Math.sin(t) + Math.cos(t);
    const tl = Math.hypot(tx, ty);
    tx /= tl;
    ty /= tl;
    const nx = -ty, ny = tx;
    const w = w0 * Math.pow(r / R, 0.7);
    left.push([x + nx * w / 2, y + ny * w / 2]);
    right.push([x - nx * w / 2, y - ny * w / 2]);
    if ( i < N * 0.75 ) rib.push([x + nx * w * 0.18, y + ny * w * 0.18]);
    if ( i === N ) end = { x, y, r: w * 0.85 + 1.2 };
  }
  /* The stem leaves the outer end of the spiral backwards along its tangent and tapers to a point. */
  const t0x = -k, t0y = 1, tl0 = Math.hypot(t0x, t0y);
  const tip = [R - (t0x / tl0) * tail, -(t0y / tl0) * tail];
  const pts = [tip, ...left, ...right.reverse()];
  const body = `M${pts.map(p => pt(p[0], p[1])).join(" L")} Z`;
  const ribPath = `M${[[R - (t0x / tl0) * tail * 0.6, -(t0y / tl0) * tail * 0.6], ...rib].map(p => pt(p[0], p[1])).join(" L")}`;
  return { body, eye: end, rib: ribPath };
}

function leafPath(L, W, bend) {
  return `M0,0 C${pt(L * 0.25, -W)} ${pt(L * 0.65, -W * 0.95 + bend * 0.5)} ${pt(L, bend)} `
    + `C${pt(L * 0.62, W * 0.55 + bend * 0.6)} ${pt(L * 0.25, W * 0.8)} 0,0 Z`;
}
function leafRib(L, W, bend) {
  return `M${pt(L * 0.06, 0)} Q${pt(L * 0.55, bend * 0.45 - W * 0.12)} ${pt(L * 0.9, bend * 0.92)}`;
}

function thornPath(L, w, bend) {
  return `M${pt(-w / 2, 0)} Q${pt(-w * 0.15 + bend * 0.4, -L * 0.55)} ${pt(bend, -L)} Q${pt(w * 0.3 + bend * 0.4, -L * 0.5)} ${pt(w / 2, 0)} Z`;
}

function starPath(r, k = 0.2) {
  const q = r * k;
  return `M0,${f(-r)} Q${pt(q, -q)} ${f(r)},0 Q${pt(q, q)} 0,${f(r)} Q${pt(-q, q)} ${f(-r)},0 Q${pt(-q, -q)} 0,${f(-r)} Z`;
}

const RUNES = [
  [[[0.2, 0], [0.2, 1]], [[0.2, 0.22], [0.62, 0]], [[0.2, 0.48], [0.62, 0.26]]],
  [[[0.15, 1], [0.15, 0], [0.58, 0.32], [0.58, 1]]],
  [[[0.2, 0], [0.2, 1]], [[0.2, 0.28], [0.58, 0.5], [0.2, 0.72]]],
  [[[0.2, 1], [0.2, 0], [0.58, 0.25], [0.2, 0.5], [0.58, 1]]],
  [[[0.58, 0.08], [0.18, 0.5], [0.58, 0.92]]],
  [[[0.08, 0.06], [0.62, 0.94]], [[0.62, 0.06], [0.08, 0.94]]],
  [[[0.14, 0], [0.14, 1]], [[0.56, 0], [0.56, 1]], [[0.14, 0.32], [0.56, 0.62]]],
  [[[0.35, 0], [0.35, 1]], [[0.05, 0.02], [0.35, 0.36], [0.65, 0.02]]],
  [[[0.05, 0.08], [0.05, 0.92], [0.65, 0.08], [0.65, 0.92], [0.05, 0.08]]],
  [[[0.1, 1], [0.58, 0.48], [0.35, 0.16], [0.12, 0.48], [0.6, 1]]],
  [[[0.35, 0], [0.35, 1]], [[0.35, 0.3], [0.65, 0.12]], [[0.35, 0.3], [0.05, 0.12]], [[0.35, 0.62], [0.65, 0.44]], [[0.35, 0.62], [0.05, 0.44]]],
  [[[0.12, 0], [0.12, 1]], [[0.12, 0.08], [0.6, 0.42], [0.12, 0.76]]]
];
function runePath(index, size) {
  const g = RUNES[index % RUNES.length];
  return g.map(line => `M${line.map(([x, y]) => pt((x - 0.35) * size, (y - 0.5) * size)).join(" L")}`).join(" ");
}

/* ---------------------------------------------------------------------------------------------- */
/* Ornament sets                                                                                    */
/* ---------------------------------------------------------------------------------------------- */

class Ink {
  constructor(P, s) {
    this.P = P;
    this.s = s;
    this.out = [];
    this.sw = 2.1 * s;
  }
  add(svg) {
    this.out.push(svg);
  }
  stroke(width = this.sw) {
    return `stroke="${this.P.outline}" stroke-width="${f(width)}" stroke-linejoin="round" stroke-linecap="round"`;
  }
  scroll(x, y, R, turns, w0, tail, rot, flip = 1, fill = "url(#ceMetal)") {
    const sc = scrollShape(R, turns, w0, tail);
    this.add(`<g transform="translate(${pt(x, y)}) rotate(${f(rot)}) scale(${flip},1)">`
      + `<path d="${sc.body}" fill="${fill}" ${this.stroke()}/>`
      + `<path d="${sc.rib}" fill="none" stroke="${this.P.light}" stroke-width="${f(Math.max(1, w0 * 0.16))}" stroke-linecap="round" opacity=".75"/>`
      + `<circle cx="${f(sc.eye.x)}" cy="${f(sc.eye.y)}" r="${f(sc.eye.r)}" fill="${fill}" ${this.stroke()}/>`
      + "</g>");
  }
  leaf(x, y, L, W, bend, rot, fill = "url(#ceLeaf)") {
    this.add(`<g transform="translate(${pt(x, y)}) rotate(${f(rot)})">`
      + `<path d="${leafPath(L, W, bend)}" fill="${fill}" ${this.stroke()}/>`
      + `<path d="${leafRib(L, W, bend)}" fill="none" stroke="${this.P.outline}" stroke-width="${f(this.sw * 0.6)}" stroke-linecap="round" opacity=".7"/>`
      + "</g>");
  }
  gem(x, y, rx, ry, setting = true) {
    const s = this.s;
    let g = "";
    if ( setting ) g += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx + 3.2 * s)}" ry="${f(ry + 3.2 * s)}" fill="url(#ceMetal)" ${this.stroke()}/>`;
    g += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#ceGem)" ${this.stroke()}/>`;
    g += `<path d="M${pt(x - rx * 0.55, y)} L${pt(x, y - ry * 0.6)} L${pt(x + rx * 0.55, y)} L${pt(x, y + ry * 0.6)} Z" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="${f(0.9 * s)}"/>`;
    g += `<ellipse cx="${f(x - rx * 0.32)}" cy="${f(y - ry * 0.38)}" rx="${f(rx * 0.26)}" ry="${f(ry * 0.18)}" fill="#ffffff" opacity=".85" transform="rotate(-30 ${pt(x - rx * 0.32, y - ry * 0.38)})"/>`;
    this.add(g);
  }
  stud(x, y, r) {
    this.add(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="url(#ceMetal)" ${this.stroke()}/>`
      + `<circle cx="${f(x - r * 0.3)}" cy="${f(y - r * 0.32)}" r="${f(r * 0.32)}" fill="${this.P.light}" opacity=".9"/>`);
  }
  thorn(x, y, L, w, bend, rot, fill = "url(#ceMetal)") {
    this.add(`<path d="${thornPath(L, w, bend)}" transform="translate(${pt(x, y)}) rotate(${f(rot)})" fill="${fill}" ${this.stroke()}/>`);
  }
  star(x, y, r, fill = "url(#ceMetal)", k = 0.2) {
    this.add(`<path d="${starPath(r, k)}" transform="translate(${pt(x, y)})" fill="${fill}" ${this.stroke(this.sw * 0.8)}/>`);
  }
}

const deg = (x, y) => Math.atan2(y, x) * 180 / Math.PI;

/** Anchors on the window border: the four "corners" (nearest point to the box corners), top, bottom, sides. */
function anchorsOf(samples, b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const top = samples.filter(q => q.y < cy).reduce((a, q) => (Math.abs(q.x - cx) < Math.abs(a.x - cx) ? q : a));
  const bottom = samples.filter(q => q.y > cy).reduce((a, q) => (Math.abs(q.x - cx) < Math.abs(a.x - cx) ? q : a));
  const left = samples.filter(q => q.x < cx).reduce((a, q) => (Math.abs(q.y - cy) < Math.abs(a.y - cy) ? q : a));
  const tl = nearest(samples, b.x, b.y);
  const bl = nearest(samples, b.x, b.y + b.h);
  return { top, bottom, left, tl, bl, cx, cy };
}

/**
 * Everything drawn in the top-left quarter (and the left side / top centre) is mirrored by <use>:
 * the window is centred in the card, so x -> W - x and y -> H - y give the other corners.
 */
function ornamentSet(kind, ctx) {
  const { P, s, B, W, H, samples, b, seed } = ctx;
  const A = anchorsOf(samples, b);
  const ink = new Ink(P, s);
  const corner = new Ink(P, s); /* top-left corner, mirrored x3 */
  const crest = new Ink(P, s); /* top crest (left half drawn whole), mirrored to the bottom */
  const side = new Ink(P, s); /* left side, mirrored to the right */
  const free = new Ink(P, s); /* drawn once, not mirrored */
  const out = B / 2 + 1.5 * s; /* just outside the band */
  const tl = A.tl;
  const dTL = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
  const along = (q, d) => ({ x: q.x + q.nx * d, y: q.y + q.ny * d });

  switch ( kind ) {
    case "volutas": {
      /* Corner: two big C-scrolls whose stems lie on the band (one along the top, one down the side),
         a fan of acanthus leaves towards the card corner and a small counter-scroll at each stem end. */
      const o = along(tl, out * 0.15);
      const R = 21 * s, w0 = 14 * s, tail = 44 * s;
      corner.leaf(o.x - 6 * s, o.y - 6 * s, 64 * s, 14 * s, -7 * s, 225);
      corner.leaf(o.x - 2 * s, o.y + 4 * s, 50 * s, 11 * s, 8 * s, 200);
      corner.leaf(o.x + 4 * s, o.y - 2 * s, 50 * s, 11 * s, -8 * s, 250);
      corner.scroll(o.x + 12 * s + tail + 8 * s, o.y - 9 * s, 9 * s, 1.1, 7 * s, 14 * s, -90, -1);
      corner.scroll(o.x - 9 * s, o.y + 12 * s + tail + 8 * s, 9 * s, 1.1, 7 * s, 14 * s, 0, 1);
      corner.scroll(o.x + 12 * s, o.y - R, R, 1.3, w0, tail, 90, 1);
      corner.scroll(o.x - R, o.y + 12 * s, R, 1.3, w0, tail, 180, -1);
      corner.leaf(o.x + 30 * s, o.y - 4 * s, 30 * s, 8 * s, -4 * s, -28);
      corner.leaf(o.x - 4 * s, o.y + 30 * s, 30 * s, 8 * s, 4 * s, 118);
      corner.gem(o.x + 1 * s, o.y + 1 * s, 6.5 * s, 6.5 * s);
      /* Top crest: a fan of five leaves, two scrolls back to back and a gem. Mirrored to the bottom. */
      const t = along(A.top, out * 0.1);
      crest.leaf(t.x, t.y - 4 * s, 58 * s, 13 * s, 0, -90);
      crest.leaf(t.x - 4 * s, t.y - 2 * s, 46 * s, 11 * s, -6 * s, -122);
      crest.leaf(t.x + 4 * s, t.y - 2 * s, 46 * s, 11 * s, 6 * s, -58);
      crest.leaf(t.x - 6 * s, t.y, 34 * s, 9 * s, -5 * s, -152);
      crest.leaf(t.x + 6 * s, t.y, 34 * s, 9 * s, 5 * s, -28);
      crest.scroll(t.x - 30 * s, t.y - 14 * s, 14 * s, 1.2, 10 * s, 24 * s, 90, 1);
      crest.scroll(t.x + 30 * s, t.y - 14 * s, 14 * s, 1.2, 10 * s, 24 * s, -90, -1);
      crest.gem(t.x, t.y - 8 * s, 10 * s, 12 * s);
      /* Sides: a small fan of leaves with a stud. */
      const l = along(A.left, out * 0.1);
      side.leaf(l.x, l.y, 36 * s, 10 * s, 0, 180);
      side.leaf(l.x, l.y - 4 * s, 30 * s, 8 * s, -5 * s, 148);
      side.leaf(l.x, l.y + 4 * s, 30 * s, 8 * s, 5 * s, 212);
      side.stud(l.x + 1 * s, l.y, 6 * s);
      break;
    }
    case "joias": {
      const studs = samplePath(ctx.windowD, 26 * s, { x: A.cx, y: A.cy }).points;
      for ( const q of studs ) free.stud(q.x, q.y, Math.max(2.2 * s, B * 0.3));
      const o = along(tl, out * 0.3);
      corner.leaf(o.x - 4 * s, o.y - 4 * s, 40 * s, 10 * s, -4 * s, 205);
      corner.leaf(o.x - 4 * s, o.y - 4 * s, 40 * s, 10 * s, 4 * s, 245);
      corner.add(`<path d="M${pt(o.x, o.y - 17 * s)} L${pt(o.x + 11 * s, o.y)} L${pt(o.x, o.y + 17 * s)} L${pt(o.x - 11 * s, o.y)} Z" transform="rotate(45 ${pt(o.x, o.y)})" fill="url(#ceMetal)" ${corner.stroke()}/>`
        + `<path d="M${pt(o.x, o.y - 12 * s)} L${pt(o.x + 7.5 * s, o.y)} L${pt(o.x, o.y + 12 * s)} L${pt(o.x - 7.5 * s, o.y)} Z" transform="rotate(45 ${pt(o.x, o.y)})" fill="url(#ceGem)" ${corner.stroke(corner.sw * 0.8)}/>`);
      const t = along(A.top, out * 0.2);
      crest.leaf(t.x - 12 * s, t.y - 4 * s, 46 * s, 12 * s, -6 * s, 196);
      crest.leaf(t.x + 12 * s, t.y - 4 * s, 46 * s, 12 * s, 6 * s, -16);
      crest.leaf(t.x - 8 * s, t.y - 12 * s, 34 * s, 9 * s, -4 * s, 222);
      crest.leaf(t.x + 8 * s, t.y - 12 * s, 34 * s, 9 * s, 4 * s, -42);
      crest.gem(t.x, t.y - 8 * s, 17 * s, 21 * s);
      const l = along(A.left, out * 0.2);
      side.leaf(l.x, l.y - 6 * s, 28 * s, 8 * s, -4 * s, 160);
      side.leaf(l.x, l.y + 6 * s, 28 * s, 8 * s, 4 * s, 200);
      side.gem(l.x, l.y, 9 * s, 13 * s);
      break;
    }
    case "espinhos": {
      const pts = samplePath(ctx.windowD, 22 * s, { x: A.cx, y: A.cy }).points;
      const r = rng(seed);
      for ( const q of pts ) {
        const base = along(q, B / 2 - 1 * s);
        free.thorn(base.x, base.y, (15 + r() * 9) * s, 9 * s, (r() - 0.5) * 8 * s, deg(q.nx, q.ny) + 90, "url(#ceThorn)");
      }
      const o = along(tl, out * 0.3);
      corner.thorn(o.x, o.y, 54 * s, 16 * s, -10 * s, -45, "url(#ceThorn)");
      corner.thorn(o.x + 8 * s, o.y, 36 * s, 12 * s, 7 * s, -14, "url(#ceThorn)");
      corner.thorn(o.x, o.y + 8 * s, 36 * s, 12 * s, -7 * s, -76, "url(#ceThorn)");
      corner.gem(o.x, o.y, 6 * s, 6 * s);
      const t = along(A.top, out * 0.2);
      crest.thorn(t.x - 16 * s, t.y, 68 * s, 20 * s, -24 * s, -30, "url(#ceThorn)");
      crest.thorn(t.x + 16 * s, t.y, 68 * s, 20 * s, 24 * s, 30, "url(#ceThorn)");
      crest.thorn(t.x, t.y - 6 * s, 30 * s, 12 * s, 0, 0, "url(#ceThorn)");
      crest.gem(t.x, t.y - 6 * s, 10 * s, 13 * s);
      const l = along(A.left, out * 0.2);
      side.thorn(l.x, l.y, 40 * s, 13 * s, 0, -90, "url(#ceThorn)");
      side.thorn(l.x, l.y - 10 * s, 26 * s, 10 * s, -5 * s, -120, "url(#ceThorn)");
      side.thorn(l.x, l.y + 10 * s, 26 * s, 10 * s, 5 * s, -60, "url(#ceThorn)");
      side.stud(l.x + 2 * s, l.y, 5.5 * s);
      break;
    }
    case "runas": {
      const pts = samplePath(ctx.windowD, 44 * s, { x: A.cx, y: A.cy }).points;
      const size = 13 * s;
      let i = seed % RUNES.length;
      let glyphs = "";
      for ( const q of pts ) {
        const c = along(q, B / 2 + size * 0.75);
        if ( c.x < size * 0.6 || c.y < size * 0.6 || c.x > W - size * 0.6 || c.y > H - size * 0.6 ) continue;
        glyphs += `<path d="${runePath(i++, size)}" transform="translate(${pt(c.x, c.y)})"/>`;
      }
      free.add(`<g fill="none" stroke="${P.gem}" stroke-width="${f(3.2 * s)}" stroke-linecap="round" stroke-linejoin="round" filter="url(#ceGlow)" opacity=".9">${glyphs}</g>`);
      free.add(`<g fill="none" stroke="${P.light}" stroke-width="${f(1.4 * s)}" stroke-linecap="round" stroke-linejoin="round">${glyphs}</g>`);
      const o = along(tl, out * 0.5);
      corner.add(`<circle cx="${f(o.x)}" cy="${f(o.y)}" r="${f(9 * s)}" fill="url(#ceMetal)" ${corner.stroke()}/>`
        + `<path d="${starPath(6 * s, 0.25)}" transform="translate(${pt(o.x, o.y)})" fill="${P.gem}" filter="url(#ceGlow)"/>`);
      const t = along(A.top, out * 0.4);
      const R = 17 * s;
      const tri = [0, 1, 2].map(k => pt(t.x + R * 0.78 * Math.sin(k * 2.0944), t.y - 6 * s - R * 0.78 * Math.cos(k * 2.0944))).join(" L");
      crest.add(`<circle cx="${f(t.x)}" cy="${f(t.y - 6 * s)}" r="${f(R)}" fill="${P.dark}" ${crest.stroke()}/>`
        + `<circle cx="${f(t.x)}" cy="${f(t.y - 6 * s)}" r="${f(R * 0.86)}" fill="none" stroke="${P.gem}" stroke-width="${f(1.6 * s)}" filter="url(#ceGlow)"/>`
        + `<path d="M${tri} Z" fill="none" stroke="${P.gem}" stroke-width="${f(1.8 * s)}" filter="url(#ceGlow)"/>`
        + `<circle cx="${f(t.x)}" cy="${f(t.y - 6 * s)}" r="${f(3 * s)}" fill="${P.light}"/>`);
      const l = along(A.left, out * 0.3);
      side.stud(l.x, l.y, 5 * s);
      break;
    }
    case "louros": {
      /* Laurel branches climbing both sides from the bottom centre (left branch drawn, right mirrored). */
      const pts = samplePath(ctx.windowD, 3 * s, { x: A.cx, y: A.cy }).points;
      const n = pts.length;
      const bIdx = pts.indexOf(nearest(pts, A.cx, A.bottom.y + 1));
      /* walk from the bottom centre towards the left, up to 30% of the window height */
      const dir = pts[(bIdx + 4) % n].x < pts[bIdx].x ? 1 : -1;
      const walk = [];
      for ( let k = 2; k < n; k++ ) {
        const q = pts[(bIdx + dir * k + n * 4) % n];
        if ( q.y < b.y + b.h * 0.3 || q.x > A.cx + 1 ) break;
        walk.push(q);
      }
      const stem = walk.filter((q, k) => k % 3 === 0).map(q => along(q, out + 3 * s));
      if ( stem.length > 1 ) {
        const sd = `M${stem.map(p => pt(p.x, p.y)).join(" L")}`;
        side.add(`<path d="${sd}" fill="none" stroke="${P.outline}" stroke-width="${f(4.2 * s)}" stroke-linecap="round" stroke-linejoin="round"/>`
          + `<path d="${sd}" fill="none" stroke="${P.dark}" stroke-width="${f(2 * s)}" stroke-linecap="round" stroke-linejoin="round"/>`);
      }
      const stepPts = Math.max(1, Math.round(14 / 3));
      let k = 0;
      for ( let i = 3; i < walk.length - 2; i += stepPts ) {
        const q = walk[i], nxt = walk[Math.min(walk.length - 1, i + 2)];
        const base = along(q, out + 3 * s);
        const heading = deg(nxt.x - q.x, nxt.y - q.y);
        const sideSign = k++ % 2 ? 1 : -1;
        side.leaf(base.x, base.y, 22 * s, 6.5 * s, sideSign * 2 * s, heading + sideSign * 38, "url(#ceLeaf)");
      }
      if ( walk.length > 4 ) {
        const last = walk[walk.length - 1], prev = walk[walk.length - 4];
        const tp = along(last, out + 3 * s);
        side.leaf(tp.x, tp.y, 20 * s, 6 * s, 0, deg(last.x - prev.x, last.y - prev.y), "url(#ceLeaf)");
      }
      /* bow at the bottom centre (not mirrored vertically: drawn once) */
      const bt = along(A.bottom, out * 0.3);
      free.add(`<g transform="translate(${pt(bt.x, bt.y)})">`
        + `<path d="M0,0 C${pt(-30 * s, -22 * s)} ${pt(-44 * s, 6 * s)} ${pt(-18 * s, 10 * s)} Z" fill="url(#ceRibbon)" ${free.stroke()}/>`
        + `<path d="M0,0 C${pt(30 * s, -22 * s)} ${pt(44 * s, 6 * s)} ${pt(18 * s, 10 * s)} Z" fill="url(#ceRibbon)" ${free.stroke()}/>`
        + `<path d="M${pt(-4 * s, 4 * s)} L${pt(-20 * s, 30 * s)} L${pt(-12 * s, 27 * s)} L${pt(-8 * s, 34 * s)} L${pt(3 * s, 6 * s)} Z" fill="url(#ceRibbon)" ${free.stroke()}/>`
        + `<path d="M${pt(4 * s, 4 * s)} L${pt(20 * s, 30 * s)} L${pt(12 * s, 27 * s)} L${pt(8 * s, 34 * s)} L${pt(-3 * s, 6 * s)} Z" fill="url(#ceRibbon)" ${free.stroke()}/>`
        + `<ellipse cx="0" cy="${f(2 * s)}" rx="${f(7 * s)}" ry="${f(6 * s)}" fill="url(#ceRibbon)" ${free.stroke()}/>`
        + "</g>");
      const t = along(A.top, out * 0.4);
      free.star(t.x, t.y - 6 * s, 15 * s);
      free.stud(t.x, t.y - 6 * s, 3.5 * s);
      break;
    }
    case "estrelas": {
      const pts = samplePath(ctx.windowD, 9 * s, { x: A.cx, y: A.cy }).points;
      const r = rng(seed);
      const used = [];
      const room = Math.max(out + 6 * s, (Number(ctx.margin) || 40) * ctx.sReal - 6 * s);
      for ( let n = 0; n < 90 && used.length < 30; n++ ) {
        const q = pts[Math.floor(r() * pts.length)];
        const c = along(q, out + (3 + r() * Math.max(6, room - out)) );
        if ( c.x < 14 * s || c.y < 14 * s || c.x > W - 14 * s || c.y > H - 14 * s ) continue;
        if ( used.some(u => Math.hypot(u.x - c.x, u.y - c.y) < 22 * s) ) continue;
        if ( Math.abs(c.x - A.cx) < 40 * s && (c.y < A.top.y || c.y > A.bottom.y) ) continue; /* crest area */
        used.push(c);
        const big = r() < 0.55;
        if ( big ) free.star(c.x, c.y, (8 + r() * 9) * s, r() < 0.3 ? "url(#ceGem)" : "url(#ceMetal)", 0.14 + r() * 0.08);
        else free.add(`<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f((2 + r() * 2.2) * s)}" fill="${P.light}" stroke="${P.outline}" stroke-width="${f(1 * s)}"/>`);
      }
      const t = along(A.top, out * 0.2);
      const R = 24 * s;
      const my = t.y - 14 * s;
      /* crescent: a half circle bulging left, closed by a flatter arc (radius 1.25R) that bulges less */
      const mx = t.x + R * 0.3;
      crest.add(`<path d="M${pt(mx, my - R)} A${f(R)},${f(R)} 0 0 0 ${pt(mx, my + R)} `
        + `A${f(R * 1.25)},${f(R * 1.25)} 0 0 1 ${pt(mx, my - R)} Z" fill="url(#ceMetal)" ${crest.stroke()}/>`);
      crest.star(t.x + 12 * s, my - 2 * s, 11 * s, "url(#ceGem)", 0.15);
      crest.star(t.x - 34 * s, t.y - 8 * s, 8 * s, "url(#ceMetal)", 0.15);
      crest.star(t.x + 38 * s, t.y - 10 * s, 6 * s, "url(#ceMetal)", 0.15);
      const o = along(tl, out * 0.4);
      corner.star(o.x, o.y, 18 * s, "url(#ceMetal)", 0.13);
      corner.add(`<circle cx="${f(o.x)}" cy="${f(o.y)}" r="${f(3.5 * s)}" fill="url(#ceGem)" ${corner.stroke(corner.sw * 0.7)}/>`);
      break;
    }
    case "cantoneiras": {
      const m = 7 * s, arm = 62 * s, th = 15 * s;
      corner.add(`<path d="M${pt(m, m)} H${f(m + arm)} L${pt(m + arm + th * 0.7, m + th / 2)} L${pt(m + arm, m + th)} H${f(m + th)} `
        + `V${f(m + arm)} L${pt(m + th / 2, m + arm + th * 0.7)} L${pt(m, m + arm)} Z" fill="url(#ceMetal)" ${corner.stroke()}/>`);
      corner.stud(m + th / 2, m + th / 2, 3.6 * s);
      corner.stud(m + arm - 6 * s, m + th / 2, 3 * s);
      corner.stud(m + th / 2, m + arm - 6 * s, 3 * s);
      const l = along(A.left, out * 0.2);
      side.add(`<rect x="${f(l.x - 9 * s)}" y="${f(l.y - 24 * s)}" width="${f(16 * s)}" height="${f(48 * s)}" rx="${f(3 * s)}" fill="url(#ceMetal)" ${side.stroke()}/>`);
      side.stud(l.x - 1 * s, l.y - 14 * s, 3 * s);
      side.stud(l.x - 1 * s, l.y + 14 * s, 3 * s);
      const t = along(A.top, out * 0.2);
      crest.add(`<rect x="${f(t.x - 24 * s)}" y="${f(t.y - 9 * s)}" width="${f(48 * s)}" height="${f(16 * s)}" rx="${f(3 * s)}" fill="url(#ceMetal)" ${crest.stroke()}/>`);
      crest.stud(t.x - 14 * s, t.y - 1 * s, 3 * s);
      crest.stud(t.x + 14 * s, t.y - 1 * s, 3 * s);
      break;
    }
    default:
      break;
  }

  /* The window is centred horizontally, so x -> W - x mirrors left to right. Top and bottom may differ
     (arch, gothic arch, shield), so the bottom copies are flipped around their own anchors. */
  const mirrorX = `matrix(-1 0 0 1 ${f(W)} 0)`;
  const cornerDx = A.bl.x - A.tl.x;
  const cornerFy = A.tl.y + A.bl.y;
  const crestFy = A.top.y + A.bottom.y;
  const cornerBL = `matrix(1 0 0 -1 ${f(cornerDx)} ${f(cornerFy)})`;
  const cornerBR = `matrix(-1 0 0 -1 ${f(W - cornerDx)} ${f(cornerFy)})`;
  const cornerOnly = kind === "cantoneiras"; /* brackets sit on the card corners, not on the window */
  let svg = "";
  if ( corner.out.length ) {
    svg += `<g id="ceCorner">${corner.out.join("")}</g>`;
    svg += `<use href="#ceCorner" transform="${mirrorX}"/>`;
    svg += cornerOnly
      ? `<use href="#ceCorner" transform="matrix(1 0 0 -1 0 ${f(H)})"/><use href="#ceCorner" transform="matrix(-1 0 0 -1 ${f(W)} ${f(H)})"/>`
      : `<use href="#ceCorner" transform="${cornerBL}"/><use href="#ceCorner" transform="${cornerBR}"/>`;
  }
  if ( side.out.length ) svg += `<g id="ceSide">${side.out.join("")}</g><use href="#ceSide" transform="${mirrorX}"/>`;
  if ( crest.out.length ) svg += `<g id="ceCrest">${crest.out.join("")}</g><use href="#ceCrest" transform="matrix(1 0 0 -1 0 ${f(crestFy)})"/>`;
  svg += free.out.join("") + ink.out.join("");
  return svg;
}

/* ---------------------------------------------------------------------------------------------- */
/* Backgrounds                                                                                      */
/* ---------------------------------------------------------------------------------------------- */

function noiseToColor(id, hex, freq, octaves, seed, ka, kb, type = "fractalNoise", channel = 0) {
  const [r, g, b] = rgbF(hex);
  const a = [0, 0, 0, 0];
  a[channel] = ka;
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">`
    + `<feTurbulence type="${type}" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}"/>`
    + `<feColorMatrix type="matrix" values="0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  ${a.join(" ")} ${kb}"/>`
    + "</filter>";
}

function background(style, W, H, s) {
  const c1 = color(style.bg1, "#f3e2b9");
  const c2 = color(style.bg2, "#b98a4e");
  const seed = Math.max(1, Math.round(Number(style.seed) || 7));
  const r = rng(seed * 31 + 7);
  let defs = "";
  let body = "";
  const full = `x="0" y="0" width="${W}" height="${H}"`;
  switch ( style.background ) {
    case "transparente":
      return { defs, body };
    case "liso":
      body = `<rect ${full} fill="${c1}"/>`;
      break;
    case "gradiente":
      defs = `<radialGradient id="ceBgGrad" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>`;
      body = `<rect ${full} fill="url(#ceBgGrad)"/>`;
      break;
    case "pergaminho":
      defs = noiseToColor("ceBgMottle", c2, f(0.011 / s), 4, seed, 2.4, -1.0)
        + noiseToColor("ceBgGrain", shade(c2, -0.3), f(0.85 / s), 2, seed + 3, 1.6, -0.62);
      body = `<rect ${full} fill="${c1}"/><rect ${full} fill="#000" filter="url(#ceBgMottle)" opacity=".55"/>`
        + `<rect ${full} fill="#000" filter="url(#ceBgGrain)" opacity=".18"/>`;
      break;
    case "estrelado": {
      defs = `<radialGradient id="ceBgSky" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>`
        + noiseToColor("ceBgNebula", mix(c1, "#ff7ad9", 0.45), f(0.006 / s), 4, seed, 2.2, -0.95);
      body = `<rect ${full} fill="url(#ceBgSky)"/><rect ${full} fill="#000" filter="url(#ceBgNebula)" opacity=".55"/>`;
      let stars = "";
      for ( let i = 0; i < 140; i++ ) {
        const x = r() * W, y = r() * H, rad = (0.5 + r() * r() * 1.8) * s;
        stars += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rad)}" fill="#ffffff" opacity="${f(0.35 + r() * 0.65)}"/>`;
      }
      for ( let i = 0; i < 9; i++ ) {
        const x = r() * W, y = r() * H;
        stars += `<path d="${starPath((3 + r() * 4) * s, 0.12)}" transform="translate(${pt(x, y)})" fill="#ffffff" opacity=".9"/>`;
      }
      body += stars;
      break;
    }
    case "pedra": {
      defs = `<filter id="ceBgStone" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">`
        + `<feTurbulence type="fractalNoise" baseFrequency="${f(0.022 / s)}" numOctaves="5" seed="${seed}" result="t"/>`
        + `<feDiffuseLighting in="t" surfaceScale="${f(3.5)}" lighting-color="#ffffff" result="l"><feDistantLight azimuth="235" elevation="48"/></feDiffuseLighting>`
        + `<feComposite in="l" in2="SourceGraphic" operator="arithmetic" k1="1.35" k2="0" k3="0" k4="-0.08"/></filter>`;
      body = `<rect ${full} fill="${c1}" filter="url(#ceBgStone)"/>`;
      let joints = "";
      const row = 58 * s;
      for ( let y = row * 0.6, k = 0; y < H; y += row, k++ ) {
        joints += `<path d="M0,${f(y)} H${W}"/>`;
        const off = (k % 2 ? 0.5 : 0) * 92 * s;
        for ( let x = off; x < W; x += 92 * s ) joints += `<path d="M${pt(x, y)} V${f(y + row)}"/>`;
      }
      body += `<g stroke="${c2}" stroke-width="${f(2.4 * s)}" opacity=".55" fill="none">${joints}</g>`;
      break;
    }
    case "madeira": {
      defs = noiseToColor("ceBgGrainW", c2, `${f(0.045 / s)} ${f(0.0032 / s)}`, 3, seed, 3.2, -1.35)
        + noiseToColor("ceBgKnots", shade(c2, -0.25), f(0.02 / s), 2, seed + 9, 3.5, -2.2);
      body = `<rect ${full} fill="${c1}"/><rect ${full} fill="#000" filter="url(#ceBgGrainW)" opacity=".85"/>`
        + `<rect ${full} fill="#000" filter="url(#ceBgKnots)" opacity=".5"/>`;
      let planks = "";
      const pw = W / 4;
      for ( let x = pw; x < W - 1; x += pw ) {
        planks += `<path d="M${pt(x, 0)} V${H}" stroke="${shade(c2, -0.35)}" stroke-width="${f(2.6 * s)}"/>`
          + `<path d="M${pt(x + 2.4 * s, 0)} V${H}" stroke="${shade(c1, 0.25)}" stroke-width="${f(1 * s)}" opacity=".5"/>`;
      }
      body += planks;
      break;
    }
    case "marmore":
      defs = noiseToColor("ceBgVeins", c2, f(0.007 / s), 5, seed, -9, 1.15, "turbulence")
        + noiseToColor("ceBgCloud", shade(c1, 0.6), f(0.01 / s), 3, seed + 5, 2, -0.8);
      body = `<rect ${full} fill="${c1}"/><rect ${full} fill="#000" filter="url(#ceBgCloud)" opacity=".5"/>`
        + `<rect ${full} fill="#000" filter="url(#ceBgVeins)" opacity=".6"/>`;
      break;
    case "damasco": {
      const T = 64 * s;
      const motif = (cx, cy, k) => {
        let g = "";
        for ( const a of [0, 90, 180, 270] ) g += `<path d="${leafPath(14 * s * k, 5 * s * k, 0)}" transform="translate(${pt(cx, cy)}) rotate(${a - 90})"/>`;
        for ( const a of [45, 135, 225, 315] ) g += `<path d="${leafPath(9 * s * k, 3.5 * s * k, 0)}" transform="translate(${pt(cx, cy)}) rotate(${a - 90})"/>`;
        g += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(2.6 * s * k)}"/>`;
        return g;
      };
      defs = `<pattern id="ceBgDamask" width="${f(T)}" height="${f(T)}" patternUnits="userSpaceOnUse">`
        + `<rect width="${f(T)}" height="${f(T)}" fill="${c1}"/><g fill="${c2}" opacity=".42">`
        + motif(T / 2, T / 2, 1) + motif(0, 0, 0.6) + motif(T, 0, 0.6) + motif(0, T, 0.6) + motif(T, T, 0.6)
        + "</g></pattern>";
      body = `<rect ${full} fill="url(#ceBgDamask)"/>`;
      break;
    }
    case "losangos": {
      const w = 46 * s, h = 70 * s;
      defs = `<pattern id="ceBgDiamond" width="${f(w)}" height="${f(h)}" patternUnits="userSpaceOnUse">`
        + `<rect width="${f(w)}" height="${f(h)}" fill="${c1}"/>`
        + `<path d="M${pt(w / 2, 0)} L${pt(w, h / 2)} L${pt(w / 2, h)} L${pt(0, h / 2)} Z" fill="${c2}"/>`
        + `<path d="M${pt(w / 2, 0)} L${pt(w, h / 2)} L${pt(w / 2, h)} L${pt(0, h / 2)} Z" fill="none" stroke="${shade(c2, -0.3)}" stroke-width="${f(0.8 * s)}" opacity=".6"/>`
        + "</pattern>";
      body = `<rect ${full} fill="url(#ceBgDiamond)"/>`;
      break;
    }
    case "raios": {
      const cx = W / 2, cy = H * 0.45, R = Math.hypot(W, H);
      let rays = "";
      const n = 32;
      for ( let i = 0; i < n; i += 2 ) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        rays += `<path d="M${pt(cx, cy)} L${pt(cx + R * Math.cos(a0), cy + R * Math.sin(a0))} L${pt(cx + R * Math.cos(a1), cy + R * Math.sin(a1))} Z"/>`;
      }
      defs = `<radialGradient id="ceBgSun" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset=".6" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`;
      body = `<rect ${full} fill="${c1}"/><g fill="${c2}" opacity=".7">${rays}</g><rect ${full} fill="url(#ceBgSun)"/>`;
      break;
    }
    default:
      body = `<rect ${full} fill="${c1}"/>`;
  }
  if ( style.vignette ) {
    defs += `<radialGradient id="ceBgVig" cx="50%" cy="50%" r="72%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>`;
    body += `<rect ${full} fill="url(#ceBgVig)"/>`;
  }
  return { defs, body };
}

/* ---------------------------------------------------------------------------------------------- */
/* Whole frame                                                                                      */
/* ---------------------------------------------------------------------------------------------- */

/** Scale a path around (cx, cy) so that its box grows by `d` on every side (approximate offset). */
function grow(b, d) {
  const sx = (b.w + 2 * d) / b.w, sy = (b.h + 2 * d) / b.h;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  return `matrix(${f(sx)} 0 0 ${f(sy)} ${f(cx - sx * cx)} ${f(cy - sy * cy)})`;
}

function band(d, P, B, transform = "") {
  const t = transform ? ` transform="${transform}"` : "";
  return `<g fill="none" stroke-linejoin="round"${t}>`
    + `<path d="${d}" stroke="${P.outline}" stroke-width="${f(B + 4.4)}"/>`
    + `<path d="${d}" stroke="${P.dark}" stroke-width="${f(B)}"/>`
    + `<path d="${d}" stroke="${P.base}" stroke-width="${f(B * 0.7)}"/>`
    + `<path d="${d}" stroke="${mix(P.base, P.light, 0.55)}" stroke-width="${f(B * 0.36)}"/>`
    + `<path d="${d}" stroke="${P.light}" stroke-width="${f(Math.max(0.8, B * 0.11))}"/>`
    + `<path d="${d}" stroke="url(#ceShine)" stroke-width="${f(B)}" opacity=".35"/>`
    + "</g>";
}

/** The window path and box of a style (card units). */
export function windowOf(style) {
  const g = geometry(style);
  return { ...g, d: shapePath(g.shape, g.box) };
}

/**
 * SVG of the frame (everything but the picture).
 * @param {object} style
 * @param {number} scale output pixels per card unit
 */
export function buildFrameSVG(style, scale = 1) {
  const { W, H, s, box, shape, d } = windowOf(style);
  const P = paletteOf(style);
  const B = Math.max(2, Number(style.border) || 14) * s;
  const seed = Math.max(1, Math.round(Number(style.seed) || 7));
  const bg = background(style, W, H, s);
  const samples = samplePath(d, 4 * s, { x: box.x + box.w / 2, y: box.y + box.h / 2 }).points;
  const z = Math.min(1.8, Math.max(0.5, Number(style.ornScale) || 1));
  const orn = ornamentSet(style.ornament, { P, s: s * z, sReal: s, B, W, H, samples, b: box, seed, windowD: d, shape, margin: style.margin });
  const card = cardPath(style, W, H, 1.5 * s);

  const defs = `<defs>`
    + `<linearGradient id="ceMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.light}"/><stop offset=".5" stop-color="${P.base}"/><stop offset="1" stop-color="${P.dark}"/></linearGradient>`
    + `<linearGradient id="ceLeaf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(P.accent, 0.35)}"/><stop offset="1" stop-color="${shade(P.accent, -0.25)}"/></linearGradient>`
    + `<linearGradient id="ceThorn" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${P.dark}"/><stop offset=".6" stop-color="${P.base}"/><stop offset="1" stop-color="${P.light}"/></linearGradient>`
    + `<linearGradient id="ceRibbon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(P.gem, 0.3)}"/><stop offset="1" stop-color="${shade(P.gem, -0.35)}"/></linearGradient>`
    + `<radialGradient id="ceGem" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${shade(P.gem, 0.65)}"/><stop offset=".45" stop-color="${P.gem}"/><stop offset="1" stop-color="${shade(P.gem, -0.55)}"/></radialGradient>`
    + `<linearGradient id="ceShine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000"/></linearGradient>`
    + `<filter id="ceGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(2.2 * s)}"/></filter>`
    + `<clipPath id="ceCard"><path d="${card}"/></clipPath>`
    + `<mask id="ceHole" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/><path d="${d}" fill="#000"/></mask>`
    + bg.defs
    + `</defs>`;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * scale)}" height="${Math.round(H * scale)}" viewBox="0 0 ${W} ${H}">`;
  svg += defs;
  svg += `<g clip-path="url(#ceCard)">`;
  svg += `<g mask="url(#ceHole)">${bg.body}</g>`;
  if ( style.double ) svg += band(d, P, Math.max(1.5, B * 0.42), grow(box, B * 1.05));
  svg += band(d, P, B);
  svg += orn;
  svg += `</g>`;
  if ( style.edge ) {
    const inner = cardPath(style, W, H, 8 * s);
    svg += `<path d="${card}" fill="none" stroke="${P.outline}" stroke-width="${f(3 * s)}"/>`;
    svg += `<path d="${inner}" fill="none" stroke="${P.outline}" stroke-width="${f(4.2 * s)}"/>`;
    svg += `<path d="${inner}" fill="none" stroke="${P.base}" stroke-width="${f(2.4 * s)}"/>`;
    svg += `<path d="${inner}" fill="none" stroke="${P.light}" stroke-width="${f(0.8 * s)}" opacity=".8"/>`;
  }
  svg += "</svg>";
  return svg;
}

/** SVG of the window alone (white), the area where the picture shows. */
export function buildMaskSVG(style, scale = 1) {
  const { W, H, d } = windowOf(style);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * scale)}" height="${Math.round(H * scale)}" viewBox="0 0 ${W} ${H}">`
    + `<path d="${d}" fill="#ffffff"/></svg>`;
}

/** Coerce anything into a valid style. */
export function normalizeStyle(raw = {}) {
  const st = { ...DEFAULT_STYLE };
  const o = raw && typeof raw === "object" ? raw : {};
  if ( CARD_TYPES[o.card] ) st.card = o.card;
  if ( SHAPES[o.shape] ) st.shape = o.shape;
  if ( METALS[o.metal] ) st.metal = o.metal;
  if ( ORNAMENTS[o.ornament] ) st.ornament = o.ornament;
  if ( BACKGROUNDS[o.background] ) st.background = o.background;
  st.metalColor = color(o.metalColor, st.metalColor);
  st.accent = color(o.accent, null);
  st.gem = color(o.gem, null);
  st.bg1 = color(o.bg1, st.bg1);
  st.bg2 = color(o.bg2, st.bg2);
  const n = (v, d, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
  st.border = n(o.border, st.border, 3, 32);
  st.margin = n(o.margin, st.margin, 16, 90);
  st.seed = Math.round(n(o.seed, st.seed, 1, 99999));
  st.ornScale = n(o.ornScale, st.ornScale, 0.5, 1.8);
  for ( const k of ["double", "vignette", "edge"] ) if ( typeof o[k] === "boolean" ) st[k] = o[k];
  return st;
}

/** Ready-made styles shown in the gallery ("Modelos do módulo"). */
export const PRESETS = [
  { id: "v-reliquia", name: "Relíquia dourada", category: "jogador", style: { shape: "arco", metal: "ouro", ornament: "volutas", background: "pergaminho", bg1: "#f3e2b9", bg2: "#b98a4e" } },
  { id: "v-heroi", name: "Herói radiante", category: "jogador", style: { shape: "oval", metal: "ouro", ornament: "estrelas", background: "raios", bg1: "#fff1c4", bg2: "#ffd36b", vignette: false } },
  { id: "v-realeza", name: "Realeza", category: "npc", style: { shape: "capsula", metal: "ouro", ornament: "joias", background: "damasco", bg1: "#7a1424", bg2: "#e8b04a" } },
  { id: "v-floresta", name: "Guardião da floresta", category: "npc", style: { shape: "cartucho", metal: "jade", ornament: "louros", background: "gradiente", bg1: "#e6f2cf", bg2: "#8fb879", accent: "#5f9a4a", gem: "#c0392b" } },
  { id: "v-arcano", name: "Arcano", category: "npc", style: { shape: "hexagono", metal: "ametista", ornament: "runas", background: "estrelado", bg1: "#3a2470", bg2: "#0e0920" } },
  { id: "v-gelo", name: "Gelo eterno", category: "npc", style: { shape: "octogono", metal: "gelo", ornament: "estrelas", background: "marmore", bg1: "#eef8fc", bg2: "#7fb0c8", vignette: false } },
  { id: "v-baralho", name: "Carta de baralho", category: "npc", style: { shape: "retangulo", metal: "rubi", ornament: "joias", background: "losangos", bg1: "#f7efe1", bg2: "#e8d6b6", vignette: false, double: false } },
  { id: "v-vilao", name: "Vilão de obsidiana", category: "criatura", style: { shape: "ogiva", metal: "obsidiana", ornament: "espinhos", background: "estrelado", bg1: "#3b1530", bg2: "#0d0610" } },
  { id: "v-fera", name: "Fera selvagem", category: "criatura", style: { shape: "escudo", metal: "bronze", ornament: "cantoneiras", background: "madeira", bg1: "#8a5a32", bg2: "#4e2f15" } },
  { id: "v-ossario", name: "Ossário", category: "criatura", style: { shape: "ogiva", metal: "osso", ornament: "espinhos", background: "pedra", bg1: "#8d8a84", bg2: "#3d3a36" } },
  { id: "v-medalhao", name: "Medalhão (token redondo)", category: "jogador", style: { card: "redondo", metal: "ouro", ornament: "joias", background: "gradiente", bg1: "#5a3d16", bg2: "#22160a", margin: 34, vignette: false } },
  { id: "v-medalhao-sombrio", name: "Medalhão sombrio", category: "criatura", style: { card: "redondo", metal: "obsidiana", ornament: "espinhos", background: "estrelado", bg1: "#3b1530", bg2: "#0d0610", margin: 34 } },
  { id: "v-quadro", name: "Quadro de ferro", category: "criatura", style: { card: "quadrado", shape: "retangulo", metal: "ferro", ornament: "cantoneiras", background: "pedra", bg1: "#7b7872", bg2: "#34312d" } }
].map(p => ({ ...p, kind: "vetor", builtin: true, style: normalizeStyle(p.style) }));

export { esc };
