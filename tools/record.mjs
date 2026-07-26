// Records the widget as a looping GIF for the README and for showing people.
//
// Frames are stepped by hand rather than captured in real time: every CSS
// animation and transition is paused and its clock is set per frame through the
// Web Animations API. The timing is then exact and reproducible, and nothing
// depends on how fast the machine happens to be. No cursor, no watermark.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import gifenc from 'gifenc';
import puppeteer from 'puppeteer-core';
import UPNG from 'upng-js';
import { ROOT, languages, loadTrackers, renderWidget } from './lib.mjs';

const { GIFEncoder, quantize, applyPalette } = gifenc;

/**
 * Запись идёт минуты — молчащий процесс неотличим от повисшего. Каждая десятая
 * отметка на своей строке: возврат каретки затирает текст ошибки, если она
 * случится, и потом непонятно, что упало.
 */
const step = (done, total, what) => {
  if (done % 10 === 0 || done === total) console.log(`${what}: ${done}/${total}`);
};

const BROWSER = process.env.VLD_BROWSER
  ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const LANG = process.argv[2] ?? 'en';
const FPS = 14;
const SCALE = 1.5;
const WIDTH = 420;

const tracker = loadTrackers().find((t) => t.name === (process.argv[3] ?? 'hud'));
const lang = languages(tracker).find((l) => l.code === LANG);

/** The two states the film cuts between. */
const CALM = {
  N: 'Vlad Kostsov', A: '32', H: "5'10\"",
  B1: 'Health', V1: '9', B2: 'Stamina', V2: '6', B3: 'Warmth', V3: '3',
  C: 'soaked parka, sweater on bare skin, combat boots',
  I: "knife, coil of rope, flask, matches, someone else's passport",
  S: 'split knuckles, wet through, voice gone',
};

const HURT = {
  ...CALM,
  V1: '4', V2: '2', V3: '1',
  S: 'brow split open, shaking, breathing through the mouth',
  E: 'Concussed', EF: 'blur',
};

const fill = (values) =>
  renderWidget(tracker, lang.chrome).replace(/\$(\d+)/g, (_, n) => {
    const field = tracker.fields[Number(n) - 1];
    return field ? String(values[field.key] ?? '') : '';
  });

/**
 * The film. Each beat holds for `hold` seconds; `act` runs once when it starts.
 * Kept declarative so the pacing can be retuned without touching the capture.
 */
const script = [
  { hold: 1.9, label: 'calm appears', act: 'show-calm' },
  { hold: 0.5, label: 'open the pack', act: 'open-pack' },
  { hold: 1.3, label: 'pack open' },
  { hold: 0.4, label: 'close the pack', act: 'close-pack' },
  { hold: 1.7, label: 'hurt appears', act: 'show-hurt' },
  { hold: 1.4, label: 'obscured', poster: true },
  { hold: 1.9, label: 'tap to read', act: 'peek' },
  { hold: 0.9, label: 'back to obscured', act: 'unpeek' },
];

const total = script.reduce((n, b) => n + Math.round(b.hold * FPS), 0);
const page = await open();
const frames = [];
let poster = null;
let elapsed = 0;

for (const beat of script) {
  if (beat.act) await page.evaluate((a) => window.act(a), beat.act);

  for (let i = 0; i < Math.round(beat.hold * FPS); i += 1) {
    elapsed += 1000 / FPS;
    await page.evaluate((ms) => window.seek(ms), elapsed);
    frames.push(await page.screenshot({ type: 'png', encoding: 'binary' }));
    step(frames.length, total, 'снято');
  }

  // Один кадр отдельной картинкой: в README он открывается сразу, без
  // ожидания мегабайтной анимации, и годится в качестве превью ссылки.
  if (beat.poster) poster = frames[frames.length - 1];
}

await page.browser().close();

const out = join(ROOT, 'docs', 'media');
mkdirSync(out, { recursive: true });
if (poster) writeFileSync(join(out, `hud-${LANG}.png`), poster);

const file = join(out, `hud-${LANG}.gif`);
const gif = await encode(frames);
writeFileSync(file, gif);

const mb = gif.length / 1024 / 1024;
console.log(`${frames.length} кадров, ${mb.toFixed(1)} МБ -> ${file}`);
if (mb > 8) console.log('тяжело для дискорда — срежь FPS или SCALE');

async function open() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER,
    headless: true,
    args: ['--force-device-scale-factor=' + SCALE, '--hide-scrollbars'],
  });

  const tab = await browser.newPage();
  await tab.setViewport({ width: WIDTH, height: 520, deviceScaleFactor: SCALE });
  await tab.setContent(stage(), { waitUntil: 'load' });

  // Height is only known once a widget is actually laid out, and it has to fit
  // the tallest state or the GIF would change size mid-loop.
  const height = await tab.evaluate(() => window.measure());
  await tab.setViewport({ width: WIDTH, height, deviceScaleFactor: SCALE });

  return tab;
}

