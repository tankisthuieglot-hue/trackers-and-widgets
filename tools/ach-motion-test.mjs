import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { loadTrackers, promptBlock, renderWidget } from './lib.mjs';

const BROWSER = process.env.VLD_BROWSER
  ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const achievement = loadTrackers().find((tracker) => tracker.name === 'ach');
const lang = achievement.lang.en;

function filled(values) {
  return renderWidget(achievement, lang.chrome).replace(/\$(\d+)/g, (_, number) => {
    const field = achievement.fields[Number(number) - 1];
    return field ? String(values[field.key] ?? '') : '';
  });
}

const common = lang.example;
const rare = {
  T: 'Structural Damage',
  D: 'identified the load-bearing wall from the inside',
  P: '1',
  G: 'skull',
};

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: true,
  args: ['--hide-scrollbars'],
});

try {
  const prompts = {
    en: promptBlock(achievement, achievement.lang.en),
    ru: promptBlock(achievement, achievement.lang.ru),
  };

  assert.match(prompts.en, /^Example: \[\[VLD_ACH\|/m, 'English uses a word before the example');
  assert.match(prompts.ru, /^Пример: \[\[VLD_ACH\|/m, 'Russian uses a word before the example');
  assert.equal(prompts.en.includes('→'), false, 'English never teaches the model to copy an arrow');
  assert.equal(prompts.ru.includes('→'), false, 'Russian never teaches the model to copy an arrow');

  const page = await browser.newPage();
  await page.setViewport({ width: 760, height: 360 });
  await page.setContent(
    `<!doctype html><meta charset="utf-8">${filled(common)}${filled(rare)}`,
    { waitUntil: 'load' },
  );

  const counted = await page.evaluate(() => {
    const roots = [...document.querySelectorAll('.vld-ach')];
    const first = roots[0];
    const rate = first.querySelector('.rate b');
    const seekable = typeof first.vldSeek === 'function';
    const snapshots = [];

    if (seekable) {
      for (const time of [0, 620, 2000]) {
        first.vldSeek(time);
        snapshots.push(rate.textContent);
      }
    }

    return {
      seekable,
      final: rate.dataset.final || '',
      snapshots,
      commonColor: getComputedStyle(rate).color,
      rareColor: getComputedStyle(roots[1].querySelector('.rate b')).color,
    };
  });

  assert.equal(counted.seekable, true, 'the percentage exposes a deterministic count-up clock');
  assert.equal(counted.final, common.P, 'the model-provided percentage is preserved separately');
  assert.deepEqual(counted.snapshots, ['0%', '8%', '12%'], 'the number counts up and lands exactly');
  assert.notEqual(counted.commonColor, counted.rareColor, 'rarity changes the percentage color');

  const reduced = await browser.newPage();
  await reduced.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await reduced.setContent(
    `<!doctype html><meta charset="utf-8">${filled(common)}`,
    { waitUntil: 'load' },
  );

  const still = await reduced.evaluate(() => ({
    text: document.querySelector('.vld-ach .rate b').textContent,
    final: document.querySelector('.vld-ach .rate b').dataset.final || '',
  }));

  assert.equal(still.text, `${common.P}%`, 'reduced motion shows the final percentage immediately');
  assert.equal(still.final, common.P, 'reduced motion keeps the model-provided value');

  console.log('✓ achievement motion: colored rarity and deterministic count-up');
} finally {
  await browser.close();
}
