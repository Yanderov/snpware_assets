function $(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBytes(n) {
  if (n == null) return "—";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 ** 3) return (n / (1024 * 1024)).toFixed(1) + " MB";
  return (n / 1024 ** 3).toFixed(2) + " GB";
}

async function api(path, opts = {}) {
  const init = {
    credentials: "same-origin",
    ...opts,
  };
  if (opts.body && !(opts.body instanceof FormData) && !opts.headers) {
    init.headers = { "Content-Type": "application/json" };
  }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function bindSidebar() {
  const btn = $("menuBtn");
  const side = $("sidebar");
  if (!btn || !side) return;
  btn.onclick = () => side.classList.toggle("open");
}

function bindFilePicks(root = document) {
  root.querySelectorAll("[data-file-pick]").forEach((wrap) => {
    const input = wrap.querySelector('input[type="file"]');
    const name = wrap.querySelector("[data-file-name]");
    if (!input || !name) return;
    input.addEventListener("change", () => {
      const files = input.files;
      if (!files || !files.length) {
        name.textContent = "No file selected";
        return;
      }
      if (files.length === 1) {
        name.textContent = files[0].name;
      } else {
        name.textContent = files.length + " files";
      }
    });
  });
}

function createFilePick(inputName, faceLabel, accept) {
  const wrap = document.createElement("div");
  wrap.className = "sky-face drop-zone";
  wrap.setAttribute("data-drop-for", inputName);
  const id = "file_" + inputName + "_" + Math.random().toString(16).slice(2, 8);
  wrap.innerHTML = `
    <label>${escapeHtml(faceLabel)}</label>
    <div class="file-pick" data-file-pick style="margin-top:8px">
      <input id="${id}" name="${escapeHtml(inputName)}" type="file" ${accept ? `accept="${accept}"` : ""} />
      <label class="file-btn" for="${id}">Choose</label>
      <span class="file-name" data-file-name>No file</span>
    </div>
    <span class="drop-hint">drop here</span>`;
  return wrap;
}

const FAV_KEY = "snpware_asset_favorites_v1";

let favoriteIds = new Set();
let favoriteItems = [];
let guestProfile = null;

function loadLocalFavoritesLegacy() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function loadFavorites() {
  return favoriteItems.slice();
}

function isFavorite(id) {
  return favoriteIds.has(id);
}

function setFavoritesState(items) {
  favoriteItems = Array.isArray(items) ? items.slice() : [];
  favoriteIds = new Set(favoriteItems.map((x) => x && x.id).filter(Boolean));
}

async function refreshFavoritesFromServer() {
  const data = await api("/api/favorites");
  setFavoritesState(data.items || []);
  if (data.profile) guestProfile = data.profile;
  return favoriteItems;
}

async function toggleFavorite(item) {
  if (!item || !item.id) return false;
  const add = !isFavorite(item.id);
  const data = await api(`/api/asset/${item.id}/favorite`, {
    method: "POST",
    body: JSON.stringify({ add }),
  });
  const updated = data.item || item;
  if (add) {
    favoriteIds.add(item.id);
    favoriteItems = [updated, ...favoriteItems.filter((x) => x && x.id !== item.id)];
  } else {
    favoriteIds.delete(item.id);
    favoriteItems = favoriteItems.filter((x) => x && x.id !== item.id);
  }
  if (updated.favorite_count != null) item.favorite_count = updated.favorite_count;
  return add;
}

async function migrateLocalFavorites() {
  const local = loadLocalFavoritesLegacy();
  if (!local.length) return;
  for (const item of local) {
    if (!item || !item.id) continue;
    try {
      await api(`/api/asset/${item.id}/favorite`, {
        method: "POST",
        body: JSON.stringify({ add: true }),
      });
    } catch (e) {}
  }
  try {
    localStorage.removeItem(FAV_KEY);
  } catch (e) {}
}

function mountGuestProfile(profile) {
  if (document.body && document.body.getAttribute("data-admin-page") === "1") {
    return;
  }
  const foot = document.querySelector(".sidebar-foot");
  if (!foot) return;
  const name = (profile && profile.name) || "Guest";
  foot.classList.add("sidebar-profile");
  foot.innerHTML = `
    <img class="guest-avatar" src="/guest.jpeg?v=3" alt="" width="40" height="40" />
    <div class="guest-meta">
      <div class="guest-name">${escapeHtml(name)}</div>
      <div class="guest-role">Guest</div>
    </div>`;
}

const QUOTA_RING_TYPES = [
  { id: "backgrounds", short: "BG", label: "Backgrounds" },
  { id: "cursors", short: "CUR", label: "Cursors" },
  { id: "skyboxes", short: "SKY", label: "Skyboxes" },
  { id: "gun_sounds", short: "GUN", label: "Gun sounds" },
];

function quotaTone(n, max) {
  const r = max > 0 ? n / max : 0;
  if (r >= 0.9) return "full";
  if (r >= 0.7) return "warn";
  return "ok";
}

function renderQuotaRings(el, counts, max, types = QUOTA_RING_TYPES) {
  if (!el) return;
  const m = Math.max(1, Number(max) || 20);
  const c = counts || {};
  const R = 18;
  const C = 2 * Math.PI * R;
  el.innerHTML = types.map((t) => {
    const n = Number(c[t.id] || 0);
    const tone = quotaTone(n, m);
    const pct = Math.min(1, n / m);
    const off = C * (1 - pct);
    return `<div class="quota-ring is-${tone}" title="${escapeHtml(t.label)}: ${n}/${m}">
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle class="track" cx="22" cy="22" r="${R}"></circle>
        <circle class="bar" cx="22" cy="22" r="${R}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"></circle>
      </svg>
      <span class="quota-ring-val">${n}/${m}</span>
      <span class="quota-ring-label">${escapeHtml(t.short)}</span>
    </div>`;
  }).join("");
}

function renderFavoritesQuota(counts, max) {
  renderQuotaRings($("quotaRings"), counts || {}, max, QUOTA_RING_TYPES);
}

const ADMIN_ELIG_KEY = "snpware_admin_eligible_v1";

function readAdminEligibleCache() {
  try {
    return sessionStorage.getItem(ADMIN_ELIG_KEY) === "1";
  } catch (e) {
    return false;
  }
}

function writeAdminEligibleCache(eligible) {
  try {
    if (eligible) sessionStorage.setItem(ADMIN_ELIG_KEY, "1");
    else sessionStorage.removeItem(ADMIN_ELIG_KEY);
  } catch (e) {}
}

function syncAdminNav(profile) {
  let eligible;
  if (profile === undefined) {
    eligible = readAdminEligibleCache();
  } else {
    eligible = !!(profile && profile.admin_eligible);
    writeAdminEligibleCache(eligible);
  }
  document.documentElement.classList.toggle("admin-eligible", eligible);
  document.querySelectorAll("[data-admin-link]").forEach((el) => {
    el.hidden = !eligible;
  });
}

// Restore Admin link before async /api/me so sidebar navigations don't flicker
syncAdminNav(undefined);

const guestReady = (async function initGuestSession() {
  try {
    await migrateLocalFavorites();
  } catch (e) {}
  try {
    const me = await api("/api/me");
    guestProfile = me;
    syncAdminNav(me);
    mountGuestProfile(me);
  } catch (e) {
    syncAdminNav(null);
    mountGuestProfile({ name: "Guest" });
  }
  try {
    await refreshFavoritesFromServer();
    if (guestProfile) {
      syncAdminNav(guestProfile);
      mountGuestProfile(guestProfile);
    }
  } catch (e) {}
  return guestProfile;
})();

function initGlassSelect(root = document) {
  root.querySelectorAll("[data-glass-select]").forEach((wrap) => {
    const native = wrap.querySelector("select");
    const trigger = wrap.querySelector("[data-gs-trigger]");
    const label = wrap.querySelector("[data-gs-label]");
    const menu = wrap.querySelector("[data-gs-menu]");
    if (!native || !trigger || !label || !menu) return;

    const syncLabel = () => {
      const opt = native.options[native.selectedIndex];
      label.textContent = opt ? opt.textContent : "";
      menu.querySelectorAll("[data-value]").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-value") === native.value);
      });
    };

    const close = () => wrap.classList.remove("open");
    const open = () => {
      document.querySelectorAll("[data-glass-select].open").forEach((el) => {
        if (el !== wrap) el.classList.remove("open");
      });
      wrap.classList.add("open");
    };

    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      if (wrap.classList.contains("open")) close();
      else open();
    });

    menu.innerHTML = "";
    [...native.options].forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-value", opt.value);
      btn.textContent = opt.textContent;
      btn.addEventListener("click", () => {
        native.value = opt.value;
        native.dispatchEvent(new Event("change", { bubbles: true }));
        syncLabel();
        close();
      });
      menu.appendChild(btn);
    });

    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) close();
    });
    native.addEventListener("change", syncLabel);
    syncLabel();
  });
}

