// Renders every tracker to a PNG so its look can be checked without a browser
// open. Same trick as the recorder: animations are paused and their clock is
// set by hand, so the shot lands after the entrance and never mid-fade.
//
//   node tools/shot.mjs [outdir]     one file per tracker
//   node tools/shot.mjs --sheet      all of them on one contact sheet
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { ROOT, languages, loadTrackers, renderWidget } from './lib.mjs';

const BROWSER = process.env.VLD_BROWSER
  ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const SHEET = process.argv.includes('--sheet');
const OUT = process.argv.find((a) => !a.startsWith('-') && a.includes('media'))
  ?? join(ROOT, 'docs', 'media', 'shots');
const SETTLED = 2600;

/** Long enough for every entrance to have finished, short of any loop restarting. */
const settle = (ms) => {
  for (const a of document.getAnimations()) {
    a.pause();
    const end = a.effect && a.effect.getComputedTiming().endTime;
    a.currentTime = end && end !== Infinity ? Math.min(ms, end) : ms;
  }
};

const trackers = loadTrackers();

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: true,
  args: ['--force-device-scale-factor=2', '--hide-scrollbars'],
});

const page = await browser.newPage();

/** One tracker's declared preview states, with the placeholders filled in. */
function widgets(t, limit = Infinity) {
  const lang = t.lang[t.previewLang] ?? languages(t)[0];

  return (t.preview ?? [lang.example]).slice(0, limit)
    .map((values) => renderWidget(t, lang.chrome).replace(/\$(\d+)/g, (_, n) => {
      const field = t.fields[Number(n) - 1];
      return field ? String(values[field.key] ?? '') : '';
    }))
    .join('\n');
}

if (SHEET) {
  await shootSheet();
} else {
  mkdirSync(OUT, { recursive: true });
  for (const t of trackers) await shootOne(t);
}

await browser.close();

async function shootOne(t) {
  await page.setViewport({ width: 420, height: 400, deviceScaleFactor: 2 });
  await page.setContent(stage(widgets(t)), { waitUntil: 'load' });
  await page.evaluate(settle, SETTLED);

  const height = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewport({ width: 420, height, deviceScaleFactor: 2 });

  const file = join(OUT, `${t.name}.png`);
  writeFileSync(file, await page.screenshot({ type: 'png' }));
  console.log(`${t.name} -> ${file}`);
}

/**
 * Everything on one image for the README. Laid out in CSS columns rather than
 * a grid: the widgets differ in height by a factor of five, and a grid would
 * leave a column of empty plate under every short one.
 */
async function shootSheet() {
  const body = trackers
    .map((t) => `<div class="cell"><span class="tag">${t.tag}</span>${widgets(t, 1)}</div>`)
    .join('\n');

  await page.setViewport({ width: 1180, height: 900, deviceScaleFactor: 2 });
  await page.setContent(stage(body, true), { waitUntil: 'load' });
  await page.evaluate(settle, SETTLED);

  const height = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewport({ width: 1180, height, deviceScaleFactor: 2 });

  const file = join(ROOT, 'docs', 'media', 'pack.png');
  mkdirSync(join(ROOT, 'docs', 'media'), { recursive: true });
  writeFileSync(file, await page.screenshot({ type: 'png' }));
  console.log(`лист -> ${file} (${height}px)`);
}

/** Widgets are meant to sit in a chat, so they are shot on a chat's backdrop. */
function stage(body, sheet = false) {
  const grid = `
  body { columns: 3; column-gap: 20px; padding: 14px 20px 24px; }
  .cell { break-inside: avoid; margin-bottom: 6px; }
  .tag { display: block; padding-left: 4px; font: 500 10px/1 ui-monospace, monospace;
         letter-spacing: .14em; color: #5d6068; }`;

  return `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; background: #101215; }
  body { padding: 6px 22px 18px; }
  ${sheet ? grid : ''}
</style>
${body}`;
}
