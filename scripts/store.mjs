/**
 * Cartas-editor: storage. World settings (only the GM writes them):
 *   biblioteca  { list: [card] }      every saved card, re-editable (the picture is kept by path)
 *   modelos     { list: [template] }  templates the GM imported (flat-colour PNG) or saved from a style
 *   pasta       where the card images are uploaded (empty = worlds/<world>/cartas-editor)
 *   formato     webp | png
 */
import {
  CATEGORIES, MODULE_ID, bool, clamp, color, deepClone, num, pick, str, uid
} from "./constants.mjs";
import { normalizeStyle } from "./svg-frames.mjs";

export function registerSettings() {
  game.settings.register(MODULE_ID, "biblioteca", {
    scope: "world", config: false, type: Object, default: { list: [] }
  });
  game.settings.register(MODULE_ID, "modelos", {
    scope: "world", config: false, type: Object, default: { list: [] }
  });
  game.settings.register(MODULE_ID, "pasta", {
    name: "Pasta das cartas",
    hint: "Onde as imagens das cartas são salvas, dentro da pasta de dados do Foundry. Vazio = worlds/<este mundo>/cartas-editor. Cada categoria ganha uma subpasta (jogadores, npcs, criaturas).",
    scope: "world", config: true, type: String, default: ""
  });
  game.settings.register(MODULE_ID, "formato", {
    name: "Formato das imagens",
    hint: "WebP fica bem menor; PNG é o mais compatível com outros programas.",
    scope: "world", config: true, type: String, default: "webp",
    choices: { webp: "WebP (leve)", png: "PNG" }
  });
}

