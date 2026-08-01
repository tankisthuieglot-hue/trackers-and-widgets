import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { loadTracker, renderWidget } from './lib.mjs';

const BROWSER = process.env.VLD_BROWSER
  ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const tracker = loadTracker('time');
const lang = tracker.lang.en;

function filled(values) {
  return renderWidget(tracker, lang.chrome).replace(/\$(\d+)/g, (_, number) => {
    const field = tracker.fields[Number(number) - 1];
    return field ? String(values[field.key] ?? '') : '';
  });
}

const states = [
  { H: '6', M: '12', D: '14 October', E: 'Dawn', N: 'The station is waking up.' },
  { H: '14', M: '30', D: '14 October', E: 'Six hours later', N: 'The long meeting finally ends.' },
  { H: '19', M: '5', D: '14 October', E: 'At dusk', N: 'The last tram leaves the square.' },
  { H: '23', M: '47', D: '15 October', E: 'Two hours later', N: 'The city has gone quiet.' },
];

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: true,
  args: ['--hide-scrollbars', '--disable-gpu'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 920 });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0}body{padding:14px 28px 22px}</style><div class="mes_text">${states.map(filled).join('')}</div>`,
    { waitUntil: 'load' },
  );

  const inspected = await page.evaluate(() => {
    const roots = [...document.querySelectorAll('.vld-time')];
    const last = roots.at(-1);
    const face = last.querySelector('.timepiece');

    last.vldSeek(0);
    const start = {
      hour: face.style.getPropertyValue('--hour-angle'),
      minute: face.style.getPropertyValue('--minute-angle'),
      settled: last.classList.contains('is-settled'),
    };

    last.vldSeek(1200);
    const crown = last.querySelector('.crown');
    const crownTransform = getComputedStyle(crown).transform;
    const crownMatrix = crownTransform === 'none' ? new DOMMatrix() : new DOMMatrix(crownTransform);
    const midway = {
      minute: parseFloat(face.style.getPropertyValue('--minute-angle')),
      crownRotation: Math.round(Math.atan2(crownMatrix.b, crownMatrix.a) * 180 / Math.PI),
      crownAnimations: crown.getAnimations({ subtree: true }).map((animation) => animation.animationName),
    };

    const watchBox = last.querySelector('.watch-body').getBoundingClientRect();
    last.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerType: 'mouse',
      clientX: watchBox.left + watchBox.width * .82,
      clientY: watchBox.top + watchBox.height * .28,
    }));
    const parallax = {
      x: last.style.getPropertyValue('--glass-x'),
      y: last.style.getPropertyValue('--glass-y'),
    };

    last.vldSeek(2600);
    const finish = {
      hour: face.style.getPropertyValue('--hour-angle'),
      minute: face.style.getPropertyValue('--minute-angle'),
      settled: last.classList.contains('is-settled'),
      time: last.querySelector('.digital-time').getAttribute('aria-label'),
      visibleDigits: [...last.querySelectorAll('.digit-window > b')].map((node) => node.textContent).join(''),
      drums: last.querySelectorAll('.digit-window').length,
    };

    last.vldTimeAct('open');
    document.getAnimations().forEach((animation) => {
      const end = animation.effect && animation.effect.getComputedTiming().endTime;
      if (Number.isFinite(end)) {
        animation.pause();
        animation.currentTime = end;
      }
    });
    const lidBox = last.querySelector('.watch-lid').getBoundingClientRect();
    const openBodyBox = last.querySelector('.watch-body').getBoundingClientRect();
    const openBowBox = last.querySelector('.bow').getBoundingClientRect();
    const openCrownBox = last.querySelector('.crown').getBoundingClientRect();
    const inscription = last.querySelector('.lid-inscription');
    const opened = inscription ? {
      root: last.classList.contains('is-open'),
      expanded: last.querySelector('.watch-trigger').getAttribute('aria-expanded'),
      hidden: inscription.getAttribute('aria-hidden'),
      date: inscription.querySelector('.moment-date').textContent,
      elapsed: inscription.querySelector('.moment-elapsed').textContent,
      note: inscription.querySelector('.moment-note').textContent,
      backface: getComputedStyle(inscription).backfaceVisibility,
      frontEtchOpacity: getComputedStyle(last.querySelector('.lid-etch')).opacity,
    } : null;
    last.vldTimeAct('close');

    return {
      count: roots.length,
      phases: roots.map((root) => [...root.classList].find((name) => name.startsWith('phase-'))),
      phaseIconsVisible: roots.map((root) => {
        const windowBox = root.querySelector('.phase-window').getBoundingClientRect();
        const icon = root.classList.contains('phase-night')
          ? root.querySelector('.phase-moon')
          : root.querySelector('.phase-sun');
        const iconBox = icon.getBoundingClientRect();
        return iconBox.right > windowBox.left
          && iconBox.left < windowBox.right
          && iconBox.bottom > windowBox.top
          && iconBox.top < windowBox.bottom;
      }),
      phaseIconOpacity: roots.map((root) => ({
        sun: Number(getComputedStyle(root.querySelector('.phase-sun')).opacity),
        moon: Number(getComputedStyle(root.querySelector('.phase-moon')).opacity),
        stars: Number(getComputedStyle(root.querySelector('.phase-stars')).opacity),
      })),
      hasLid: Boolean(last.querySelector('.watch-lid')),
      hasBalance: Boolean(last.querySelector('.balance-wheel')),
      hasPhaseDisc: Boolean(last.querySelector('.phase-disc')),
      hardwareMountedToBody: ['.bow', '.crown'].every((selector) =>
        last.querySelector(selector).parentElement === last.querySelector('.watch-body')),
      detachedCard: Boolean(last.querySelector('.moment-card')),
      start,
      midway,
      parallax,
      finish,
      opened,
      lidInViewport: lidBox.left >= 3 && lidBox.right <= innerWidth - 3,
      lidBounds: { left: lidBox.left, right: lidBox.right, viewport: innerWidth },
      openHardware: {
        bowFromBody: Math.round((openBowBox.left + openBowBox.width / 2) - (openBodyBox.left + openBodyBox.width / 2)),
        crownFromBody: Math.round((openCrownBox.left + openCrownBox.width / 2) - (openBodyBox.left + openBodyBox.width / 2)),
      },
      closed: !last.classList.contains('is-open'),
    };
  });

  assert.equal(inspected.count, 4, 'all four moments render');
  assert.deepEqual(
    inspected.phases,
    ['phase-dawn', 'phase-day', 'phase-dusk', 'phase-night'],
    'the hour selects dawn, day, dusk and night materials',
  );
  assert.equal(inspected.hasLid, true, 'the watch has a physical glass lid');
  assert.equal(inspected.hasBalance, true, 'the dial exposes a mechanical balance wheel');
  assert.equal(inspected.hasPhaseDisc, true, 'the day phase is a physical rotating enamel disc');
  assert.equal(
    inspected.hardwareMountedToBody,
    true,
    'bow and crown inherit lid-opening movement from the watch body instead of fighting it with another transform',
  );
  assert.deepEqual(inspected.phaseIconsVisible, [true, true, true, true], 'every phase keeps its celestial body inside the aperture');
  assert.deepEqual(
    inspected.phaseIconOpacity,
    [
      { sun: 1, moon: 0, stars: 0 },
      { sun: 1, moon: 0, stars: 0 },
      { sun: 1, moon: 0, stars: 0 },
      { sun: 0, moon: 1, stars: 0.78 },
    ],
    'the aperture shows one clear celestial scene instead of overlapping sun and moon blobs',
  );
  assert.equal(inspected.detachedCard, false, 'moment details live inside the lid, not in a detached HUD card');
  assert.deepEqual(
    inspected.start,
    { hour: '0deg', minute: '0deg', settled: false },
    'the deterministic timeline starts with both hands at twelve',
  );
  assert.deepEqual(
    inspected.finish,
    { hour: '353.5deg', minute: '282deg', settled: true, time: '23:47', visibleDigits: '2347', drums: 4 },
    'the hands and four rolling drums land on the exact supplied time',
  );
  assert.ok(inspected.midway.minute > 360, 'the minute hand performs a complete setting revolution');
  assert.equal(inspected.midway.crownRotation, 0, 'the crown body never rotates through neighbouring metal');
  assert.ok(
    inspected.midway.crownAnimations.includes('vld-time-crown-pull'),
    'the crown pulls out and clicks back without rotating its body',
  );
  assert.ok(
    inspected.midway.crownAnimations.includes('vld-time-crown-knurl'),
    'only the knurled crown texture moves while winding',
  );
  assert.notEqual(inspected.parallax.x, '', 'pointer movement offsets the glass reflection on its own layer');
  assert.notEqual(inspected.parallax.y, '', 'pointer movement offsets the glass reflection vertically');
  assert.deepEqual(
    inspected.opened,
    {
      root: true,
      expanded: 'true',
      hidden: 'false',
      date: '15 October',
      elapsed: 'Two hours later',
      note: 'The city has gone quiet.',
      backface: 'visible',
      frontEtchOpacity: '0',
    },
    'opening the lid reveals the complete engraved moment on its inner face',
  );
  assert.equal(
    inspected.lidInViewport,
    true,
    `the opened 3D lid stays inside a narrow chat viewport: ${JSON.stringify(inspected.lidBounds)}`,
  );
  assert.ok(
    Math.abs(inspected.openHardware.bowFromBody) <= 3,
    `the bow stays attached to the shifted watch body: ${JSON.stringify(inspected.openHardware)}`,
  );
  assert.ok(
    inspected.openHardware.crownFromBody >= 48 && inspected.openHardware.crownFromBody <= 60,
    `the crown stays attached beside the bow: ${JSON.stringify(inspected.openHardware)}`,
  );
  assert.equal(inspected.closed, true, 'the lid closes reversibly');

  const streaming = await browser.newPage();
  await streaming.setViewport({ width: 460, height: 780 });
  await streaming.setContent(
    `<!doctype html><meta charset="utf-8"><div class="mes_text">${filled(states[3])}</div>`,
    { waitUntil: 'load' },
  );
  await streaming.evaluate(async () => {
    const message = document.querySelector('.mes_text');
    for (let index = 0; index < 3; index += 1) {
      message.append(document.createTextNode(String(index)));
      await new Promise((resolve) => setTimeout(resolve, 70));
    }
    await new Promise((resolve) => setTimeout(resolve, 320));
  });
  const streamed = await streaming.evaluate(() => {
    const root = document.querySelector('.vld-time');
    const names = root.getAnimations({ subtree: true }).map((animation) => animation.animationName);
    return {
      run: Number(root.dataset.timeRun || 0),
      running: root.classList.contains('is-running'),
      alive: root.classList.contains('is-alive'),
      balanceAnimation: names.includes('vld-time-balance'),
    };
  });
  assert.equal(streamed.run, 1, 'streaming mutations produce one delayed animation run');
  assert.equal(streamed.running, true, 'the hand-set ritual starts after streaming becomes quiet');
  assert.equal(streamed.alive, true, 'the escapement remains alive after automatic startup');
  assert.equal(streamed.balanceAnimation, true, 'the balance wheel has a live Tavern animation');

  const malformed = await browser.newPage();
  await malformed.setContent(
    `<!doctype html><meta charset="utf-8">${filled({ H: '99', M: '88' })}`,
    { waitUntil: 'load' },
  );
  const safe = await malformed.evaluate(() => {
    const root = document.querySelector('.vld-time');
    root.vldSeek(Infinity);
    return {
      time: root.querySelector('.digital-time').getAttribute('aria-label'),
      phase: [...root.classList].find((name) => name.startsWith('phase-')),
      disabled: root.querySelector('.watch-trigger').disabled,
    };
  });
  assert.deepEqual(
    safe,
    { time: '23:59', phase: 'phase-night', disabled: true },
    'bad numbers clamp safely and an empty detail card cannot be opened',
  );

  const reduced = await browser.newPage();
  await reduced.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await reduced.setContent(
    `<!doctype html><meta charset="utf-8">${filled(states[3])}`,
    { waitUntil: 'load' },
  );
  const still = await reduced.evaluate(() => {
    const root = document.querySelector('.vld-time');
    const face = root.querySelector('.timepiece');
    return {
      hour: face.style.getPropertyValue('--hour-angle'),
      minute: face.style.getPropertyValue('--minute-angle'),
      settled: root.classList.contains('is-settled'),
      animations: root.getAnimations({ subtree: true }).length,
    };
  });
  assert.deepEqual(
    still,
    { hour: '353.5deg', minute: '282deg', settled: true, animations: 0 },
    'reduced motion renders the final readable time without movement',
  );

  console.log('✓ time motion: exact hands, four day phases, glass lid, streaming-safe escapement');
} finally {
  await browser.close();
}
