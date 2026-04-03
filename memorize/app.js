(() => {
  const WEEK_MIN = 1;
  const OPT_KEY = "memorize:options:v1";
  const TTS_KEY = "memorize:tts:v4";
  const DEFAULT_OPTIONS = {
    autoNextAfterDoneSelection: true,
  };

  const $q = (sel) => $(sel);
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

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

  const normalizeWeeks = (data) =>
    (Array.isArray(data?.weeks) ? data.weeks : []).map((item, index) => {
      const verses =
        Array.isArray(item.verses) && item.verses.length
          ? item.verses
          : [
              item.ref1 || item.text1
                ? { label: "A", ref: item.ref1 || "", text: item.text1 || "" }
                : null,
              item.ref2 || item.text2
                ? { label: "B", ref: item.ref2 || "", text: item.text2 || "" }
                : null,
            ].filter(Boolean);

      return {
        week: Number(item.week ?? index + 1),
        category: item.category || "",
        title: item.title || "",
        verses,
        shareText: verses.map((verse) => `${verse.ref} ${verse.text}`.trim()).join(" "),
      };
    });

  const doneKey = (year) => `memorized:${year}`;
  const getDoneMap = (year) => safeJSON.read(doneKey(year), {});
  const setDoneMap = (year, map) => safeJSON.write(doneKey(year), map);
  const countDone = (map) => Object.values(map || {}).filter(Boolean).length;

  const getOptions = () => {
    const parsed = safeJSON.read(OPT_KEY, {});
    return {
      autoNextAfterDoneSelection: true,
      ...parsed,
      autoNextAfterDoneSelection: true,
    };
  };

  const setOptions = (value) => safeJSON.write(OPT_KEY, { ...DEFAULT_OPTIONS, ...value });

  const getTTS = () =>
    safeJSON.read(TTS_KEY, {
      open: false,
      gapSec: 10,
      ratePreset: "normal",
      voiceURI: "",
    });

  const setTTS = (value) => safeJSON.write(TTS_KEY, value);

  const getQueryWeek = (totalWeeks) => {
    const params = new URLSearchParams(window.location.search);
    const week = Number(params.get("week"));
    return Number.isFinite(week) ? clamp(week, WEEK_MIN, totalWeeks) : null;
  };

  const setQueryWeek = (week) => {
    const url = new URL(window.location.href);
    url.searchParams.set("week", String(week));
    window.history.replaceState({}, "", url);
  };

  const findNextUndoneWeek = (year, startWeek, totalWeeks) => {
    const doneMap = getDoneMap(year);
    for (let week = startWeek + 1; week <= totalWeeks; week += 1) {
      if (!doneMap[String(week)]) return week;
    }
    for (let week = WEEK_MIN; week <= startWeek; week += 1) {
      if (!doneMap[String(week)]) return week;
    }
    return startWeek;
  };

  const findFirstUndoneWeek = (year, totalWeeks) => {
    const doneMap = getDoneMap(year);
    for (let week = WEEK_MIN; week <= totalWeeks; week += 1) {
      if (!doneMap[String(week)]) return week;
    }
    return totalWeeks || WEEK_MIN;
  };

  const resolveInitialWeek = ({ year, totalWeeks, queryWeek }) => {
    const defaultWeek = findFirstUndoneWeek(year, totalWeeks);
    if (queryWeek == null) return defaultWeek;

    const doneMap = getDoneMap(year);
    return doneMap[String(queryWeek)] ? defaultWeek : queryWeek;
  };

  const sanitizeForTTS = (text) =>
    String(text || "")
      .replace(/[\r\n]+/g, " ")
      .replace(/[—·•]/g, " ")
      .replace(/[()［］\[\]{}]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

  const BIBLE_BOOK_NAMES = {
    창: "창세기",
    출: "출애굽기",
    레: "레위기",
    민: "민수기",
    신: "신명기",
    수: "여호수아",
    삿: "사사기",
    룻: "룻기",
    삼상: "사무엘상",
    삼하: "사무엘하",
    왕상: "열왕기상",
    왕하: "열왕기하",
    대상: "역대상",
    대하: "역대하",
    스: "에스라",
    느: "느헤미야",
    에: "에스더",
    욥: "욥기",
    시: "시편",
    잠: "잠언",
    전: "전도서",
    아: "아가",
    사: "이사야",
    렘: "예레미야",
    애: "예레미야애가",
    겔: "에스겔",
    단: "다니엘",
    호: "호세아",
    욜: "요엘",
    암: "아모스",
    옵: "오바댜",
    욘: "요나",
    미: "미가",
    나: "나훔",
    합: "하박국",
    습: "스바냐",
    학: "학개",
    슥: "스가랴",
    말: "말라기",
    마: "마태복음",
    막: "마가복음",
    눅: "누가복음",
    요: "요한복음",
    행: "사도행전",
    롬: "로마서",
    고전: "고린도전서",
    고후: "고린도후서",
    갈: "갈라디아서",
    엡: "에베소서",
    빌: "빌립보서",
    골: "골로새서",
    살전: "데살로니가전서",
    살후: "데살로니가후서",
    딤전: "디모데전서",
    딤후: "디모데후서",
    딛: "디도서",
    몬: "빌레몬서",
    히: "히브리서",
    약: "야고보서",
    벧전: "베드로전서",
    벧후: "베드로후서",
    요일: "요한일서",
    요이: "요한이서",
    요삼: "요한삼서",
    유: "유다서",
    계: "요한계시록"
  };

  const formatVerseRef = (ref) => {
    const value = String(ref || "").trim();
    if (!value) return "";
    const match = value.match(/^([^\d\s]+)\s*(.+)$/);
    if (!match) return value;
    const [, shortName, rest] = match;
    return `${BIBLE_BOOK_NAMES[shortName] || shortName} ${rest}`.trim();
  };

  const formatVerseRefForTTS = (ref) => {
    const value = String(ref || "").trim();
    if (!value) return "";

    const match = value.match(/^([^\d\s]+)\s*(.+)$/);
    if (!match) return value;

    const [, shortName, rest] = match;
    const bookName = BIBLE_BOOK_NAMES[shortName] || shortName;
    const rangeMatch = rest.match(/^(\d+):(\d+)(?:-(\d+))?([상하]?)$/);

    if (!rangeMatch) return `${bookName} ${rest} 말씀. 아멘!`;

    const [, chapter, verseStart, verseEnd, suffix] = rangeMatch;
    let verseText = `${chapter}장 ${verseStart}절`;

    if (verseEnd) {
      verseText += `에서 ${verseEnd}절`;
    }

    if (suffix === "상") verseText += " 상반절";
    if (suffix === "하") verseText += " 하반절";

    return `${bookName} ${verseText} 말씀. 아멘!`;
  };

  const getRateByPreset = (preset) => {
    if (preset === "slow") return 0.95;
    if (preset === "fast") return 1.05;
    return 1.0;
  };

  const getAllVoices = () => {
    try {
      return "speechSynthesis" in window ? window.speechSynthesis.getVoices() || [] : [];
    } catch (_) {
      return [];
    }
  };

  const pickVoice = (voiceURI) => {
    const voices = getAllVoices();
    if (!voices.length) return null;
    if (voiceURI) {
      const saved = voices.find((voice) => voice.voiceURI === voiceURI);
      if (saved) return saved;
    }
    return (
      voices.find((voice) => /google/i.test(voice.name || "") && /^ko/i.test(voice.lang || "")) ||
      voices.find((voice) => (voice.lang || "").toLowerCase() === "ko-kr") ||
      voices.find((voice) => (voice.lang || "").toLowerCase().startsWith("ko")) ||
      null
    );
  };

  const CARD_TTS_GAP_MS = 1500;
  const VERSE_REF_TTS_DELAY_MS = 500;
  const TITLE_TTS_DELAY_MS = 500;
  const ttsRuntime = { playing: false, timer: null };

  const setTTSStatus = (message) => {
    $q("#tts-mini-status").text(message || "");
    $q("#tts-panel-status").text(message || "");
  };

  const clearTTSTimer = () => {
    if (ttsRuntime.timer) clearTimeout(ttsRuntime.timer);
    ttsRuntime.timer = null;
  };

  const stopTTS = () => {
    ttsRuntime.playing = false;
    clearTTSTimer();
    try {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    } catch (_) {}
    setTTSStatus("");
  };

  const speakOnce = (text, cfg) => {
    if (!("speechSynthesis" in window)) {
      alert("이 브라우저는 음성 읽기(TTS)를 지원하지 않아요.");
      return null;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = getRateByPreset(cfg.ratePreset);
    const voice = pickVoice(cfg.voiceURI);
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
    return utterance;
  };

  const startTTS = (state, { announceTitle = false } = {}) => {
    const weekData = state.weeks.find((item) => item.week === state.selectedWeek);
    if (!weekData) return;

    const cfg = getTTS();
    const segments = weekData.verses
      .map((verse) => ({
        text: sanitizeForTTS(verse.text),
        ref: sanitizeForTTS(formatVerseRefForTTS(verse.ref)),
      }))
      .filter((segment) => segment.text || segment.ref);
    if (!segments.length) {
      stopTTS();
      return;
    }

    ttsRuntime.playing = true;
    setTTSStatus(`암송: ${cfg.gapSec}초 텀`);

    const speakSegment = (index) => {
      if (!ttsRuntime.playing || index >= segments.length) return;

      const current = segments[index];
      const textToSpeak = current.text || current.ref;
      const utterance = speakOnce(textToSpeak, cfg);
      if (!utterance) {
        stopTTS();
        return;
      }

      utterance.onend = () => {
        if (!ttsRuntime.playing) return;
        clearTTSTimer();

        if (current.text && current.ref) {
          ttsRuntime.timer = setTimeout(() => {
            if (!ttsRuntime.playing) return;

            const refUtterance = speakOnce(current.ref, cfg);
            if (!refUtterance) {
              stopTTS();
              return;
            }

            refUtterance.onend = () => {
              if (!ttsRuntime.playing) return;
              clearTTSTimer();

              if (index < segments.length - 1) {
                ttsRuntime.timer = setTimeout(() => speakSegment(index + 1), CARD_TTS_GAP_MS);
                return;
              }

              const nextCfg = getTTS();
              ttsRuntime.timer = setTimeout(
                () => startTTS(state, { announceTitle: true }),
                clamp(Number(nextCfg.gapSec) || 10, 1, 999) * 1000
              );
            };
            refUtterance.onerror = () => stopTTS();
          }, VERSE_REF_TTS_DELAY_MS);
          return;
        }

        if (index < segments.length - 1) {
          ttsRuntime.timer = setTimeout(() => speakSegment(index + 1), CARD_TTS_GAP_MS);
          return;
        }

        const nextCfg = getTTS();
        ttsRuntime.timer = setTimeout(
          () => startTTS(state, { announceTitle: true }),
          clamp(Number(nextCfg.gapSec) || 10, 1, 999) * 1000
        );
      };
      utterance.onerror = () => stopTTS();
    };

    const titleToSpeak = String(weekData.title || "").trim();
    if (announceTitle && titleToSpeak) {
      const titleUtterance = speakOnce(titleToSpeak, cfg);
      if (!titleUtterance) {
        stopTTS();
        return;
      }

      titleUtterance.onend = () => {
        if (!ttsRuntime.playing) return;
        clearTTSTimer();
        ttsRuntime.timer = setTimeout(() => {
          if (!ttsRuntime.playing) return;
          speakSegment(0);
        }, TITLE_TTS_DELAY_MS);
      };
      titleUtterance.onerror = () => stopTTS();
      return;
    }

    speakSegment(0);
  };

  const renderHeader = (state) => {
    $q("#week-badge").text(`${state.selectedWeek}주 암송`);
    $q("#progress").text(`진행률: ${countDone(getDoneMap(state.activeYear))}/${state.totalWeeks}`);
  };

  const renderOptions = () => {
    return;
  };

  const renderMainCard = (state) => {
    const weekData = state.weeks.find((item) => item.week === state.selectedWeek);
    if (!weekData) {
      $q("#main-card").empty();
      return;
    }

    const doneMap = getDoneMap(state.activeYear);
    const done = !!doneMap[String(state.selectedWeek)];
    const isDefaultWeek = state.selectedWeek === state.getDefaultWeek();

    $q("#main-card").html(`
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-5 border border-gray-100 dark:border-gray-700">
        ${
          weekData.category
            ? `<div class="mt-3 text-xs font-semibold text-blue-700 dark:text-blue-200">${weekData.category}</div>`
            : ""
        }
        ${
          weekData.title
            ? `<div class="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">${weekData.title}</div>`
            : ""
        }

        <div class="mt-4 space-y-3">
          ${weekData.verses
            .map(
              (verse) => `
                <article class="rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 p-4">
                  <div class="text-[16px] leading-relaxed text-gray-900 dark:text-gray-100">${verse.text || ""}</div>
                  <div class="mt-2 text-sm font-semibold text-blue-700 dark:text-blue-200">${formatVerseRef(verse.ref)}</div>
                </article>
              `
            )
            .join("")}
        </div>

        <button id="done-btn"
          class="mt-4 w-full py-3 rounded-xl text-white font-semibold shadow-sm active:scale-[0.99] ${
            done ? "bg-green-600" : "bg-blue-600"
          }">
          ${done ? "완료됨 ✓ (다시 누르면 해제)" : "암송했어요 :)"}
        </button>
      </div>
    `);

    $q("#done-btn")
      .off("click")
      .on("click", () => {
        stopTTS();
        const beforeCount = countDone(doneMap);
        const nextDone = !done;
        const nextMap = { ...doneMap, [String(state.selectedWeek)]: nextDone };
        const afterCount = countDone(nextMap);
        setDoneMap(state.activeYear, nextMap);

        if (nextDone && afterCount > beforeCount) {
          if (afterCount >= state.totalWeeks) window.SiteFX?.burstBig?.();
          else window.SiteFX?.burstSmall?.();
        }

        if (nextDone) {
          state.setSelectedWeek(findNextUndoneWeek(state.activeYear, state.selectedWeek, state.totalWeeks));
          return;
        }

        renderAll(state);
      });
  };

  const renderTTS = (state) => {
    const cfg = getTTS();
    const voices = getAllVoices().filter((voice) => (voice.lang || "").toLowerCase().startsWith("ko"));
    const gaps = [5, 10, 20, 30];

    $q("#tts-area").html(`
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-4 border border-gray-100 dark:border-gray-700">
        <button id="tts-toggle"
          class="w-full flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40 px-4 py-3 active:scale-[0.99]">
          <div class="flex items-center gap-2">
            <span class="text-base">🎧</span>
            <span class="font-semibold text-gray-900 dark:text-gray-100">암송듣기</span>
            <span id="tts-mini-status" class="text-xs text-gray-500 dark:text-gray-300"></span>
          </div>
          <span class="text-sm text-gray-500 dark:text-gray-300">${cfg.open ? "▲" : "▼"}</span>
        </button>

        <div id="tts-panel" class="${cfg.open ? "" : "hidden"} mt-3">
          <div class="text-xs text-gray-500 dark:text-gray-300 mb-2">선택한 주차의 구절을 차례대로 읽고, 정한 텀 뒤에 반복합니다.</div>

          <div class="flex flex-wrap items-center gap-2">
            <div class="text-xs text-gray-500 dark:text-gray-300 mr-1">텀(초):</div>
            ${gaps
              .map(
                (gap) => `
                  <label class="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 text-sm text-gray-800 dark:text-gray-100">
                    <input type="radio" name="gap-sec" value="${gap}" ${
                  Number(cfg.gapSec) === gap ? "checked" : ""
                }>
                    <span>${gap}</span>
                  </label>
                `
              )
              .join("")}
          </div>

          <div class="mt-3">
            <div class="text-xs text-gray-500 dark:text-gray-300 mb-1">속도</div>
            <div class="grid grid-cols-3 gap-2">
              ${["slow", "normal", "fast"]
                .map((preset) => {
                  const label = preset === "slow" ? "느림" : preset === "fast" ? "빠름" : "보통";
                  const active = cfg.ratePreset === preset;
                  return `
                    <button data-rate="${preset}"
                      class="rate-btn rounded-xl border border-gray-200 dark:border-gray-700 py-2 text-sm font-semibold ${
                        active
                          ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-100 dark:border-blue-800"
                          : "bg-white dark:bg-gray-900/40 text-gray-800 dark:text-gray-100"
                      }">${label}</button>
                  `;
                })
                .join("")}
            </div>
          </div>

          ${
            voices.length
              ? `
            <div class="mt-3 hidden">
              <select id="tts-voice"
                class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
                <option value="">자동(한국어)</option>
                ${voices
                  .map(
                    (voice) =>
                      `<option value="${voice.voiceURI}" ${
                        cfg.voiceURI === voice.voiceURI ? "selected" : ""
                      }>${voice.name} (${voice.lang})</option>`
                  )
                  .join("")}
              </select>
            </div>
          `
              : ""
          }

          <div class="mt-3 grid grid-cols-2 gap-2">
            <button id="tts-play" class="rounded-xl bg-blue-600 text-white py-3 font-semibold shadow-sm active:scale-[0.99]">▶ 시작</button>
            <button id="tts-stop" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 text-gray-800 dark:text-gray-100 py-3 font-semibold active:scale-[0.99]">■ 정지</button>
          </div>

          <div id="tts-panel-status" class="mt-2 text-xs text-gray-500 dark:text-gray-300"></div>
        </div>
      </div>
    `);

    $q("#tts-toggle")
      .off("click")
      .on("click", () => {
        setTTS({ ...getTTS(), open: !cfg.open });
        renderTTS(state);
      });

    $q('input[name="gap-sec"]')
      .off("change")
      .on("change", function () {
        setTTS({ ...getTTS(), gapSec: clamp(Number(this.value) || 10, 1, 999) });
        if (ttsRuntime.playing) setTTSStatus(`암송: ${getTTS().gapSec}초 텀`);
      });

    $q(".rate-btn")
      .off("click")
      .on("click", function () {
        setTTS({ ...getTTS(), ratePreset: $(this).data("rate") });
        renderTTS(state);
      });

    $q("#tts-voice")
      .off("change")
      .on("change", function () {
        setTTS({ ...getTTS(), voiceURI: this.value || "" });
      });

    $q("#tts-play")
      .off("click")
      .on("click", () => {
        stopTTS();
        startTTS(state, { announceTitle: true });
      });

    $q("#tts-stop")
      .off("click")
      .on("click", () => stopTTS());

    setTTSStatus(ttsRuntime.playing ? `암송: ${cfg.gapSec}초 텀` : "");
  };

  const updateNavButtons = (state) => {
    $q("#prev-btn").toggleClass("invisible pointer-events-none", state.selectedWeek <= WEEK_MIN);
    $q("#next-btn").toggleClass("invisible pointer-events-none", state.selectedWeek >= state.totalWeeks);
  };

  const renderAll = (state) => {
    renderHeader(state);
    renderOptions();
    renderMainCard(state);
    renderTTS(state);
    updateNavButtons(state);
  };

  const tryShare = async (week) => {
    const url = new URL(window.location.href);
    url.searchParams.set("week", String(week));
    try {
      if (navigator.share) {
        await navigator.share({
          title: "제자훈련 신앙생활 · 32주 암송",
          text: `${week}주 암송 말씀을 확인해 보세요.`,
          url: url.toString(),
        });
      } else {
        await navigator.clipboard.writeText(url.toString());
        alert("링크를 복사했어요!");
      }
    } catch (_) {}
  };

  const bindStaticEvents = (state) => {
    $q("#go-home")
      .off("click")
      .on("click", () => {
        stopTTS();
        window.location.replace("/");
      });
    $q("#prev-btn")
      .off("click")
      .on("click", () => state.setSelectedWeek(state.selectedWeek - 1));
    $q("#next-btn")
      .off("click")
      .on("click", () => state.setSelectedWeek(state.selectedWeek + 1));
    $q("#go-default")
      .off("click")
      .on("click", () => state.setSelectedWeek(state.getDefaultWeek()));
    $q("#share-btn")
      .off("click")
      .on("click", () => tryShare(state.selectedWeek));

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopTTS();
    });
    window.addEventListener("beforeunload", () => stopTTS());
  };

  const bindOptionEvents = () => {
    return;
  };

  (async function init() {
    const res = await fetch("./data.json", { cache: "no-store" });
    const raw = await res.json();
    const weeks = normalizeWeeks(raw);
    const totalWeeks = weeks.length || 32;
    const activeYear = new Date().getFullYear();
    const queryWeek = getQueryWeek(totalWeeks);

    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
          if (window.__memorize_state__) renderTTS(window.__memorize_state__);
        };
      } catch (_) {}
    }

    const state = {
      weeks,
      totalWeeks,
      activeYear,
      selectedWeek: WEEK_MIN,
      getDefaultWeek: () => findFirstUndoneWeek(activeYear, totalWeeks),
      setSelectedWeek: (week) => {
        stopTTS();
        state.selectedWeek = clamp(week, WEEK_MIN, totalWeeks);
        setQueryWeek(state.selectedWeek);
        renderAll(state);
      },
    };

    state.selectedWeek = resolveInitialWeek({ year: activeYear, totalWeeks, queryWeek });
    window.__memorize_state__ = state;
    setQueryWeek(state.selectedWeek);

    bindStaticEvents(state);
    bindOptionEvents();
    renderAll(state);
    setTimeout(() => renderTTS(state), 300);
  })();
})();
