(() => {
  const STORAGE_KEY = "nalmada-prayers:v1";
  const MIGRATION_KEY = "nalmada-prayers:migrated:v1";
  const LEGACY_DB_NAME = "nalmada-prayer-db";
  const LEGACY_STORE_NAME = "prayers";
  const LEGACY_DB_VERSION = 1;

  const qs = (id) => document.getElementById(id);
  const listEl = qs("prayer-list");
  const emptyStateEl = qs("empty-state");
  const unlockedIds = new Set();
  const expandedIds = new Set();
  let editingPrayer = null;
  let storageReady = false;
  let pendingUnlockAction = "view";

  const escapeHTML = (value) => String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const fmtDate = (value) => {
    const d = value ? new Date(value) : new Date();
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  };

  const hashPassword = async (plain) => {
    const msgUint8 = new TextEncoder().encode(String(plain || ""));
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const normalizePrayer = (prayer) => ({
    id: String(prayer?.id || `prayer-${Date.now()}`),
    title: String(prayer?.title || "").trim(),
    content: String(prayer?.content || "").trim(),
    isPrivate: !!prayer?.isPrivate,
    passwordHash: String(prayer?.passwordHash || ""),
    order: Number.isFinite(Number(prayer?.order)) ? Number(prayer.order) : null,
    createdAt: String(prayer?.createdAt || new Date().toISOString()),
    updatedAt: String(prayer?.updatedAt || prayer?.createdAt || new Date().toISOString()),
  });

  const sortPrayers = (prayers) => prayers.sort((a, b) => {
    const orderA = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
    const orderB = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });

  const ensurePrayerOrder = (prayers) => {
    let changed = false;
    const next = prayers.map((prayer, index) => {
      if (Number.isFinite(prayer.order)) return prayer;
      changed = true;
      return { ...prayer, order: index };
    });
    return { prayers: next, changed };
  };

  const resequencePrayers = (prayers) => prayers.map((prayer, index) => ({
    ...normalizePrayer(prayer),
    order: index,
  }));

  const readPrayers = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const normalized = parsed.map(normalizePrayer);
      const ordered = sortPrayers(normalized);
      const { prayers, changed } = ensurePrayerOrder(ordered);
      if (changed) writePrayers(prayers);
      return prayers;
    } catch (error) {
      throw error;
    }
  };

  const writePrayers = (prayers) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(resequencePrayers(prayers)));
  };

  const getAllPrayers = async () => readPrayers();

  const savePrayer = async (prayer) => {
    const prayers = readPrayers();
    const next = normalizePrayer(prayer);
    const index = prayers.findIndex((item) => item.id === next.id);
    if (index >= 0) {
      prayers[index] = {
        ...next,
        order: Number.isFinite(prayers[index].order) ? prayers[index].order : index,
      };
    } else {
      prayers.push({
        ...next,
        order: prayers.length,
      });
    }
    writePrayers(prayers);
  };

  const deletePrayer = async (id) => {
    const prayers = readPrayers().filter((item) => item.id !== id);
    writePrayers(prayers);
  };

  const movePrayer = async (id, direction) => {
    const prayers = readPrayers();
    const index = prayers.findIndex((item) => item.id === id);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= prayers.length) return;
    const [item] = prayers.splice(index, 1);
    prayers.splice(targetIndex, 0, item);
    writePrayers(prayers);
  };

  const readLegacyPrayers = () => new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      resolve([]);
      return;
    }

    try {
      const req = indexedDB.open(LEGACY_DB_NAME, LEGACY_DB_VERSION);
      req.onupgradeneeded = () => resolve([]);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
          db.close();
          resolve([]);
          return;
        }

        const tx = db.transaction(LEGACY_STORE_NAME, "readonly");
        const store = tx.objectStore(LEGACY_STORE_NAME);
        const getReq = store.getAll();
        getReq.onsuccess = () => resolve(Array.isArray(getReq.result) ? getReq.result : []);
        getReq.onerror = () => reject(getReq.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
      req.onerror = () => reject(req.error);
    } catch (error) {
      reject(error);
    }
  });

  const ensureStorageReady = async () => {
    if (storageReady) return;

    try {
      const existing = readPrayers();
      if (!existing.length && localStorage.getItem(MIGRATION_KEY) !== "done") {
        const legacy = await readLegacyPrayers();
        if (legacy.length) {
          writePrayers(legacy);
        }
        localStorage.setItem(MIGRATION_KEY, "done");
      }
      storageReady = true;
    } catch (error) {
      throw error;
    }
  };

  const showStorageError = () => {
    renderStats([]);
    emptyStateEl.classList.add("hidden");
    listEl.innerHTML = `<div class="bg-red-50 text-red-700 rounded-2xl p-4 text-sm">저장 공간을 불러오지 못했습니다. 브라우저의 저장 기능이 꺼져 있지 않은지 확인해 주세요.</div>`;
  };

  const withErrorHandling = async (work) => {
    try {
      await ensureStorageReady();
      await work();
    } catch (error) {
      showStorageError();
    }
  };

  window.addEventListener("storage", (event) => {
    if (event.key && event.key !== STORAGE_KEY) return;
    withErrorHandling(renderList);
  });

  const setModal = (el, open) => {
    el.classList.toggle("hidden", !open);
    document.body.style.overflow = open ? "hidden" : "";
  };

  const resetForm = () => {
    qs("prayer-form").reset();
    qs("prayer-id").value = "";
    qs("form-status").textContent = "";
    editingPrayer = null;
    qs("form-title").textContent = "중보기도 작성";
    qs("prayer-password").required = false;
  };

  const openForm = (prayer = null) => {
    resetForm();
    if (prayer) {
      editingPrayer = prayer;
      qs("form-title").textContent = "중보기도 수정";
      qs("prayer-id").value = prayer.id;
      qs("prayer-title").value = prayer.title || "";
      qs("prayer-content").value = prayer.content || "";
      qs("prayer-private").checked = !!prayer.isPrivate;
      qs("prayer-password").required = !!prayer.isPrivate;
    }
    setModal(qs("form-modal"), true);
    setTimeout(() => qs("prayer-title").focus(), 30);
  };

  const closeForm = () => {
    setModal(qs("form-modal"), false);
    resetForm();
  };

  const openUnlock = (prayer, action = "view") => {
    pendingUnlockAction = action;
    qs("unlock-id").value = prayer.id;
    qs("unlock-password").value = "";
    qs("unlock-status").textContent = "";
    qs("unlock-title").textContent = action === "edit"
      ? `“${prayer.title}” `
      : `“${prayer.title}” `;
    qs("unlock-submit").textContent = action === "edit" ? "수정하기" : "펼치기";
    setModal(qs("unlock-modal"), true);
    setTimeout(() => qs("unlock-password").focus(), 30);
  };

  const closeUnlock = () => {
    pendingUnlockAction = "view";
    qs("unlock-password").value = "";
    qs("unlock-status").textContent = "";
    setModal(qs("unlock-modal"), false);
  };

  const renderStats = (prayers) => {
    const privateCount = prayers.filter((item) => item.isPrivate).length;
    qs("stats-total").textContent = String(prayers.length);
    qs("stats-public").textContent = String(prayers.length - privateCount);
    qs("stats-private").textContent = String(privateCount);
  };

  const renderList = async () => {
    let prayers = [];
    try {
      prayers = await getAllPrayers();
    } catch (error) {
      showStorageError();
      return;
    }

    renderStats(prayers);
    emptyStateEl.classList.toggle("hidden", prayers.length > 0);

    listEl.innerHTML = prayers.map((prayer, index) => {
      const unlocked = !prayer.isPrivate || unlockedIds.has(prayer.id);
      const expanded = expandedIds.has(prayer.id);
      const contentHtml = unlocked
        ? `<div class="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-200">${escapeHTML(prayer.content)}</div>`
        : `<div class="rounded-xl border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-4 text-sm text-amber-800 dark:text-amber-100">🔒 이 기도문은 가려져 있습니다. 비밀번호를 입력하면 볼 수 있어요.</div>`;

      return `
        <article class="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <h2 class="text-base font-bold truncate">${escapeHTML(prayer.title)}</h2>
                <span class="text-[11px] px-2 py-1 rounded-full ${prayer.isPrivate ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-100" : "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-100"}">${prayer.isPrivate ? "잠금" : "공개"}</span>
              </div>
              ${expanded ? `
                <div class="mt-2 text-xs text-gray-500 dark:text-gray-300">최근 수정: ${escapeHTML(fmtDate(prayer.updatedAt))}</div>
              ` : `
                <div class="mt-2 text-xs text-gray-500 dark:text-gray-300">최근 수정: ${escapeHTML(fmtDate(prayer.updatedAt))}</div>
                <div class="mt-2 flex items-center gap-2">
                  <button data-action="move-up" data-id="${prayer.id}" ${index === 0 ? "disabled" : ""} class="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed">위</button>
                  <button data-action="move-down" data-id="${prayer.id}" ${index === prayers.length - 1 ? "disabled" : ""} class="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed">아래</button>
                </div>
              `}
            </div>
            <div class="shrink-0">
              <button data-action="toggle" data-id="${prayer.id}" class="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-xs font-semibold">
                ${expanded ? "접기" : "펼치기"}
              </button>
            </div>
          </div>
          <div class="mt-3 ${expanded ? "" : "hidden"}">
            <div class="mt-3">
              ${contentHtml}
            </div>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <button data-action="edit" data-id="${prayer.id}" class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold">수정</button>
              <button data-action="delete" data-id="${prayer.id}" class="w-full px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold">삭제</button>
            </div>
          </div>
        </article>`;
    }).join("");

    listEl.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const prayersCurrent = await getAllPrayers();
        const prayer = prayersCurrent.find((item) => item.id === button.dataset.id);
        if (!prayer) return;

        const action = button.dataset.action;
        if (action === "toggle") {
          if (!expandedIds.has(prayer.id) && prayer.isPrivate && !unlockedIds.has(prayer.id)) {
            openUnlock(prayer, "view");
            return;
          }
          if (expandedIds.has(prayer.id)) {
            expandedIds.delete(prayer.id);
          } else {
            expandedIds.add(prayer.id);
          }
          renderList();
        } else if (action === "move-up") {
          await movePrayer(prayer.id, "up");
          await renderList();
        } else if (action === "move-down") {
          await movePrayer(prayer.id, "down");
          await renderList();
        } else if (action === "edit") {
          if (prayer.isPrivate && !unlockedIds.has(prayer.id)) {
            openUnlock(prayer, "edit");
            return;
          }
          openForm(prayer);
        } else if (action === "delete") {
          const ok = window.confirm(`“${prayer.title}” 기도문을 삭제할까요?`);
          if (!ok) return;
          unlockedIds.delete(prayer.id);
          await deletePrayer(prayer.id);
          await renderList();
        }
      });
    });
  };

  qs("go-home").addEventListener("click", () => { location.href = "/"; });
  qs("open-form").addEventListener("click", () => openForm());
  qs("prayer-private").addEventListener("change", () => {
    qs("prayer-password").toggleAttribute("required", qs("prayer-private").checked);
  });

  document.querySelectorAll("[data-close-form]").forEach((el) => el.addEventListener("click", closeForm));
  document.querySelectorAll("[data-close-unlock]").forEach((el) => el.addEventListener("click", closeUnlock));

  qs("prayer-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await withErrorHandling(async () => {
      const title = qs("prayer-title").value.trim();
      const content = qs("prayer-content").value.trim();
      const isPrivate = qs("prayer-private").checked;
      const password = qs("prayer-password").value;

      if (!title || !content) {
        qs("form-status").textContent = "제목과 기도문을 모두 입력해 주세요.";
        return;
      }

      if (isPrivate && !(password || editingPrayer?.passwordHash)) {
        qs("form-status").textContent = "가려서 저장하려면 비밀번호를 입력해 주세요.";
        return;
      }

      const now = new Date().toISOString();
      const next = {
        id: qs("prayer-id").value || `prayer-${Date.now()}`,
        title,
        content,
        isPrivate,
        passwordHash: isPrivate ? (password ? await hashPassword(password) : editingPrayer?.passwordHash || "") : "",
        createdAt: editingPrayer?.createdAt || now,
        updatedAt: now,
      };

      await savePrayer(next);
      if (!isPrivate) unlockedIds.add(next.id);
      expandedIds.add(next.id);
      closeForm();
      await renderList();
    });
  });

  qs("unlock-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await withErrorHandling(async () => {
      const id = qs("unlock-id").value;
      const input = qs("unlock-password").value;
      const prayers = await getAllPrayers();
      const target = prayers.find((item) => item.id === id);
      if (!target) {
        qs("unlock-status").textContent = "기도문을 찾을 수 없습니다.";
        return;
      }

      const hashed = await hashPassword(input);
      if (hashed !== target.passwordHash) {
        qs("unlock-status").textContent = "비밀번호가 맞지 않습니다.";
        return;
      }

      unlockedIds.add(id);
      expandedIds.add(id);
      if (pendingUnlockAction === "edit") {
        closeUnlock();
        openForm(target);
        return;
      }
      closeUnlock();
      expandedIds.add(id);
      await renderList();
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!qs("unlock-modal").classList.contains("hidden")) closeUnlock();
    if (!qs("form-modal").classList.contains("hidden")) closeForm();
  });

  qs("expand-all")?.addEventListener("click", async () => {
    const prayers = await getAllPrayers();
    prayers.forEach((prayer) => expandedIds.add(prayer.id));
    renderList();
  });

  qs("collapse-all")?.addEventListener("click", () => {
    expandedIds.clear();
    renderList();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js");
  }

  withErrorHandling(renderList);
})();