bindSidebar();

function ensureDialogHost() {
  let host = document.getElementById("glassDialogHost");
  if (host) return host;
  host = document.createElement("div");
  host.id = "glassDialogHost";
  host.className = "modal-backdrop";
  host.innerHTML = `
    <div class="modal glass-dialog">
      <h2 id="gdTitle">Confirm</h2>
      <p class="hint" id="gdMessage"></p>
      <div class="form-row" id="gdInputRow" hidden>
        <label for="gdInput">Value</label>
        <input id="gdInput" type="text" />
      </div>
      <div class="modal-actions">
        <button class="btn" type="button" id="gdCancel">Cancel</button>
        <button class="btn primary" type="button" id="gdOk">OK</button>
      </div>
    </div>`;
  document.body.appendChild(host);
  return host;
}

function glassConfirm(title, message) {
  return new Promise((resolve) => {
    const host = ensureDialogHost();
    const inputRow = $("gdInputRow");
    inputRow.hidden = true;
    $("gdTitle").textContent = title || "Confirm";
    $("gdMessage").textContent = message || "";
    $("gdMessage").hidden = !message;
    host.classList.add("open");
    const cleanup = (result) => {
      host.classList.remove("open");
      $("gdOk").onclick = null;
      $("gdCancel").onclick = null;
      host.onclick = null;
      resolve(result);
    };
    $("gdOk").onclick = () => cleanup(true);
    $("gdCancel").onclick = () => cleanup(false);
    host.onclick = (e) => {
      if (e.target === host) cleanup(false);
    };
  });
}

