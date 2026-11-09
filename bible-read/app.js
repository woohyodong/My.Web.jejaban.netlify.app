(() => {
  // =========================================================
  // 0) Core Utils / Constants
  // =========================================================
  let currentBibleCtx = null;
  const DAY_MIN = 1;

  const qs = (sel) => $(sel);
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
  const nowIso = () => new Date().toISOString();

  const safeJSON = {
    read(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    },
    write(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    },
  };

  // HTML escape helpers
  const escapeHTML = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const escapeAttr = (s) => escapeHTML(s).replaceAll("`", "&#96;");

  // =========================================================
  // 1) GOODTV Bible MP3 (공식 음원)
  // =========================================================
  const GOODTV_AUDIO_BASE =
    "https://online.goodtv.co.kr/online_bible/goodtvbible/Revision";
  const pad3 = (n) => String(n).padStart(3, "0");

  const buildGoodTvBibleAudioUrl = (bookNum, chapter) => {
    if (!Number.isFinite(bookNum) || !Number.isFinite(chapter)) return null;
    return `${GOODTV_AUDIO_BASE}/${bookNum}/${pad3(chapter)}.mp3`;
  };

  // =========================================================
  // 2) GOODTV Audio Panel - 자체 컨트롤
  // =========================================================
  const BIBLE_AUDIO_KEY = "bibleRead:audio:v1";

  const getAUDIO = () =>
    safeJSON.read(BIBLE_AUDIO_KEY, {
      open: false,
    });

  const setAUDIO = (o) => safeJSON.write(BIBLE_AUDIO_KEY, o);

  const goodtvAudio = {
    el: null,
    playing: false,
    loading: false,
    lastUrl: null, // 마지막으로 로드한 음원 URL (패널 토글로 재로딩 방지)
  };

  const ensureGoodtvAudio = () => {
    if (goodtvAudio.el) return goodtvAudio.el;
    const a = new Audio();
    a.preload = "none";
    goodtvAudio.el = a;
    return a;
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const fmtTime = (sec) => {
    sec = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const getGoodtvDayKey = (state) =>
    `${Number(state?.cycle || 1)}:${Number(state?.selectedDay || 1)}`;

  const getGoodtvQueueItemLabel = (item) =>
    item ? `${item.short}${item.chapter}` : "";

  const setGoodtvQueueStatus = (prefix, item, idx, total) => {
    const pos =
      Number.isFinite(idx) && Number.isFinite(total) && total > 0
        ? ` (${idx + 1}/${total})`
        : "";
    const tail = item ? ` · ${getGoodtvQueueItemLabel(item)}` : "";
    qs("#goodtv-day-status").text(`${prefix}${pos}${tail}`.trim());
  };

  const waitForGoodtvAudioReady = (audio, timeoutMs = 8000) =>
    new Promise((resolve) => {
      if (audio.readyState >= 2) return resolve(true);
      let settled = false;
      let timer = null;

      const finish = (ready) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        audio.removeEventListener("canplay", onReady);
        audio.removeEventListener("loadedmetadata", onReady);
        audio.removeEventListener("canplaythrough", onReady);
        audio.removeEventListener("error", onFail);
        resolve(ready);
      };

      const onReady = () => finish(true);
      const onFail = () => finish(false);

      audio.addEventListener("canplay", onReady, { once: true });
      audio.addEventListener("loadedmetadata", onReady, { once: true });
      audio.addEventListener("canplaythrough", onReady, { once: true });
      audio.addEventListener("error", onFail, { once: true });
      timer = setTimeout(() => finish(false), timeoutMs);
    });

  const playGoodtvAudioWithRetry = async (
    audio,
    url,
    { attempts = 3, timeoutMs = 8000, onAttempt, isCurrent = () => true } = {}
  ) => {
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (!isCurrent()) return { ok: false, cancelled: true };
      try {
        onAttempt?.(attempt);
        audio.src = url;
        audio.load();

        const ready = await waitForGoodtvAudioReady(
          audio,
          timeoutMs + (attempt - 1) * 2000
        );
        if (!isCurrent()) return { ok: false, cancelled: true };
        if (!ready) throw new Error("audio-ready-timeout");

        await audio.play();
        if (!isCurrent()) return { ok: false, cancelled: true };
        return { ok: true, attempt };
      } catch (err) {
        if (!isCurrent()) return { ok: false, cancelled: true };
        lastError = err;
        resetGoodtvAudioMedia();

        if (attempt < attempts) await sleep(500 * attempt);
      }
    }

    return { ok: false, error: lastError };
  };

  const setGoodtvPanelText = (title, sub) => {
    qs("#goodtv-audio-title").text(title || "GOOD TV 원음");
    qs("#goodtv-audio-sub").text(sub || "");
  };

  const formatGoodtvRef = async (ctx) => {
    try {
      const idx = await loadBibleDb();
      const long = idx.bookToLong.get(ctx.bookNum) || `${ctx.bookNum}권`;
      const short = idx.bookToShort?.get(ctx.bookNum) || long.slice(0, 1);

      // 작은 화면에서는 "창2" 처럼 짧게
      const useShort =
        window.matchMedia &&
        window.matchMedia("(max-width: 380px)").matches;

      return useShort ? `${short}${ctx.chapter}` : `${long} ${ctx.chapter}장`;
    } catch (_) {
      // DB 로드 실패 시 최소 표기
      return `${ctx.bookNum}권 ${ctx.chapter}장`;
    }
  };

  const setGoodtvPlayBtn = (playing) => {
    qs("#goodtv-play").text(playing ? "❚❚ 일시정지" : "▶ 재생");
  };

  const setGoodtvLoading = (loading) => {
    goodtvAudio.loading = loading;
    qs("#goodtv-play").prop("disabled", loading).attr("aria-busy", String(loading));
  };

  const resetGoodtvAudioMedia = ({ clearLastUrl = false } = {}) => {
    const a = ensureGoodtvAudio();
    try {
      a.pause();
      a.removeAttribute("src");
      a.load();
    } catch (_) {}
    goodtvAudio.playing = false;
    if (clearLastUrl) goodtvAudio.lastUrl = null;
    setGoodtvPlayBtn(false);
  };

  const stopGoodtvAudio = () => {
    const a = ensureGoodtvAudio();
    try {
      a.pause();
      a.currentTime = 0;
    } catch (_) {}
    goodtvAudio.playing = false;
    setGoodtvPlayBtn(false);
    qs("#goodtv-seek").val(0);
    qs("#goodtv-time").text("0:00");
    qs("#goodtv-duration").text("0:00");
  };

  // =========================================================
  // 2.1) "패널은 유지, 상태만 초기화" (Day 변경 / 구절 변경 공통)
  // =========================================================
  const resetGoodtvStateKeepPanel = () => {
    // ✅ 패널 hidden 토글은 건드리지 않음
    try {
      stopGoodtvDayQueue();
    } catch (_) {}
    try {
      stopGoodtvAudio();
    } catch (_) {}

    const a = ensureGoodtvAudio();
    try {
      a.removeAttribute("src"); // ✅ 잔상 방지
      a.load();
    } catch (_) {}

    goodtvAudio.lastUrl = null;
    currentBibleCtx = null;

    // 표시 초기화
    qs("#goodtv-day-status").text("");
    qs("#goodtv-play-range").text("");
    setGoodtvLoading(false);
    setGoodtvPanelText("GOOD TV 원음", "");
  };

  // Day 변경 시 GOODTV 패널/컨트롤 초기화 (패널은 유지)
  const resetGoodtvForDayChange = () => {
    resetGoodtvStateKeepPanel(); // ✅
  };

  const toggleGoodtvPanel = async () => {
    const $panel = qs("#goodtv-audio-panel");
    if (!$panel.length) return;

    const willOpen = $panel.hasClass("hidden");

    const cur = getAUDIO();
    setAUDIO({ ...cur, open: willOpen });

    if (willOpen) {
      $panel.removeClass("hidden");
      qs("#open-label").text("▲");
    } else {
      $panel.addClass("hidden");
      qs("#open-label").text("▼");
      // NOTE: 패널 토글은 UI만 처리 (재생/큐 재생에는 영향 없음)
    }
  };

  const bindGoodtvControls = (state) => {
    const a = ensureGoodtvAudio();

    if (!a.__goodtvRuntimeStatusBound) {
      a.__goodtvRuntimeStatusBound = true;

      a.addEventListener("playing", () => {
        if (!goodtvDayRuntime.playing) return;
        setGoodtvQueueStatus("재생 중…", goodtvDayRuntime.queue[goodtvDayRuntime.idx], goodtvDayRuntime.idx, goodtvDayRuntime.queue.length);
      });

      a.addEventListener("waiting", () => {
        if (!goodtvDayRuntime.playing) return;
        setGoodtvQueueStatus(
          "버퍼링 중…",
          goodtvDayRuntime.queue[goodtvDayRuntime.idx],
          goodtvDayRuntime.idx,
          goodtvDayRuntime.queue.length
        );
      });

      a.addEventListener("stalled", () => {
        if (!goodtvDayRuntime.playing) return;
        setGoodtvQueueStatus(
          "연결 재시도 중…",
          goodtvDayRuntime.queue[goodtvDayRuntime.idx],
          goodtvDayRuntime.idx,
          goodtvDayRuntime.queue.length
        );
      });
    }

    qs("#goodtv-play")
      .off("click")
      .on("click", async () => {
        if (goodtvAudio.loading) return;
        if (goodtvDayRuntime.playing) {
          a.pause();
          goodtvDayRuntime.playing = false;
          goodtvDayRuntime.paused = true;
          goodtvAudio.playing = false;
          setGoodtvPlayBtn(false);
          setGoodtvQueueStatus("일시정지", goodtvDayRuntime.queue[goodtvDayRuntime.idx], goodtvDayRuntime.idx, goodtvDayRuntime.queue.length);
          return;
        }

        setGoodtvLoading(true);
        const ctx = currentBibleCtx;
        const session = goodtvDayRuntime.session;
        try {
          if (goodtvDayRuntime.paused) {
            if (a.error || !a.src) {
              goodtvDayRuntime.playing = true;
              goodtvDayRuntime.paused = false;
              await goodtvDayRuntime.playAt(goodtvDayRuntime.idx);
            } else {
              await a.play();
              if (ctx !== currentBibleCtx || session !== goodtvDayRuntime.session) return;
              goodtvDayRuntime.playing = true;
              goodtvDayRuntime.paused = false;
              goodtvAudio.playing = true;
              setGoodtvPlayBtn(true);
              setGoodtvQueueStatus("재생 중…", goodtvDayRuntime.queue[goodtvDayRuntime.idx], goodtvDayRuntime.idx, goodtvDayRuntime.queue.length);
            }
          } else {
            await playGoodtvDayQueue(state);
          }
        } catch (_) {
          if (ctx !== currentBibleCtx || session !== goodtvDayRuntime.session) return;
          goodtvDayRuntime.playing = false;
          goodtvDayRuntime.paused = !!goodtvDayRuntime.queue.length;
          goodtvAudio.playing = false;
          setGoodtvPlayBtn(false);
          qs("#goodtv-day-status").text("재생하지 못했어요. 다시 눌러 주세요.");
        } finally {
          if (ctx === currentBibleCtx || (!goodtvDayRuntime.playing && !goodtvDayRuntime.paused)) setGoodtvLoading(false);
        }
      });

    qs("#goodtv-repeat")
      .off("click")
      .on("click", () => {
        goodtvDayRuntime.repeat = !goodtvDayRuntime.repeat;
        a.loop = goodtvDayRuntime.repeat;
        qs("#goodtv-repeat")
          .attr("aria-pressed", String(goodtvDayRuntime.repeat))
          .attr("title", goodtvDayRuntime.repeat ? "한 장 반복 끄기" : "현재 장 반복 켜기")
          .toggleClass("bg-blue-100 dark:bg-blue-900", goodtvDayRuntime.repeat);
        renderGoodtvRange(goodtvDayRuntime.queue);
      });

    a.addEventListener("error", () => {
      if (goodtvAudio.loading || !goodtvDayRuntime.playing) return;
      a.pause();
      goodtvDayRuntime.playing = false;
      goodtvDayRuntime.paused = true;
      goodtvAudio.playing = false;
      setGoodtvPlayBtn(false);
      qs("#goodtv-day-status").text("재생 오류 · 다시 눌러 주세요.");
    });

    // timeupdate -> 진행바
    a.addEventListener("timeupdate", () => {
      const cur = a.currentTime || 0;
      const dur = a.duration || 0;
      const pct = dur ? Math.min(100, (cur / dur) * 100) : 0;

      qs("#goodtv-time").text(fmtTime(cur));
      qs("#goodtv-duration").text(fmtTime(dur));
      qs("#goodtv-seek").val(pct);
    });

    // 시킹
    qs("#goodtv-seek")
      .off("input")
      .on("input", function () {
        const dur = a.duration || 0;
        if (!dur) return;
        const pct = Number(this.value || 0);
        a.currentTime = (dur * pct) / 100;
      });

    // 끝나면 버튼만 정리 (큐 모드일 땐 큐 핸들러가 다음 트랙 진행)
    a.addEventListener("ended", () => {
      if (goodtvDayRuntime.playing) return; // ✅ 큐 모드면 여기서 처리 X
      goodtvAudio.playing = false;
      setGoodtvPlayBtn(false);
    });
  };

  // =========================================================
  // 2.2) "전체 듣기" 중 본문(#bible-modal-body) 동기화
  // =========================================================
  const renderBibleModalForChapter = async ({
    bookNum,
    chapter,
    titleText,
  }) => {
    // 모달이 열려있을 때만 동기화
    const $modal = qs("#bible-modal");
    if (!$modal.length || $modal.hasClass("hidden")) return;

    try {
      const idx = await loadBibleDb();
      const longLabel = idx.bookToLong.get(bookNum) || `${bookNum}권`;
      const shortLabel = idx.bookToShort?.get(bookNum) || longLabel.slice(0, 1);

      qs("#bible-modal-title").text(titleText || `${shortLabel}${chapter}`);
      qs("#bible-modal-subtitle").text(`${longLabel} ${chapter}장`);

      const $body = qs("#bible-modal-body");
      let verses = idx.bcToVerses.get(`${bookNum}:${chapter}`) || [];

      const html = `
        <div class="mb-5">
          <div class="font-extrabold text-gray-900 dark:text-gray-100">${escapeHTML(
            longLabel
          )} ${chapter}장</div>
          <div class="mt-2 space-y-2">
            ${
              verses.length
                ? verses
                    .map(
                      (v) => `
                        <div class="flex gap-2">
                          <div class="shrink-0 w-7 text-right text-xs text-gray-400 pt-[2px]">${escapeHTML(
                            v.p
                          )}</div>
                          <div class="text-gray-900 dark:text-gray-100">${escapeHTML(
                            v.s
                          )}</div>
                        </div>
                      `
                    )
                    .join("")
                : `<div class="text-sm text-gray-500">본문 데이터가 없어요.</div>`
            }
          </div>
        </div>
      `;
      $body.html(html);
    } catch (e) {
      // 본문 동기화 실패는 치명적이 아니므로 조용히
      console.warn("renderBibleModalForChapter failed", e);
    }
  };

  // =========================================================
  // 2.5) GOODTV "선택한 Day 분량 이어듣기" (Day Queue)
  // =========================================================
  const goodtvDayRuntime = {
    playing: false,
    paused: false,
    repeat: false,
    queue: [],
    idx: 0,
    session: 0,
    playAt: null,
    selectionKey: null,
  };

  const stopGoodtvDayQueue = () => {
    if (!goodtvDayRuntime.playing && !goodtvDayRuntime.paused && !goodtvDayRuntime.queue.length)
      return;
    goodtvDayRuntime.playing = false;
    goodtvDayRuntime.paused = false;
    goodtvDayRuntime.queue = [];
    goodtvDayRuntime.idx = 0;
    goodtvDayRuntime.selectionKey = null;
    goodtvDayRuntime.playAt = null;
    goodtvDayRuntime.session += 1;
    qs("#goodtv-day-status").text("정지됨");
  };

  const markSelectedDayDone = (state) => {
    try {
      const p2 = loadProgress();
      const cycle = Number(state.cycle || 1);
      const day = Number(state.selectedDay || 1);
      ensureCycle(p2, cycle);

      // 이미 완료면 유지
      if (!p2.cycles[String(cycle)].completed) p2.cycles[String(cycle)].completed = {};
      if (!p2.cycles[String(cycle)].completed[String(day)]) {
        p2.cycles[String(cycle)].completed[String(day)] = true;

        if (p2.cycles[String(cycle)].startedAt === null)
          p2.cycles[String(cycle)].startedAt = nowIso();

        const doneCount = countDone(p2.cycles[String(cycle)].completed);
        if (doneCount >= state.days) p2.cycles[String(cycle)].finishedAt = nowIso();
      }
      saveProgress(p2);
    } catch (e) {
      console.warn("markSelectedDayDone failed", e);
    }
  };

  const buildGoodtvDayQueue = async (state) => {
    const entry = state?.PLAN?.[state.selectedDay - 1];
    const readings = Array.isArray(entry?.readings) ? entry.readings : [];
    if (!readings.length) return [];

    const idx = await loadBibleDb(); // short -> bookNum 매핑
    const out = [];

    for (const token of readings) {
      const parsed = parseReadingToken(token);
      if (!parsed) continue;

      const bookNum = idx.shortToBook.get(parsed.short);
      if (!bookNum) continue;
      const parts = expandWholeBookParts(parsed, idx, bookNum);

      // parts를 chapter 단위로 확장
      for (const part of parts) {
        for (let ch = part.chStart; ch <= part.chEnd; ch++) {
          out.push({ token, short: parsed.short, bookNum, chapter: ch });
        }
      }
    }
    return out;
  };

  const buildGoodtvRemainingQueue = async (state) => {
    const ctx = currentBibleCtx;
    const queue = await buildGoodtvDayQueue(state);
    const sameChapter = (item) => item.bookNum === ctx?.bookNum && item.chapter === ctx?.chapter;
    let start = queue.findIndex((item) => sameChapter(item) && item.token === ctx?.token);
    // 장 범위는 화면에서 개별 장 토큰으로 펼쳐진다.
    if (start < 0) start = queue.findIndex(sameChapter);
    return start < 0 ? [] : queue.slice(start);
  };

  const renderGoodtvRange = (queue) => {
    const first = queue[0];
    const last = queue[queue.length - 1];
    const range = first
      ? queue.length > 1
        ? first.short + first.chapter + " → " + last.short + last.chapter + "까지 이어서 재생"
        : first.short + first.chapter + " 재생"
      : "";
    const current = queue[Math.min(goodtvDayRuntime.idx, queue.length - 1)];
    const repeat = current && goodtvDayRuntime.repeat
      ? " · " + current.short + current.chapter + " 한 장 반복"
      : "";
    qs("#goodtv-play-range").text(range + repeat);
  };

  const playGoodtvDayQueue = async (state) => {
    const a = ensureGoodtvAudio();
    const ctx = currentBibleCtx;
    const selectionKey = getGoodtvDayKey(state);
    const queue = goodtvDayRuntime.selectionKey === selectionKey && goodtvDayRuntime.queue.length
      ? goodtvDayRuntime.queue
      : await buildGoodtvRemainingQueue(state);
    const dayQueue = await buildGoodtvDayQueue(state);
    if (ctx !== currentBibleCtx || selectionKey !== getGoodtvDayKey(state)) return;
    if (!queue.length) {
      alert("선택한 Day의 성경을 먼저 선택해 주세요.");
      return;
    }

    goodtvDayRuntime.queue = queue;
    goodtvDayRuntime.idx = 0;
    goodtvDayRuntime.session += 1;
    goodtvDayRuntime.selectionKey = selectionKey;
    const mySession = goodtvDayRuntime.session;
    const coversWholeDay = queue.length === dayQueue.length;
    let hadFailure = false;
    const isCurrent = () => goodtvDayRuntime.playing && goodtvDayRuntime.session === mySession && selectionKey === getGoodtvDayKey(state);

    qs("#goodtv-audio-panel").removeClass("hidden");
    qs("#open-label").text("▲");
    setAUDIO({ ...getAUDIO(), open: true });
    goodtvDayRuntime.playing = true;
    goodtvDayRuntime.paused = false;
    renderGoodtvRange(queue);

    const playAt = async (i) => {
      if (!isCurrent()) return;
      const item = queue[i];
      if (!item) {
        goodtvDayRuntime.playing = false;
        goodtvDayRuntime.paused = false;
        goodtvAudio.playing = false;
        setGoodtvPlayBtn(false);
        setGoodtvPanelText("GOOD TV 원음", "선택한 분량 재생을 마쳤습니다.");
        qs("#goodtv-day-status").text(hadFailure
          ? "재생하지 못한 장을 제외하고 재생 완료"
          : coversWholeDay ? "전체 분량 재생 완료 ✓" : "남은 분량을 모두 들었습니다 ✓");
        if (coversWholeDay && !hadFailure) {
          markSelectedDayDone(state);
          try { render(state); } catch (_) {}
        }
        setGoodtvLoading(false);
        return;
      }

      setGoodtvLoading(true);
      let failed = false;
      try {
        stopGoodtvAudio();
        currentBibleCtx = { token: item.token, bookNum: item.bookNum, chapter: item.chapter };
        renderGoodtvRange(queue);
        await renderBibleModalForChapter({ bookNum: item.bookNum, chapter: item.chapter, titleText: item.short + item.chapter });
        if (!isCurrent()) return;
        const ref = await formatGoodtvRef(item);
        if (!isCurrent()) return;
        setGoodtvPanelText("GOOD TV 원음", ref);
        const url = buildGoodTvBibleAudioUrl(item.bookNum, item.chapter);
        goodtvAudio.lastUrl = url;
        const result = await playGoodtvAudioWithRetry(a, url, {
          attempts: 4,
          timeoutMs: 8000,
          isCurrent,
          onAttempt: (attempt) => setGoodtvQueueStatus(attempt === 1 ? "재생 준비 중…" : "연결 재시도 중…", item, i, queue.length),
        });
        if (!isCurrent()) return;
        if (result.ok) {
          goodtvAudio.playing = true;
          setGoodtvPlayBtn(true);
          setGoodtvQueueStatus("재생 중…", item, i, queue.length);
          return;
        }
        failed = true;
      } catch (_) {
        if (!isCurrent()) return;
        failed = true;
      } finally {
        if (goodtvDayRuntime.session === mySession) setGoodtvLoading(false);
      }

      if (!failed || !isCurrent()) return;
      hadFailure = true;
      goodtvAudio.playing = false;
      setGoodtvPlayBtn(false);
      if (goodtvDayRuntime.repeat) {
        goodtvDayRuntime.playing = false;
        goodtvDayRuntime.paused = true;
        setGoodtvQueueStatus("재생 실패 · 다시 눌러 주세요", item, i, queue.length);
        return;
      }
      setGoodtvQueueStatus("재생 실패, 다음 장으로 이동합니다…", item, i, queue.length);
      setGoodtvLoading(true);
      await sleep(700);
      if (!isCurrent()) return;
      goodtvDayRuntime.idx = i + 1;
      await playAt(goodtvDayRuntime.idx);
    };

    goodtvDayRuntime.playAt = playAt;
    if (!a.__goodtvDayQueueBound) {
      a.__goodtvDayQueueBound = true;
      a.addEventListener("ended", () => {
        if (!goodtvDayRuntime.playing) return;
        goodtvDayRuntime.idx += 1;
        const session = goodtvDayRuntime.session;
        setTimeout(() => {
          if (goodtvDayRuntime.session !== session) return;
          goodtvDayRuntime.playAt?.(goodtvDayRuntime.idx);
        }, 0);
      });
    }
    await playAt(0);
  };

  // =========================================================
  // 3) Confetti FX (site.js wrapper optional)
  // =========================================================
  const prefersReducedMotion = () =>
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  const fxSmall = () => {
    if (prefersReducedMotion()) return;
    if (window.SiteFX?.burstSmall) return window.SiteFX.burstSmall();
    if (typeof window.confetti === "function") {
      try {
        window.confetti({
          particleCount: 60,
          spread: 70,
          startVelocity: 35,
          origin: { y: 0.75 },
        });
      } catch (_) {}
    }
  };

  const fxBig = () => {
    if (prefersReducedMotion()) return;
    if (window.SiteFX?.burstBig) return window.SiteFX.burstBig();
    if (typeof window.confetti === "function") {
      try {
        window.confetti({
          particleCount: 160,
          spread: 110,
          startVelocity: 55,
          origin: { y: 0.65 },
        });
        setTimeout(() => {
          window.confetti({
            particleCount: 120,
            spread: 90,
            startVelocity: 45,
            origin: { y: 0.65 },
          });
        }, 180);
      } catch (_) {}
    }
  };

  // =========================================================
  // 4) Bible DB (bible_db.json) - Index + Loader
  // =========================================================
  const BIBLE_DB_URL = "/data/bible_db.json";
  let __bibleDbPromise = null;
  let __bibleIndex = null;

  const buildBibleIndex = (rows) => {
    const shortToBook = new Map();
    const bookToLong = new Map();
    const bookToShort = new Map();
    const bookToMaxChapter = new Map();
    const bcToVerses = new Map(); // "book:chapter" -> [{p,s}]

    for (const r of rows) {
      if (!shortToBook.has(r.short_label)) shortToBook.set(r.short_label, r.book);
      if (!bookToLong.has(r.book)) bookToLong.set(r.book, r.long_label);
      if (!bookToShort.has(r.book)) bookToShort.set(r.book, r.short_label);
      bookToMaxChapter.set(
        r.book,
        Math.max(Number(bookToMaxChapter.get(r.book) || 0), Number(r.chapter || 0))
      );

      const key = `${r.book}:${r.chapter}`;
      if (!bcToVerses.has(key)) bcToVerses.set(key, []);
      bcToVerses.get(key).push({ p: r.paragraph, s: r.sentence });
    }

    return { shortToBook, bookToLong, bookToShort, bookToMaxChapter, bcToVerses };
  };

  const loadBibleDb = async () => {
    if (__bibleIndex) return __bibleIndex;

    if (!__bibleDbPromise) {
      __bibleDbPromise = fetch(BIBLE_DB_URL, { cache: "force-cache" })
        .then((r) => {
          if (!r.ok) throw new Error(`bible_db.json 로드 실패 (${r.status})`);
          return r.json();
        })
        .then((json) => {
          const rows = Array.isArray(json?.Bible) ? json.Bible : [];
          __bibleIndex = buildBibleIndex(rows);
          return __bibleIndex;
        });
    }

    return __bibleDbPromise;
  };

  // =========================================================
  // 5) Bible Token Parser + Modal Renderer
  // =========================================================
  // "에9,10" / "눅1:1-38" / "시119:1-24" / "창9-10" / "창1~2" / "옵" 지원
  const parseReadingToken = (token) => {
    const raw = String(token || "").trim();
    if (!raw) return null;

    const m = raw.match(/^([가-힣]+)\s*(.*)$/);
    if (!m) return null;

    const short = m[1].trim();
    const rest = m[2].trim();
    if (!rest) return { short, parts: [], wholeBook: true };

    const segs = rest.split(/\s*,\s*/).filter(Boolean);
    if (!segs.length) return null;

    const parts = [];

    for (const seg of segs) {
      if (seg.includes(":")) {
        const mm = seg.match(/^(\d+)\s*:\s*(\d+)(?:\s*[~-]\s*(\d+))?$/);
        if (!mm) return null;
        const ch = Number(mm[1]);
        const vStart = Number(mm[2]);
        const vEnd = mm[3] ? Number(mm[3]) : vStart;
        if (![ch, vStart, vEnd].every(Number.isFinite)) return null;

        parts.push({
          chStart: ch,
          chEnd: ch,
          vStart: Math.min(vStart, vEnd),
          vEnd: Math.max(vStart, vEnd),
        });
        continue;
      }

      const mm = seg.match(/^(\d+)(?:\s*[~-]\s*(\d+))?$/);
      if (!mm) return null;
      const chStart = Number(mm[1]);
      const chEnd = mm[2] ? Number(mm[2]) : chStart;
      if (![chStart, chEnd].every(Number.isFinite)) return null;

      parts.push({
        chStart: Math.min(chStart, chEnd),
        chEnd: Math.max(chStart, chEnd),
      });
    }

    parts.sort(
      (a, b) => a.chStart - b.chStart || (a.vStart ?? 0) - (b.vStart ?? 0)
    );

    return { short, parts, wholeBook: false };
  };

  const expandWholeBookParts = (parsed, idx, bookNum) => {
    if (!parsed?.wholeBook) return parsed?.parts || [];
    const maxChapter = Number(idx?.bookToMaxChapter?.get(bookNum) || 0);
    if (!Number.isFinite(maxChapter) || maxChapter < 1) return [];
    return [{ chStart: 1, chEnd: maxChapter }];
  };

  const expandReadingItemsForDisplay = (readings) => {
    const source = Array.isArray(readings) ? readings : [];
    const out = [];

    for (const token of source) {
      const rawToken = String(token || "").trim();
      if (!rawToken) continue;

      const parsed = parseReadingToken(rawToken);
      if (!parsed || parsed.wholeBook || !Array.isArray(parsed.parts) || !parsed.parts.length) {
        out.push({ token: rawToken, label: rawToken });
        continue;
      }

      for (const part of parsed.parts) {
        if (part.vStart != null) {
          const verseLabel =
            part.vStart === part.vEnd
              ? `${parsed.short}${part.chStart}:${part.vStart}`
              : `${parsed.short}${part.chStart}:${part.vStart}-${part.vEnd}`;
          out.push({ token: rawToken, label: verseLabel });
          continue;
        }

        for (let ch = part.chStart; ch <= part.chEnd; ch++) {
          out.push({
            token: `${parsed.short}${ch}`,
            label: `${parsed.short}${ch}`,
          });
        }
      }
    }

    return out;
  };

  const renderReadingsHTML = (readings) => {
    const items = expandReadingItemsForDisplay(readings);
    if (!items.length) {
      return `<span class="text-gray-500 dark:text-gray-300">(데이터 준비중)</span>`;
    }

    return `
      <div class="w-full flex flex-wrap items-center gap-2 gap-y-3">
        ${items
          .map(
            (item) => `
              <span class="inline-flex items-center gap-1">
                <button type="button"
                  class="reading-ref inline-flex items-center rounded-lg bg-blue-50 px-2 py-1 text-blue-800 font-semibold hover:bg-blue-100 active:scale-[0.99]"
                  data-ref="${escapeAttr(item.token)}">
                  ${escapeHTML(item.label)}
                </button>
              </span>
            `
          )
          .join(`<span class="text-gray-300">·</span>`)}
      </div>
    `;
  };

  const closeBibleModal = () => {
    // ✅ 모달 닫으면 GOODTV도 정리
    resetGoodtvStateKeepPanel(); // ✅ (패널 유지)
    qs("#bible-modal").addClass("hidden");
    window.SiteOverlay?.close("bible-modal");
  };

  const openBibleModal = async (token, state) => {
    // ✅ 새 토큰(구절) 열 때: 패널은 유지하되 상태 초기화
    resetGoodtvStateKeepPanel(); // ✅

    const cfg = getAUDIO();
    qs("#goodtv-audio-panel").toggleClass("hidden", !cfg.open);
    qs("#open-label").text(cfg.open ? "▲" : "▼");

    const parsed = parseReadingToken(token);

    qs("#bible-modal").removeClass("hidden");
    qs("#bible-modal-title").text(token || "성경");
    qs("#bible-modal-subtitle").text("");
    window.SiteOverlay?.open("bible-modal", closeBibleModal);

    const $body = qs("#bible-modal-body");
    $body.html(`<div class="text-sm text-gray-500">불러오는 중…</div>`);

    if (!parsed) {
      qs("#bible-modal-subtitle").text("지원되지 않는 표기");
      $body.html(
        `<div class="text-sm text-gray-600">"${escapeHTML(
          token
        )}" 표기는 아직 지원하지 않아요.</div>`
      );
      return;
    }

    try {
      const idx = await loadBibleDb();
      const bookNum = idx.shortToBook.get(parsed.short);
      const parts = expandWholeBookParts(parsed, idx, bookNum);
      const firstPart = parts?.[0];
      const firstChapter = firstPart?.chStart;

      currentBibleCtx = {
        token,
        bookNum: bookNum,
        chapter: firstChapter || 1,
        vStart: firstPart?.vStart ?? null,
        vEnd: firstPart?.vEnd ?? null,
      };

      if (!bookNum) {
        qs("#bible-modal-subtitle").text("책을 찾을 수 없음");
        $body.html(
          `<div class="text-sm text-gray-600">"${escapeHTML(
            parsed.short
          )}" 약어를 성경DB에서 찾지 못했어요.</div>`
        );
        return;
      }

      const longLabel = idx.bookToLong.get(bookNum) || parsed.short;

      const labelParts = parts.map((p) => {
        const ch = p.chStart === p.chEnd ? `${p.chStart}` : `${p.chStart}~${p.chEnd}`;
        if (p.vStart != null) return `${p.chStart}:${p.vStart}-${p.vEnd}`;
        return ch;
      });

      qs("#bible-modal-subtitle").text(
        parsed.wholeBook ? `${longLabel} 전체` : `${longLabel} ${labelParts.join(", ")}`
      );

      let html = "";

      for (const part of parts) {
        for (let ch = part.chStart; ch <= part.chEnd; ch++) {
          let verses = idx.bcToVerses.get(`${bookNum}:${ch}`) || [];

          if (part.vStart != null && part.chStart === part.chEnd) {
            verses = verses.filter((v) => {
              const n = Number(v.p);
              return Number.isFinite(n) && n >= part.vStart && n <= part.vEnd;
            });
          }

          html += `
            <div class="mb-5">
              <div class="font-extrabold text-gray-900 dark:text-gray-100">${escapeHTML(
                longLabel
              )} ${ch}장</div>
              <div class="mt-2 space-y-2">
                ${
                  verses.length
                    ? verses
                        .map(
                          (v) => `
                            <div class="flex gap-2">
                              <div class="shrink-0 w-7 text-right text-xs text-gray-400 pt-[2px]">${escapeHTML(
                                v.p
                              )}</div>
                              <div class="text-gray-900 dark:text-gray-100">${escapeHTML(
                                v.s
                              )}</div>
                            </div>
                          `
                        )
                        .join("")
                    : `<div class="text-sm text-gray-500">본문 데이터가 없어요.</div>`
                }
              </div>
            </div>
          `;
        }
      }

      $body.html(html || `<div class="text-sm text-gray-500">표시할 내용이 없어요.</div>`);

      const ctx = currentBibleCtx;
      const ref = await formatGoodtvRef(ctx);
      const queue = await buildGoodtvRemainingQueue(state);
      if (ctx !== currentBibleCtx) return;
      goodtvDayRuntime.queue = queue;
      goodtvDayRuntime.selectionKey = getGoodtvDayKey(state);
      setGoodtvPanelText("GOOD TV 원음", ref);
      renderGoodtvRange(queue);
    } catch (e) {
      qs("#bible-modal-subtitle").text("로드 오류");
      $body.html(
        `<div class="text-sm text-red-600">본문을 불러오지 못했어요. (오프라인이거나 파일 경로를 확인해 주세요)</div>`
      );
      console.error(e);
    }
  };

  // =========================================================
  // 6) Progress / Options / Plan
  // =========================================================
  const STORAGE_KEY = "bibleRead:progress:v2";
  const OPT_KEY = "bibleRead:options:v1";

  const loadProgress = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { activeCycle: 1, cycles: {} };
  };

  const saveProgress = (p) => localStorage.setItem(STORAGE_KEY, JSON.stringify(p));

  const ensureCycle = (p, cycle) => {
    const k = String(cycle);
    if (!p.cycles[k]) p.cycles[k] = { completed: {}, startedAt: null, finishedAt: null };
    return p;
  };

  const countDone = (completedMap) =>
    Object.values(completedMap || {}).filter(Boolean).length;

  const loadOptions = () => {
    try {
      const raw = localStorage.getItem(OPT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          autoNextAfterDoneSelection: true,
          keepScreenAwake: true,
          ...parsed,
          autoNextAfterDoneSelection: true,
        };
      }
    } catch {}
    return { autoNextAfterDoneSelection: true, keepScreenAwake: true };
  };

  const saveOptions = (opt) => localStorage.setItem(OPT_KEY, JSON.stringify(opt));

  const applyWakeLockOption = async (enabled) => {
    try {
      if (!window.SiteWakeLock?.setEnabled) return;
      await window.SiteWakeLock.setEnabled(!!enabled);
    } catch (_) {}
  };

  const getQueryDay = () => {
    const u = new URL(location.href);
    const v = u.searchParams.get("day");
    const n = v == null ? null : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const setQueryDay = (day) => {
    const u = new URL(location.href);
    u.searchParams.set("day", String(day));
    history.replaceState({}, "", u);
  };

  const normalizePlan = (raw) => {
    if (Array.isArray(raw?.weeks)) {
      return raw.weeks.flatMap((weekRow, weekIndex) =>
        (weekRow.days || []).map((dayRow, dayIndex) => ({
          day: Number(dayRow.entry ?? weekIndex * 7 + dayIndex + 1),
          week: Number(weekRow.week ?? weekIndex + 1),
          dayInWeek: Number(dayRow.day ?? dayIndex + 1),
          entry: Number(dayRow.entry ?? weekIndex * 7 + dayIndex + 1),
          readings: Array.isArray(dayRow.readings) ? dayRow.readings : [],
          label: `${weekRow.week ?? weekIndex + 1}주 ${dayRow.day ?? dayIndex + 1}일`,
        }))
      );
    }

    return (raw || []).map((row, i) => {
      const day = Number(row.day ?? row.Day ?? (i + 1));
      const date = row.date ?? row.Date ?? row.mmdd ?? row.MMDD ?? "";
      const readings = row.readings ?? row.Readings ?? row.reading ?? row.Reading ?? [];
      let month = row.month;
      let dayOfMonth = row.dayOfMonth;

      if (
        (!month || !dayOfMonth) &&
        typeof date === "string" &&
        /^\d{2}-\d{2}$/.test(date)
      ) {
        const [mm, dd] = date.split("-").map(Number);
        month = mm;
        dayOfMonth = dd;
      }

      return {
        ...row,
        day,
        date,
        month,
        dayOfMonth,
        readings,
        week: Number(row.week ?? Math.floor(i / 7) + 1),
        dayInWeek: Number(row.dayInWeek ?? ((i % 7) + 1)),
        entry: Number(row.entry ?? day),
        label: row.label ?? `${Number(row.week ?? Math.floor(i / 7) + 1)}주 ${Number(row.dayInWeek ?? ((i % 7) + 1))}일`,
      };
    });
  };

  const renderFatal = (msg, extra = "") => {
    qs("#main-card").html(`
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-5 border border-gray-100 dark:border-gray-700">
        <div class="text-red-600 font-extrabold">데이터 로딩 오류</div>
        <div class="mt-2 text-gray-800 dark:text-gray-100 font-semibold">${escapeHTML(
          msg
        )}</div>
        ${
          extra
            ? `<div class="mt-3 text-sm text-gray-500 dark:text-gray-300">${escapeHTML(
                extra
              )}</div>`
            : ""
        }
      </div>
    `);
  };

  const findNextUndoneDay = (p, cycle, fromDay, days) => {
    const completed = p.cycles[String(cycle)]?.completed || {};
    for (let d = fromDay + 1; d <= days; d++) if (!completed[String(d)]) return d;
    for (let d = 1; d <= days; d++) if (!completed[String(d)]) return d;
    return clamp(fromDay + 1, 1, days);
  };

  const isCycleFinished = (p, cycle, days) => {
    ensureCycle(p, cycle);
    const doneCount = countDone(p.cycles[String(cycle)]?.completed);
    return doneCount >= days;
  };

  const advanceCycleIfFinished = (p, cycle, days) => {
    ensureCycle(p, cycle);
    const k = String(cycle);

    const doneCount = countDone(p.cycles[k]?.completed);
    if (doneCount >= days && !p.cycles[k].finishedAt) p.cycles[k].finishedAt = nowIso();
    if (doneCount < days) p.cycles[k].finishedAt = null;

    if (doneCount < days) return cycle;

    const next = Number(p.activeCycle || cycle) + 1;
    p.activeCycle = next;
    ensureCycle(p, next);
    saveProgress(p);
    return next;
  };

  // =========================================================
  // 7) UI Render (Main / Header / Progress / Nav)
  // =========================================================
  const renderMainCard = (state) => {
    const { PLAN, selectedDay, cycle, days } = state;

    const entry = PLAN[selectedDay - 1];
    const p = loadProgress();
    ensureCycle(p, cycle);
    const done = !!p.cycles[String(cycle)].completed[String(selectedDay)];

    const readings = entry?.readings ?? [];
    const hasReadings = Array.isArray(readings) && readings.length > 0;

    qs("#main-card").html(`
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-5 border border-gray-100 dark:border-gray-700">
        <div class="inline-flex items-center gap-2">
          <span class="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-100">
            ${cycle}독
          </span>
          <span class="text-xs text-gray-500 dark:text-gray-300">
            ${escapeHTML(entry?.label || `${entry?.week || 1}주 ${entry?.dayInWeek || 1}일`)}
          </span>
        </div>

        <div class="mt-2 text-xs text-gray-500 dark:text-gray-300">
          42주 읽기표 중 ${selectedDay}번째 분량
        </div>

        <div class="mt-3 text-[17px] leading-relaxed break-words text-gray-900 dark:text-gray-100 flex flex-wrap gap-2 gap-y-4">
          ${
            hasReadings
              ? renderReadingsHTML(readings)
              : `<span class="text-gray-500 dark:text-gray-300">(데이터 준비중)</span>`
          }
        </div>

        <button id="done-btn"
          class="mt-4 w-full py-3 rounded-xl text-white font-semibold shadow-sm active:scale-[0.99]
          ${done ? "bg-green-600" : "bg-blue-600"}">
          ${done ? "완료됨 ✓ (다시 누르면 해제)" : "읽었어요 :)"}
        </button>
      </div>
    `);

    qs("#done-btn")
      .off("click")
      .on("click", () => {
        const p2 = loadProgress();
        ensureCycle(p2, cycle);

        const wasDone = !!p2.cycles[String(cycle)].completed[String(selectedDay)];
        const nowDone = !wasDone;

        p2.cycles[String(cycle)].completed[String(selectedDay)] = nowDone;

        if (p2.cycles[String(cycle)].startedAt === null)
          p2.cycles[String(cycle)].startedAt = nowIso();

        const doneCount = countDone(p2.cycles[String(cycle)].completed);
        if (doneCount >= days) p2.cycles[String(cycle)].finishedAt = nowIso();
        else p2.cycles[String(cycle)].finishedAt = null;

        saveProgress(p2);

        // 7독 단위 축하
        if (nowDone && doneCount % 7 === 0) fxSmall();

        // 완독 시
        if (nowDone && doneCount >= days) {
          fxBig();

          const nextCycle = advanceCycleIfFinished(p2, cycle, days);
          state.cycle = nextCycle;

          const p3 = loadProgress();
          ensureCycle(p3, state.cycle);

          const nextDay = state.getDefaultDay();
          state.setSelectedDay(nextDay);
          return;
        }

        // 옵션: 완료 후 다음 미완료로 자동 진행
        if (nowDone) {
          state.setSelectedDay(findNextUndoneDay(p2, cycle, selectedDay, days)); // ✅ 변경: selectedDay 기준
          return;
        }

        render(state);
      });
  };

  const renderProgress = (state) => {
    const $p = qs("#progress");
    if (!$p.length) return;

    const p = loadProgress();
    ensureCycle(p, state.cycle);
    const doneMap = p.cycles[String(state.cycle)]?.completed || {};
    const doneCount = countDone(doneMap);
    const pct = Math.floor((doneCount / state.days) * 100);
    $p.text(`진행률: ${state.cycle}독 · ${doneCount}/${state.days} (${pct}%)`);
  };

  const renderHeader = (state) => {
    // share 버튼이 있을 때만
    const $share = qs("#share-btn");
    if ($share.length) {
      $share.off("click").on("click", async () => {
        const url = new URL(location.href);
        url.searchParams.set("day", String(state.selectedDay));
        const shareData = {
          title: "제자훈련 신앙생활 · 42주 성경 1독",
          text: "읽기 분량을 함께 확인해요",
          url: url.toString(),
        };
        try {
          if (navigator.share) await navigator.share(shareData);
          else {
            await navigator.clipboard.writeText(url.toString());
            alert("링크를 복사했어요!");
          }
        } catch {}
      });
    }

    // 홈 버튼이 있을 때만
    const $home = qs("#go-home");
    if ($home.length) {
      $home.off("click").on("click", () => {
        closeBibleModal();
        location.assign("/");
      });
    }
  };

  const updateNavButtons = (state) => {
    qs("#prev-btn").toggleClass(
      "invisible pointer-events-none",
      state.selectedDay <= DAY_MIN
    );
    qs("#next-btn").toggleClass(
      "invisible pointer-events-none",
      state.selectedDay >= state.days
    );
  };

  const initBottomNav = (state) => {
    qs("#prev-btn")
      .off("click")
      .on("click", () => {
        if (state.selectedDay <= DAY_MIN) return;
        state.setSelectedDay(state.selectedDay - 1);
      });

    qs("#next-btn")
      .off("click")
      .on("click", () => {
        if (state.selectedDay >= state.days) return;
        state.setSelectedDay(state.selectedDay + 1);
      });

    qs("#today-btn")
      .off("click")
      .on("click", () => state.setSelectedDay(state.getDefaultDay()));
  };

  // 옵션 UI가 있는 경우에만 연결(없으면 무시)
  const initOptions = () => {
    const opt = loadOptions();

    const $wake = qs("#opt-keep-screen-awake");
    if ($wake.length) {
      $wake.prop("checked", !!opt.keepScreenAwake);
      applyWakeLockOption(opt.keepScreenAwake);
      $wake.off("change").on("change", async (e) => {
        const next = {
          ...loadOptions(),
          keepScreenAwake: !!e.target.checked,
        };
        saveOptions(next);
        await applyWakeLockOption(next.keepScreenAwake);
      });
      return;
    }

    applyWakeLockOption(opt.keepScreenAwake);
  };

  // =========================================================
  // 8) Events (Modal Close / GOODTV Toggle / Reading Ref)
  // =========================================================
  const bindBibleModalEvents = (state) => {
    // 닫기 클릭
    $(document)
      .off("click.bibleClose")
      .on("click.bibleClose", "[data-bible-close]", () => closeBibleModal());

    // ESC
    $(document)
      .off("keydown.bibleEsc")
      .on("keydown.bibleEsc", (ev) => {
        if (ev.key === "Escape") closeBibleModal();
      });

    // ref 클릭 -> 성경 모달 오픈
    $(document)
      .off("click.bibleRef")
      .on("click.bibleRef", ".reading-ref", async (e) => {
        const ref = $(e.currentTarget).data("ref");
        if (!ref) return;
        await openBibleModal(ref, state);
      });

    // GOODTV 토글(모달 내 버튼)
    $(document)
      .off("click.openBibleAudio")
      .on("click.openBibleAudio", "#open-bible-audio", async () => {
        await toggleGoodtvPanel();
      });

    // ✅ 선택한 Day 분량 이어듣기 버튼 바인딩
  };

  // =========================================================
  // 9) Main Render
  // =========================================================
  const render = (state) => {
    renderHeader(state);
    renderMainCard(state);
    updateNavButtons(state);
    renderProgress(state);
  };

  // =========================================================
  // 10) Boot
  // =========================================================
  (async () => {
    try {
      const RAW = await fetch("./data.json", { cache: "no-cache" }).then((r) =>
        r.json()
      );
      const PLAN = normalizePlan(RAW);

      if (!Array.isArray(PLAN) || PLAN.length === 0) {
        renderFatal(
          "data.json이 비어있거나 형식이 올바르지 않아요.",
          "bible-read/data.json 내용을 확인해 주세요."
        );
        return;
      }

      const days = PLAN.length;

      const p = loadProgress();
      ensureCycle(p, p.activeCycle);

      // 이미 완독 상태면 자동 다음 독
      if (isCycleFinished(p, p.activeCycle, days)) {
        p.activeCycle = advanceCycleIfFinished(p, p.activeCycle, days);
      } else {
        saveProgress(p);
      }

      initOptions();

      const queryDay = getQueryDay();
      // 초기 day 선택: 쿼리가 없으면 첫 미완료 분량
      let initialDay;
      if (queryDay != null) {
        initialDay = clamp(queryDay, DAY_MIN, days);
      } else {
        const p2 = loadProgress();
        const cycle = Number(p2.activeCycle || 1);
        ensureCycle(p2, cycle);
        initialDay = findNextUndoneDay(p2, cycle, 0, days);
      }

      const pFinal = loadProgress();
      const state = {
        PLAN,
        days,
        selectedDay: initialDay,
        cycle: Number(pFinal.activeCycle || 1),
        getDefaultDay: () => {
          const progress = loadProgress();
          ensureCycle(progress, state.cycle);
          return findNextUndoneDay(progress, state.cycle, 0, state.days);
        },
        setSelectedDay: (d) => {
          state.selectedDay = clamp(d, DAY_MIN, days);
          setQueryDay(state.selectedDay);
          resetGoodtvForDayChange(); // ✅ Day 변경 시 "패널 유지 + 상태 초기화"
          render(state);
        },
      };

      initBottomNav(state);
      render(state);

      bindBibleModalEvents(state);
      bindGoodtvControls(state);
    } catch (e) {
      renderFatal("예상치 못한 오류", String(e?.message || e));
      console.error(e);
    }
  })();
})();
