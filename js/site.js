// /js/site.js
(() => {
  // (선택) 우클릭/롱프레스/드래그 선택 방지 — 기존 유지
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("selectstart", (e) => e.preventDefault());

  // =========================
  // Text Size (Global)
  // =========================
  const TEXT_SIZE_KEY = "textSize"; // "sm" | "base" | "lg"
  const TEXT_SIZE_MAP = {
    sm: "15px",
    base: "16px",
    lg: "18px",
  };

  const normalizeTextSize = (value) =>
    Object.prototype.hasOwnProperty.call(TEXT_SIZE_MAP, value) ? value : "base";

  const applyTextSize = (size) => {
    const next = normalizeTextSize(size);
    document.documentElement.style.fontSize = TEXT_SIZE_MAP[next];
    document.documentElement.dataset.textSize = next;
  };

  const getTextSize = () => normalizeTextSize(localStorage.getItem(TEXT_SIZE_KEY));
  const setTextSize = (size) => {
    const next = normalizeTextSize(size);
    localStorage.setItem(TEXT_SIZE_KEY, next);
    applyTextSize(next);
  };

  applyTextSize(getTextSize());

  const bindTextSizeButtons = (containerOrSelector) => {
    const rootEl =
      typeof containerOrSelector === "string"
        ? document.querySelector(containerOrSelector)
        : containerOrSelector;

    if (!rootEl) return;

    const buttons = Array.from(rootEl.querySelectorAll("[data-text-size]"));
    if (!buttons.length) return;

    const paintButtons = () => {
      const current = getTextSize();

      buttons.forEach((btn) => {
        const active = btn.dataset.textSize === current;
        btn.setAttribute("aria-pressed", active ? "true" : "false");
        btn.classList.toggle("bg-blue-600", active);
        btn.classList.toggle("text-white", active);
        btn.classList.toggle("shadow-sm", active);
        btn.classList.toggle("dark:bg-blue-500", active);

        btn.classList.toggle("bg-white", !active);
        btn.classList.toggle("text-gray-700", !active);
        btn.classList.toggle("dark:bg-gray-800", !active);
        btn.classList.toggle("dark:text-gray-100", !active);
      });
    };

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        setTextSize(btn.dataset.textSize);
        paintButtons();
      });
    });

    window.addEventListener("storage", (e) => {
      if (e.key !== TEXT_SIZE_KEY) return;
      applyTextSize(getTextSize());
      paintButtons();
    });

    paintButtons();
  };

  // =========================
  // Theme (Global)
  // =========================
  const THEME_KEY = "theme"; // "light" | "dark"
  const root = document.documentElement;

  const apply = (theme) => {
    const isDark = theme === "dark";
    root.classList.toggle("dark", isDark);

    // (선택) 브라우저 UI 색도 맞추고 싶으면 meta theme-color도 교체 가능
    // const meta = document.querySelector('meta[name="theme-color"]');
    // if (meta) meta.setAttribute("content", isDark ? "#0B1220" : "#2563EB");
  };

  const get = () => localStorage.getItem(THEME_KEY) || "light";
  const set = (theme) => {
    localStorage.setItem(THEME_KEY, theme === "dark" ? "dark" : "light");
    apply(get());
  };
  const toggle = () => set(get() === "dark" ? "light" : "dark");

  // 페이지 진입 시 항상 적용(홈에서 설정한 값이 서브에 자동 반영)
  apply(get());

  // 홈에서만 버튼 바인딩할 수 있도록 헬퍼 제공
  const bindToggleButton = (btnOrSelector) => {
    const btn =
      typeof btnOrSelector === "string"
        ? document.querySelector(btnOrSelector)
        : btnOrSelector;

    if (!btn) return;

    const paintIcon = () => {
      const isDark = get() === "dark";
      const iconEl = btn.querySelector("[data-theme-icon]");
      const labelEl = btn.querySelector("[data-theme-label]");

      if (iconEl) iconEl.textContent = isDark ? "☀️" : "🌙";
      if (labelEl) labelEl.textContent = isDark ? "라이트 모드로 전환" : "다크 모드로 전환";

      if (!iconEl && !labelEl) {
        btn.textContent = isDark ? "☀️" : "🌙";
      }

      btn.setAttribute("aria-label", isDark ? "라이트 모드" : "다크 모드");
    };

    paintIcon();
    btn.addEventListener("click", () => {
      toggle();
      paintIcon();
    });

    // 다른 탭/창에서 바꿔도 아이콘 동기화
    window.addEventListener("storage", (e) => {
      if (e.key !== THEME_KEY) return;
      apply(get());
      paintIcon();
    });
  };

  window.SiteTheme = { get, set, toggle, apply, bindToggleButton };
  window.SiteTextSize = { get: getTextSize, set: setTextSize, apply: applyTextSize, bindButtons: bindTextSizeButtons };

  // =========================
  // Overlay Back Manager
  // =========================
  const STACK = []; // [{ key, close }]
  let internalPop = false;

  const top = () => STACK[STACK.length - 1];
  const isSameKeyOnTop = (key) => top()?.key === key;

  const open = (key, closeFn) => {
    if (!key || typeof closeFn !== "function") return;
    if (isSameKeyOnTop(key)) return;

    STACK.push({ key, close: closeFn });

    try {
      history.pushState({ __overlay: true, key }, "", location.href);
    } catch (_) {}
  };

  const close = (key, opts = {}) => {
    const { fromPopstate = false } = opts;

    if (!key) key = top()?.key;
    if (!key) return;

    let idx = -1;
    for (let i = STACK.length - 1; i >= 0; i--) {
      if (STACK[i].key === key) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;

    const item = STACK.splice(idx, 1)[0];
    try {
      item.close?.();
    } catch (_) {}

    if (!fromPopstate) {
      internalPop = true;
      try {
        history.back();
      } catch (_) {}
      setTimeout(() => (internalPop = false), 150);
    }
  };

  window.addEventListener(
    "popstate",
    () => {
      if (internalPop) {
        internalPop = false;
        return;
      }
      if (!STACK.length) return;

      const t = top();
      if (!t) return;

      close(t.key, { fromPopstate: true });
    },
    true
  );

  window.SiteOverlay = { open, close, stack: STACK };
})();

// =========================
// Effects (Confetti)
// =========================
(() => {
  const reduced = () =>
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  const fire = (opts) => {
    if (reduced()) return;
    if (typeof window.confetti !== "function") return;
    try { window.confetti(opts); } catch (_) {}
  };

  const burstSmall = () => {
    fire({ particleCount: 60, spread: 70, startVelocity: 35, origin: { y: 0.45 } });
  };

  const burstBig = () => {
    fire({ particleCount: 160, spread: 110, startVelocity: 55, origin: { y: 0.4 } });
    setTimeout(
      () => fire({ particleCount: 120, spread: 90, startVelocity: 45, origin: { y: 0.45 } }),
      180
    );
  };

  window.SiteFX = { burstSmall, burstBig };
})();