function glassPrompt(title, defaultValue, message) {
  return new Promise((resolve) => {
    const host = ensureDialogHost();
    const inputRow = $("gdInputRow");
    inputRow.hidden = false;
    $("gdTitle").textContent = title || "Input";
    $("gdMessage").textContent = message || "";
    $("gdMessage").hidden = !message;
    const input = $("gdInput");
    input.value = defaultValue || "";
    input.maxLength = 100;
    host.classList.add("open");
    setTimeout(() => input.focus(), 30);
    const cleanup = (result) => {
      host.classList.remove("open");
      $("gdOk").onclick = null;
      $("gdCancel").onclick = null;
      host.onclick = null;
      input.onkeydown = null;
      resolve(result);
    };
    $("gdOk").onclick = () => cleanup(input.value);
    $("gdCancel").onclick = () => cleanup(null);
    host.onclick = (e) => {
      if (e.target === host) cleanup(null);
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter") cleanup(input.value);
      if (e.key === "Escape") cleanup(null);
    };
  });
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  // Browser locale (undefined) — e.g. Russian OS/browser → «13 июл. 2026 г.»
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatUploader(item) {
  const name = item && item.uploader;
  return name ? String(name) : "Guest";
}

const AGE_GATE_KEY = "snpware_age_ok_v1";

function ensureAgeGate() {
  try {
    if (localStorage.getItem(AGE_GATE_KEY) === "1") return;
  } catch (e) {}
  if (document.getElementById("ageGate")) return;

  const host = document.createElement("div");
  host.id = "ageGate";
  host.className = "age-gate";
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.innerHTML = `
    <div class="age-gate-card">
      <div class="age-gate-kicker">SNPWARE ASSETS</div>
      <h2>Content notice</h2>
      <p>This website may contain <strong>18+</strong> assets (including adult or otherwise sensitive material). By continuing you confirm you are allowed to view such content and agree to see it.</p>
      <label class="age-gate-check">
        <input type="checkbox" id="ageGateCheck" />
        <span>I understand and agree to see 18+ content on this site</span>
      </label>
      <button class="btn primary" type="button" id="ageGateBtn" disabled>Enter site</button>
      <p class="age-gate-note">This notice is only for the website UI. The API is unaffected.</p>
    </div>`;
  document.body.appendChild(host);
  document.documentElement.classList.add("age-gate-locked");

  const check = host.querySelector("#ageGateCheck");
  const btn = host.querySelector("#ageGateBtn");
  check.addEventListener("change", () => {
    btn.disabled = !check.checked;
  });
  btn.addEventListener("click", () => {
    if (!check.checked) return;
    try {
      localStorage.setItem(AGE_GATE_KEY, "1");
    } catch (e) {}
    document.documentElement.classList.remove("age-gate-locked");
    host.remove();
  });
}

ensureAgeGate();

async function reportView(item) {
  if (!item || !item.id) return;
  try {
    await api(`/api/asset/${item.id}/view`, { method: "POST", body: "{}" });
  } catch (e) {}
}

function isSheetAnim(item) {
  if (!item || !item.sheet) return false;
  const total = Number(item.sheet.totalFrames) || 0;
  const url = item.sheet_url || (item.files && item.files.sheet) || "";
  return total > 1 && !!url;
}

function sheetFileUrl(item) {
  return item.sheet_url || (item.files && item.files.sheet) || "";
}

/**
 * Canvas spritesheet player.
 * Grid from PNG + meta; draws object-fit:cover into the element's box
 * (CSS object-fit on <canvas> is unreliable and can look "sliced").
 */
function createSheetPlayer(item, opts = {}) {
  const fit = opts.fit === "contain" ? "contain" : "cover";
  const meta = item.sheet || {};
  const url = sheetFileUrl(item);
  const total = Math.max(1, Number(meta.totalFrames) || 1);
  let fps = Number(meta.frameRate) || 10;
  if (meta.durationSec && Number(meta.durationSec) > 0) {
    fps = total / Number(meta.durationSec);
  }
  fps = Math.max(1, Math.min(24, fps));

  const canvas = document.createElement("canvas");
  canvas.className = "sheet-canvas";
  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.decoding = "async";

  let cols = Math.max(1, Number(meta.columns) || 1);
  let cellW = 0;
  let cellH = 0;
  let frame = 0;
  let acc = 0;
  let last = 0;
  let raf = 0;
  let running = false;
  let ready = false;
  let notified = false;
  let ro = null;

  function syncCanvasSize() {
    let cssW = 0;
    let cssH = 0;
    const parent = canvas.parentElement;
    if (parent) {
      const r = parent.getBoundingClientRect();
      if (r.width >= 2 && r.height >= 2) {
        cssW = r.width;
        cssH = r.height;
      }
    }
    if (cssW < 2 || cssH < 2) {
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
    }
    if (cssW < 2 || cssH < 2) {
      cssW = cellW || 160;
      cssH = cellH || 90;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const tw = Math.max(1, Math.round(cssW * dpr));
    const th = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== tw || canvas.height !== th) {
      canvas.width = tw;
      canvas.height = th;
    }
  }

  function draw() {
    if (!ready || cellW <= 0 || cellH <= 0) return;
    syncCanvasSize();
    const col = frame % cols;
    const row = Math.floor(frame / cols);
    const sx = Math.round(col * cellW);
    const sy = Math.round(row * cellH);
    const sw = Math.max(1, Math.round(cellW));
    const sh = Math.max(1, Math.round(cellH));
    const cw = canvas.width;
    const ch = canvas.height;
    const scale =
      fit === "contain" ? Math.min(cw / sw, ch / sh) : Math.max(cw / sw, ch / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  function tick(ts) {
    if (!running) return;
    if (!last) last = ts;
    acc += (ts - last) / 1000;
    last = ts;
    const step = 1 / fps;
    let advanced = false;
    while (acc >= step) {
      acc -= step;
      frame = (frame + 1) % total;
      advanced = true;
    }
    if (advanced) draw();
    raf = requestAnimationFrame(tick);
  }

  const api = {
    el: canvas,
    ready: () => ready,
    start() {
      if (running) return;
      running = true;
      last = 0;
      draw();
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    },
    destroy() {
      api.stop();
      if (ro) {
        ro.disconnect();
        ro = null;
      }
      img.onload = null;
      img.onerror = null;
      img.src = "";
    },
    onReady: null,
  };

  function notifyReady() {
    if (notified) return;
    notified = true;
    if (typeof api.onReady === "function") api.onReady();
  }

  function bindResize() {
    if (ro || typeof ResizeObserver === "undefined") return;
    const parent = canvas.parentElement;
    if (!parent) return;
    ro = new ResizeObserver(() => draw());
    ro.observe(parent);
  }

  img.onload = () => {
    const nw = img.naturalWidth || 0;
    const nh = img.naturalHeight || 0;
    if (nw < 2 || nh < 2) return;

    const fw = Math.round(Number(meta.frameSizeX) || 0);
    const fh = Math.round(Number(meta.frameSizeY) || 0);
    const metaCols = Math.max(1, Number(meta.columns) || 0);
    const metaRows = Math.max(1, Number(meta.rows) || 0);

    if (fw >= 1 && fh >= 1 && nw >= fw && nh >= fh && nw % fw === 0 && nh % fh === 0) {
      cols = nw / fw;
      cellW = fw;
      cellH = fh;
    } else if (metaCols >= 1 && metaRows >= 1 && nw % metaCols === 0 && nh % metaRows === 0) {
      cols = metaCols;
      cellW = nw / metaCols;
      cellH = nh / metaRows;
    } else if (fw >= 1 && fh >= 1 && nw >= fw && nh >= fh) {
      cols = Math.max(1, Math.round(nw / fw));
      const rows = Math.max(1, Math.round(nh / fh));
      cellW = nw / cols;
      cellH = nh / rows;
    } else {
      cols = Math.max(1, metaCols || 1);
      const rows = Math.max(1, metaRows || Math.ceil(total / cols));
      cellW = nw / cols;
      cellH = nh / rows;
    }

    ready = true;
    draw();
    notifyReady();
    // parent may appear only after onReady appends canvas
    requestAnimationFrame(() => {
      bindResize();
      draw();
    });
  };
  img.onerror = () => {
    ready = false;
  };
  img.src = url;
  return api;
}

function isAudioItem(item) {
  return !!(item && ((item.mime || "").startsWith("audio/") || item.type === "gun_sounds"));
}

function isSkyboxItem(item) {
  return !!(item && item.type === "skyboxes" && item.files);
}

function skyboxFaceUrls(item) {
  const f = (item && item.files) || {};
  return {
    Ft: f.Ft || "",
    Bk: f.Bk || "",
    Lf: f.Lf || "",
    Rt: f.Rt || "",
    Up: f.Up || "",
    Dn: f.Dn || "",
  };
}

const SKYBOX_NET_ORDER = [
  { code: "Up", slot: "up" },
  { code: "Lf", slot: "lf" },
  { code: "Ft", slot: "ft" },
  { code: "Rt", slot: "rt" },
  { code: "Dn", slot: "dn" },
  { code: "Bk", slot: "bk" },
];

function mountSkyboxNet(container, item, opts = {}) {
  if (!container || !isSkyboxItem(item)) return false;
  const faces = skyboxFaceUrls(item);
  const wrap = document.createElement("div");
  wrap.className = "sky-net" + (opts.modal ? " sky-net-modal" : "");
  SKYBOX_NET_ORDER.forEach(({ code, slot }) => {
    const cell = document.createElement("div");
    cell.className = "sky-net-cell sky-net-" + slot;
    const url = faces[code];
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = code;
      img.loading = "lazy";
      cell.appendChild(img);
    } else {
      cell.classList.add("is-empty");
    }
    const tag = document.createElement("span");
    tag.className = "sky-net-tag";
    tag.textContent = code;
    cell.appendChild(tag);
    wrap.appendChild(cell);
  });
  container.appendChild(wrap);
  return true;
}

function mountThumbPreview(thumbEl, item) {
  thumbEl.innerHTML = "";
  thumbEl.classList.remove("thumb-audio", "thumb-sky");
  if (thumbEl._sheetCleanup) {
    thumbEl._sheetCleanup();
    thumbEl._sheetCleanup = null;
  }

  if (isAudioItem(item)) {
    thumbEl.classList.add("thumb-audio");
    thumbEl.textContent = "AUDIO";
    return;
  }

  if (isSkyboxItem(item)) {
    thumbEl.classList.add("thumb-sky");
    mountSkyboxNet(thumbEl, item);
    return;
  }

  const main = item.url || "";
  const nativeAnim =
    !isSheetAnim(item) &&
    ((item.mime || "").includes("gif") ||
      (item.mime || "").includes("webp") ||
      /\.(gif|webp)(\?|$)/i.test(main));

  if (nativeAnim && main) {
    const img = document.createElement("img");
    img.src = main;
    img.alt = "";
    img.loading = "lazy";
    thumbEl.appendChild(img);
    return;
  }

  if (item.preview_url) {
    const poster = document.createElement("img");
    poster.className = "thumb-poster";
    poster.src = item.preview_url;
    poster.alt = "";
    poster.loading = "lazy";
    thumbEl.appendChild(poster);
  } else if (!isSheetAnim(item)) {
    thumbEl.textContent = "NO PREVIEW";
    return;
  }

  if (!isSheetAnim(item)) return;

  let player = null;
  const start = () => {
    if (player) {
      player.start();
      return;
    }
    player = createSheetPlayer(item, { fit: "contain" });
    player.el.classList.add("thumb-sheet");
    player.onReady = () => {
      thumbEl.appendChild(player.el);
      const poster = thumbEl.querySelector(".thumb-poster");
      if (poster) poster.classList.add("is-hidden");
      void thumbEl.offsetWidth;
      player.start();
    };
    if (player.ready()) {
      player.onReady();
    }
  };
  const stop = () => {
    if (!player) return;
    player.destroy();
    player = null;
    const sheet = thumbEl.querySelector(".thumb-sheet");
    if (sheet) sheet.remove();
    const poster = thumbEl.querySelector(".thumb-poster");
    if (poster) poster.classList.remove("is-hidden");
  };

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) start();
        else stop();
      });
    },
    { rootMargin: "100px", threshold: 0.2 }
  );
  io.observe(thumbEl);
  thumbEl._sheetCleanup = () => {
    io.disconnect();
    stop();
  };
}

