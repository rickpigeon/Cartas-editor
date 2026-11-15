/**
 * Cartas-editor: the editor window (GM only).
 *
 * Left: template gallery and saved cards. Centre: the card, where the picture is dragged, zoomed (wheel)
 * and turned (Shift+wheel) inside the frame. Right: picture, frame, background, name and file options.
 * ApplicationV2 without Handlebars: the shell is built once and updated by hand, so the canvas and the
 * pointer state survive every change.
 */
import {
  CATEGORIES, MODULE_ID, MODULE_TITLE, clamp, deepClone, escapeHTML, hash, isGM, slug, uid
} from "./constants.mjs";
import { BACKGROUNDS, CARD_TYPES, METALS, ORNAMENTS, SHAPES, normalizeStyle, paletteOf, windowOf } from "./svg-frames.mjs";
import { GM_TEMPLATES, allTemplates, findTemplate, keyTemplate, loadImage, makeCanvas, prepare, styleFor } from "./templates.mjs";
import { canvasToBlob, composeCard, containScale, drawPicture, labelFont, placement, templateThumb } from "./compose.mjs";
import {
  LABEL_BANDS, WINDOW_BG, defaultCard, deleteCard, deleteCustomTemplate, findCard, getCards, loadDraft,
  normalizeCard, saveCustomTemplate, saveDraft, setting, upsertCard
} from "./store.mjs";
import { browse, downloadBlob, extensionOf, rootFolder, uploadBlob, uploadOriginal } from "./files.mjs";
import {
  PORTRAIT_MODES, TOKEN_MODES, actorChoices, actorTypes, applyToActor, applyToSelectedTokens,
  createActorFromCard, guessCategory, guessType, playerUsers, selectedTokens
} from "./actors.mjs";
import { detectKey, extractKey, pixelColor } from "./chroma.mjs";
import { guard, reportError } from "./errors.mjs";

const { ApplicationV2 } = foundry.applications.api;
const APP_ID = `${MODULE_ID}-editor`;
const DEFAULT_TOKEN = "icons/svg/mystery-man.svg";
const HISTORY_MAX = 80;
const FONTS_FALLBACK = ["Modesto Condensed", "Signika", "Amiri", "Bruno Ace", "Palatino Linotype", "Georgia", "Times New Roman", "Arial"];

/* ---------------------------------------------------------------------------------------------- */
/* Helpers                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}
const opt = (value, label, current) => `<option value="${escapeHTML(value)}"${String(value) === String(current) ? " selected" : ""}>${escapeHTML(label)}</option>`;
const options = (table, current) => Object.entries(table).map(([v, l]) => opt(v, typeof l === "string" ? l : l.label, current)).join("");
const pct = v => `${Math.round(v * 100)}%`;

function dragData(event) {
  try {
    const TE = foundry.applications?.ux?.TextEditor?.implementation;
    if ( TE?.getDragEventData ) return TE.getDragEventData(event);
  } catch ( err ) { /* fall back */ }
  try {
    return JSON.parse(event.dataTransfer?.getData("text/plain") || "null");
  } catch ( err ) {
    return null;
  }
}

function fontChoices() {
  const defs = Object.keys(globalThis.CONFIG?.fontDefinitions ?? {});
  const list = defs.length ? defs : FONTS_FALLBACK;
  return [...new Set([...list, ...FONTS_FALLBACK.filter(f => !defs.length || defs.includes(f))])];
}

/** Hash of what the GM would lose: everything but the bookkeeping fields. */
function contentHash(card) {
  const { file, updated, actorUuid, ...rest } = card;
  return hash(rest);
}

/* ---------------------------------------------------------------------------------------------- */
/* The window                                                                                       */
/* ---------------------------------------------------------------------------------------------- */

