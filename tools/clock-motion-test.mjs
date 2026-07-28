import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { loadTracker, renderWidget } from './lib.mjs';

const BROWSER = process.env.VLD_BROWSER
  ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const clock = loadTracker('clock');
const lang = clock.lang.en;

function filled(values) {
  return renderWidget(clock, lang.chrome).replace(/\$(\d+)/g, (_, number) => {
    const field = clock.fields[Number(number) - 1];
    return field ? String(values[field.key] ?? '') : '';
  });
}

const states = [
  { T: 'the patrol reaches the safehouse', F: '3', S: '4', W: 'the door comes down', L: 'a witness talked' },
  { T: 'the signal triangulates your position', F: '5', S: '6', W: 'the drones converge', L: 'the radio stayed open' },
  { T: 'the winter closes the pass', F: '7', S: '8', W: 'the road disappears', L: 'the storm moved east' },
];

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: true,
  args: ['--hide-scrollbars'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1180, height: 360 });
  await page.setContent(
    `<!doctype html><meta charset="utf-8">${states.map(filled).join('')}`,
    { waitUntil: 'load' },
  );

  const motion = await page.evaluate(() => {
    const roots = [...document.querySelectorAll('.vld-clock')];
    const first = roots[0];
    const unit = first.querySelector('.unit');
    const seekable = typeof first.vldSeek === 'function';
    const snapshots = [];

    if (seekable) {
      for (const time of [0, 235, 360, 2000]) {
        first.vldSeek(time);
        snapshots.push({
          locked: Number(unit.dataset.locked || 0),
          fill: unit.style.getPropertyValue('--live-turn'),
          hand: unit.style.getPropertyValue('--hand-turn'),
          count: unit.querySelector('.hub b').textContent,
          settled: unit.classList.contains('is-settled'),
        });
      }
    }

    const finals = roots.map((root) => {
      root.vldSeek?.(2000);
      const item = root.querySelector('.unit');
      return {
        fill: item.style.getPropertyValue('--live-turn'),
        hand: item.style.getPropertyValue('--hand-turn'),
        count: item.querySelector('.hub b').textContent,
      };
    });

    return {
      seekable,
      hasHand: Boolean(first.querySelector('.hand')),
      snapshots,
      finals,
    };
  });

  assert.equal(motion.seekable, true, 'the clock exposes a deterministic animation clock');
  assert.equal(motion.hasHand, true, 'the dial has a scanner hand');
  assert.deepEqual(
    motion.snapshots.map(({ locked, fill, count, settled }) => ({ locked, fill, count, settled })),
    [
      { locked: 0, fill: '0deg', count: '0', settled: false },
      { locked: 1, fill: '90deg', count: '1', settled: false },
      { locked: 2, fill: '180deg', count: '2', settled: false },
      { locked: 3, fill: '270deg', count: '3', settled: true },
    ],
    'segments lock one at a time and the counter follows each impact',
  );
  assert.notEqual(
    motion.snapshots[0].hand,
    motion.snapshots[1].hand,
    'the scanner hand travels before stopping at the filled edge',
  );
  assert.deepEqual(
    motion.finals,
    [
      { fill: '270deg', hand: '270deg', count: '3' },
      { fill: '300deg', hand: '300deg', count: '5' },
      { fill: '315deg', hand: '315deg', count: '7' },
    ],
    '4, 6 and 8 segment clocks land on their exact boundaries',
  );

  const reduced = await browser.newPage();
  await reduced.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await reduced.setContent(
    `<!doctype html><meta charset="utf-8">${filled(states[0])}`,
    { waitUntil: 'load' },
  );

  const still = await reduced.evaluate(() => {
    const unit = document.querySelector('.vld-clock .unit');
    return {
      count: unit.querySelector('.hub b').textContent,
      fill: unit.style.getPropertyValue('--live-turn'),
      hand: unit.style.getPropertyValue('--hand-turn'),
      settled: unit.classList.contains('is-settled'),
    };
  });

  assert.deepEqual(
    still,
    { count: '3', fill: '270deg', hand: '270deg', settled: true },
    'reduced motion renders the final clock without playing the impacts',
  );

  console.log('✓ clock motion: stepped locks, scanner hand, exact 4/6/8 boundaries');
} finally {
  await browser.close();
}
