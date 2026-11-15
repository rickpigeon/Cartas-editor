/**
 * Cartas-editor: the flat "key colour" of a card template (pink, blue...) marks where the picture goes.
 *
 * extractKey() splits a template image into
 *   frame  the template with the key colour removed (edge pixels un-mixed so no pink fringe is left)
 *   mask   white where the picture shows (the key area, its soft edge and 2 px under the frame)
 *   box    the bounding box of the key area (the "window"), used to fit the picture
 */
import { hexToRgb, rgbToHex } from "./constants.mjs";

const REF_RADIUS = 3; /* where to look for the clean frame colour of an edge pixel */
const REF_MIN_KD = 2; /* pixels at least this far from the key area count as clean (thin outlines are 2 px) */

/**
 * @param {ImageData} img   the template pixels
 * @param {string} key      key colour (#rrggbb)
 * @param {object} opts     tol: distance under which a pixel is pure key; soft: distance above which an
 *                          isolated pixel is surely frame
 */
export function extractKey(img, key, { tol = 60, soft = 150 } = {}) {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const [kr, kg, kb] = hexToRgb(key);
  const dist = new Float32Array(n);
  const isKey = new Uint8Array(n);
  let keyCount = 0;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;

  for ( let i = 0; i < n; i++ ) {
    const o = i * 4;
    if ( data[o + 3] < 16 ) {
      dist[i] = 999;
      continue;
    }
    const dr = data[o] - kr, dg = data[o + 1] - kg, db = data[o + 2] - kb;
    const d = Math.sqrt(dr * dr + dg * dg + db * db);
    dist[i] = d;
    if ( d <= tol ) {
      isKey[i] = 1;
      keyCount++;
      const x = i % w, y = (i / w) | 0;
      if ( x < x0 ) x0 = x;
      if ( x > x1 ) x1 = x;
      if ( y < y0 ) y0 = y;
      if ( y > y1 ) y1 = y;
    }
  }

  /* Chebyshev distance (capped) from every pixel to the key area: two passes of a 3x3 chamfer. */
  const CAP = 6;
  const kd = new Uint8Array(n).fill(CAP);
  for ( let i = 0; i < n; i++ ) if ( isKey[i] ) kd[i] = 0;
  for ( let y = 0; y < h; y++ ) {
    for ( let x = 0; x < w; x++ ) {
      const i = y * w + x;
      let v = kd[i];
      if ( v === 0 ) continue;
      if ( x > 0 ) v = Math.min(v, kd[i - 1] + 1);
      if ( y > 0 ) {
        v = Math.min(v, kd[i - w] + 1);
        if ( x > 0 ) v = Math.min(v, kd[i - w - 1] + 1);
        if ( x < w - 1 ) v = Math.min(v, kd[i - w + 1] + 1);
      }
      kd[i] = v;
    }
  }
  for ( let y = h - 1; y >= 0; y-- ) {
    for ( let x = w - 1; x >= 0; x-- ) {
      const i = y * w + x;
      let v = kd[i];
      if ( v === 0 ) continue;
      if ( x < w - 1 ) v = Math.min(v, kd[i + 1] + 1);
      if ( y < h - 1 ) {
        v = Math.min(v, kd[i + w] + 1);
        if ( x < w - 1 ) v = Math.min(v, kd[i + w + 1] + 1);
        if ( x > 0 ) v = Math.min(v, kd[i + w - 1] + 1);
      }
      kd[i] = v;
    }
  }

  const frame = new ImageData(new Uint8ClampedArray(data), w, h);
  const fd = frame.data;
  const mask = new ImageData(w, h);
  const md = mask.data;
  const setMask = (i, a) => {
    const o = i * 4;
    md[o] = 255;
    md[o + 1] = 255;
    md[o + 2] = 255;
    md[o + 3] = Math.max(md[o + 3], a);
  };

  for ( let i = 0; i < n; i++ ) {
    const o = i * 4;
    if ( isKey[i] ) {
      fd[o + 3] = 0;
      setMask(i, 255);
      continue;
    }
    const k = kd[i];
    if ( k > 2 || data[o + 3] < 16 ) continue;

    /* Edge pixel: P = a*F + (1-a)*K. Find the clean neighbour colour F that explains P best. */
    const P = [data[o], data[o + 1], data[o + 2]];
    const px = P[0] - kr, py = P[1] - kg, pz = P[2] - kb;
    const x = i % w, y = (i / w) | 0;
    let best = null;
    for ( let dy = -REF_RADIUS; dy <= REF_RADIUS; dy++ ) {
      const yy = y + dy;
      if ( yy < 0 || yy >= h ) continue;
      for ( let dx = -REF_RADIUS; dx <= REF_RADIUS; dx++ ) {
        const xx = x + dx;
        if ( xx < 0 || xx >= w ) continue;
        const j = yy * w + xx;
        if ( j === i || kd[j] < REF_MIN_KD || kd[j] < k || data[j * 4 + 3] < 200 ) continue;
        const q = j * 4;
        const fx = data[q] - kr, fy = data[q + 1] - kg, fz = data[q + 2] - kb;
        const ff = fx * fx + fy * fy + fz * fz;
        if ( ff < 1 ) continue;
        const a = Math.min(1, Math.max(0, (px * fx + py * fy + pz * fz) / ff));
        const rx = px - a * fx, ry = py - a * fy, rz = pz - a * fz;
        const res = rx * rx + ry * ry + rz * rz;
        if ( !best || res < best.res - 1 || (Math.abs(res - best.res) <= 1 && a > best.a) ) best = { res, a, q };
      }
    }

    let a;
    let rgb;
    if ( best && best.res <= 48 * 48 ) {
      a = best.a;
      rgb = a >= 0.97 ? P : [data[best.q], data[best.q + 1], data[best.q + 2]];
    }
    else {
      const d = dist[i];
      if ( d >= soft ) {
        a = 1;
        rgb = P;
      }
      else {
        const t = Math.max(0, Math.min(1, (d - tol) / Math.max(1, soft - tol)));
        a = t * t * (3 - 2 * t);
        rgb = unmix(P, Math.max(a, 0.05), kr, kg, kb);
      }
    }
    fd[o] = rgb[0];
    fd[o + 1] = rgb[1];
    fd[o + 2] = rgb[2];
    fd[o + 3] = Math.round(data[o + 3] * a);
    /* The picture runs under every edge pixel (the frame covers it by its own alpha). */
    setMask(i, Math.round(255 * Math.min(1, data[o + 3] / 255 + 0.001)));
  }

  /* 2 px more of picture under the opaque frame, so no hairline gap can appear at the border. */
  for ( let i = 0; i < n; i++ ) {
    if ( isKey[i] || kd[i] > 4 ) continue;
    const o = i * 4;
    if ( kd[i] <= 4 && fd[o + 3] >= 250 ) setMask(i, 255);
  }

  const box = keyCount ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { x: 0, y: 0, w, h };
  return { frame, mask, box, keyCount, coverage: keyCount / n };
}