export class CardEditorApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: ["cartas-editor", "ce-app"],
    window: { title: MODULE_TITLE, icon: "fa-solid fa-id-badge", resizable: true },
    position: { width: 1260, height: 830 }
  };

  static get instance() {
    return foundry.applications.instances.get(APP_ID) ?? null;
  }

  /**
   * Open (or bring up) the editor.
   * @param {object} [what]  cardId: a saved card; actor: start a card for this actor; image: picture path
   */
  static open(what = {}) {
    if ( !isGM() ) {
      ui.notifications.warn(`${MODULE_TITLE}: só o mestre usa o editor de cartas.`);
      return null;
    }
    let app = CardEditorApp.instance;
    if ( !app ) {
      const width = Math.min(1320, Math.max(900, window.innerWidth - 100));
      const height = Math.min(900, Math.max(600, window.innerHeight - 60));
      app = new CardEditorApp({
        position: { width, height, left: Math.max(10, (window.innerWidth - width) / 2), top: Math.max(10, (window.innerHeight - height) / 2) }
      });
      app.pending = what;
      app.render({ force: true });
    }
    else {
      if ( app.minimized ) app.maximize?.();
      app.bringToFront?.();
      if ( what && Object.keys(what).length ) app.handleOpen(what);
    }
    return app;
  }

  static refresh(key) {
    const app = CardEditorApp.instance;
    if ( !app?.shell ) return;
    if ( key === "biblioteca" ) app.renderLibrary();
    if ( key === "modelos" ) app.renderTemplates();
    if ( key === "pasta" || key === "formato" ) app.renderProps();
  }

  constructor(options = {}) {
    super(options);
    const draft = loadDraft();
    this.card = draft?.card ?? defaultCard(GM_TEMPLATES[0].id, GM_TEMPLATES[0].category);
    if ( !findTemplate(this.card.template) ) {
      this.card.template = GM_TEMPLATES[0].id;
      this.card.style = null;
    }
    this.savedHash = draft ? draft.savedHash : contentHash(this.card);
    this.categoryTouched = Boolean(draft);
    this.tab = "modelos";
    this.filter = "todos";
    this.query = "";
    this.history = [];
    this.future = [];
    this.img = null;
    this.imgSrc = "";
    this.prep = null;
    this.prepKey = "";
    this.view = { scale: 1, ox: 0, oy: 0 };
    this.drag = null;
    this.ghost = false;
    this.busy = false;
    this.work = makeCanvas(2, 2);
  }

  /* ---------------------------------------------------------------------------------------------- */
  /* Rendering (built once)                                                                           */
  /* ---------------------------------------------------------------------------------------------- */

  async _renderHTML() {
    this.shell ??= this.buildShell();
    return this.shell;
  }

  _replaceHTML(result, content) {
    if ( result.parentElement !== content ) content.replaceChildren(result);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    if ( this.bound ) return;
    this.bound = true;
    try {
      this.bindEvents();
      this.renderTemplates();
      this.renderLibrary();
      this.renderProps();
      this.updateStatus();
      if ( this.pending && Object.keys(this.pending).length ) await this.handleOpen(this.pending);
      this.pending = null;
      await this.loadPicture();
      this.refreshPrep();
      this.requestDraw();
    } catch ( err ) {
      reportError(err, "abrir o editor");
    }
  }

  async _onClose(options) {
    await super._onClose?.(options);
    this.resizeObserver?.disconnect();
    saveDraft(this.card, this.savedHash);
  }

  buildShell() {
    const root = document.createElement("div");
    root.className = "ce-root";
    const chips = [["todos", "Todos", "fa-solid fa-layer-group"], ...Object.entries(CATEGORIES).map(([k, c]) => [k, c.plural, c.icon])]
      .map(([k, label, icon]) => `<button type="button" class="ce-chip" data-filter="${k}"><i class="${icon}"></i> ${label}</button>`).join("");
    root.innerHTML = `
      <aside class="ce-left">
        <nav class="ce-tabs">
          <button type="button" data-tab="modelos" class="active"><i class="fa-solid fa-table-cells-large"></i> Modelos</button>
          <button type="button" data-tab="biblioteca"><i class="fa-solid fa-book-bookmark"></i> Cartas salvas</button>
        </nav>
        <section class="ce-pane" data-pane="modelos">
          <div class="ce-chips">${chips}</div>
          <div class="ce-templates"></div>
          <button type="button" class="ce-wide" data-act="importTemplate"><i class="fa-solid fa-file-import"></i> Importar modelo (cor chapada)…</button>
        </section>
        <section class="ce-pane" data-pane="biblioteca" hidden>
          <div class="ce-libbar">
            <input type="search" class="ce-search" placeholder="Buscar carta…" data-keyboard-focus="true">
            <button type="button" data-act="newCard" title="Nova carta"><i class="fa-solid fa-plus"></i></button>
          </div>
          <div class="ce-library"></div>
        </section>
      </aside>
      <main class="ce-main">
        <div class="ce-stage" tabindex="0" data-keyboard-focus="true">
          <canvas class="ce-canvas"></canvas>
          <div class="ce-empty">
            <i class="fa-solid fa-image"></i>
            <p>Arraste uma imagem para cá<br><small>(arquivo do computador, ator, item ou imagem do Foundry) ou</small></p>
            <div class="ce-empty-btns">
              <button type="button" data-act="pickImage"><i class="fa-solid fa-folder-open"></i> Escolher no servidor</button>
              <button type="button" data-act="uploadImage"><i class="fa-solid fa-upload"></i> Enviar do computador</button>
            </div>
          </div>
          <div class="ce-dropzone"><span><i class="fa-solid fa-file-arrow-down"></i> Solte para usar esta imagem</span></div>
          <div class="ce-busy" hidden><i class="fa-solid fa-spinner fa-spin"></i> <span></span></div>
        </div>
        <div class="ce-toolbar">
          <div class="ce-group">
            <button type="button" data-act="pickImage" title="Escolher uma imagem do servidor"><i class="fa-solid fa-folder-open"></i></button>
            <button type="button" data-act="uploadImage" title="Enviar uma imagem do computador"><i class="fa-solid fa-upload"></i></button>
            <button type="button" data-act="removeImage" title="Tirar a imagem"><i class="fa-solid fa-eraser"></i></button>
          </div>
          <div class="ce-group">
            <button type="button" data-act="zoomOut" title="Diminuir (−)"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
            <button type="button" data-act="zoomIn" title="Aumentar (+)"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
            <button type="button" data-act="rotateLeft" title="Girar 15° para a esquerda"><i class="fa-solid fa-rotate-left"></i></button>
            <button type="button" data-act="rotateRight" title="Girar 15° para a direita"><i class="fa-solid fa-rotate-right"></i></button>
            <button type="button" data-act="flip" title="Espelhar"><i class="fa-solid fa-left-right"></i></button>
          </div>
          <div class="ce-group">
            <button type="button" data-act="fitCover" title="Preencher a janela (duplo clique na carta)"><i class="fa-solid fa-expand"></i> Preencher</button>
            <button type="button" data-act="fitContain" title="Mostrar a imagem inteira"><i class="fa-solid fa-compress"></i> Inteira</button>
            <button type="button" data-act="center" title="Centralizar"><i class="fa-solid fa-crosshairs"></i></button>
            <button type="button" data-act="toggleGhost" class="ce-toggle" title="Mostrar o que fica fora da moldura"><i class="fa-solid fa-ghost"></i></button>
          </div>
          <div class="ce-group">
            <button type="button" data-act="undo" title="Desfazer (Ctrl+Z)"><i class="fa-solid fa-arrow-rotate-left"></i></button>
            <button type="button" data-act="redo" title="Refazer (Ctrl+Y)"><i class="fa-solid fa-arrow-rotate-right"></i></button>
          </div>
        </div>
        <div class="ce-status"><span class="ce-state"></span><span class="ce-hint">Arraste para mover · roda: zoom · Shift+roda: girar · setas: ajuste fino · duplo clique: preencher</span></div>
      </main>
      <aside class="ce-right">
        <div class="ce-props"></div>
        <footer class="ce-actions">
          <button type="button" class="ce-primary" data-act="save"><i class="fa-solid fa-floppy-disk"></i> Salvar carta</button>
          <button type="button" data-act="saveUse"><i class="fa-solid fa-user-plus"></i> Salvar e usar…</button>
          <button type="button" data-act="download" title="Baixar a imagem no computador"><i class="fa-solid fa-download"></i></button>
        </footer>
      </aside>
      <input type="file" class="ce-file" accept="image/*" hidden>
      <div class="ce-modal" hidden></div>`;
    this.el = {
      root,
      stage: root.querySelector(".ce-stage"),
      canvas: root.querySelector(".ce-canvas"),
      empty: root.querySelector(".ce-empty"),
      busy: root.querySelector(".ce-busy"),
      templates: root.querySelector(".ce-templates"),
      library: root.querySelector(".ce-library"),
      props: root.querySelector(".ce-props"),
      state: root.querySelector(".ce-state"),
      file: root.querySelector(".ce-file"),
      modal: root.querySelector(".ce-modal"),
      search: root.querySelector(".ce-search")
    };
    return root;
  }

  /* ---------------------------------------------------------------------------------------------- */
  /* Events                                                                                           */
  /* ---------------------------------------------------------------------------------------------- */

  bindEvents() {
    const { root, stage, props, file, search } = this.el;
    root.addEventListener("click", guard(ev => this.onClick(ev), "clique"));
    props.addEventListener("input", guard(ev => this.onField(ev), "campo"));
    props.addEventListener("change", guard(ev => this.onField(ev), "campo"));
    search.addEventListener("input", () => {
      this.query = search.value;
      this.renderLibrary();
    });
    file.addEventListener("change", guard(async () => {
      const f = file.files?.[0];
      file.value = "";
      if ( f ) await this.receiveFile(f);
    }, "enviar imagem"));

    stage.addEventListener("pointerdown", guard(ev => this.onPointerDown(ev), "arrastar"));
    stage.addEventListener("pointermove", guard(ev => this.onPointerMove(ev), "arrastar"));
    stage.addEventListener("pointerup", guard(ev => this.onPointerUp(ev), "arrastar"));
    stage.addEventListener("pointercancel", guard(ev => this.onPointerUp(ev), "arrastar"));
    stage.addEventListener("dblclick", guard(ev => {
      if ( this.labelBox && this.inLabel(this.toCard(ev)) ) return;
      this.fit("cover");
    }, "preencher"));
    stage.addEventListener("wheel", guard(ev => this.onWheel(ev), "zoom"), { passive: false });
    stage.addEventListener("keydown", guard(ev => this.onKey(ev), "teclado"));
    root.addEventListener("paste", guard(ev => this.onPaste(ev), "colar"));

    stage.addEventListener("dragenter", ev => {
      ev.preventDefault();
      stage.classList.add("is-over");
    });
    stage.addEventListener("dragover", ev => {
      ev.preventDefault();
      if ( ev.dataTransfer ) ev.dataTransfer.dropEffect = "copy";
      stage.classList.add("is-over");
    });
    stage.addEventListener("dragleave", ev => {
      if ( !stage.contains(ev.relatedTarget) ) stage.classList.remove("is-over");
    });
    stage.addEventListener("drop", guard(ev => this.onDrop(ev), "soltar"));

    this.resizeObserver = new ResizeObserver(() => this.requestDraw());
    this.resizeObserver.observe(stage);

    root.addEventListener("keydown", ev => {
      if ( ev.key === "Escape" && !this.el.modal.hidden ) {
        ev.preventDefault();
        ev.stopPropagation();
        this.closeModal(null);
      }
    });
  }

  onClick(ev) {
    const t = ev.target.closest("[data-act],[data-tab],[data-filter],[data-tpl],[data-card]");
    if ( !t || !this.el.root.contains(t) ) return;
    if ( t.closest(".ce-modal") && !t.dataset.act?.startsWith("modal") ) return; /* modal buttons handled there */
    if ( t.dataset.tab ) return this.setTab(t.dataset.tab);
    if ( t.dataset.filter ) {
      this.filter = t.dataset.filter;
      return this.renderTemplates();
    }
    if ( t.dataset.act ) {
      const fn = this.actions[t.dataset.act];
      if ( fn ) return fn.call(this, ev, t);
      return;
    }
    if ( t.dataset.tpl ) return this.selectTemplate(t.dataset.tpl);
    if ( t.dataset.card ) return this.actions.openCard.call(this, ev, t);
  }

  get actions() {
    return {
      pickImage: () => browse({ type: "image", current: this.card.image.src, callback: path => this.setPicture(path) }),
      uploadImage: () => this.el.file.click(),
      removeImage: () => {
        if ( !this.card.image.src ) return;
        this.pushHistory();
        this.card.image.src = "";
        this.img = null;
        this.imgSrc = "";
        this.afterChange({ props: true });
      },
      zoomIn: () => this.nudge(() => this.zoomAt(1.1, this.windowCentre())),
      zoomOut: () => this.nudge(() => this.zoomAt(1 / 1.1, this.windowCentre())),
      rotateLeft: () => this.nudge(() => this.rotateBy(-15)),
      rotateRight: () => this.nudge(() => this.rotateBy(15)),
      flip: () => this.nudge(() => {
        this.card.image.flip = !this.card.image.flip;
      }),
      fitCover: () => this.fit("cover"),
      fitContain: () => this.fit("contain"),
      center: () => this.nudge(() => {
        this.card.image.x = 0;
        this.card.image.y = 0;
      }),
      toggleGhost: (ev, t) => {
        this.ghost = !this.ghost;
        t.classList.toggle("active", this.ghost);
        this.requestDraw();
      },
      undo: () => this.undo(),
      redo: () => this.redo(),
      save: () => this.save(),
      saveUse: () => this.save({ thenUse: true }),
      download: () => this.download(),
      newCard: () => this.newCard(),
      importTemplate: () => this.openImportDialog(),
      saveStyleAsTemplate: () => this.saveStyleAsTemplate(),
      deleteTemplate: async (ev, t) => {
        ev.stopPropagation();
        const def = findTemplate(t.dataset.id);
        if ( !def || def.builtin ) return;
        if ( !(await this.confirm("Apagar modelo", `Apagar o modelo "${def.name}" da galeria? As cartas já salvas continuam com a imagem pronta.`)) ) return;
        await deleteCustomTemplate(def.id);
        this.renderTemplates();
      },
      openCard: async (ev, t) => {
        const id = t.dataset.id ?? t.closest("[data-card]")?.dataset.card;
        const card = findCard(id);
        if ( !card ) return;
        if ( card.id === this.card.id && !this.dirty ) return;
        if ( this.dirty && !(await this.confirm("Trocar de carta", "A carta aberta tem alterações não salvas. Descartar?")) ) return;
        this.loadCard(card, { saved: true });
      },
      useCard: async (ev, t) => {
        ev.stopPropagation();
        const card = findCard(t.dataset.id);
        if ( !card?.file ) return ui.notifications.warn(`${MODULE_TITLE}: essa carta ainda não tem imagem salva.`);
        await this.openUseDialog(card);
      },
      duplicateCard: async (ev, t) => {
        ev.stopPropagation();
        const card = findCard(t.dataset.id);
        if ( !card ) return;
        if ( this.dirty && !(await this.confirm("Duplicar", "A carta aberta tem alterações não salvas. Descartar?")) ) return;
        const copy = normalizeCard({ ...deepClone(card), id: uid("c"), name: `${card.name || "Carta"} (cópia)`, file: "", actorUuid: "", updated: 0 });
        this.loadCard(copy, { saved: false });
        ui.notifications.info(`${MODULE_TITLE}: cópia aberta no editor. Salve para guardá-la.`);
      },
      deleteCard: async (ev, t) => {
        ev.stopPropagation();
        const card = findCard(t.dataset.id);
        if ( !card ) return;
        if ( !(await this.confirm("Excluir carta", `Tirar "${card.name || "Sem nome"}" da biblioteca? O arquivo de imagem continua na pasta e os atores que o usam não mudam.`)) ) return;
        await deleteCard(card.id);
        if ( card.id === this.card.id ) {
          this.savedHash = "";
          this.updateStatus();
        }
        this.renderLibrary();
      },
      pickFolder: () => browse({
        type: "folder", current: rootFolder(), callback: async path => {
          await game.settings.set(MODULE_ID, "pasta", String(path ?? "").replace(/^\/+|\/+$/g, ""));
          this.renderProps();
        }
      }),
      resetFolder: async () => {
        await game.settings.set(MODULE_ID, "pasta", "");
        this.renderProps();
      },
      randomSeed: () => this.edit(() => {
        this.card.style.seed = Math.floor(Math.random() * 99998) + 1;
      }, { props: true }),
      resetColor: (ev, t) => this.edit(() => setPath(this.card, t.dataset.path, null), { props: true }),
      resetStyle: () => {
        const def = this.def();
        if ( def?.kind !== "vetor" ) return;
        this.edit(() => {
          this.card.style = normalizeStyle(def.style);
        }, { props: true });
      },
      resetTint: () => this.edit(() => {
        this.card.tint = { hue: 0, sat: 1, light: 1 };
      }, { props: true }),
      resetAdjust: () => this.edit(() => Object.assign(this.card.image, { brightness: 1, contrast: 1, saturation: 1 }), { props: true }),
      chooseActor: () => this.openActorPicker()
    };
  }

  setTab(tab) {
    this.tab = tab;
    for ( const b of this.el.root.querySelectorAll(".ce-tabs [data-tab]") ) b.classList.toggle("active", b.dataset.tab === tab);
    for ( const p of this.el.root.querySelectorAll(".ce-pane") ) p.hidden = p.dataset.pane !== tab;
    if ( tab === "biblioteca" ) this.renderLibrary();
  }

  /** Open request from outside (API, context menu, macro). */
  async handleOpen(what) {
    if ( what.cardId ) {
      const card = findCard(what.cardId);
      if ( card ) {
        if ( this.dirty && card.id !== this.card.id && !(await this.confirm("Trocar de carta", "A carta aberta tem alterações não salvas. Descartar?")) ) return;
        this.loadCard(card, { saved: true });
      }
      return;
    }
    if ( what.actor ) {
      const actor = what.actor;
      const existing = getCards().find(c => c.actorUuid === actor.uuid);
      if ( existing ) {
        if ( this.dirty && existing.id !== this.card.id && !(await this.confirm("Trocar de carta", "A carta aberta tem alterações não salvas. Descartar?")) ) return;
        this.loadCard(existing, { saved: true });
        return;
      }
      if ( this.dirty && !(await this.confirm("Nova carta", "A carta aberta tem alterações não salvas. Descartar?")) ) return;
      const tpl = this.def() ?? GM_TEMPLATES[0];
      const card = defaultCard(tpl.id, guessCategory(actor));
      card.style = tpl.kind === "vetor" ? normalizeStyle(this.card.style ?? tpl.style) : null;
      card.output.scale = tpl.kind === "vetor" ? 2 : 1;
      card.name = actor.name ?? "";
      card.actorUuid = actor.uuid ?? "";
      const img = actor.img && !String(actor.img).includes("mystery-man") ? actor.img : "";
      card.image.src = img;
      this.loadCard(card, { saved: false });
      this.categoryTouched = true;
      return;
    }
    if ( what.image ) this.setPicture(what.image);
  }

  /* ---------------------------------------------------------------------------------------------- */
  /* State                                                                                            */
  /* ---------------------------------------------------------------------------------------------- */

  def() {
    return findTemplate(this.card.template);
  }

  get dirty() {
    return contentHash(this.card) !== this.savedHash;
  }

  pushHistory() {
    this.history.push(JSON.stringify(this.card));
    if ( this.history.length > HISTORY_MAX ) this.history.shift();
    this.future = [];
  }

  undo() {
    if ( !this.history.length ) return;
    this.future.push(JSON.stringify(this.card));
    this.card = normalizeCard(JSON.parse(this.history.pop()));
    this.afterChange({ props: true, templates: true });
  }

  redo() {
    if ( !this.future.length ) return;
    this.history.push(JSON.stringify(this.card));
    this.card = normalizeCard(JSON.parse(this.future.pop()));
    this.afterChange({ props: true, templates: true });
  }

  /** One undoable change. */
  edit(fn, { props = false } = {}) {
    this.pushHistory();
    fn();
    this.afterChange({ props });
  }

  /** A change from a toolbar button (needs a picture). */
  nudge(fn) {
    if ( !this.img || !this.prep ) return;
    this.edit(fn);
    this.syncProps();
  }

  afterChange({ props = false, templates = false } = {}) {
    if ( props ) this.renderProps();
    else this.syncProps();
    if ( templates ) this.renderTemplates();
    this.updateStatus();
    this.loadPicture();
    this.refreshPrep();
    this.requestDraw();
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => saveDraft(this.card, this.savedHash), 400);
  }

  loadCard(card, { saved }) {
    this.card = normalizeCard(deepClone(card));
    if ( !findTemplate(this.card.template) ) {
      ui.notifications.warn(`${MODULE_TITLE}: o modelo desta carta não existe mais; usei o primeiro da galeria.`);
      this.card.template = GM_TEMPLATES[0].id;
    }
    this.savedHash = saved ? contentHash(this.card) : "";
    this.categoryTouched = true;
    this.history = [];
    this.future = [];
    this.afterChange({ props: true, templates: true });
    this.renderLibrary();
  }

  async newCard() {
    if ( this.dirty && !(await this.confirm("Nova carta", "A carta aberta tem alterações não salvas. Descartar?")) ) return;
    const def = this.def() ?? GM_TEMPLATES[0];
    const card = defaultCard(def.id, def.category ?? "npc");
    card.style = def.kind === "vetor" ? normalizeStyle(def.style) : null;
    card.output.scale = def.kind === "vetor" ? 2 : 1;
    this.loadCard(card, { saved: false });
    this.savedHash = contentHash(this.card);
    this.categoryTouched = false;
    this.updateStatus();
    this.setTab("modelos");
  }

  selectTemplate(id) {
    const def = findTemplate(id);
    if ( !def ) return;
    const before = this.def();
    this.pushHistory();
    this.card.template = id;
    this.card.style = def.kind === "vetor" ? normalizeStyle(def.style) : null;
    if ( !this.categoryTouched && def.category ) this.card.category = def.category;
    if ( (before?.kind ?? "") !== def.kind ) this.card.output.scale = def.kind === "vetor" ? 2 : 1;
    this.afterChange({ props: true, templates: true });
  }

  /* ---------------------------------------------------------------------------------------------- */
  /* Picture                                                                                          */
  /* ---------------------------------------------------------------------------------------------- */

  setPicture(src, { keepFraming = false } = {}) {
    if ( !src ) return;
    this.pushHistory();
    const im = this.card.image;
    if ( keepFraming ) im.src = src;
    else Object.assign(im, { src, x: 0, y: 0, scale: 1, rot: 0, flip: false });
    if ( !this.card.name ) {
      const base = decodeURIComponent(String(src).split("/").pop() ?? "").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+\w{6,9}$/, "").trim();
      if ( base && !src.startsWith("data:") ) this.card.name = base.charAt(0).toUpperCase() + base.slice(1);
    }
    this.afterChange({ props: true });
  }

  async loadPicture() {
    const src = this.card.image.src;
    if ( src === this.imgSrc ) return;
    this.imgSrc = src;
    this.img = null;
    this.updateEmpty();
    if ( !src ) return this.requestDraw();
    this.setBusy("Abrindo a imagem…");
    try {
      const img = await loadImage(src);
      if ( this.imgSrc === src ) this.img = img;
    } catch ( err ) {
      if ( this.imgSrc === src ) reportError(err, "imagem");
    } finally {
      this.setBusy(null);
      this.updateEmpty();
      this.requestDraw();
    }
  }

  updateEmpty() {
    this.el.empty.hidden = Boolean(this.card.image.src);
  }

  async receiveFile(file) {
    if ( !file?.type?.startsWith("image/") ) return ui.notifications.warn(`${MODULE_TITLE}: isso não é uma imagem.`);
    this.setBusy("Enviando a imagem…");
    try {
      const path = await uploadOriginal(file, this.card.name);
      this.setPicture(path);
    } finally {
      this.setBusy(null);
    }
  }

  async receiveDocument(data) {
    let doc = null;
    if ( data.uuid ) doc = await fromUuid(data.uuid);
    if ( !doc && data.type && data.id ) doc = game.collections?.get?.(data.type)?.get(data.id) ?? null;
    if ( !doc ) return ui.notifications.warn(`${MODULE_TITLE}: não reconheci o que foi solto.`);
    const kind = doc.documentName;
    if ( kind === "Token" && doc.actor ) return this.linkActor(doc.actor, doc.texture?.src);
    if ( kind === "Actor" ) return this.linkActor(doc);
    const src = doc.texture?.src ?? doc.src ?? doc.img ?? doc.thumb ?? "";
    if ( !src ) return ui.notifications.warn(`${MODULE_TITLE}: esse ${kind ?? "documento"} não tem imagem.`);
    if ( !this.card.name && doc.name ) this.card.name = doc.name;
    this.setPicture(src);
  }

  linkActor(actor, preferredSrc = "") {
    this.pushHistory();
    this.card.actorUuid = actor.uuid;
    if ( !this.card.name ) this.card.name = actor.name;
    if ( !this.categoryTouched ) this.card.category = guessCategory(actor);
    const src = [actor.img, preferredSrc].find(s => s && s !== DEFAULT_TOKEN && !String(s).includes("mystery-man")) ?? "";
    if ( src ) Object.assign(this.card.image, { src, x: 0, y: 0, scale: 1, rot: 0, flip: false });
    else ui.notifications.info(`${MODULE_TITLE}: ${actor.name} está ligado à carta, mas não tem retrato; escolha uma imagem.`);
    this.afterChange({ props: true });
  }

  async onDrop(ev) {
    ev.preventDefault();
    this.el.stage.classList.remove("is-over");
    const files = Array.from(ev.dataTransfer?.files ?? []).filter(f => f.type?.startsWith("image/"));
    if ( files.length ) return this.receiveFile(files[0]);
    const data = dragData(ev);
    if ( data && (data.uuid || data.type) ) return this.receiveDocument(data);
    const uri = (ev.dataTransfer?.getData("text/uri-list") || ev.dataTransfer?.getData("text/plain") || "").trim();
    if ( /^(https?:\/\/|data:image\/)/i.test(uri) ) {
      if ( /^https?:/i.test(uri) && !uri.startsWith(window.location.origin) ) {
        ui.notifications.warn(`${MODULE_TITLE}: imagem de outro site. Se a gravação falhar, baixe-a e arraste o arquivo.`);
      }
      return this.setPicture(uri);
    }
    if ( uri && /\.(png|jpe?g|webp|gif|avif|svg|bmp)$/i.test(uri) ) return this.setPicture(uri);
  }

  async onPaste(ev) {
    if ( ev.target?.closest?.("input, textarea, select") ) return;
    const item = Array.from(ev.clipboardData?.items ?? []).find(i => i.type?.startsWith("image/"));
    if ( !item ) return;
    ev.preventDefault();
    const file = item.getAsFile();
    if ( file ) await this.receiveFile(new File([file], `colada.${(file.type.split("/")[1] || "png")}`, { type: file.type }));
  }

  /* ---------------------------------------------------------------------------------------------- */
  /* Framing the picture                                                                              */
  /* ---------------------------------------------------------------------------------------------- */

  windowCentre() {
    const b = this.prep?.box ?? { x: 0, y: 0, w: 1, h: 1 };
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }

  zoomAt(f, p) {
    if ( !this.prep ) return;
    const b = this.prep.box;
    const im = this.card.image;
    const next = clamp(im.scale * f, 0.02, 40);
    const k = next / im.scale;
    const cx = b.x + b.w / 2 + im.x * b.w, cy = b.y + b.h / 2 + im.y * b.h;
    const nx = p.x + (cx - p.x) * k, ny = p.y + (cy - p.y) * k;
    im.x = clamp((nx - b.x - b.w / 2) / b.w, -5, 5);
    im.y = clamp((ny - b.y - b.h / 2) / b.h, -5, 5);
    im.scale = next;
  }

  rotateBy(deg) {
    let r = this.card.image.rot + deg;
    while ( r > 180 ) r -= 360;
    while ( r < -180 ) r += 360;
    this.card.image.rot = Math.round(r * 10) / 10;
  }

  fit(mode) {
    if ( !this.img || !this.prep ) return;
    this.edit(() => {
      Object.assign(this.card.image, { x: 0, y: 0, rot: 0, scale: mode === "contain" ? containScale(this.prep, this.img) : 1 });
    });
  }

  /* ---------------------------------------------------------------------------------------------- */
  /* Pointer, wheel and keys on the card                                                              */
  /* ---------------------------------------------------------------------------------------------- */

  toCard(ev) {
    const r = this.el.stage.getBoundingClientRect();
    const v = this.view;
    return { x: (ev.clientX - r.left - v.ox) / v.scale, y: (ev.clientY - r.top - v.oy) / v.scale };
  }

  inLabel(p) {
    const b = this.labelBox;
    return Boolean(b) && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }

  onPointerDown(ev) {
    if ( ev.button !== 0 || !this.prep ) return;
    if ( ev.target.closest(".ce-empty button") ) return;
    this.el.stage.focus({ preventScroll: true });
    const p = this.toCard(ev);
    let mode = null;
    if ( this.inLabel(p) ) mode = "label";
    else if ( this.img ) mode = "image";
    if ( !mode ) return;
    ev.preventDefault();
    this.pushHistory();
    this.drag = { mode, x: ev.clientX, y: ev.clientY, moved: false };
    this.el.stage.setPointerCapture?.(ev.pointerId);
    this.el.stage.classList.add("is-dragging");
    this.requestDraw();
  }

  onPointerMove(ev) {
    if ( !this.drag ) {
      const over = this.inLabel(this.toCard(ev));
      if ( over !== this.hoverLabel ) {
        this.hoverLabel = over;
        this.el.stage.classList.toggle("over-label", over);
        this.requestDraw();
      }
      return;
    }
    const v = this.view;
    const dx = (ev.clientX - this.drag.x) / v.scale;
    const dy = (ev.clientY - this.drag.y) / v.scale;
    if ( !dx && !dy ) return;
    this.drag.x = ev.clientX;
    this.drag.y = ev.clientY;
    this.drag.moved = true;
    if ( this.drag.mode === "image" ) {
      const b = this.prep.box;
      this.card.image.x = clamp(this.card.image.x + dx / b.w, -5, 5);
      this.card.image.y = clamp(this.card.image.y + dy / b.h, -5, 5);
    }
    else {
      const L = this.card.label;
      L.x = clamp(L.x + dx / this.prep.w, 0, 1);
      L.y = clamp(L.y + dy / this.prep.h, 0, 1);
    }
    this.requestDraw();
  }

  onPointerUp(ev) {
    if ( !this.drag ) return;
    this.el.stage.releasePointerCapture?.(ev.pointerId);
    this.el.stage.classList.remove("is-dragging");
    const moved = this.drag.moved;
    this.drag = null;
    if ( !moved ) this.history.pop();
    this.afterChange();
  }

  /** Wheel and arrow keys group their changes into one undo step. */
  grouped(fn) {
    if ( !this.groupTimer ) this.pushHistory();
    clearTimeout(this.groupTimer);
    this.groupTimer = setTimeout(() => {
      this.groupTimer = null;
      this.afterChange();
    }, 450);
    fn();
    this.syncProps();
    this.updateStatus();
    this.requestDraw();
  }

  onWheel(ev) {
    if ( !this.img || !this.prep ) return;
    ev.preventDefault();
    const dy = ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY;
    this.grouped(() => {
      if ( ev.shiftKey ) this.rotateBy((dy || ev.deltaX) > 0 ? 2 : -2);
      else this.zoomAt(Math.exp(-dy * (ev.altKey ? 0.0004 : 0.0015)), this.toCard(ev));
    });
  }

  onKey(ev) {
    const ctrl = ev.ctrlKey || ev.metaKey;
    const key = ev.key;
    if ( ctrl && (key === "z" || key === "Z") ) {
      ev.preventDefault();
      if ( ev.shiftKey ) this.redo();
      else this.undo();
      return;
    }
    if ( ctrl && (key === "y" || key === "Y") ) {
      ev.preventDefault();
      this.redo();
      return;
    }
    if ( ctrl || !this.img || !this.prep ) return;
    const step = ev.shiftKey ? 10 : 1;
    const b = this.prep.box;
    const im = this.card.image;
    const moves = {
      ArrowLeft: () => (im.x -= step / b.w),
      ArrowRight: () => (im.x += step / b.w),
      ArrowUp: () => (im.y -= step / b.h),
      ArrowDown: () => (im.y += step / b.h),
      "+": () => this.zoomAt(ev.shiftKey ? 1.2 : 1.03, this.windowCentre()),
      "=": () => this.zoomAt(ev.shiftKey ? 1.2 : 1.03, this.windowCentre()),
      "-": () => this.zoomAt(1 / (ev.shiftKey ? 1.2 : 1.03), this.windowCentre()),
      "[": () => this.rotateBy(ev.shiftKey ? -15 : -1),
      "]": () => this.rotateBy(ev.shiftKey ? 15 : 1)
    };
    if ( key === "0" ) {
      ev.preventDefault();
      return this.fit("cover");
    }
    const fn = moves[key];
    if ( !fn ) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.grouped(fn);
  }

  /* ---------------------------------------------------------------------------------------------- */
  /* Drawing                                                                                          */
  /* ---------------------------------------------------------------------------------------------- */

  requestDraw() {
    if ( this.frame ) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      try {
        this.draw();
      } catch ( err ) {
        reportError(err, "desenhar");
      }
    });
  }

  /** Display prep scale for the current window size (quantized, so resizing does not rebuild it). */
  wantedScale() {
    const def = this.def();
    if ( !def ) return 1;
    const dpr = window.devicePixelRatio || 1;
    const st = this.el.stage;
    const base = this.prep && this.prep.key?.startsWith(def.kind === "vetor" ? "v|" : "r|") ? this.prep : null;
    const w = base?.w ?? (def.kind === "vetor" ? windowOf(styleFor(def, this.card.style)).W : 450);
    const h = base?.h ?? (def.kind === "vetor" ? windowOf(styleFor(def, this.card.style)).H : 750);
    const fit = Math.min((st.clientWidth - 48) / w, (st.clientHeight - 48) / h);
    return clamp(Math.ceil(fit * dpr * 4) / 4, 0.25, 3);
  }

  /** Rebuild the template canvases when the template, its style or the display size changes. */
  async refreshPrep() {
    const def = this.def();
    if ( !def ) return;
    this.prepWant = `${def.id}|${hash(styleFor(def, this.card.style))}|${this.wantedScale()}`;
    if ( this.prepBusy ) return;
    this.prepBusy = true;
    try {
      while ( this.prepWant && this.prepWant !== this.prepKey ) {
        const want = this.prepWant;
        const d = this.def();
        if ( !d ) break;
        if ( !this.prep ) this.setBusy("Preparando a moldura…");
        const prep = await prepare(d, this.card.style, this.wantedScale());
        if ( this.prepWant === want || !this.prep ) {
          this.prep = prep;
          this.prepKey = want;
          this.requestDraw();
        }
        if ( this.prepWant === want ) break;
      }
    } catch ( err ) {
      reportError(err, "modelo");
      this.prepKey = this.prepWant;
    } finally {
      this.prepBusy = false;
      this.setBusy(null);
    }
  }

  draw() {
    const { stage, canvas } = this.el;
    const dpr = window.devicePixelRatio || 1;
    const sw = stage.clientWidth, sh = stage.clientHeight;
    if ( !sw || !sh ) return;
    if ( canvas.width !== Math.round(sw * dpr) || canvas.height !== Math.round(sh * dpr) ) {
      canvas.width = Math.round(sw * dpr);
      canvas.height = Math.round(sh * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, sw, sh);
    const p = this.prep;
    if ( !p ) return;
    const want = `${this.def()?.id}|${hash(styleFor(this.def(), this.card.style))}|${this.wantedScale()}`;
    if ( want !== this.prepWant ) this.refreshPrep();

    const pad = 24;
    const vs = Math.min((sw - 2 * pad) / p.w, (sh - 2 * pad) / p.h);
    const ox = (sw - p.w * vs) / 2, oy = (sh - p.h * vs) / 2;
    this.view = { scale: vs, ox, oy };

    if ( this.card.label.on ) {
      const font = labelFont(this.card.label, 48);
      if ( !this.fontsAsked?.has(font) && document.fonts?.check && !document.fonts.check(font) ) {
        (this.fontsAsked ??= new Set()).add(font);
        this.loadFont(this.card.label).then(() => this.requestDraw());
      }
    }

    if ( this.img && (this.ghost || this.drag?.mode === "image") ) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.translate(ox, oy);
      drawPicture(ctx, this.img, placement(p, this.img, this.card.image), vs);
      ctx.restore();
    }

    const { canvas: cc, labelBox } = composeCard(p, this.card, { image: this.img, placeholder: !this.img, canvas: this.work });
    this.labelBox = labelBox;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 5;
    ctx.drawImage(cc, ox, oy, p.w * vs, p.h * vs);
    ctx.restore();

    if ( labelBox && (this.hoverLabel || this.drag?.mode === "label") ) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "#ffd34d";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ox + labelBox.x * vs - 3, oy + labelBox.y * vs - 3, labelBox.w * vs + 6, labelBox.h * vs + 6);
      ctx.restore();
    }
    if ( this.drag?.mode === "image" ) {
      const b = p.box;
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + b.x * vs, oy + b.y * vs, b.w * vs, b.h * vs);
      ctx.restore();
    }
  }

  setBusy(text) {
    const el = this.el?.busy;
    if ( !el ) return;
    el.hidden = !text;
    if ( text ) el.querySelector("span").textContent = text;
  }

  updateStatus() {
    const el = this.el?.state;
    if ( !el ) return;
    const saved = getCards().some(c => c.id === this.card.id);
    if ( this.dirty ) el.innerHTML = `<i class="fa-solid fa-circle ce-dot"></i> ${saved ? "Alterações não salvas" : "Carta nova (não salva)"}`;
    else if ( this.card.file ) el.innerHTML = `<i class="fa-solid fa-check"></i> Salva em <code>${escapeHTML(this.card.file)}</code>`;
    else el.textContent = "";
    this.el.root.querySelector('[data-act="undo"]')?.toggleAttribute("disabled", !this.history.length);
    this.el.root.querySelector('[data-act="redo"]')?.toggleAttribute("disabled", !this.future.length);
  }

  /* ---------------------------------------------------------------------------------------------- */
  /* Left panel                                                                                       */
  /* ---------------------------------------------------------------------------------------------- */

  renderTemplates() {
    const box = this.el.templates;
    for ( const c of this.el.root.querySelectorAll(".ce-chip") ) c.classList.toggle("active", c.dataset.filter === this.filter);
    const list = allTemplates().filter(t => this.filter === "todos" || t.category === this.filter);
    const mine = list.filter(t => t.kind === "raster" || !t.builtin);
    const module = list.filter(t => t.kind === "vetor" && t.builtin);
    const tile = t => {
      const cat = CATEGORIES[t.category];
      const del = t.builtin ? "" : `<button type="button" class="ce-tpl-del" data-act="deleteTemplate" data-id="${t.id}" title="Apagar modelo"><i class="fa-solid fa-xmark"></i></button>`;
      return `<div class="ce-tpl${t.id === this.card.template ? " active" : ""}" data-tpl="${t.id}" title="${escapeHTML(t.name)} (${cat?.label ?? ""})" role="button" tabindex="0">`
        + `<span class="ce-tpl-img"><img alt="" data-thumb="${t.id}"></span>`
        + `<span class="ce-tpl-name"><i class="${cat?.icon ?? ""}"></i> ${escapeHTML(t.name)}</span>${del}</div>`;
    };
    box.innerHTML = (mine.length ? `<h4>Seus modelos</h4><div class="ce-grid">${mine.map(tile).join("")}</div>` : "")
      + (module.length ? `<h4>Modelos do módulo</h4><div class="ce-grid">${module.map(tile).join("")}</div>` : "")
      + (!list.length ? `<p class="ce-none">Nenhum modelo nesta categoria.</p>` : "");
    for ( const img of box.querySelectorAll("img[data-thumb]") ) {
      const def = findTemplate(img.dataset.thumb);
      if ( !def ) continue;
      templateThumb(def).then(url => {
        img.src = url;
      }).catch(err => {
        img.closest(".ce-tpl")?.classList.add("broken");
        console.warn(`${MODULE_TITLE} | miniatura ${def.id}`, err);
      });
    }
  }

  renderLibrary() {
    const q = this.query.trim().toLowerCase();
    const cards = getCards().filter(c => !q || c.name.toLowerCase().includes(q));
    const box = this.el.library;
    if ( !cards.length ) {
      box.innerHTML = `<p class="ce-none">${q ? "Nada encontrado." : "Nenhuma carta salva ainda. Monte uma carta e clique em Salvar."}</p>`;
      return;
    }
    box.innerHTML = cards.map(c => {
      const cat = CATEGORIES[c.category];
      const tpl = findTemplate(c.template);
      const thumb = c.file ? `<img src="${escapeHTML(c.file)}" alt="">` : `<span class="ce-noimg"><i class="fa-solid fa-image"></i></span>`;
      const linked = c.actorUuid ? ` · <i class="fa-solid fa-link" title="Ligada a um ator"></i>` : "";
      return `<div class="ce-card${c.id === this.card.id ? " active" : ""}" data-card="${c.id}" title="Clique para editar">`
        + `<span class="ce-card-img">${thumb}</span>`
        + `<span class="ce-card-info"><b>${escapeHTML(c.name || "Sem nome")}</b><small><i class="${cat.icon}"></i> ${cat.label} · ${escapeHTML(tpl?.name ?? "modelo apagado")}${linked}</small></span>`
        + `<span class="ce-card-btns">`
        + `<button type="button" data-act="useCard" data-id="${c.id}" title="Usar como ator ou token"><i class="fa-solid fa-user-plus"></i></button>`
        + `<button type="button" data-act="duplicateCard" data-id="${c.id}" title="Duplicar"><i class="fa-solid fa-copy"></i></button>`
        + `<button type="button" data-act="deleteCard" data-id="${c.id}" title="Tirar da biblioteca"><i class="fa-solid fa-trash"></i></button>`
        + `</span></div>`;
    }).join("");
  }

  /* ---------------------------------------------------------------------------------------------- */
  /* Right panel                                                                                      */
  /* ---------------------------------------------------------------------------------------------- */

  renderProps() {
    const c = this.card;
    const def = this.def();
    const vec = def?.kind === "vetor";
    const st = c.style;
    const open = this.openSections ??= new Set(["carta", "imagem", "moldura"]);
    for ( const d of this.el.props.querySelectorAll("details[data-sec]") ) {
      if ( d.open ) open.add(d.dataset.sec);
      else open.delete(d.dataset.sec);
    }
    const sec = (id, title, icon, body) => `<details data-sec="${id}"${open.has(id) ? " open" : ""}><summary><i class="${icon}"></i> ${title}</summary><div class="ce-sec">${body}</div></details>`;
    const row = (label, control, cls = "") => `<label class="ce-row ${cls}"><span>${label}</span>${control}</label>`;
    const range = (path, min, max, step, fmt, extra = "") => {
      const v = getPath(c, path);
      return `<span class="ce-range"><input type="range" data-path="${path}" min="${min}" max="${max}" step="${step}" value="${v}" ${extra}><output data-out="${path}" data-fmt="${fmt}">${this.fmt(fmt, v)}</output></span>`;
    };
    const logRange = (path, min, max, fmt) => {
      const v = getPath(c, path);
      return `<span class="ce-range"><input type="range" data-path="${path}" data-map="log" min="${min}" max="${max}" step="0.01" value="${Math.log2(v)}"><output data-out="${path}" data-fmt="${fmt}">${this.fmt(fmt, v)}</output></span>`;
    };
    const sel = (path, table, rebuild = false) => `<select data-path="${path}"${rebuild ? " data-rebuild" : ""}>${options(table, getPath(c, path))}</select>`;
    const col = (path, fallback, reset = false) => {
      const v = getPath(c, path) ?? fallback;
      return `<span class="ce-color"><input type="color" data-path="${path}" value="${v}">${reset ? `<button type="button" class="ce-mini" data-act="resetColor" data-path="${path}" title="Voltar à cor do metal"><i class="fa-solid fa-rotate-left"></i></button>` : ""}</span>`;
    };
    const chk = (path, label, rebuild = false) => `<label class="ce-check"><input type="checkbox" data-path="${path}"${getPath(c, path) ? " checked" : ""}${rebuild ? " data-rebuild" : ""}> ${label}</label>`;

    const catOptions = Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label]));
    let linked = "";
    if ( c.actorUuid ) {
      const actor = globalThis.fromUuidSync?.(c.actorUuid);
      linked = `<div class="ce-linked"><i class="fa-solid fa-link"></i> Ligada a <b>${escapeHTML(actor?.name ?? "um ator apagado")}</b></div>`;
    }
    let html = sec("carta", "Carta", "fa-solid fa-id-card",
      row("Nome", `<input type="text" data-path="name" value="${escapeHTML(c.name)}" placeholder="Nome do personagem" maxlength="120">`)
      + row("Categoria", `<select data-path="category" data-cat>${options(catOptions, c.category)}</select>`)
      + row("Modelo", `<span class="ce-tplname">${escapeHTML(def?.name ?? "?")}</span>`)
      + linked
      + `<button type="button" class="ce-wide ce-small" data-act="chooseActor"><i class="fa-solid fa-user"></i> Pegar o retrato de um ator…</button>`);

    html += sec("imagem", "Imagem", "fa-solid fa-image",
      (c.image.src ? `<div class="ce-path" title="${escapeHTML(c.image.src)}">${escapeHTML(c.image.src.startsWith("data:") ? "(imagem colada)" : c.image.src)}</div>` : `<p class="ce-hintline">Sem imagem. Arraste uma para a carta ou use os botões abaixo dela.</p>`)
      + row("Zoom", logRange("image.scale", -4.3, 4, "pct"))
      + row("Girar", range("image.rot", -180, 180, 0.5, "deg"))
      + row("Horizontal", range("image.x", -1.5, 1.5, 0.001, "pct"))
      + row("Vertical", range("image.y", -1.5, 1.5, 0.001, "pct"))
      + chk("image.flip", "Espelhar")
      + `<div class="ce-subhead">Ajustes <button type="button" class="ce-mini" data-act="resetAdjust" title="Zerar ajustes"><i class="fa-solid fa-rotate-left"></i></button></div>`
      + row("Brilho", range("image.brightness", 0.2, 2, 0.01, "pct"))
      + row("Contraste", range("image.contrast", 0.2, 2, 0.01, "pct"))
      + row("Saturação", range("image.saturation", 0, 2.5, 0.01, "pct")));

    html += sec("janela", "Fundo atrás da imagem", "fa-solid fa-fill-drip",
      `<p class="ce-hintline">Aparece onde a imagem não cobre a janela (imagens com fundo transparente).</p>`
      + row("Fundo", sel("windowBg.mode", WINDOW_BG, true))
      + (c.windowBg.mode !== "nenhum" ? row("Cor", col("windowBg.color", "#3b3142")) : "")
      + (c.windowBg.mode === "gradiente" ? row("Cor da borda", col("windowBg.color2", "#141018")) : "")
      + row("Sombra interna", range("shadow", 0, 1, 0.01, "pct")));

    if ( vec && st ) {
      const pal = paletteOf(st);
      const cardType = st.card;
      html += sec("moldura", "Moldura", "fa-solid fa-border-all",
        row("Formato da carta", sel("style.card", Object.fromEntries(Object.entries(CARD_TYPES).map(([k, v]) => [k, v.label])), true))
        + (cardType !== "redondo" ? row("Janela", sel("style.shape", SHAPES)) : "")
        + row("Metal", sel("style.metal", Object.fromEntries(Object.entries(METALS).map(([k, v]) => [k, v.label])), true))
        + (st.metal === "custom" ? row("Cor do metal", col("style.metalColor", "#8a6a3a")) : "")
        + row("Ornamentos", sel("style.ornament", ORNAMENTS))
        + row("Tamanho dos ornamentos", range("style.ornScale", 0.5, 1.8, 0.05, "pct"))
        + row("Cor das folhas", col("style.accent", pal.accent, true))
        + row("Cor das joias", col("style.gem", pal.gem, true))
        + row("Espessura da borda", range("style.border", 3, 32, 0.5, "px"))
        + row("Margem", range("style.margin", 16, 90, 1, "px"))
        + chk("style.double", "Moldura dupla")
        + chk("style.edge", "Filete na beirada da carta")
        + `<div class="ce-btnrow"><button type="button" class="ce-small" data-act="resetStyle"><i class="fa-solid fa-rotate-left"></i> Voltar ao modelo</button>`
        + `<button type="button" class="ce-small" data-act="saveStyleAsTemplate"><i class="fa-solid fa-star"></i> Salvar como modelo</button></div>`);
      html += sec("fundo", "Fundo da carta", "fa-solid fa-scroll",
        row("Tipo", sel("style.background", BACKGROUNDS, true))
        + (st.background !== "transparente" ? row("Cor 1", col("style.bg1", "#f3e2b9")) : "")
        + (!["transparente", "liso"].includes(st.background) ? row("Cor 2", col("style.bg2", "#b98a4e")) : "")
        + (st.background !== "transparente" ? chk("style.vignette", "Escurecer as beiradas") : "")
        + (["pergaminho", "estrelado", "pedra", "madeira", "marmore"].includes(st.background) || ["espinhos", "estrelas", "runas"].includes(st.ornament)
          ? row("Variação", `<span class="ce-range"><input type="number" data-path="style.seed" min="1" max="99999" step="1" value="${st.seed}"><button type="button" class="ce-mini" data-act="randomSeed" title="Sortear"><i class="fa-solid fa-dice"></i></button></span>`) : ""));
    }
    else {
      html += sec("moldura", "Cores do modelo", "fa-solid fa-palette",
        `<p class="ce-hintline">A moldura e o fundo vêm da imagem do modelo. Dá para mudar o tom inteiro dela aqui.</p>`
        + row("Matiz", range("tint.hue", -180, 180, 1, "deg"))
        + row("Saturação", range("tint.sat", 0, 2.5, 0.01, "pct"))
        + row("Brilho", range("tint.light", 0.3, 1.8, 0.01, "pct"))
        + `<div class="ce-btnrow"><button type="button" class="ce-small" data-act="resetTint"><i class="fa-solid fa-rotate-left"></i> Cores originais</button></div>`);
    }

    const L = c.label;
    const fonts = Object.fromEntries(fontChoices().map(f => [f, f]));
    if ( L.font && !fonts[L.font] ) fonts[L.font] = L.font;
    html += sec("nome", "Nome na carta", "fa-solid fa-signature",
      chk("label.on", "Escrever o nome na carta", true)
      + (L.on
        ? row("Texto", `<input type="text" data-path="label.text" value="${escapeHTML(L.text)}" placeholder="${escapeHTML(c.name || "Nome da carta")}" maxlength="80">`)
          + row("Fonte", sel("label.font", fonts))
          + row("Tamanho", range("label.size", 10, 120, 1, "px"))
          + row("Cor", col("label.color", "#ffffff"))
          + row("Contorno", col("label.stroke", "#000000"))
          + row("Espessura", range("label.strokeW", 0, 14, 0.5, "px"))
          + `<div class="ce-checks">${chk("label.caps", "Maiúsculas")}${chk("label.bold", "Negrito")}</div>`
          + row("Faixa", sel("label.band", LABEL_BANDS, true))
          + (L.band !== "nenhuma" ? row("Cor da faixa", col("label.bandColor", "#8c1c2b")) + row("Borda da faixa", col("label.bandEdge", "#f2b33d")) : "")
          + row("Posição", range("label.y", 0, 1, 0.001, "pct"))
          + `<p class="ce-hintline">Também dá para arrastar o nome na carta.</p>`
        : ""));

    const prepW = this.prep?.w ?? (vec ? windowOf(st).W : 450);
    const prepH = this.prep?.h ?? (vec ? windowOf(st).H : 750);
    const scales = Object.fromEntries([0.5, 1, 1.5, 2, 3, 4].map(k => [k, `×${String(k).replace(".", ",")} (${Math.round(prepW * k)} × ${Math.round(prepH * k)} px)`]));
    const worldFormat = setting("formato", "webp");
    html += sec("arquivo", "Arquivo", "fa-solid fa-file-image",
      row("Resolução", `<select data-path="output.scale" data-type="num">${options(scales, c.output.scale)}</select>`)
      + row("Formato", sel("output.format", { "": `Padrão do mundo (${worldFormat === "png" ? "PNG" : "WebP"})`, webp: "WebP", png: "PNG" }))
      + `<div class="ce-folder"><span>Pasta</span><code title="${escapeHTML(rootFolder())}">${escapeHTML(rootFolder())}</code>`
      + `<button type="button" class="ce-mini" data-act="pickFolder" title="Escolher outra pasta"><i class="fa-solid fa-folder-tree"></i></button>`
      + (setting("pasta", "") ? `<button type="button" class="ce-mini" data-act="resetFolder" title="Voltar à pasta do mundo"><i class="fa-solid fa-rotate-left"></i></button>` : "")
      + `</div><p class="ce-hintline">Cada categoria vai para uma subpasta: ${Object.values(CATEGORIES).map(k => k.folder).join(", ")}.</p>`);

    this.el.props.innerHTML = html;
  }

  fmt(kind, v) {
    if ( kind === "pct" ) return pct(v);
    if ( kind === "deg" ) return `${Math.round(v)}°`;
    if ( kind === "px" ) return `${Math.round(v * 10) / 10}`;
    return String(v);
  }

  /** Put the current values back into the fields (after dragging, wheel, undo...). */
  syncProps() {
    for ( const el of this.el.props.querySelectorAll("[data-path]") ) {
      if ( el === document.activeElement && el.type !== "range" ) continue;
      const v = getPath(this.card, el.dataset.path);
      if ( el.type === "checkbox" ) el.checked = Boolean(v);
      else if ( el.dataset.map === "log" ) el.value = Math.log2(v);
      else if ( el.type === "color" ) el.value = v ?? el.value;
      else el.value = v ?? "";
    }
    for ( const out of this.el.props.querySelectorAll("output[data-out]") ) {
      out.textContent = this.fmt(out.dataset.fmt, getPath(this.card, out.dataset.out));
    }
  }

  /**
   * A field of the right panel changed. Sliders, colours and texts apply live on "input" (one undo step
   * per drag/typing session, closed by "change"); checkboxes and selects apply on "change".
   */
  onField(ev) {
    const el = ev.target.closest("[data-path]");
    if ( !el ) return;
    const path = el.dataset.path;
    const discrete = el.type === "checkbox" || el.tagName === "SELECT";
    if ( ev.type === "input" && discrete ) return;
    let value;
    if ( el.type === "checkbox" ) value = el.checked;
    else if ( el.dataset.map === "log" ) value = 2 ** Number(el.value);
    else if ( el.type === "range" || el.type === "number" || el.dataset.type === "num" ) value = Number(el.value);
    else value = el.value;
    if ( typeof value === "number" && !Number.isFinite(value) ) return;

    if ( ev.type === "change" && !discrete ) {
      /* end of a drag / typing session */
      this.fieldActive = null;
      if ( getPath(this.card, path) !== value ) this.applyField(path, value, el);
      this.afterChange({ props: el.hasAttribute("data-rebuild") });
      return;
    }
    if ( this.fieldActive !== path ) {
      this.pushHistory();
      this.fieldActive = discrete ? null : path;
    }
    this.applyField(path, value, el);
    const rebuild = discrete && (el.hasAttribute("data-rebuild") || path === "output.scale");
    this.afterChange({ props: rebuild });
    if ( path === "category" ) this.renderTemplates();
  }

  applyField(path, value, el) {
    setPath(this.card, path, value);
    if ( el.hasAttribute("data-cat") ) this.categoryTouched = true;
    if ( path.startsWith("style.") ) this.card.style = normalizeStyle(this.card.style);
    const out = this.el.props.querySelector(`output[data-out="${path}"]`);
    if ( out ) out.textContent = this.fmt(out.dataset.fmt, getPath(this.card, path));
  }

  /* ---------------------------------------------------------------------------------------------- */
  /* Saving                                                                                           */
  /* ---------------------------------------------------------------------------------------------- */

  /** Render the card at its output scale. */
  async renderOutput(card = this.card) {
    const def = findTemplate(card.template);
    if ( !def ) throw new Error("o modelo desta carta não existe mais");
    const prep = await prepare(def, card.style, card.output.scale);
    const image = card.image.src ? await loadImage(card.image.src) : null;
    if ( card.label.on ) await this.loadFont(card.label);
    return composeCard(prep, card, { image, placeholder: !image }).canvas;
  }

  /** Make sure the label font is ready before drawing with it (fonts load lazily). */
  async loadFont(L) {
    try {
      await document.fonts?.load?.(labelFont(L, 48));
    } catch ( err ) { /* the fallback font is used */ }
  }

  formatOf(card = this.card) {
    return card.output.format || setting("formato", "webp") || "webp";
  }

  async save({ thenUse = false } = {}) {
    if ( this.busy ) return;
    if ( !isGM() ) return ui.notifications.warn(`${MODULE_TITLE}: só o mestre salva cartas.`);
    if ( !this.card.name.trim() ) {
      const name = await this.prompt("Nome da carta", "Como essa carta se chama?", "");
      if ( name === null ) return;
      this.pushHistory();
      this.card.name = name.trim() || "Sem nome";
      this.afterChange({ props: true });
    }
    if ( !this.card.image.src && !(await this.confirm("Salvar sem imagem", "A carta está sem imagem (vai sair com a silhueta). Salvar assim mesmo?")) ) return;
    if ( !this.dirty && this.card.file && getCards().some(c => c.id === this.card.id) ) {
      if ( thenUse ) return this.openUseDialog(this.card);
      return ui.notifications.info(`${MODULE_TITLE}: nada mudou desde o último salvamento.`);
    }
    this.busy = true;
    this.setBusy("Salvando a carta…");
    try {
      const canvas = await this.renderOutput();
      const blob = await canvasToBlob(canvas, this.formatOf());
      const ext = extensionOf(blob, this.formatOf());
      const dir = `${rootFolder()}/${CATEGORIES[this.card.category].folder}`;
      const name = `${slug(this.card.name)}-${Date.now().toString(36)}.${ext}`;
      const path = await uploadBlob(blob, dir, name);
      this.card.file = path;
      this.card.updated = Date.now();
      const stored = await upsertCard(this.card);
      this.card = stored;
      this.savedHash = contentHash(this.card);
      saveDraft(this.card, this.savedHash);
      this.updateStatus();
      this.renderLibrary();
      ui.notifications.info(`${MODULE_TITLE}: carta "${this.card.name}" salva.`);
      if ( thenUse ) {
        this.busy = false;
        this.setBusy(null);
        await this.openUseDialog(this.card);
      }
    } finally {
      this.busy = false;
      this.setBusy(null);
    }
  }

  async download() {
    if ( this.busy ) return;
    this.busy = true;
    this.setBusy("Gerando a imagem…");
    try {
      const canvas = await this.renderOutput();
      const blob = await canvasToBlob(canvas, this.formatOf());
      downloadBlob(blob, `${slug(this.card.name)}.${extensionOf(blob, this.formatOf())}`);
    } finally {
      this.busy = false;
      this.setBusy(null);
    }
  }

  async cardRatio(card) {
    const def = findTemplate(card.template);
    if ( !def ) return 1;
    if ( def.kind === "vetor" ) {
      const g = windowOf(styleFor(def, card.style));
      return g.H / g.W;
    }
    const k = await keyTemplate(def.src, def.key, def.tol);
    return k.h / k.w;
  }

  /* ---------------------------------------------------------------------------------------------- */
  /* Modal dialogs (inside the window)                                                                */
  /* ---------------------------------------------------------------------------------------------- */

  /**
   * Show a dialog over the editor. `build(body)` fills it; `onSubmit(form)` returns the result
   * (or throws to keep the dialog open). Resolves with the result, or null when cancelled.
   */
  modal({ title, icon = "fa-solid fa-id-badge", body, submit = "OK", wide = false, onRender, onSubmit, cancel = "Cancelar" }) {
    this.closeModal(null);
    const m = this.el.modal;
    m.hidden = false;
    m.innerHTML = `<form class="ce-dialog${wide ? " wide" : ""}" autocomplete="off">
      <header><i class="${icon}"></i> ${escapeHTML(title)}</header>
      <div class="ce-dialog-body">${body}</div>
      <footer>${cancel ? `<button type="button" data-modal="cancel">${escapeHTML(cancel)}</button>` : ""}${submit ? `<button type="submit" class="ce-primary">${submit}</button>` : ""}</footer>
    </form>`;
    const form = m.querySelector("form");
    return new Promise(resolve => {
      this.modalResolve = resolve;
      form.addEventListener("click", ev => {
        if ( ev.target.closest("[data-modal=cancel]") ) {
          ev.preventDefault();
          this.closeModal(null);
        }
      });
      form.addEventListener("submit", async ev => {
        ev.preventDefault();
        const btn = form.querySelector("button[type=submit]");
        if ( btn?.disabled ) return;
        try {
          if ( btn ) btn.disabled = true;
          const result = onSubmit ? await onSubmit(form) : true;
          if ( result === undefined ) return; /* stay open */
          this.closeModal(result);
        } catch ( err ) {
          reportError(err, title);
        } finally {
          if ( btn ) btn.disabled = false;
        }
      });
      try {
        onRender?.(form);
      } catch ( err ) {
        reportError(err, title);
      }
      (form.querySelector("[autofocus]") ?? form.querySelector("input, select, button[type=submit]"))?.focus();
    });
  }

  closeModal(result) {
    const m = this.el?.modal;
    if ( !m || m.hidden ) return;
    m.hidden = true;
    m.innerHTML = "";
    const resolve = this.modalResolve;
    this.modalResolve = null;
    resolve?.(result);
    this.el.stage.focus({ preventScroll: true });
  }

  async confirm(title, text) {
    const r = await this.modal({ title, icon: "fa-solid fa-circle-question", body: `<p>${escapeHTML(text)}</p>`, submit: "Sim", onSubmit: () => true });
    return r === true;
  }

  async prompt(title, label, value = "") {
    const r = await this.modal({
      title, icon: "fa-solid fa-pen",
      body: `<label class="ce-row"><span>${escapeHTML(label)}</span><input type="text" name="v" value="${escapeHTML(value)}" maxlength="120" autofocus></label>`,
      submit: "OK",
      onSubmit: form => form.elements.v.value
    });
    return typeof r === "string" ? r : null;
  }

  async openActorPicker() {
    const actors = actorChoices();
    if ( !actors.length ) return ui.notifications.info(`${MODULE_TITLE}: não há atores neste mundo.`);
    const body = `<input type="search" class="ce-actor-search" placeholder="Buscar ator…" data-keyboard-focus="true" autofocus>
      <div class="ce-actor-list">${actors.map(a => `<button type="button" class="ce-actor" data-actor="${a.id}"><img src="${escapeHTML(a.img || DEFAULT_TOKEN)}" alt=""><span>${escapeHTML(a.name)}</span><small>${escapeHTML(a.type)}</small></button>`).join("")}</div>
      <p class="ce-hintline">O retrato do ator vira a imagem da carta, e a carta fica ligada a ele.</p>`;
    const id = await this.modal({
      title: "Pegar o retrato de um ator", icon: "fa-solid fa-user", body, submit: "", wide: true,
      onRender: form => {
        const search = form.querySelector(".ce-actor-search");
        search.addEventListener("input", () => {
          const q = search.value.trim().toLowerCase();
          for ( const b of form.querySelectorAll(".ce-actor") ) b.hidden = q && !b.textContent.toLowerCase().includes(q);
        });
        form.addEventListener("click", ev => {
          const b = ev.target.closest(".ce-actor");
          if ( b ) this.closeModal(b.dataset.actor);
        });
      }
    });
    if ( !id ) return;
    const actor = game.actors.get(id);
    if ( actor ) this.linkActor(actor);
  }

  /** "Use as": new actor, existing actor or the selected tokens. */
  async openUseDialog(card) {
    if ( !card?.file ) return;
    const types = actorTypes();
    const ratio = await this.cardRatio(card);
    const linked = card.actorUuid ? await fromUuid(card.actorUuid).catch(() => null) : null;
    const tokens = selectedTokens().length;
    const players = playerUsers();
    const actors = actorChoices();
    const folders = (game.folders?.contents ?? Array.from(game.folders ?? [])).filter(f => f.type === "Actor").map(f => ({ id: f.id, name: f.name }));
    const cat = CATEGORIES[card.category];
    const typeGuess = guessType(card.category);
    const mode = linked ? "existente" : "novo";
    const body = `
      <div class="ce-use">
        <img class="ce-use-img" src="${escapeHTML(card.file)}" alt="">
        <div class="ce-use-form">
          <div class="ce-seg">
            <label><input type="radio" name="mode" value="novo"${mode === "novo" ? " checked" : ""}> Novo ator</label>
            <label><input type="radio" name="mode" value="existente"${mode === "existente" ? " checked" : ""}${actors.length ? "" : " disabled"}> Ator existente</label>
            <label title="${tokens ? "" : "Selecione tokens na cena primeiro"}"><input type="radio" name="mode" value="tokens"${tokens ? "" : " disabled"}> Tokens selecionados (${tokens})</label>
          </div>
          <div data-for="novo">
            <label class="ce-row"><span>Nome</span><input type="text" name="name" value="${escapeHTML(card.name)}" maxlength="120"></label>
            <label class="ce-row"><span>Tipo</span><select name="type">${types.map(t => opt(t.type, t.label, typeGuess)).join("")}</select></label>
            <label class="ce-row"><span>Pasta</span><select name="folder">${opt("auto", `${MODULE_TITLE} › ${cat.plural}`, "auto")}${opt("none", "Sem pasta", "")}${folders.map(f => opt(f.id, f.name, "")).join("")}</select></label>
            ${players.length ? `<label class="ce-row"><span>Dono</span><select name="owner">${opt("", "Ninguém (só o mestre)", "")}${players.map(u => opt(u.id, u.name, "")).join("")}</select></label>` : ""}
          </div>
          <div data-for="existente">
            <label class="ce-row"><span>Ator</span><select name="actor">${actors.map(a => opt(a.id, a.name, linked?.id ?? "")).join("")}</select></label>
            <label class="ce-check"><input type="checkbox" name="sceneTokens" checked> Trocar também os tokens dele na cena atual</label>
          </div>
          <div data-for="novo existente">
            <label class="ce-row"><span>Retrato do ator</span><select name="portrait">${opt("carta", PORTRAIT_MODES.carta, "carta")}${card.image.src ? opt("original", PORTRAIT_MODES.original, "") : ""}<option value="manter" data-only="existente">${PORTRAIT_MODES.manter}</option></select></label>
            <label class="ce-check"><input type="checkbox" name="useToken" checked> Usar a carta como imagem do token</label>
          </div>
          ${Math.abs(ratio - 1) > 0.06 ? `<label class="ce-row" data-for="novo existente tokens"><span>Token</span><select name="tokenMode">${options(TOKEN_MODES, "inteira")}</select></label>` : ""}
          <p class="ce-hintline" data-for="tokens">Só a imagem dos tokens selecionados muda; os atores continuam como estão.</p>
        </div>
      </div>`;
    const result = await this.modal({
      title: `Usar a carta "${card.name || "Sem nome"}"`, icon: "fa-solid fa-user-plus", body, submit: "Aplicar", wide: true,
      onRender: form => {
        const sync = () => {
          const m = form.elements.mode.value;
          for ( const el of form.querySelectorAll("[data-for]") ) el.hidden = !el.dataset.for.split(" ").includes(m);
          const keep = form.querySelector('option[data-only="existente"]');
          if ( keep ) {
            keep.disabled = m !== "existente";
            if ( keep.disabled && form.elements.portrait.value === "manter" ) form.elements.portrait.value = "carta";
          }
        };
        form.addEventListener("change", sync);
        sync();
      },
      onSubmit: async form => {
        const f = form.elements;
        const m = f.mode.value;
        const common = {
          path: card.file, original: card.image.src.startsWith("data:") ? "" : card.image.src, portrait: f.portrait?.value ?? "carta",
          useToken: f.useToken?.checked ?? true, tokenMode: f.tokenMode?.value ?? "inteira", ratio, cardId: card.id
        };
        if ( m === "tokens" ) {
          const n = await applyToSelectedTokens(card.file, common.tokenMode, ratio);
          ui.notifications.info(`${MODULE_TITLE}: carta aplicada a ${n} token(s).`);
          return { done: true };
        }
        let actor;
        if ( m === "novo" ) {
          if ( !f.type.value ) throw new Error("este sistema não tem tipos de ator");
          actor = await createActorFromCard({ ...common, name: f.name.value.trim() || card.name, type: f.type.value, category: card.category, owner: f.owner?.value ?? "", folder: f.folder.value });
          ui.notifications.info(`${MODULE_TITLE}: ator "${actor.name}" criado com a carta.`);
        }
        else {
          actor = game.actors.get(f.actor.value);
          const placed = await applyToActor(actor, { ...common, sceneTokens: f.sceneTokens.checked });
          ui.notifications.info(`${MODULE_TITLE}: carta aplicada a "${actor.name}"${placed ? ` e a ${placed} token(s) da cena` : ""}.`);
        }
        const stored = findCard(card.id);
        if ( stored ) {
          stored.actorUuid = actor.uuid;
          await upsertCard(stored);
        }
        if ( this.card.id === card.id ) {
          this.card.actorUuid = actor.uuid;
          saveDraft(this.card, this.savedHash);
          this.renderProps();
        }
        return { actor };
      }
    });
    if ( result?.actor ) {
      const open = await this.modal({
        title: "Pronto", icon: "fa-solid fa-check",
        body: `<p>A carta agora é a imagem de <b>${escapeHTML(result.actor.name)}</b>.</p>`,
        submit: "Abrir a ficha", cancel: "Fechar", onSubmit: () => true
      });
      if ( open ) result.actor.sheet?.render({ force: true });
    }
  }

  async saveStyleAsTemplate() {
    const def = this.def();
    if ( def?.kind !== "vetor" || !this.card.style ) return;
    const r = await this.modal({
      title: "Salvar como modelo", icon: "fa-solid fa-star",
      body: `<label class="ce-row"><span>Nome do modelo</span><input type="text" name="name" value="${escapeHTML(def.builtin ? `${def.name} (meu)` : def.name)}" maxlength="80" autofocus></label>
        <label class="ce-row"><span>Categoria</span><select name="category">${options(Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label])), this.card.category)}</select></label>`,
      submit: "Salvar",
      onSubmit: form => ({ name: form.elements.name.value.trim() || "Meu modelo", category: form.elements.category.value })
    });
    if ( !r ) return;
    const tpl = await saveCustomTemplate({ kind: "vetor", name: r.name, category: r.category, style: this.card.style });
    this.pushHistory();
    this.card.template = tpl.id;
    this.afterChange({ props: true, templates: true });
    ui.notifications.info(`${MODULE_TITLE}: modelo "${tpl.name}" salvo na galeria.`);
  }

  /** Import a flat-colour template: pick the PNG, check the key colour, name it. */
  async openImportDialog() {
    const state = { src: "", key: "#ff00ff", tol: 60, img: null, data: null };
    const catOptions = Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label]));
    const body = `
      <p class="ce-hintline">Faça a carta num editor de imagem e pinte a área da imagem de uma cor chapada e viva (como o rosa ou o azul dos seus modelos). Salve em PNG.</p>
      <div class="ce-import">
        <div class="ce-import-preview"><canvas></canvas><span class="ce-import-empty">Escolha a imagem do modelo</span></div>
        <div class="ce-import-form">
          <div class="ce-btnrow">
            <button type="button" data-m="pick"><i class="fa-solid fa-folder-open"></i> Escolher no servidor</button>
            <button type="button" data-m="upload"><i class="fa-solid fa-upload"></i> Enviar do computador</button>
            <input type="file" accept="image/png,image/webp" hidden>
          </div>
          <div class="ce-path" data-src>—</div>
          <label class="ce-row"><span>Cor-chave</span><span class="ce-color"><input type="color" name="key" value="${state.key}"><small>clique na prévia para pegar a cor</small></span></label>
          <label class="ce-row"><span>Tolerância</span><span class="ce-range"><input type="range" name="tol" min="10" max="160" step="1" value="${state.tol}"><output>${state.tol}</output></span></label>
          <p class="ce-hintline" data-cov></p>
          <label class="ce-row"><span>Nome</span><input type="text" name="name" maxlength="80" placeholder="Nome do modelo"></label>
          <label class="ce-row"><span>Categoria</span><select name="category">${options(catOptions, "npc")}</select></label>
        </div>
      </div>`;
    const tpl = await this.modal({
      title: "Importar modelo", icon: "fa-solid fa-file-import", body, submit: "Salvar modelo", wide: true,
      onRender: form => {
        const canvas = form.querySelector(".ce-import-preview canvas");
        const empty = form.querySelector(".ce-import-empty");
        const fileInput = form.querySelector("input[type=file]");
        const srcLabel = form.querySelector("[data-src]");
        const cov = form.querySelector("[data-cov]");
        const tolOut = form.querySelector("input[name=tol] + output");
        const preview = () => {
          if ( !state.data ) return;
          const res = extractKey(state.data, state.key, { tol: state.tol, soft: Math.max(state.tol + 60, 150) });
          const { width: w, height: h } = state.data;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, w, h);
          const tmp = makeCanvas(w, h);
          tmp.getContext("2d").putImageData(res.mask, 0, 0);
          ctx.save();
          ctx.drawImage(tmp, 0, 0);
          ctx.globalCompositeOperation = "source-in";
          const pat = makeCanvas(16, 16);
          const pc = pat.getContext("2d");
          pc.fillStyle = "#cfd8dc";
          pc.fillRect(0, 0, 16, 16);
          pc.fillStyle = "#90a4ae";
          pc.fillRect(0, 0, 8, 8);
          pc.fillRect(8, 8, 8, 8);
          ctx.fillStyle = ctx.createPattern(pat, "repeat");
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
          const fr = makeCanvas(w, h);
          fr.getContext("2d").putImageData(res.frame, 0, 0);
          ctx.drawImage(fr, 0, 0);
          ctx.strokeStyle = "#ffd34d";
          ctx.setLineDash([6, 4]);
          ctx.lineWidth = 2;
          ctx.strokeRect(res.box.x + 1, res.box.y + 1, res.box.w - 2, res.box.h - 2);
          const p = Math.round(res.coverage * 100);
          cov.innerHTML = res.keyCount
            ? `Área da imagem: <b>${p}%</b> do modelo (${res.box.w} × ${res.box.h} px). O xadrez mostra onde a imagem vai entrar.`
            : `<b class="ce-warn">Não achei essa cor no modelo.</b> Clique na área colorida da prévia.`;
          empty.hidden = true;
        };
        const load = async src => {
          state.src = src;
          srcLabel.textContent = src;
          const img = await loadImage(src);
          const c = makeCanvas(img.naturalWidth, img.naturalHeight);
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          state.data = ctx.getImageData(0, 0, c.width, c.height);
          state.key = detectKey(state.data) ?? state.key;
          form.elements.key.value = state.key;
          if ( !form.elements.name.value ) {
            const base = decodeURIComponent(src.split("/").pop() ?? "").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+\w{6,9}$/, "").trim();
            form.elements.name.value = base ? base.charAt(0).toUpperCase() + base.slice(1) : "";
          }
          preview();
        };
        form.addEventListener("click", guard(async ev => {
          const b = ev.target.closest("[data-m]");
          if ( !b ) return;
          if ( b.dataset.m === "pick" ) browse({ type: "image", current: state.src, callback: path => load(path).catch(err => reportError(err, "modelo")) });
          if ( b.dataset.m === "upload" ) fileInput.click();
        }, "importar"));
        fileInput.addEventListener("change", guard(async () => {
          const f = fileInput.files?.[0];
          fileInput.value = "";
          if ( !f ) return;
          const path = await uploadBlob(f, `${rootFolder()}/modelos`, `${slug(f.name.replace(/\.[^.]+$/, ""), "modelo")}-${Date.now().toString(36)}.${(f.type.split("/")[1] || "png").replace("jpeg", "jpg")}`);
          await load(path);
        }, "enviar modelo"));
        canvas.addEventListener("click", ev => {
          if ( !state.data ) return;
          const r = canvas.getBoundingClientRect();
          const x = ((ev.clientX - r.left) / r.width) * state.data.width;
          const y = ((ev.clientY - r.top) / r.height) * state.data.height;
          state.key = pixelColor(state.data, clamp(x, 0, state.data.width - 1), clamp(y, 0, state.data.height - 1));
          form.elements.key.value = state.key;
          preview();
        });
        form.elements.key.addEventListener("input", () => {
          state.key = form.elements.key.value;
          preview();
        });
        form.elements.tol.addEventListener("input", () => {
          state.tol = Number(form.elements.tol.value);
          tolOut.textContent = state.tol;
          preview();
        });
      },
      onSubmit: async form => {
        if ( !state.src || !state.data ) throw new Error("escolha a imagem do modelo");
        return saveCustomTemplate({
          kind: "raster", name: form.elements.name.value.trim() || "Modelo", category: form.elements.category.value,
          src: state.src, key: state.key, tol: state.tol
        });
      }
    });
    if ( !tpl ) return;
    this.renderTemplates();
    this.selectTemplate(tpl.id);
    ui.notifications.info(`${MODULE_TITLE}: modelo "${tpl.name}" na galeria.`);
  }
}
