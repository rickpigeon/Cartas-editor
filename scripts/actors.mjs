/**
 * Cartas-editor: using a saved card as the picture of an actor (portrait and/or token) or of tokens.
 * Only core fields are written (img, prototypeToken, ownership, folder, flags), so it works in any system.
 */
import { CATEGORIES, MODULE_ID, MODULE_TITLE } from "./constants.mjs";

export const PORTRAIT_MODES = { carta: "A carta", original: "A imagem original", manter: "Não mudar" };
export const TOKEN_MODES = {
  inteira: "1 × 1, carta inteira (ajustada no quadrado)",
  empe: "Em pé: 1 de largura, altura da carta"
};

/* ---------------------------------------------------------------------------------------------- */
/* Actor types of the running system                                                                */
/* ---------------------------------------------------------------------------------------------- */

export function actorTypes() {
  const all = Array.isArray(game.documentTypes?.Actor) ? game.documentTypes.Actor : Object.keys(game.model?.Actor ?? {});
  const list = all.length > 1 ? all.filter(t => t !== "base") : all;
  return list.map(type => {
    const key = CONFIG.Actor?.typeLabels?.[type];
    let label = key ? game.i18n.localize(key) : "";
    if ( !label || label === key ) label = type;
    return { type, label };
  });
}

const GUESS = {
  jogador: ["character", "personagem", "pc", "player", "hero", "heroi", "jogador"],
  npc: ["npc", "pdm", "nonplayer", "character"],
  criatura: ["creature", "criatura", "monster", "monstro", "ameaca", "threat", "enemy", "inimigo", "npc"]
};

/** The actor type that best matches a category ("character" for players, "npc" for the others...). */
export function guessType(category) {
  const types = actorTypes().map(t => t.type);
  if ( !types.length ) return "";
  for ( const word of GUESS[category] ?? [] ) {
    const exact = types.find(t => t.toLowerCase() === word);
    if ( exact ) return exact;
  }
  for ( const word of GUESS[category] ?? [] ) {
    const near = types.find(t => t.toLowerCase().includes(word));
    if ( near ) return near;
  }
  return types[0];
}

export function guessCategory(actor) {
  if ( !actor ) return "npc";
  if ( actor.hasPlayerOwner ) return "jogador";
  const t = String(actor.type ?? "").toLowerCase();
  if ( GUESS.criatura.slice(0, 8).some(w => t.includes(w)) ) return "criatura";
  if ( GUESS.jogador.some(w => t === w) ) return "jogador";
  return "npc";
}

/** Players (non-GM users) for the "owner" choice. */
export function playerUsers() {
  return (game.users?.contents ?? Array.from(game.users ?? [])).filter(u => !u.isGM).map(u => ({ id: u.id, name: u.name }));
}

