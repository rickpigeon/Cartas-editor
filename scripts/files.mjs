/**
 * Cartas-editor: files. Uploads go to the Foundry data folder ("data" source) with FilePicker.upload.
 */
import { MODULE_ID, MODULE_TITLE, slug } from "./constants.mjs";
import { setting } from "./store.mjs";

const SOURCE = "data";

export function filePickerClass() {
  return foundry.applications?.apps?.FilePicker?.implementation
    ?? foundry.applications?.apps?.FilePicker
    ?? globalThis.FilePicker
    ?? null;
}

/** Root folder of the module's files (setting "pasta", or worlds/<world>/cartas-editor). */
export function rootFolder() {
  const custom = String(setting("pasta", "") ?? "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return custom || `worlds/${game.world?.id ?? "mundo"}/${MODULE_ID}`;
}

const ready = new Set();

/** Make sure every level of `dir` exists (browse first, create when missing). */
export async function ensureDir(dir) {
  const FP = filePickerClass();
  if ( !FP ) throw new Error("o seletor de arquivos do Foundry não está disponível");
  const parts = dir.split("/").filter(Boolean);
  let path = "";
  for ( const part of parts ) {
    path = path ? `${path}/${part}` : part;
    if ( ready.has(path) ) continue;
    let exists = false;
    try {
      await FP.browse(SOURCE, path);
      exists = true;
    } catch ( err ) {
      exists = false;
    }
    if ( !exists ) {
      try {
        await FP.createDirectory(SOURCE, path, {});
      } catch ( err ) {
        /* "already exists" races are fine; anything else shows up when the upload fails */
        console.warn(`${MODULE_TITLE} | createDirectory ${path}`, err);
      }
    }
    ready.add(path);
  }
}

/** Upload a Blob as `name` into `dir`; returns the stored path. */
export async function uploadBlob(blob, dir, name) {
  const FP = filePickerClass();
  if ( !FP?.upload ) throw new Error("o envio de arquivos do Foundry não está disponível");
  await ensureDir(dir);
  const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
  const result = await FP.upload(SOURCE, dir, file, {}, { notify: false });
  if ( result === false || result?.status === "error" ) throw new Error(result?.message ?? "o servidor recusou o arquivo");
  if ( result?.path ) return result.path;
  if ( result?.status === "success" || result === undefined ) return `${dir}/${name}`;
  return `${dir}/${name}`;
}

const EXT = { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg", "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg", "image/bmp": "bmp" };

/** Upload a picture the GM dropped or pasted, into <root>/originais. */
export async function uploadOriginal(file, hint = "") {
  const type = file.type || "image/png";
  if ( !type.startsWith("image/") ) throw new Error("isso não é uma imagem");
  const ext = EXT[type] ?? (String(file.name ?? "").split(".").pop() || "png").toLowerCase();
  const base = slug(hint || String(file.name ?? "").replace(/\.[^.]+$/, ""), "imagem");
  const name = `${base}-${Date.now().toString(36)}.${ext}`;
  return uploadBlob(file, `${rootFolder()}/originais`, name);
}

/** Open Foundry's file picker. type "image" or "folder". */
export function browse({ type = "image", current = "", callback }) {
  const FP = filePickerClass();
  if ( !FP ) {
    ui.notifications.warn(`${MODULE_TITLE}: o seletor de arquivos não está disponível.`);
    return null;
  }
  const picker = new FP({ type, current, callback });
  /* browse() loads the folder listing and shows the picker; render() alone is the fallback */
  if ( typeof picker.browse === "function" ) {
    Promise.resolve(picker.browse()).catch(err => {
      console.warn(`${MODULE_TITLE} | FilePicker.browse`, err);
      picker.render({ force: true });
    });
  }
  else picker.render({ force: true });
  return picker;
}

/** Save a Blob on the GM's computer. */
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function extensionOf(blob, fallback = "webp") {
  return EXT[blob?.type] ?? fallback;
}
