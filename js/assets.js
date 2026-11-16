/* GRAVEWAVE — optional image assets (art agent deliverables). Anything missing falls back to procedural art. */
(function () {
  'use strict';
  const GW = window.GW;
  const AS = (GW.Assets = { img: {}, meta: {}, ready: false, loaded: 0, total: 0 });
  const ROOT = 'assets/';

  /** Zone id -> asset key suffix used by the art brief (floors). */
  AS.ZONE_KEYS = ['plaza', 'arcade', 'aquarium', 'speedway', 'substation', 'stage', 'starwheel', 'manor', 'pier'];

  /** The loaded image for a key, or null. */
  AS.get = (key) => AS.img[key] || null;

  function loadImage(key, entry) {
    return new Promise((resolve) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => {
        // reject wrong-sized deliveries rather than drawing them stretched
        if (entry.w && entry.h && (im.naturalWidth !== entry.w || im.naturalHeight !== entry.h)) {
          console.warn('[assets] ' + key + ' is ' + im.naturalWidth + 'x' + im.naturalHeight + ', expected ' + entry.w + 'x' + entry.h + ' — using procedural art');
        } else {
          AS.img[key] = im;
          AS.meta[key] = entry;
        }
        AS.loaded++;
        resolve();
      };
      im.onerror = () => {
        AS.loaded++;
        resolve();
      };
      im.src = ROOT + entry.file;
    });
  }

  /**
   * Fetch assets/manifest.json and preload every listed image.
   * Resolves with the number of usable images; never rejects (offline, file://, missing manifest are all fine).
   */
  AS.load = function (onProgress) {
    const timeout = new Promise((resolve) => setTimeout(resolve, 10000));
    const work = fetch(ROOT + 'manifest.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((man) => {
        const list = man && man.assets ? Object.keys(man.assets) : [];
        AS.total = list.length;
        if (!list.length) return;
        let done = 0;
        return Promise.all(
          list.map((k) =>
            loadImage(k, man.assets[k]).then(() => {
              done++;
              if (onProgress) onProgress(done / list.length);
            })
          )
        );
      });
    return Promise.race([work, timeout]).then(() => {
      AS.ready = true;
      return Object.keys(AS.img).length;
    });
  };

  /**
   * Draw a 96px-per-tile seamless texture onto one 48px world tile at (tx, ty).
   * Returns false when the texture isn't available (caller draws procedurally).
   */
  AS.tile = function (g, key, tx, ty, T) {
    const im = AS.img[key];
    if (!im) return false;
    const n = Math.max(1, Math.round(im.naturalWidth / 96));
    const sx = (((tx % n) + n) % n) * 96, sy = (((ty % n) + n) % n) * 96;
    g.drawImage(im, sx, sy, 96, 96, tx * T, ty * T, T, T);
    return true;
  };

  /**
   * Draw a prop image into the world rect (x, y, w, h). If the image is authored for the other
   * orientation (e.g. a 1x2 coffin placed as 2x1) it is rotated 90 degrees to fit.
   */
  AS.drawFit = function (g, key, x, y, w, h, rot) {
    const im = AS.img[key];
    if (!im) return false;
    const iw = im.naturalWidth, ih = im.naturalHeight;
    const swap = (iw > ih) !== (w > h) && iw !== ih && w !== h;
    g.save();
    g.translate(x + w / 2, y + h / 2);
    if (rot) g.rotate(rot);
    if (swap) g.rotate(Math.PI / 2);
    const dw = swap ? h : w, dh = swap ? w : h;
    g.drawImage(im, -dw / 2, -dh / 2, dw, dh);
    g.restore();
    return true;
  };
})();