/** Actors for the "update an actor" choice, sorted by name. */
export function actorChoices() {
  const list = (game.actors?.contents ?? Array.from(game.actors ?? [])).map(a => ({ id: a.id, uuid: a.uuid, name: a.name, type: a.type, img: a.img }));
  return list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/* ---------------------------------------------------------------------------------------------- */
/* Folders                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

function folderClass() {
  const cls = foundry.documents?.Folder ?? globalThis.Folder;
  return cls?.implementation ?? CONFIG.Folder?.documentClass ?? cls;
}

function parentId(folder) {
  return folder?._source?.folder ?? folder?.folder?.id ?? null;
}

/** Actor folder "Cartas-editor / Jogadores" (created when missing); returns its id. */
export async function categoryFolder(category) {
  const Folder = folderClass();
  const folders = game.folders?.contents ?? Array.from(game.folders ?? []);
  const find = (name, parent) => folders.find(f => f.type === "Actor" && f.name === name && parentId(f) === parent);
  let root = find(MODULE_TITLE, null);
  if ( !root ) root = await Folder.create({ name: MODULE_TITLE, type: "Actor", folder: null, color: "#6b3f12" });
  const plural = CATEGORIES[category]?.plural ?? "Cartas";
  let sub = (game.folders?.contents ?? Array.from(game.folders ?? [])).find(f => f.type === "Actor" && f.name === plural && parentId(f) === root.id);
  if ( !sub ) sub = await Folder.create({ name: plural, type: "Actor", folder: root.id });
  return sub.id;
}

/* ---------------------------------------------------------------------------------------------- */
/* Writing                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

/**
 * Token size for a card of height/width `ratio`.
 * inteira: 1x1 with fit "contain" (whole card inside the square); empe: 1 x ratio.
 */
export function tokenSize(ratio, mode) {
  if ( Math.abs(ratio - 1) < 0.06 ) return { width: 1, height: 1, fit: "fill" };
  if ( mode === "empe" ) return { width: 1, height: Math.max(0.5, Math.round(ratio * 10) / 10), fit: "contain" };
  return { width: 1, height: 1, fit: "contain" };
}

function actorClass() {
  return foundry.documents?.Actor?.implementation ?? CONFIG.Actor?.documentClass ?? globalThis.Actor;
}

const DISPOSITION = { jogador: "FRIENDLY", npc: "NEUTRAL", criatura: "HOSTILE" };

export async function createActorFromCard(opts) {
  const { name, type, category, path, original, portrait = "carta", useToken = true, tokenMode = "inteira", ratio = 1, owner = "", folder = "auto", cardId } = opts;
  if ( !game.user.isGM ) throw new Error("só o mestre cria atores pelo editor");
  const size = tokenSize(ratio, tokenMode);
  const dispKey = DISPOSITION[category] ?? "NEUTRAL";
  const disposition = CONST?.TOKEN_DISPOSITIONS?.[dispKey] ?? CATEGORIES[category]?.disposition ?? 0;
  const tokenSrc = useToken ? path : (original || path);
  const data = {
    name: name || "Sem nome",
    type,
    img: portrait === "original" && original ? original : path,
    prototypeToken: {
      name: name || "Sem nome",
      texture: { src: tokenSrc, fit: useToken ? size.fit : "contain" },
      width: useToken ? size.width : 1,
      height: useToken ? size.height : 1,
      disposition,
      actorLink: category === "jogador"
    },
    flags: { [MODULE_ID]: { card: cardId ?? null } }
  };
  if ( folder === "auto" ) data.folder = await categoryFolder(category);
  else if ( folder && folder !== "none" ) data.folder = folder;
  if ( owner ) data.ownership = { default: 0, [owner]: CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3 };
  const actor = await actorClass().create(data);
  if ( !actor ) throw new Error("o Foundry não criou o ator (veja o console)");
  return actor;
}

export async function applyToActor(actor, opts) {
  const { path, original, portrait = "carta", useToken = true, tokenMode = "inteira", ratio = 1, sceneTokens = true, cardId } = opts;
  if ( !actor ) throw new Error("ator não encontrado");
  const size = tokenSize(ratio, tokenMode);
  const update = { [`flags.${MODULE_ID}.card`]: cardId ?? null };
  if ( portrait === "carta" ) update.img = path;
  else if ( portrait === "original" && original ) update.img = original;
  if ( useToken ) update.prototypeToken = { texture: { src: path, fit: size.fit }, width: size.width, height: size.height };
  await actor.update(update);
  let placed = 0;
  if ( useToken && sceneTokens && canvas?.scene ) {
    const docs = canvas.scene.tokens.filter(t => t.actorId === actor.id);
    if ( docs.length ) {
      await canvas.scene.updateEmbeddedDocuments("Token", docs.map(t => ({ _id: t.id, texture: { src: path, fit: size.fit } })));
      placed = docs.length;
    }
  }
  return placed;
}

export function selectedTokens() {
  return Array.from(canvas?.tokens?.controlled ?? []);
}

/** Put the card on the selected tokens of the current scene (only the token image changes). */
export async function applyToSelectedTokens(path, tokenMode = "inteira", ratio = 1) {
  const tokens = selectedTokens();
  if ( !tokens.length ) return 0;
  const size = tokenSize(ratio, tokenMode);
  const scene = tokens[0].document?.parent ?? canvas.scene;
  await scene.updateEmbeddedDocuments("Token", tokens.map(t => ({ _id: t.document?.id ?? t.id, texture: { src: path, fit: size.fit } })));
  return tokens.length;
}
