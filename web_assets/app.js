const TYPES = [
  { id: "backgrounds", label: "Backgrounds" },
  { id: "cursors", label: "Cursors" },
  { id: "skyboxes", label: "Skyboxes" },
  { id: "gun_sounds", label: "Gun sounds" },
];

let currentType = "backgrounds";
let currentSort = "new";
let currentQuery = "";
let catalogItems = [];
let modalItem = null;

function typeBadge(item) {
  if (item.type === "skyboxes") return "SKY";
  if (item.type === "cursors") return "CUR";
  if ((item.mime || "").startsWith("audio/") || item.type === "gun_sounds") return "MP3";
  const kind = item.kind || item.type || "";
  if (String(kind).includes("sheet") || (item.sheet && item.sheet.totalFrames > 1)) return "ANIM";
  if (String(kind).includes("video") || (item.mime || "").startsWith("video/")) return "MP4";
  if ((item.mime || "").includes("gif") || String(item.url || "").endsWith(".gif")) return "GIF";
  if ((item.mime || "").includes("webp") || String(item.url || "").endsWith(".webp")) return "WEBP";
  return "IMG";
}

function syncFavButton() {
  const btn = $("modalFav");
  if (!btn || !modalItem) return;
  if (modalItem.is_own) {
    btn.hidden = false;
    btn.disabled = true;
    btn.classList.remove("on");
    btn.classList.add("own");
    btn.textContent = "Your asset";
    btn.title = "This is your uploaded asset";
    return;
  }
  btn.hidden = false;
  btn.disabled = false;
  btn.classList.remove("own");
  const on = isFavorite(modalItem.id);
  btn.classList.toggle("on", on);
  btn.textContent = on ? "★" : "☆";
  btn.title = on ? "Remove from favorites" : "Add to favorites";
}

function renderTabs() {
  const tabs = $("typeTabs");
  tabs.innerHTML = "";
  TYPES.forEach((t) => {
    const b = document.createElement("button");
    b.className = "tab" + (t.id === currentType ? " active" : "");
    b.type = "button";
    b.textContent = t.label;
    b.onclick = () => {
      currentType = t.id;
      renderTabs();
      loadCatalog();
    };
    tabs.appendChild(b);
  });
}

function renderSort() {
  document.querySelectorAll(".sort-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-sort") === currentSort);
  });
}

function catalogMatchesQuery(item, q) {
  if (!q) return true;
  const uploader = String(formatUploader(item) || "").toLowerCase();
  const hay = [
    item.title,
    item.id,
    item.kind,
    item.type,
    item.mime,
    uploader,
    typeBadge(item),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function filteredCatalogItems() {
  const q = currentQuery;
  if (!q) return catalogItems.slice();
  return catalogItems.filter((item) => catalogMatchesQuery(item, q));
}

function renderCatalog(items) {
  const grid = $("catalogGrid");
  const empty = $("catalogEmpty");
  grid.querySelectorAll(".thumb").forEach((t) => {
    if (t._sheetCleanup) t._sheetCleanup();
  });
  grid.innerHTML = "";
  empty.hidden = items.length > 0;
  if (!items.length) {
    empty.textContent = currentQuery
      ? "No assets match your search."
      : "No approved assets in this category yet.";
  }
  items.forEach((item) => {
    const own = !!item.is_own;
    const fav = !own && isFavorite(item.id);
    const el = document.createElement("article");
    el.className = "card";
    el.innerHTML = `
      ${
        own
          ? `<span class="card-own" title="This is your uploaded asset">Your asset</span>`
          : `<button class="card-fav ${fav ? "on" : ""}" type="button" title="${fav ? "Remove favorite" : "Add favorite"}">${fav ? "★" : "☆"}</button>`
      }
      <div class="thumb"></div>
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:start">
          <h3 class="card-title" style="margin:0">${escapeHtml(item.title || item.id)}</h3>
          <span class="badge">${typeBadge(item)}</span>
        </div>
        <div class="card-stats">
          <span>Created <strong>${formatDate(item.created_at)}</strong></span>
          <span>Uploader <strong>${escapeHtml(formatUploader(item))}</strong></span>
          <span>★ Favs <strong>${item.favorite_count || 0}</strong></span>
          <span>Uses <strong>${item.use_count || 0}</strong></span>
          <span>Views <strong>${item.view_count || 0}</strong></span>
          <span>Size <strong>${formatBytes(item.size)}</strong></span>
        </div>
      </div>`;
    mountThumbPreview(el.querySelector(".thumb"), item);
    const favBtn = el.querySelector(".card-fav");
    if (favBtn) {
      favBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          const on = await toggleFavorite(item);
          favBtn.classList.toggle("on", on);
          favBtn.textContent = on ? "★" : "☆";
          favBtn.title = on ? "Remove favorite" : "Add favorite";
          if (modalItem && modalItem.id === item.id) syncFavButton();
          if (currentSort === "popular") loadCatalog().catch(() => {});
        } catch (err) {
          await glassConfirm("Favorites", err.message || String(err));
        }
      });
    }
    el.onclick = () => openModal(item);
    grid.appendChild(el);
  });
}