function mountModalPreview(container, item) {
  if (container._sheetCleanup) {
    container._sheetCleanup();
    container._sheetCleanup = null;
  }
  container.innerHTML = "";

  if (isAudioItem(item) && item.url) {
    const a = document.createElement("audio");
    a.src = item.url;
    a.controls = true;
    container.appendChild(a);
    return;
  }

  if (isSkyboxItem(item)) {
    mountSkyboxNet(container, item, { modal: true });
    return;
  }

  if (isSheetAnim(item)) {
    const player = createSheetPlayer(item, { fit: "contain" });
    player.el.classList.add("modal-sheet");
    const show = () => {
      container.innerHTML = "";
      container.appendChild(player.el);
      player.start();
    };
    player.onReady = show;
    if (item.preview_url) {
      const poster = document.createElement("img");
      poster.src = item.preview_url;
      poster.alt = item.title || "";
      container.appendChild(poster);
    }
    if (player.ready()) show();
    container._sheetCleanup = () => player.destroy();
    return;
  }

  const main = item.url || "";
  if (
    (item.mime || "").includes("gif") ||
    (item.mime || "").includes("webp") ||
    /\.(gif|webp)(\?|$)/i.test(main)
  ) {
    const img = document.createElement("img");
    img.src = main || item.preview_url;
    img.alt = item.title || "";
    container.appendChild(img);
    return;
  }

  if (item.preview_url || ((item.mime || "").startsWith("image/") && (item.preview_url || item.url))) {
    const img = document.createElement("img");
    img.src = item.preview_url || item.url;
    img.alt = item.title || "";
    container.appendChild(img);
    return;
  }
  if ((item.mime || "").startsWith("video/") && item.url) {
    const v = document.createElement("video");
    v.src = item.url;
    v.controls = true;
    v.loop = true;
    v.playsInline = true;
    container.appendChild(v);
    return;
  }
  container.textContent = "No preview";
}