/**
 * A page that holds both states and exposes the two controls the film needs.
 *
 * The widget carries its own `<script>`, and inside a script literal that
 * closing tag would end this one — so every `</` in the embedded markup is
 * escaped before it reaches the HTML parser.
 */
function stage() {
  const embed = (values) => JSON.stringify(fill(values)).replaceAll('</', '<\\/');

  return `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; background: #101215; }
  body { padding: 14px 28px 22px; font: 14px system-ui, sans-serif; }
  #slot { min-height: 1px; }
</style>
<div id="slot"></div>
<script>
  const CALM = ${embed(CALM)};
  const HURT = ${embed(HURT)};
  const slot = document.getElementById('slot');

  function mount(html) {
    slot.innerHTML = html;
    // innerHTML never runs scripts; re-create them so the widget behaves as it
    // does inside SillyTavern.
    slot.querySelectorAll('script').forEach((old) => {
      const fresh = document.createElement('script');
      fresh.textContent = old.textContent;
      old.replaceWith(fresh);
    });
    // Nothing may advance on its own — seek() owns the clock.
    document.getAnimations().forEach((a) => { a.pause(); });
  }

  window.act = (what) => {
    if (what === 'show-calm') mount(CALM);
    if (what === 'show-hurt') mount(HURT);
    if (what === 'open-pack') slot.querySelector('details').open = true;
    if (what === 'close-pack') slot.querySelector('details').open = false;
    if (what === 'peek') slot.querySelector('.panel').classList.add('peeking');
    if (what === 'unpeek') slot.querySelector('.panel').classList.remove('peeking');
    document.getAnimations().forEach((a) => { a.pause(); });
  };

  // Кадр не должен менять размер по ходу, поэтому берём самое высокое из
  // состояний — с раскрытым инвентарём и со строкой состояния.
  window.measure = () => {
    let tallest = 0;
    for (const html of [CALM, HURT]) {
      mount(html);
      slot.querySelector('details').open = true;
      tallest = Math.max(tallest, document.body.scrollHeight);
    }
    slot.innerHTML = '';
    return tallest;
  };

  window.seek = (ms) => {
    document.getAnimations().forEach((a) => {
      a.pause();
      const end = a.effect && a.effect.getComputedTiming().endTime;
      a.currentTime = end && end !== Infinity ? Math.min(ms, end) : ms;
    });
  };
</script>`;
}

/**
 * Decoding happens in Node. The first version handed each frame back from the
 * browser as `Array.from(imageData.data)` — a million-odd numbers through JSON,
 * two hundred times, plus a second browser launched only to hold a canvas. It
 * worked, and it took minutes with nothing on screen.
 */
async function encode(pngs) {
  // Buffer.buffer is the shared allocation pool, not this buffer's bytes —
  // handing that to a decoder feeds it whatever else Node had lying around.
  const bytes = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const decode = (png) => {
    const img = UPNG.decode(bytes(png));
    return { rgba: new Uint8ClampedArray(UPNG.toRGBA8(img)[0]), w: img.width, h: img.height };
  };

  const frames = pngs.map((png, i) => {
    const f = decode(png);
    step(i + 1, pngs.length, 'разобрано');
    return f;
  });

  // One palette for the whole film. Per-frame palettes cost a colour table in
  // every frame and make flat areas shimmer as the quantiser changes its mind.
  //
  // Quantised to 255, not 256: index 255 is left free to mean "unchanged", and
  // applyPalette can never pick it because it only ever sees 255 entries.
  const sample = frames.filter((_, i) => i % 6 === 0);
  const joined = new Uint8ClampedArray(sample.reduce((n, f) => n + f.rgba.length, 0));
  let at = 0;
  for (const f of sample) { joined.set(f.rgba, at); at += f.rgba.length; }

  const palette = quantize(joined, 255);
  const withHole = [...palette, [0, 0, 0]];
  const TRANSPARENT = 255;

  const gif = GIFEncoder();
  let previous = null;

  frames.forEach((f, i) => {
    const indexed = applyPalette(f.rgba, palette);

    // Everything that did not move since the last frame is left out of this
    // one. During a hold that is nearly the whole panel.
    if (previous) {
      for (let p = 0; p < indexed.length; p += 1) {
        const o = p * 4;
        if (f.rgba[o] === previous[o] && f.rgba[o + 1] === previous[o + 1]
          && f.rgba[o + 2] === previous[o + 2]) {
          indexed[p] = TRANSPARENT;
        }
      }
    }

    gif.writeFrame(indexed, f.w, f.h, {
      palette: i === 0 ? withHole : undefined,
      first: i === 0,
      transparent: i > 0,
      transparentIndex: TRANSPARENT,
      dispose: 1,
      delay: 1000 / FPS,
    });

    previous = f.rgba;
    step(i + 1, frames.length, 'сжато');
  });

  gif.finish();
  console.log(`кадр ${frames[0].w}×${frames[0].h}`);
  return Buffer.from(gif.bytes());
}