export function setting(key, fallback = null) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch ( err ) {
    return fallback;
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* Cards                                                                                            */
/* ---------------------------------------------------------------------------------------------- */

export const WINDOW_BG = { nenhum: "Transparente", cor: "Cor", gradiente: "Degradê" };
export const LABEL_BANDS = { nenhuma: "Sem faixa", fita: "Fita", placa: "Placa" };

export const DEFAULT_LABEL = {
  on: false, text: "", font: "Modesto Condensed", size: 44, color: "#fff6dc", stroke: "#3a1606", strokeW: 5,
  bold: false, caps: true, x: 0.5, y: 0.9, band: "fita", bandColor: "#8c1c2b", bandEdge: "#f2b33d"
};

export function defaultCard(template = "r-jogadores", category = "jogador") {
  return {
    id: uid("c"),
    name: "",
    category,
    template,
    style: null,
    tint: { hue: 0, sat: 1, light: 1 },
    image: { src: "", x: 0, y: 0, scale: 1, rot: 0, flip: false, brightness: 1, contrast: 1, saturation: 1 },
    windowBg: { mode: "gradiente", color: "#3b3142", color2: "#141018" },
    shadow: 0.35,
    label: { ...DEFAULT_LABEL },
    output: { scale: 1, format: "" },
    file: "",
    actorUuid: "",
    updated: 0
  };
}

export function normalizeCard(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const base = defaultCard();
  const im = o.image && typeof o.image === "object" ? o.image : {};
  const wb = o.windowBg && typeof o.windowBg === "object" ? o.windowBg : {};
  const lb = o.label && typeof o.label === "object" ? o.label : {};
  const tn = o.tint && typeof o.tint === "object" ? o.tint : {};
  const out = o.output && typeof o.output === "object" ? o.output : {};
  return {
    id: typeof o.id === "string" && /^[\w-]{1,40}$/.test(o.id) ? o.id : base.id,
    name: str(o.name, "", 120),
    category: pick(o.category, CATEGORIES, "npc"),
    template: typeof o.template === "string" && /^[\w-]{1,60}$/.test(o.template) ? o.template : base.template,
    style: o.style ? normalizeStyle(o.style) : null,
    tint: { hue: num(tn.hue, 0, -180, 180), sat: num(tn.sat, 1, 0, 3), light: num(tn.light, 1, 0.2, 2.5) },
    image: {
      src: str(im.src, "", 2000),
      x: num(im.x, 0, -5, 5), y: num(im.y, 0, -5, 5),
      scale: num(im.scale, 1, 0.02, 40), rot: num(im.rot, 0, -360, 360), flip: bool(im.flip, false),
      brightness: num(im.brightness, 1, 0, 3), contrast: num(im.contrast, 1, 0, 3), saturation: num(im.saturation, 1, 0, 3)
    },
    windowBg: { mode: pick(wb.mode, WINDOW_BG, "gradiente"), color: color(wb.color, "#3b3142"), color2: color(wb.color2, "#141018") },
    shadow: num(o.shadow, 0.35, 0, 1),
    label: {
      on: bool(lb.on, false),
      text: str(lb.text, "", 80),
      font: str(lb.font, DEFAULT_LABEL.font, 80) || DEFAULT_LABEL.font,
      size: num(lb.size, DEFAULT_LABEL.size, 8, 200),
      color: color(lb.color, DEFAULT_LABEL.color),
      stroke: color(lb.stroke, DEFAULT_LABEL.stroke),
      strokeW: num(lb.strokeW, DEFAULT_LABEL.strokeW, 0, 20),
      bold: bool(lb.bold, DEFAULT_LABEL.bold),
      caps: bool(lb.caps, DEFAULT_LABEL.caps),
      x: num(lb.x, 0.5, 0, 1), y: num(lb.y, 0.9, 0, 1),
      band: pick(lb.band, LABEL_BANDS, "fita"),
      bandColor: color(lb.bandColor, DEFAULT_LABEL.bandColor),
      bandEdge: color(lb.bandEdge, DEFAULT_LABEL.bandEdge)
    },
    output: { scale: num(out.scale, 1, 0.25, 4), format: pick(out.format, { webp: 1, png: 1, "": 1 }, "") },
    file: str(o.file, "", 2000),
    actorUuid: str(o.actorUuid, "", 200),
    updated: num(o.updated, 0, 0, 1e15)
  };
}

export function getCards() {
  const value = setting("biblioteca", { list: [] });
  const list = Array.isArray(value?.list) ? value.list : [];
  return list.map(normalizeCard);
}

export function findCard(id) {
  return getCards().find(c => c.id === id) ?? null;
}

let writing = Promise.resolve();
function queue(fn) {
  writing = writing.then(fn, fn);
  return writing;
}

export function upsertCard(card) {
  return queue(async () => {
    const clean = normalizeCard(deepClone(card));
    const list = getCards();
    const i = list.findIndex(c => c.id === clean.id);
    if ( i >= 0 ) list[i] = clean;
    else list.unshift(clean);
    await game.settings.set(MODULE_ID, "biblioteca", { list });
    return clean;
  });
}

export function deleteCard(id) {
  return queue(async () => {
    const list = getCards().filter(c => c.id !== id);
    await game.settings.set(MODULE_ID, "biblioteca", { list });
  });
}

/* ---------------------------------------------------------------------------------------------- */
/* Imported templates                                                                               */
/* ---------------------------------------------------------------------------------------------- */

export function normalizeTemplate(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const kind = o.kind === "vetor" ? "vetor" : "raster";
  const t = {
    id: typeof o.id === "string" && /^u[\w-]{1,40}$/.test(o.id) ? o.id : uid("u"),
    kind,
    name: str(o.name, "Modelo", 80) || "Modelo",
    category: pick(o.category, CATEGORIES, "npc"),
    builtin: false
  };
  if ( kind === "raster" ) {
    t.src = str(o.src, "", 2000);
    t.key = color(o.key, "#ff00ff");
    t.tol = clamp(num(o.tol, 60, 5, 200), 5, 200);
    if ( !t.src ) return null;
  }
  else t.style = normalizeStyle(o.style);
  return t;
}

export function getCustomTemplates() {
  const value = setting("modelos", { list: [] });
  const list = Array.isArray(value?.list) ? value.list : [];
  return list.map(normalizeTemplate).filter(Boolean);
}

export function saveCustomTemplate(tpl) {
  return queue(async () => {
    const clean = normalizeTemplate(tpl);
    if ( !clean ) throw new Error("modelo inválido");
    const list = getCustomTemplates();
    const i = list.findIndex(t => t.id === clean.id);
    if ( i >= 0 ) list[i] = clean;
    else list.push(clean);
    await game.settings.set(MODULE_ID, "modelos", { list });
    return clean;
  });
}

export function deleteCustomTemplate(id) {
  return queue(async () => {
    const list = getCustomTemplates().filter(t => t.id !== id);
    await game.settings.set(MODULE_ID, "modelos", { list });
  });
}

/* ---------------------------------------------------------------------------------------------- */
/* Draft (per browser): the card being edited survives closing the window                         */
/* ---------------------------------------------------------------------------------------------- */

const draftKey = () => `${MODULE_ID}.rascunho.${game.user?.id ?? "gm"}`;

export function loadDraft() {
  try {
    const raw = JSON.parse(localStorage.getItem(draftKey()) ?? "null");
    if ( !raw?.card ) return null;
    return { card: normalizeCard(raw.card), savedHash: typeof raw.savedHash === "string" ? raw.savedHash : "" };
  } catch ( err ) {
    return null;
  }
}

export function saveDraft(card, savedHash) {
  try {
    localStorage.setItem(draftKey(), JSON.stringify({ card, savedHash }));
  } catch ( err ) { /* storage full or blocked: the draft is a convenience */ }
}

export function clearDraft() {
  try {
    localStorage.removeItem(draftKey());
  } catch ( err ) { /* ignore */ }
}
