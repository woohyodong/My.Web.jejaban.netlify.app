const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'memorize/app.js'), 'utf8');
const weeks = JSON.parse(fs.readFileSync(path.join(root, 'memorize/data.json'), 'utf8')).weeks;
const ttsSource = source.slice(0, source.indexOf('  const renderHeader')) +
  '\n globalThis.api = { startTTS, stopTTS, formatVerseRefForTTS, formatVerseRefForTTSNoAmen }; })();';

function player() {
  const spoken = [];
  const delays = [];
  let pending = null;
  const context = {
    window: { speechSynthesis: {
      cancel() {}, getVoices() { return []; }, speak(utterance) { spoken.push(utterance); }
    } },
    localStorage: { getItem() { return JSON.stringify(cfg); } },
    SpeechSynthesisUtterance: function(text) { this.text = text; },
    $() { return { text() {} }; },
    setTimeout(fn, ms) { pending = fn; delays.push(ms); return 1; },
    clearTimeout() { pending = null; },
    alert() { throw new Error('Unexpected unsupported-TTS alert'); }
  };
  const cfg = { gapSec: 10, ratePreset: 'normal', voiceURI: '' };
  vm.runInNewContext(ttsSource, context);
  return {
    ...context.api, cfg, spoken, delays,
    end() { spoken.at(-1).onend(); },
    advance() {
      const next = pending;
      pending = null;
      assert.equal(typeof next, 'function');
      next();
    },
    hasTimer() { return pending !== null; }
  };
}

for (const preset of ['slow', 'normal', 'fast']) {
  test('all 32 weeks follow the requested sequence: ' + preset, () => {
    for (const week of weeks) {
      const p = player();
      p.cfg.ratePreset = preset;
      p.startTTS({ weeks: [week], selectedWeek: week.week }, { announceTitle: true });
      const [first, second] = week.verses;
      const expected = [
        week.title, p.formatVerseRefForTTSNoAmen(first.ref), first.text,
        p.formatVerseRefForTTSNoAmen(first.ref), week.title,
        p.formatVerseRefForTTSNoAmen(second.ref), second.text,
        p.formatVerseRefForTTS(second.ref), week.title
      ];
      for (let i = 1; i < expected.length; i++) { p.end(); p.advance(); }
      assert.deepEqual(p.spoken.map(u => u.text), expected);
      const scale = preset === 'slow' ? 1.2 : preset === 'fast' ? 0.8 : 1;
      assert.deepEqual(p.delays, [500, 500, 500, 1500, 500, 500, 500]
        .map(ms => Math.round(ms * scale)).concat(10000));
      assert(p.spoken.every(u => u.rate ===
        (preset === 'slow' ? 0.8 : preset === 'fast' ? 1.3 : 1)));
      assert.equal(p.spoken.slice(0, 8).filter(u => u.text.includes('아멘!')).length, 1);
      for (const index of [1, 3, 5]) {
        assert.equal(p.spoken[index].text.includes('말씀'), false);
      }
      assert(p.spoken[7].text.endsWith(' 말씀. 아멘!'));
      if (week.week === 1) {
        assert.equal(p.spoken[1].text, '로마서 십장 구절에서 십절.');
        assert.equal(p.spoken[5].text, '마태복음 십육장 십육절.');
      }
    }
  });
}

test('missing title still reads both verses and repeats', () => {
  const p = player();
  const week = { ...weeks[0], title: '' };
  p.startTTS({ weeks: [week], selectedWeek: week.week }, { announceTitle: true });
  for (let i = 0; i < 6; i++) { p.end(); p.advance(); }
  assert.equal(p.spoken.length, 7);
  assert.equal(p.spoken[0].text, p.spoken[6].text);
  assert.deepEqual(p.delays, [500, 500, 1500, 500, 500, 10000]);
});

test('stop clears pending playback; errors also stop playback', () => {
  for (const action of ['stop', 'error']) {
    const p = player();
    p.startTTS({ weeks: [weeks[0]], selectedWeek: 1 }, { announceTitle: true });
    p.end();
    assert(p.hasTimer());
    if (action === 'stop') p.stopTTS();
    else p.spoken.at(-1).onerror();
    assert.equal(p.hasTimer(), false);
    p.end();
    assert.equal(p.hasTimer(), false);
    assert.equal(p.spoken.length, 1);
  }
});