function applyCatalogFilter() {
  renderCatalog(filteredCatalogItems());
}

async function loadCatalog() {
  const data = await api(
    `/api/catalog?type=${encodeURIComponent(currentType)}&sort=${encodeURIComponent(currentSort)}`
  );
  catalogItems = data.items || [];
  applyCatalogFilter();
}

function openModal(item) {
  modalItem = item;
  reportView(item);
  $("modalTitle").textContent = item.title || item.id;
  $("modalMeta").textContent = [item.type, item.kind, formatBytes(item.size), item.id]
    .filter(Boolean)
    .join(" · ");

  const meta = $("modalMetaGrid");
  if (meta) {
    meta.innerHTML = `
      <div class="meta-chip">Created<strong>${formatDate(item.created_at)}</strong></div>
      <div class="meta-chip">Uploader<strong>${escapeHtml(formatUploader(item))}</strong></div>
      <div class="meta-chip">Favorites<strong>${item.favorite_count || 0}</strong></div>
      <div class="meta-chip">Uses<strong>${item.use_count || 0}</strong></div>
      <div class="meta-chip">Views<strong>${item.view_count || 0}</strong></div>
      <div class="meta-chip">Format<strong>${escapeHtml((item.mime || typeBadge(item)).toString())}</strong></div>`;
  }

  syncFavButton();
  mountModalPreview($("modalPreview"), item);
  $("modal").classList.add("open");
}

function closeModal() {
  $("modal").classList.remove("open");
  const preview = $("modalPreview");
  if (preview._sheetCleanup) preview._sheetCleanup();
  preview._sheetCleanup = null;
  preview.innerHTML = "";
  modalItem = null;
}

$("modalClose").onclick = closeModal;
$("modalFav").onclick = async () => {
  if (!modalItem || modalItem.is_own) return;
  try {
    await toggleFavorite(modalItem);
    syncFavButton();
    loadCatalog().catch(() => {});
  } catch (e) {}
};
$("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});

document.querySelectorAll(".sort-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentSort = btn.getAttribute("data-sort") || "new";
    renderSort();
    loadCatalog().catch(() => {});
  });
});

const searchBox = $("searchBox");
if (searchBox) {
  let searchTimer = 0;
  const runSearch = () => {
    currentQuery = String(searchBox.value || "").trim().toLowerCase();
    applyCatalogFilter();
  };
  searchBox.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 120);
  });
  searchBox.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      searchBox.value = "";
      currentQuery = "";
      applyCatalogFilter();
      searchBox.blur();
    }
  });
}

renderTabs();
renderSort();
guestReady
  .then(() => loadCatalog())
  .catch((e) => {
    $("catalogEmpty").hidden = false;
    $("catalogEmpty").textContent = "Failed to load catalog: " + e.message;
  });
