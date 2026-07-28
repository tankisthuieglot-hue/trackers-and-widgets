import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { loadTracker, renderWidget } from './lib.mjs';

const BROWSER = process.env.VLD_BROWSER
  ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

let relationship = null;
try {
  relationship = loadTracker('rel');
} catch {
  // The first RED run lands here: the preview tracker does not exist yet.
}

assert.ok(relationship, 'the relationship pulse-card tracker exists');

const lang = relationship.lang.en;

function filled(values) {
  return renderWidget(relationship, lang.chrome).replace(/\$(\d+)/g, (_, number) => {
    const field = relationship.fields[Number(number) - 1];
    return field ? String(values[field.key] ?? '') : '';
  });
}

const friendship = {
  N: 'Marisha',
  Q: 'She still saves you a seat.',
  S: 'close friend',
  C: 'black coat, wet gloves',
  E1: 'friendship', V1: '38',
  E2: 'trust', V2: '21',
  E3: 'interest', V3: '12',
};

const love = {
  N: 'Irene',
  Q: 'She is hopelessly in love with you.',
  S: 'partner',
  C: 'white shirt, loosened tie',
  E1: 'love', V1: '86',
  E2: 'trust', V2: '72',
  E3: 'friendship', V3: '64',
};

const fear = {
  N: 'Quartermaster Vale',
  Q: 'You terrify him.',
  S: 'former ally',
  C: 'uniform coat buttoned to the throat',
  E1: 'fear', V1: '91',
  E2: 'hostility', V2: '44',
  E3: 'trust', V3: '8',
};

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: true,
  args: ['--hide-scrollbars'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1180, height: 520 });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><div class="mes_text">${[friendship, love, fear].map(filled).join('')}</div>`,
    { waitUntil: 'load' },
  );

  const state = await page.evaluate(() => {
    const roots = [...document.querySelectorAll('.vld-rel')];
    const first = roots[0];
    const host = document.querySelector('.vld-rel.deck-host');
    const cards = host
      ? [...host.querySelectorAll('.deck-pages > .card')]
      : roots.map((item) => item.querySelector('.card'));
    const tabs = host ? [...host.querySelectorAll('.deck-tab')] : [];
    const snapshots = [];
    const comments = [];

    for (const time of [0, 500, 2000]) {
      first.vldSeek?.(time);
      snapshots.push(
        [...cards[0].querySelectorAll('.signal .value')].map((value) => value.textContent),
      );
      comments.push(cards[0].querySelector('.comment')?.textContent ?? '');
    }

    roots.forEach((root) => root.vldSeek?.(2000));

    const friendSignal = cards[0].querySelector('.signal.e-friendship');
    const loveSignal = cards[1].querySelector('.signal.e-love');
    const fearSignal = cards[2].querySelector('.signal.e-fear');

    return {
      seekable: typeof first.vldSeek === 'function',
      decked: Boolean(host),
      tabCount: tabs.length,
      pageCount: cards.length,
      activeName: cards.find((item) => !item.hidden)?.querySelector('h3').textContent ?? '',
      signalCount: cards[0].querySelectorAll('.signal:not(.is-empty)').length,
      snapshots,
      comments,
      oldCaptionPresent: document.body.textContent.includes('HOW THEY REGARD YOU'),
      orbitCount: cards[0].querySelectorAll('.orbit').length,
      friendLow: friendSignal.classList.contains('band-low'),
      lovePeak: loveSignal.classList.contains('band-peak'),
      heartVisible: cards[1].querySelector('.heart').classList.contains('is-visible'),
      fearPeak: fearSignal.classList.contains('band-peak'),
      fearCard: cards[2].classList.contains('mood-fear'),
      loveAnimation: getComputedStyle(loveSignal).animationName,
      fearAnimation: getComputedStyle(fearSignal).animationName,
      fearLabel: fearSignal.querySelector('.label').textContent,
      wearing: cards[2].querySelector('.clothes .value').textContent,
      friendNameColor: getComputedStyle(cards[0].querySelector('h3')).color,
      loveNameColor: getComputedStyle(cards[1].querySelector('h3')).color,
      fearNameColor: getComputedStyle(cards[2].querySelector('h3')).color,
    };
  });

  assert.equal(state.seekable, true, 'the preview exposes a deterministic animation clock');
  assert.equal(state.decked, true, 'several NPC markers merge into one deck');
  assert.equal(state.tabCount, 3, 'the deck exposes one name tab per NPC');
  assert.equal(state.pageCount, 3, 'the deck keeps every NPC card');
  assert.equal(state.activeName, friendship.N, 'the first NPC starts in front');
  assert.equal(state.signalCount, 3, 'one NPC card renders exactly three emotion slots');
  assert.deepEqual(
    state.snapshots,
    [
      ['0', '0', '0'],
      ['27', '12', '5'],
      ['38', '21', '12'],
    ],
    'the three values count up and land on the model-provided percentages',
  );
  assert.deepEqual(
    state.comments,
    ['', friendship.Q, friendship.Q],
    'the AI comment types in and replaces the generic caption',
  );
  assert.equal(state.oldCaptionPresent, false, 'the generic how-they-regard-you caption is gone');
  assert.equal(state.orbitCount, 3, 'the identity seal carries one orbit per emotion');
  assert.equal(state.friendLow, true, 'friendship 10–50 uses the restrained green band');
  assert.equal(state.lovePeak, true, 'high love reaches its strongest visual band');
  assert.equal(state.heartVisible, true, 'love adds a heart above the NPC name');
  assert.equal(state.fearPeak, true, 'high fear reaches its strongest visual band');
  assert.equal(state.fearCard, true, 'dominant fear changes the whole card treatment');
  assert.notEqual(
    state.fearAnimation,
    state.loveAnimation,
    'fear and love never reuse the same animation',
  );
  assert.equal(state.fearLabel, 'fear', 'emotion labels follow the selected widget language');
  assert.equal(
    state.wearing,
    fear.C,
    'clothing belongs to the NPC and remains readable',
  );
  assert.equal(state.friendNameColor, 'rgb(86, 190, 133)', 'friendship colors the NPC name green');
  assert.equal(state.loveNameColor, 'rgb(225, 76, 103)', 'love colors the NPC name red');
  assert.equal(state.fearNameColor, 'rgb(157, 216, 231)', 'fear colors the NPC name icy blue');

  await page.click('.deck-tab:nth-child(3)');
  const switched = await page.evaluate(() => ({
    active: document.querySelector('.deck-pages > .card:not([hidden]) h3')?.textContent ?? '',
    selected: document.querySelector('.deck-tab[aria-selected="true"]')?.textContent ?? '',
  }));
  assert.deepEqual(
    switched,
    { active: fear.N, selected: fear.N },
    'clicking an NPC tab brings the matching card to the front',
  );

  const postInserted = await browser.newPage();
  await postInserted.setContent('<!doctype html><meta charset="utf-8"><div class="mes_text"></div>');
  const postInsertedState = await postInserted.evaluate((html) => {
    const message = document.querySelector('.mes_text');
    message.innerHTML = html;
    message.querySelectorAll('script').forEach((old) => {
      const fresh = document.createElement('script');
      fresh.textContent = old.textContent;
      old.replaceWith(fresh);
    });
    document.querySelectorAll('.vld-rel').forEach((root) => root.vldSeek?.(2000));
    document.querySelectorAll('.deck-tab')[2]?.click();
    return {
      tabs: document.querySelectorAll('.deck-tab').length,
      values: [...document.querySelectorAll('.deck-pages > .card:not([hidden]) .signal .value')]
        .map((value) => value.textContent),
    };
  }, [friendship, love, fear].map(filled).join(''));

  assert.deepEqual(
    postInsertedState,
    { tabs: 3, values: ['91', '44', '8'] },
    'the deck initializes every NPC when JavaScript support runs after the full message is inserted',
  );

  const reduced = await browser.newPage();
  await reduced.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await reduced.setContent(
    `<!doctype html><meta charset="utf-8">${filled(fear)}`,
    { waitUntil: 'load' },
  );

  const still = await reduced.evaluate(() => ({
    values: [...document.querySelectorAll('.vld-rel .signal .value')]
      .map((value) => value.textContent),
    animation: getComputedStyle(document.querySelector('.vld-rel .card')).animationName,
  }));

  assert.deepEqual(still.values, ['91', '44', '8'], 'reduced motion shows final values immediately');
  assert.equal(still.animation, 'none', 'reduced motion removes the fear shake');

  console.log('✓ relationship preview: three NPC emotions, love heart, distinct fear treatment');
} finally {
  await browser.close();
}