function unmix(P, a, kr, kg, kb) {
  const inv = 1 - a;
  return [
    Math.max(0, Math.min(255, (P[0] - inv * kr) / a)),
    Math.max(0, Math.min(255, (P[1] - inv * kg) / a)),
    Math.max(0, Math.min(255, (P[2] - inv * kb) / a))
  ];
}

/**
 * Guess the key colour of a template: the most common strongly saturated colour,
 * preferring the one in the middle of the image (where the picture usually goes).
 */
export function detectKey(img) {
  const { width: w, height: h, data } = img;
  const bins = new Map();
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 120000)));
  for ( let y = 0; y < h; y += step ) {
    for ( let x = 0; x < w; x += step ) {
      const o = (y * w + x) * 4;
      if ( data[o + 3] < 250 ) continue;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if ( max - min < 110 || max < 90 ) continue;
      const exact = (r << 16) | (g << 8) | b;
      bins.set(exact, (bins.get(exact) ?? 0) + 1);
    }
  }
  if ( !bins.size ) return null;
  /* Merge exact colours into coarse groups, then return the most common exact colour of the best group. */
  const groups = new Map();
  for ( const [c, count] of bins ) {
    const g = ((c >> 19) & 31) << 10 | ((c >> 11) & 31) << 5 | ((c >> 3) & 31);
    const entry = groups.get(g) ?? { total: 0, best: c, bestCount: 0 };
    entry.total += count;
    if ( count > entry.bestCount ) {
      entry.best = c;
      entry.bestCount = count;
    }
    groups.set(g, entry);
  }
  let winner = null;
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  const co = (cy * w + cx) * 4;
  const centre = (data[co] << 16) | (data[co + 1] << 8) | data[co + 2];
  const centreGroup = ((centre >> 19) & 31) << 10 | ((centre >> 11) & 31) << 5 | ((centre >> 3) & 31);
  for ( const [g, entry] of groups ) {
    const score = entry.total * (g === centreGroup ? 3 : 1);
    if ( !winner || score > winner.score ) winner = { score, c: entry.best };
  }
  const c = winner.c;
  return rgbToHex((c >> 16) & 255, (c >> 8) & 255, c & 255);
}

/** Colour of one pixel as #rrggbb (eyedropper). */
export function pixelColor(img, x, y) {
  const o = (Math.round(y) * img.width + Math.round(x)) * 4;
  return rgbToHex(img.data[o], img.data[o + 1], img.data[o + 2]);
}
