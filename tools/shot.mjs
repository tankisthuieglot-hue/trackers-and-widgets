// Renders every tracker to a PNG so its look can be checked without a browser
// open. Same trick as the recorder: animations are paused and their clock is
// set by hand, so the shot lands after the entrance and never mid-fade.
//
//   node tools/shot.mjs [outdir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { ROOT, languages, loadTrackers, renderWidget } from './lib.mjs';

const BROWSER = process.env.VLD_BROWSER
  ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const OUT = process.argv[2] ?? join(ROOT, 'docs', 'media', 'shots');
const SETTLED = 2600;

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: true,
  args: ['--force-device-scale-factor=2', '--hide-scrollbars'],
});

const page = await browser.newPage();
await page.setViewport({ width: 420, height: 400, deviceScaleFactor: 2 });

for (const t of loadTrackers()) {
  const lang = t.lang[t.previewLang] ?? languages(t)[0];
  const states = t.preview ?? [lang.example];

  const body = states
    .map((values) => renderWidget(t, lang.chrome).replace(/\$(\d+)/g, (_, n) => {
      const field = t.fields[Number(n) - 1];
      return field ? String(values[field.key] ?? '') : '';
    }))
    .join('\n');

  await page.setContent(stage(body), { waitUntil: 'load' });
  await page.evaluate((ms) => {
    for (const a of document.getAnimations()) {
      a.pause();
      const end = a.effect && a.effect.getComputedTiming().endTime;
      a.currentTime = end && end !== Infinity ? Math.min(ms, end) : ms;
    }
  }, SETTLED);

  const height = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewport({ width: 420, height, deviceScaleFactor: 2 });

  const file = join(OUT, `${t.name}.png`);
  writeFileSync(file, await page.screenshot({ type: 'png' }));
  console.log(`${t.name} -> ${file}`);
}

await browser.close();

/** Widgets are meant to sit in a chat, so they are shot on a chat's backdrop. */
function stage(body) {
  return `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; background: #101215; }
  body { padding: 6px 22px 18px; }
</style>
${body}`;
}
