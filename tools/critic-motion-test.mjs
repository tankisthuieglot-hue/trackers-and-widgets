import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { loadTracker, renderWidget } from './lib.mjs';

const BROWSER = process.env.VLD_BROWSER
  ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

let critic = null;
try {
  critic = loadTracker('critic');
} catch {
  // The RED run lands here until the preview exists.
}

assert.ok(critic, 'the unsolicited critics preview exists');

const lang = critic.lang.en;

function filled(values) {
  return renderWidget(critic, lang.chrome).replace(/\$(\d+)/g, (_, number) => {
    const field = critic.fields[Number(number) - 1];
    return field ? String(values[field.key] ?? '') : '';
  });
}

const threeCritics = {
  N1: 'Gordon Ramsay',
  K1: 'public',
  T1: 'chef with no patience left',
  V1: '3',
  C1: 'That plan is raw, and somehow the door is on fire.',
  N2: 'Lelouch Lamperouge',
  K2: 'anime',
  T2: 'exiled prince and strategist',
  V2: '8',
  C2: 'Crude, but every witness chose the outcome you wanted.',
  N3: 'Diogenes',
  K3: 'history',
  T3: 'professional public nuisance',
  V3: '10',
  C3: 'At last, a decision with less dignity and more honesty.',
};

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: true,
  args: ['--hide-scrollbars'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 760, height: 720 });
  await page.setContent(`<!doctype html><meta charset="utf-8">${filled(threeCritics)}`, {
    waitUntil: 'load',
  });

  const state = await page.evaluate(() => {
    const root = document.querySelector('.vld-critic');
    const cards = [...root.querySelectorAll('.critic-card:not(.is-empty)')];
    const atStart = [];
    const atEnd = [];

    root.vldSeek?.(0);
    cards.forEach((card) => atStart.push(card.querySelector('.score-number').textContent));
    root.vldSeek?.(2600);
    cards.forEach((card) => atEnd.push(card.querySelector('.score-number').textContent));

    return {
      seekable: typeof root.vldSeek === 'function',
      count: cards.length,
      atStart,
      atEnd,
      comments: cards.map((card) => card.querySelector('.comment').textContent),
      kinds: cards.map((card) => card.dataset.kind),
      animations: cards.map((card) => getComputedStyle(card).animationName),
      aggregate: root.querySelector('.aggregate, .average, .jury'),
    };
  });

  assert.equal(state.seekable, true, 'the preview exposes a deterministic animation clock');
  assert.equal(state.count, 3, 'one interruption can contain three independent critics');
  assert.deepEqual(state.atStart, ['0', '0', '0'], 'every score starts at zero');
  assert.deepEqual(state.atEnd, ['3', '8', '10'], 'every score lands on its own supplied value');
  assert.deepEqual(
    state.comments,
    [threeCritics.C1, threeCritics.C2, threeCritics.C3],
    'each critic keeps an independent comment',
  );
  assert.deepEqual(
    state.kinds,
    ['public', 'anime', 'history'],
    'public, anime and historical critics receive distinct visual treatments',
  );
  assert.equal(new Set(state.animations).size, 3, 'the three critic types enter differently');
  assert.equal(state.aggregate, null, 'critics never become a jury or receive an average score');

  const twoCritics = await browser.newPage();
  await twoCritics.setContent(
    `<!doctype html><meta charset="utf-8">${filled({
      ...threeCritics,
      N3: '', K3: '', T3: '', V3: '', C3: '',
    })}`,
    { waitUntil: 'load' },
  );
  assert.equal(
    await twoCritics.evaluate(() =>
      document.querySelectorAll('.vld-critic .critic-card:not(.is-empty)').length),
    2,
    'the optional third critic disappears without leaving a blank card',
  );

  const reduced = await browser.newPage();
  await reduced.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await reduced.setContent(`<!doctype html><meta charset="utf-8">${filled(threeCritics)}`, {
    waitUntil: 'load',
  });

  const still = await reduced.evaluate(() => ({
    scores: [...document.querySelectorAll('.vld-critic .score-number')]
      .map((node) => node.textContent),
    animations: [...document.querySelectorAll('.vld-critic .critic-card')]
      .map((card) => getComputedStyle(card).animationName),
  }));

  assert.deepEqual(still.scores, ['3', '8', '10'], 'reduced motion shows final scores immediately');
  assert.deepEqual(still.animations, ['none', 'none', 'none'], 'reduced motion removes entrances');

  console.log('✓ critics preview: 2–3 independent critics, distinct entrances, no jury score');
} finally {
  await browser.close();
}
