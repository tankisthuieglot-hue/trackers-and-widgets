import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {
  loadTracker, markerRegExp, renderWidget,
} from './lib.mjs';

const BROWSER = process.env.VLD_BROWSER
  ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const phase = (name) => console.log(`[system-test] ${name}`);

let system = null;
try {
  system = loadTracker('system');
} catch {
  // RED until the tracker contract and widget exist.
}

assert.ok(system, 'the System tracker exists');

const lang = system.lang.en;

function filled(values) {
  return renderWidget(system, lang.chrome).replace(/\$(\d+)/g, (_, number) => {
    const field = system.fields[Number(number) - 1];
    return field ? String(values[field.key] ?? '') : '';
  });
}

const snapshot = {
  M: 'xp',
  T: 'Experience acquired',
  D: 'The cathedral guardian fell before the bell completed its final toll.',
  L: '7',
  X: '420',
  G: '600',
  I: 'Ashen Key~1~rare;Glass Vial~3~common;Bent Coin~1~strange',
  K: 'Ember Script~fire~II;Frost Step~ice~I;Storm Lash~storm~III;Veil Sight~shadow~I;Sanctuary~holy~II',
  C: 'Cinder Mark~burn;Venom Trace~poison;White Numbness~freeze',
  P: '+120 XP',
  A: '120',
  FX: 'gold',
};

const sync = {
  ...snapshot,
  M: 'sync',
  T: '',
  D: '',
  P: '',
  A: '',
  FX: 'neutral',
};

const replacement = renderWidget(system, lang.chrome);
const unsafeMarker = '[[VLD_SYSTEM|M=loot|T=Found|D=Unsafe|L=7|X=420|G=600'
  + '|I=<img src=x onerror=alert(1)>|K=|C=|P=bad|A=1|FX=gold]]';
const unsafe = unsafeMarker.replace(markerRegExp(system.tag, system.fields), replacement);
assert.equal(unsafe.includes('<img'), false, 'list captures reject HTML opening brackets');
assert.equal(unsafe.includes('onerror'), false, 'unsafe list payload never reaches replacement HTML');

const badNumberMarker = '[[VLD_SYSTEM|M=xp|T=Experience|D=Bad number|L=7|X=forty'
  + '|G=600|I=|K=|C=|P=|A=none|FX=gold]]';
const badNumber = markerRegExp(system.tag, system.fields).exec(badNumberMarker);
assert.equal(badNumber?.[5], '', 'counter fields discard words instead of feeding them to JS');
assert.equal(badNumber?.[11], '', 'optional counter fields also discard words');

const invalidModeMarker = '[[VLD_SYSTEM|M=popup|T=Bad mode|D=Must stay quiet|L=7|X=420'
  + '|G=600|I=|K=|C=|P=|A=|FX=rainbow]]';
const invalidMode = invalidModeMarker.replace(
  markerRegExp(system.tag, system.fields),
  replacement,
);

phase('launch browser');
const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: true,
  args: ['--hide-scrollbars', '--disable-gpu'],
});

