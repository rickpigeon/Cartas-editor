/**
 * Cartas-editor: constants and small helpers. Labels are Portuguese (no lang files).
 */
export const MODULE_ID = "cartas-editor";
export const MODULE_TITLE = "Cartas-editor";
export const PATH = `modules/${MODULE_ID}`;

/** The three kinds of card the GM makes. `folder` names the upload sub-folder and the actor folder. */
export const CATEGORIES = {
  jogador: { label: "Jogador", plural: "Jogadores", folder: "jogadores", icon: "fa-solid fa-user-shield", disposition: 1 },
  npc: { label: "NPC", plural: "NPCs", folder: "npcs", icon: "fa-solid fa-user", disposition: 0 },
  criatura: { label: "Criatura", plural: "Criaturas", folder: "criaturas", icon: "fa-solid fa-dragon", disposition: -1 }
};

export const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export const num = (value, fallback, min = -Infinity, max = Infinity) => {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
};

export const str = (value, fallback = "", max = 4000) => (typeof value === "string" ? value.slice(0, max) : fallback);

export const bool = (value, fallback = false) => (typeof value === "boolean" ? value : fallback);

export const pick = (value, table, fallback) => (
  Object.prototype.hasOwnProperty.call(table, value) ? value : fallback
);

const HEX = /^#[0-9a-f]{6}$/i;
export const color = (value, fallback = null) => {
  if ( typeof value !== "string" ) return fallback;
  const v = value.trim();
  if ( HEX.test(v) ) return v.toLowerCase();
  if ( /^#[0-9a-f]{3}$/i.test(v) ) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  return fallback;
};

/** Random id that is safe as a key and a DOM attribute. */
export function uid(prefix = "c") {
  const r = globalThis.foundry?.utils?.randomID?.(10) ?? Math.random().toString(36).slice(2, 12);
  return `${prefix}${r}`;
}

export function hexToRgb(hex) {
  const n = parseInt(color(hex, "#000000").slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  return `#${((1 << 24) | (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8)
    | clamp(Math.round(b), 0, 255)).toString(16).slice(1)}`;
}

/** Mix a hex colour with black (t < 0) or white (t > 0). */
export function shade(hex, t) {
  const [r, g, b] = hexToRgb(hex);
  const target = t < 0 ? 0 : 255;
  const k = Math.abs(t);
  return rgbToHex(r + (target - r) * k, g + (target - g) * k, b + (target - b) * k);
}

/** Mix two hex colours (t = 0 -> a, t = 1 -> b). */
export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

/** A file-name friendly version of a text: "Lorde Sombrio!" -> "lorde-sombrio". */
export function slug(text, fallback = "carta") {
  const s = String(text ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || fallback;
}

/** Deterministic random numbers (mulberry32), so a seed always draws the same stars and cracks. */
export function rng(seed) {
  let a = (Number(seed) || 1) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Short stable hash of any JSON-able value (cache keys). */
export function hash(value) {
  const s = JSON.stringify(value);
  let h = 2166136261;
  for ( let i = 0; i < s.length; i++ ) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export const deepClone = value => (globalThis.foundry?.utils?.deepClone ? foundry.utils.deepClone(value) : structuredClone(value));

/** True when the current user is a GM. Everything in this module is GM only. */
export const isGM = () => Boolean(globalThis.game?.user?.isGM);
