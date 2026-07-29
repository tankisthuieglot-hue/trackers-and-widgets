import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { loadTracker, renderWidget } from './lib.mjs';

const BROWSER = process.env.VLD_BROWSER
  ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

let encounter = null;
try {
  encounter = loadTracker('encounter');
} catch {
  // The RED run lands here until the preview exists.
}

assert.ok(encounter, 'the encounter dossier preview exists');

const lang = encounter.lang.en;

function filled(values) {
  return renderWidget(encounter, lang.chrome).replace(/\$(\d+)/g, (_, number) => {
    const field = encounter.fields[Number(number) - 1];
    return field ? String(values[field.key] ?? '') : '';
  });
}

const newcomer = {
  M: 'intro',
  T: 'fantasy',
  K: 'creature',
  N: 'Ashfang',
  R: 'dire wolf',
  O: 'pack scout',
  D: 'charcoal fur, old spear wound, smoke on its breath',
  G: 'iron collar marked with three white cuts',
  A: 'tracks warm blood through stone walls',
  W: 'hesitates at open flame',
  F: 'the Black Pine pack',
  V: '7',
  X: 'clear',
};

const boss = {
  M: 'warning',
  T: 'fantasy',
  K: 'boss',
  N: 'The Bell-Bearer',
  R: 'unresolved colossus',
  O: 'cathedral executioner',
  D: 'a leaning silhouette wrapped in funeral cloth',
  G: 'a bronze bell chained where its head should be',
  A: 'each toll bends gravity toward the nave',
  W: '',
  F: '',
  V: '10',
  X: 'obscured',
};