try {
  phase('create XP page');
  const page = await browser.newPage();
  await page.setViewport({ width: 760, height: 820 });
  await page.setContent(`<!doctype html><meta charset="utf-8">${filled(snapshot)}`, {
    waitUntil: 'load',
  });

  phase('inspect initial state');
  const initial = await page.evaluate(() => {
    const root = document.querySelector('.vld-system');
    root.vldSeek?.(0);
    return {
      seekable: typeof root.vldSeek === 'function',
      actionable: typeof root.vldSystemAct === 'function',
      open: root.classList.contains('is-open'),
      xp: root.querySelector('.xp-current')?.textContent,
      rings: root.querySelectorAll('.system-ring').length,
      tabs: root.querySelectorAll('[data-system-tab]').length,
      layers: root.querySelectorAll('.system-layer').length,
      shutters: root.querySelectorAll('.event-shutter').length,
      rituals: root.querySelectorAll('.event-ritual > [class*="ritual-"]').length,
      activeRitual: root.querySelector('.event-ritual')?.dataset.active,
      modules: root.querySelectorAll('.tab-module').length,
      mode: root.dataset.mode,
      fx: root.dataset.fx,
    };
  });

  assert.deepEqual(initial, {
    seekable: true,
    actionable: true,
    open: false,
    xp: '300',
    rings: 3,
    tabs: 4,
    layers: 3,
    shutters: 2,
    rituals: 6,
    activeRitual: 'xp',
    modules: 4,
    mode: 'xp',
    fx: 'gold',
  }, 'an XP event begins as a layered physical mechanism with its own ritual');

  phase('seek XP animation');
  const finalXp = await page.evaluate(() => {
    const root = document.querySelector('.vld-system');
    root.vldSeek(2400);
    return {
      xp: root.querySelector('.xp-current').textContent,
      angle: root.querySelector('.xp-orbit').style.getPropertyValue('--xp-angle'),
      settled: root.classList.contains('is-settled'),
      ritualComplete: root.classList.contains('is-ritual-complete'),
      eyeAnimation: getComputedStyle(root.querySelector('.core-eye')).animationName,
    };
  });
  assert.deepEqual(
    finalXp,
    {
      xp: '420',
      angle: '252deg',
      settled: true,
      ritualComplete: true,
      eyeAnimation: 'vld-system-eye-idle',
    },
    'XP settles and the System eye enters its permanent idle focus',
  );

  phase('open system');
  await page.click('.system-trigger');
  await page.evaluate(() => document.getAnimations().forEach((animation) => {
    const end = animation.effect?.getComputedTiming().endTime;
    if (end && end !== Infinity) animation.finish();
  }));
  assert.equal(
    await page.evaluate(() => {
      const root = document.querySelector('.vld-system');
      return root.classList.contains('is-open') && root.classList.contains('is-unlatched');
    }),
    true,
    'tapping unlatches and deploys one continuous mechanism',
  );

  phase('test inventory tab hit target');
  const inventoryHit = await page.evaluate(() => {
    const tab = document.querySelector('[data-system-tab="inventory"]');
    const box = tab.getBoundingClientRect();
    return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      ?.closest?.('[data-system-tab]')?.dataset?.systemTab ?? '';
  });
  assert.equal(inventoryHit, 'inventory', 'the expanded tabs remain physically tappable');

  phase('open inventory');
  await page.click('[data-system-tab="inventory"]');
  const inventory = await page.evaluate(() => ({
    active: document.querySelector('.system-stage.is-active')?.dataset.stage,
    count: document.querySelectorAll('.inventory-item').length,
    rare: document.querySelectorAll('.inventory-item.rarity-rare').length,
    neutral: document.querySelectorAll('.inventory-item.rarity-neutral').length,
    prisms: document.querySelectorAll('.inventory-item .item-prism').length,
    lids: document.querySelectorAll('.inventory-item .item-lid').length,
  }));
  assert.deepEqual(
    inventory,
    { active: 'inventory', count: 3, rare: 1, neutral: 1, prisms: 3, lids: 3 },
    'inventory accepts arbitrary counts and safely defaults unknown rarity',
  );

  phase('inspect inventory item');
  await page.click('.inventory-item');
  assert.equal(
    await page.evaluate(() => {
      const item = document.querySelector('.inventory-item');
      return item.classList.contains('is-inspected')
        && item.getAttribute('aria-expanded') === 'true';
    }),
    true,
    'inventory glass prism rises and opens by tap',
  );

  phase('open skills');
  await page.click('[data-system-tab="skills"]');
  const skills = await page.evaluate(() => ({
    active: document.querySelector('.system-stage.is-active')?.dataset.stage,
    count: document.querySelectorAll('.skill-card').length,
    fire: document.querySelectorAll('.skill-card.element-fire').length,
    ice: document.querySelectorAll('.skill-card.element-ice').length,
    storm: document.querySelectorAll('.skill-card.element-storm').length,
    shadow: document.querySelectorAll('.skill-card.element-shadow').length,
    holy: document.querySelectorAll('.skill-card.element-holy').length,
    letters: document.querySelectorAll('.element-fire .skill-letter').length,
    lenses: document.querySelectorAll('.skill-card .skill-lens').length,
  }));
  assert.deepEqual(
    skills,
    {
      active: 'skills',
      count: 5,
      fire: 1,
      ice: 1,
      storm: 1,
      shadow: 1,
      holy: 1,
      letters: 12,
      lenses: 5,
    },
    'skill constellation assigns elemental treatments and wraps fire letters',
  );

  phase('inspect fire skill');
  await page.click('.element-fire');
  assert.equal(
    await page.evaluate(() => {
      const skill = document.querySelector('.element-fire');
      return skill.classList.contains('is-inspected')
        && skill.getAttribute('aria-expanded') === 'true';
    }),
    true,
    'elemental card opens its nested lens with touch feedback',
  );

  phase('open status');
  await page.click('[data-system-tab="status"]');
  const conditions = await page.evaluate(() => ({
    active: document.querySelector('.system-stage.is-active')?.dataset.stage,
    count: document.querySelectorAll('.condition-chip').length,
    burn: document.querySelectorAll('.condition-chip.effect-burn').length,
    poison: document.querySelectorAll('.condition-chip.effect-poison').length,
    freeze: document.querySelectorAll('.condition-chip.effect-freeze').length,
    scanner: Boolean(document.querySelector('.status-scanner')),
    satellites: document.querySelectorAll('.condition-satellite').length,
    threads: document.querySelectorAll('.condition-thread').length,
  }));
  assert.deepEqual(
    conditions,
    {
      active: 'status',
      count: 3,
      burn: 1,
      poison: 1,
      freeze: 1,
      scanner: true,
      satellites: 3,
      threads: 3,
    },
    'status view renders only the supplied objective conditions',
  );

  phase('test material parallax');
  const parallax = await page.evaluate(() => {
    const core = document.querySelector('.system-core');
    const box = core.getBoundingClientRect();
    core.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerType: 'mouse',
      clientX: box.right - 2,
      clientY: box.top + 3,
    }));
    return {
      x: core.style.getPropertyValue('--parallax-x'),
      y: core.style.getPropertyValue('--parallax-y'),
    };
  });
  assert.notEqual(parallax.x, '0px', 'pointer position drives horizontal material depth');
  assert.notEqual(parallax.y, '0px', 'pointer position drives vertical material depth');

  phase('close system');
  await page.click('.system-close');
  assert.equal(
    await page.evaluate(() => document.querySelector('.vld-system').classList.contains('is-open')),
    false,
    'the System closes reversibly',
  );

  phase('test sync marker');
  const syncPage = await browser.newPage();
  await syncPage.setContent(`<!doctype html><meta charset="utf-8">${filled(sync)}`, {
    waitUntil: 'load',
  });
  assert.equal(
    await syncPage.evaluate(() => getComputedStyle(document.querySelector('.vld-system')).display),
    'none',
    'sync markers carry state without creating visible chat clutter',
  );

  phase('test unknown mode fallback');
  const invalidPage = await browser.newPage();
  await invalidPage.setContent(`<!doctype html><meta charset="utf-8">${invalidMode}`, {
    waitUntil: 'load',
  });
  assert.deepEqual(
    await invalidPage.evaluate(() => {
      const root = document.querySelector('.vld-system');
      return {
        display: getComputedStyle(root).display,
        mode: root.dataset.mode,
        fx: root.dataset.fx,
      };
    }),
    { display: 'none', mode: 'sync', fx: 'neutral' },
    'invented mode and effect degrade to an invisible sync instead of a broken plate',
  );

  phase('test all six event rituals');
  for (const state of system.preview.slice(0, 6)) {
    const ritualPage = await browser.newPage();
    await ritualPage.setContent(`<!doctype html><meta charset="utf-8">${filled(state)}`, {
      waitUntil: 'load',
    });
    const ritual = await ritualPage.evaluate(() => {
      const root = document.querySelector('.vld-system');
      root.vldSeek?.(900);
      return {
        mode: root.dataset.mode,
        active: root.querySelector('.event-ritual')?.dataset.active,
        actors: root.querySelectorAll('.event-ritual > .is-active').length,
      };
    });
    assert.deepEqual(
      ritual,
      { mode: state.M, active: state.M, actors: 1 },
      `${state.M} activates exactly one dedicated event ritual`,
    );
    await ritualPage.close();
  }

  phase('test streaming-safe eye animation');
  const streaming = await browser.newPage();
  await streaming.setContent(
    `<!doctype html><meta charset="utf-8"><div class="mes_text">${filled(snapshot)}</div>`,
    { waitUntil: 'load' },
  );
  const streamedEye = await streaming.evaluate(async () => {
    const message = document.querySelector('.mes_text');
    for (let index = 0; index < 3; index += 1) {
      message.appendChild(document.createTextNode(' '));
      await new Promise((resolve) => setTimeout(resolve, 55));
    }
    await new Promise((resolve) => setTimeout(resolve, 2850));
    const root = document.querySelector('.vld-system');
    return {
      settled: root.classList.contains('is-settled'),
      animation: getComputedStyle(root.querySelector('.core-eye')).animationName,
    };
  });
  assert.deepEqual(
    streamedEye,
    { settled: true, animation: 'vld-system-eye-idle' },
    'after streaming goes quiet the eye keeps animating without a click',
  );

  phase('test reduced motion');
  const reduced = await browser.newPage();
  await reduced.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await reduced.setContent(`<!doctype html><meta charset="utf-8">${filled(snapshot)}`, {
    waitUntil: 'load',
  });
  const still = await reduced.evaluate(() => ({
    xp: document.querySelector('.xp-current')?.textContent,
    animation: getComputedStyle(document.querySelector('.system-core')).animationName,
  }));
  assert.deepEqual(
    still,
    { xp: '420', animation: 'none' },
    'reduced motion shows the final XP and removes the core entrance',
  );

  console.log('✓ System Core: sync, XP, inventory, elemental skills, status, touch');
} finally {
  await browser.close();
}
