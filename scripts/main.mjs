/**
 * Cartas-editor: entry point. Everything is for the GM only; players never see a button.
 *
 * Opening the editor: the "Cartas-editor" button at the top of the Actors sidebar, the button in the Token
 * controls, right-click on an actor ("Criar carta-token"), the module settings menu, a keybinding
 * (unassigned by default) or `game.modules.get("cartas-editor").api.open()`.
 */
import { MODULE_ID, MODULE_TITLE, isGM } from "./constants.mjs";
import { findCard, getCards, getCustomTemplates, registerSettings } from "./store.mjs";
import { CardEditorApp } from "./editor-app.mjs";
import { allTemplates } from "./templates.mjs";
import { guard, reportError, watchUncaught } from "./errors.mjs";

const { ApplicationV2 } = foundry.applications.api;

/** Settings-menu entry: the menu "opens" this class, which just opens the editor. */
class EditorLauncher extends ApplicationV2 {
  async render() {
    CardEditorApp.open();
    return this;
  }
}

Hooks.once("init", () => {
  watchUncaught();
  registerSettings();
  game.settings.registerMenu(MODULE_ID, "abrir", {
    name: "Editor de cartas-token",
    label: "Abrir o Cartas-editor",
    hint: "Monte cartas com moldura para jogadores, NPCs e criaturas e use-as como retrato e token.",
    icon: "fa-solid fa-id-badge",
    type: EditorLauncher,
    restricted: true
  });
  game.keybindings.register(MODULE_ID, "abrir", {
    name: `Abrir o ${MODULE_TITLE}`,
    editable: [],
    restricted: true,
    onDown: () => {
      if ( !isGM() ) return false;
      CardEditorApp.open();
      return true;
    }
  });
});

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  if ( !module ) return;
  module.api = {
    /** Open the editor (GM). `what` = { cardId } | { actor } | { image: "path" }. */
    open: (what = {}) => CardEditorApp.open(what),
    /** Open the editor on a saved card (id or name). */
    edit: ref => {
      const card = findCard(ref) ?? getCards().find(c => c.name === ref);
      if ( !card ) return ui.notifications.warn(`${MODULE_TITLE}: carta não encontrada.`);
      return CardEditorApp.open({ cardId: card.id });
    },
    /** Copies of the saved cards and the available templates. */
    cards: () => getCards(),
    templates: () => allTemplates().map(t => ({ id: t.id, name: t.name, kind: t.kind, category: t.category })),
    importedTemplates: () => getCustomTemplates()
  };
});

/* The editor follows changes made from another GM tab. */
function onSettingChanged(setting) {
  const key = String(setting?.key ?? "");
  if ( !key.startsWith(`${MODULE_ID}.`) || !isGM() ) return;
  try {
    CardEditorApp.refresh(key.slice(MODULE_ID.length + 1));
  } catch ( err ) {
    reportError(err, "atualizar");
  }
}
Hooks.on("createSetting", onSettingChanged);
Hooks.on("updateSetting", onSettingChanged);

/* Token controls (v13: records of controls and tools). GM only. */
Hooks.on("getSceneControlButtons", controls => {
  if ( !isGM() ) return;
  const tokens = controls?.tokens;
  if ( !tokens?.tools ) return;
  tokens.tools.cartasEditor = {
    name: "cartasEditor",
    title: MODULE_TITLE,
    icon: "fa-solid fa-id-badge",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => CardEditorApp.open()
  };
});

/* A button at the top of the Actors sidebar. GM only. */
Hooks.on("renderActorDirectory", (app, html) => {
  if ( !isGM() ) return;
  try {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if ( !root || root.querySelector(".ce-open-actors") ) return;
    const bar = root.querySelector(".header-actions") ?? root.querySelector(".directory-header");
    if ( !bar ) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ce-open-actors";
    btn.innerHTML = `<i class="fa-solid fa-id-badge"></i> ${MODULE_TITLE}`;
    btn.addEventListener("click", ev => {
      ev.preventDefault();
      CardEditorApp.open();
    });
    bar.append(btn);
  } catch ( err ) {
    reportError(err, "barra de atores");
  }
});

/*
 * Right-click on an actor in the sidebar. v13 entries are { name, icon, condition, callback(li) };
 * v14 renamed them to { label, icon, visible, onClick(event, target) }. The running version decides.
 */
function contextEntry(label, icon, run) {
  const gm = () => isGM();
  const action = guard(run, label);
  if ( (game.release?.generation ?? 13) >= 14 ) return { label, icon, visible: gm, onClick: (event, target) => action(target) };
  return { name: label, icon, condition: gm, callback: li => action(li) };
}

async function actorFromEntry(app, li) {
  const el = li instanceof HTMLElement ? li : li?.[0];
  const id = el?.dataset?.entryId ?? el?.dataset?.documentId;
  if ( !id ) return null;
  const collection = app?.collection ?? game.actors;
  return collection.get?.(id) ?? (await collection.getDocument?.(id)) ?? game.actors.get(id) ?? null;
}

Hooks.on("getActorContextOptions", (app, items) => {
  if ( !Array.isArray(items) || !isGM() ) return;
  items.push(contextEntry("Criar carta-token", '<i class="fa-solid fa-id-badge"></i>', async li => {
    const actor = await actorFromEntry(app, li);
    if ( !actor ) throw new Error("ator não encontrado.");
    CardEditorApp.open({ actor });
  }));
});