const revealed = {
  M: 'reveal',
  T: 'fantasy',
  K: 'boss',
  N: 'Saint Orlov',
  R: 'revenant commander',
  O: 'warden of the drowned cathedral',
  D: 'the funeral cloth parts around a cracked silver mask',
  G: 'the Bell of Low Water and a rusted processional blade',
  A: 'pulls living bodies toward the sound of the bell',
  W: 'the cracked bell goes silent under running water',
  F: 'the Pale Choir',
  V: '10',
  X: 'clear',
};

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: true,
  args: ['--hide-scrollbars'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 760, height: 760 });
  await page.setContent(`<!doctype html><meta charset="utf-8">${filled(boss)}`, {
    waitUntil: 'load',
  });

  const initial = await page.evaluate(() => {
    const root = document.querySelector('.vld-encounter');
    root.vldSeek?.(0);
    return {
      seekable: typeof root.vldSeek === 'function',
      open: root.classList.contains('is-open'),
      name: root.querySelector('.subject-name').textContent,
      cipher: root.querySelector('.cipher-stream').textContent,
      blur: getComputedStyle(root.querySelector('.subject-portrait')).filter,
      redactions: root.querySelectorAll('.redaction, .black-bar').length,
      folioCover: Boolean(root.querySelector('.folio-cover')),
      clasp: Boolean(root.querySelector('.clasp')),
      brassCorners: root.querySelectorAll('.brass-corner').length,
      sheets: root.querySelectorAll('.folio-sheet').length,
      dust: root.querySelectorAll('.impact-dust i').length,
      artifacts: [
        '.threat-seal',
        '.faction-stamp',
        '.weapon-tag',
        '.ability-card',
        '.weakness-note',
        '.appearance-notes',
      ].every((selector) => Boolean(root.querySelector(selector))),
    };
  });

  assert.equal(initial.seekable, true, 'the dossier exposes a deterministic animation clock');
  assert.equal(initial.open, false, 'a new encounter starts as a compact closed folder');
  assert.notEqual(initial.name, boss.N, 'an obscured boss name starts encrypted');
  assert.notEqual(initial.blur, 'none', 'an obscured boss portrait stays blurred');
  assert.equal(initial.redactions, 0, 'boss information never falls back to black censor bars');
  assert.equal(initial.folioCover, true, 'the closed encounter is a physical folio cover');
  assert.equal(initial.clasp, true, 'the folio has a working metal clasp');
  assert.equal(initial.brassCorners, 4, 'four brass corners reinforce the leather cover');
  assert.equal(initial.sheets, 3, 'three genuinely separate paper sheets sit inside the folio');
  assert.ok(initial.dust >= 6, 'the folder impact has a visible dust burst');
  assert.equal(initial.artifacts, true, 'characteristics are distinct nested artifacts, not repeated rows');

  const cipherLater = await page.evaluate(() => {
    const root = document.querySelector('.vld-encounter');
    root.vldSeek(520);
    return root.querySelector('.cipher-stream').textContent;
  });
  assert.notEqual(cipherLater, initial.cipher, 'boss cipher symbols visibly cycle');

  await page.click('.folder-trigger');
  await page.evaluate(() => document.getAnimations().forEach((animation) => {
    const end = animation.effect?.getComputedTiming().endTime;
    if (end && end !== Infinity) animation.finish();
  }));
  const opened = await page.evaluate(() => {
    const root = document.querySelector('.vld-encounter');
    const cover = root.querySelector('.folio-cover');
    const sheets = Array.from(root.querySelectorAll('.folio-sheet'));
    return {
      open: root.classList.contains('is-open'),
      unlatched: root.classList.contains('is-unlatched'),
      expanded: root.querySelector('.folder-trigger').getAttribute('aria-expanded'),
      activePage: root.querySelector('.dossier-page.is-active')?.dataset.page,
      coverTransform: getComputedStyle(cover).transform,
      sheetTransforms: sheets.map((sheet) => getComputedStyle(sheet).transform),
    };
  });
  assert.equal(opened.open, true, 'tapping the folder opens the folio');
  assert.equal(opened.unlatched, true, 'the clasp visibly releases before the folio opens');
  assert.equal(opened.expanded, 'true', 'the trigger exposes the open state to assistive tech');
  assert.equal(opened.activePage, 'profile', 'the profile sheet starts on top');
  assert.notEqual(opened.coverTransform, 'none', 'the leather cover physically rotates in 3D');
  assert.equal(
    new Set(opened.sheetTransforms).size,
    3,
    'the three sheets fan to different physical positions',
  );

  const observedHit = await page.evaluate(() => {
    const tab = document.querySelector('[data-target="observed"]');
    const box = tab.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      target: hit?.closest?.('.dossier-tab')?.dataset?.target ?? '',
      tag: hit?.tagName ?? '',
      className: typeof hit?.className === 'string' ? hit.className : '',
    };
  });
  assert.equal(
    observedHit.target,
    'observed',
    `the expanded folder leaves its page tabs tappable; hit ${JSON.stringify(observedHit)}`,
  );

  await page.click('[data-target="observed"]');
  await page.click('[data-target="intel"]');
  const intel = await page.evaluate(() => ({
    activePage: document.querySelector('.dossier-page.is-active')?.dataset.page,
    activeTab: document.querySelector('.dossier-tab[aria-selected="true"]')?.dataset.target,
    weakness: document.querySelector('[data-field="weakness"] .field-value')?.textContent,
  }));
  assert.equal(intel.activePage, 'intel', 'tabs switch the visible dossier page');
  assert.equal(intel.activeTab, 'intel', 'the selected tab follows the visible page');
  assert.notEqual(intel.weakness, '', 'unknown boss intelligence remains a visible cipher');
  assert.notEqual(intel.weakness, boss.W, 'interaction does not invent or reveal an unknown weakness');

  const foldedWeakness = await page.evaluate(() => ({
    expanded: document.querySelector('.weakness-note').getAttribute('aria-expanded'),
    open: document.querySelector('.weakness-note').classList.contains('is-unfolded'),
  }));
  assert.deepEqual(
    foldedWeakness,
    { expanded: 'false', open: false },
    'the weakness begins as a folded note',
  );

  await page.click('.weakness-note');
  const unfoldedWeakness = await page.evaluate(() => ({
    expanded: document.querySelector('.weakness-note').getAttribute('aria-expanded'),
    open: document.querySelector('.weakness-note').classList.contains('is-unfolded'),
  }));
  assert.deepEqual(
    unfoldedWeakness,
    { expanded: 'true', open: true },
    'the weakness is a reversible nested reveal inside the dossier',
  );

  await page.click('.dossier-close');
  assert.equal(
    await page.evaluate(() => document.querySelector('.vld-encounter').classList.contains('is-open')),
    false,
    'the dossier can always be folded closed again',
  );

  const revealPage = await browser.newPage();
  await revealPage.setContent(`<!doctype html><meta charset="utf-8">${filled(revealed)}`, {
    waitUntil: 'load',
  });
  const reveal = await revealPage.evaluate((finalName) => {
    const root = document.querySelector('.vld-encounter');
    root.vldSeek(0);
    const before = root.querySelector('.subject-name').textContent;
    root.vldSeek(1800);
    const after = root.querySelector('.subject-name').textContent;
    return { before, after, finalName };
  }, revealed.N);
  assert.notEqual(reveal.before, revealed.N, 'a reveal starts with a decrypting identity');
  assert.equal(reveal.after, revealed.N, 'a self-contained reveal settles on its supplied identity');

  const normalPage = await browser.newPage();
  await normalPage.setContent(`<!doctype html><meta charset="utf-8">${filled(newcomer)}`, {
    waitUntil: 'load',
  });
  const normal = await normalPage.evaluate(() => {
    const root = document.querySelector('.vld-encounter');
    root.vldSeek(1800);
    return {
      name: root.querySelector('.subject-name').textContent,
      cipher: root.querySelectorAll('.persistent-cipher').length,
      mode: root.dataset.mode,
    };
  });
  assert.deepEqual(
    normal,
    { name: newcomer.N, cipher: 0, mode: 'intro' },
    'an ordinary newcomer stays readable and uses the intro event',
  );

  const reduced = await browser.newPage();
  await reduced.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await reduced.setContent(`<!doctype html><meta charset="utf-8">${filled(revealed)}`, {
    waitUntil: 'load',
  });
  const still = await reduced.evaluate(() => ({
    name: document.querySelector('.vld-encounter .subject-name').textContent,
    animation: getComputedStyle(document.querySelector('.vld-encounter .folder-object')).animationName,
  }));
  assert.equal(still.name, revealed.N, 'reduced motion shows the final revealed identity');
  assert.equal(still.animation, 'none', 'reduced motion removes the folder entrance');

  console.log('✓ encounter dossier: reversible folder, pages, boss cipher, self-contained reveal');
} finally {
  await browser.close();
}
