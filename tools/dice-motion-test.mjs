import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { loadTrackers, renderWidget } from './lib.mjs';

const BROWSER = process.env.VLD_BROWSER
  ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const dice = loadTrackers().find((t) => t.name === 'dice');
const lang = dice.lang.en;
const values = lang.example;

const widget = renderWidget(dice, lang.chrome).replace(/\$(\d+)/g, (_, n) => {
  const field = dice.fields[Number(n) - 1];
  return field ? String(values[field.key] ?? '') : '';
});

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: true,
  args: ['--hide-scrollbars'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 460, height: 340 });
  await page.setContent(`<!doctype html><meta charset="utf-8">${widget}`, { waitUntil: 'load' });

  const start = await page.evaluate(() => {
    const root = document.querySelector('.vld-dice');
    return {
      rolling: root.querySelector('.throw').classList.contains('is-rolling'),
      run: Number(root.dataset.diceRun || 0),
      final: root.querySelector('.roll').dataset.final,
      current: root.querySelector('.roll').textContent,
      transform: root.querySelector('.die').style.transform,
      readOpacity: getComputedStyle(root.querySelector('.read')).opacity,
      verdictOpacity: getComputedStyle(root.querySelector('.verdict')).opacity,
    };
  });

  assert.equal(start.rolling, true, 'the first throw starts when the widget mounts');
  assert.equal(start.run, 1, 'mount starts exactly one throw');
  assert.equal(start.final, values.R, 'the model-provided result is preserved separately');
  const startX = Number(/translate3d\(([-\d.]+)px/.exec(start.transform)?.[1]);
  assert.ok(Math.abs(startX) <= 10, 'the die tumbles inside its slot instead of entering from the side');
  assert.equal(start.readOpacity, '1', 'the action stays visible during the throw');
  assert.equal(start.verdictOpacity, '0', 'only the unresolved verdict waits for the landing');

  await new Promise((resolve) => setTimeout(resolve, 1800));

  const landed = await page.evaluate(() => {
    const root = document.querySelector('.vld-dice');
    const stage = root.querySelector('.arena');
    return {
      settled: root.querySelector('.throw').classList.contains('is-settled'),
      rolling: root.querySelector('.throw').classList.contains('is-rolling'),
      result: root.querySelector('.roll').textContent,
      bounces: Number(stage.dataset.bounces || 0),
      verdictOpacity: getComputedStyle(root.querySelector('.verdict')).opacity,
    };
  });

  assert.equal(landed.settled, true, 'the die reaches a settled state');
  assert.equal(landed.rolling, false, 'rolling state is cleared on landing');
  assert.equal(landed.result, values.R, 'landing restores the model-provided result');
  assert.equal(landed.bounces, 2, 'the visual physics performs two impacts');
  assert.equal(landed.verdictOpacity, '1', 'the verdict is revealed after landing');

  await page.click('.vld-dice .die');
  const replay = await page.evaluate(() => {
    const root = document.querySelector('.vld-dice');
    return {
      rolling: root.querySelector('.throw').classList.contains('is-rolling'),
      run: Number(root.dataset.diceRun || 0),
      final: root.querySelector('.roll').dataset.final,
    };
  });

  assert.equal(replay.rolling, true, 'clicking the die replays the throw');
  assert.equal(replay.run, 2, 'replay starts one new run');
  assert.equal(replay.final, values.R, 'replay cannot change the model-provided result');

  const lateRevival = await browser.newPage();
  await lateRevival.evaluateOnNewDocument(() => {
    const listeners = {};
    const eventSource = {
      on(name, listener) {
        (listeners[name] ??= []).push(listener);
      },
      removeListener(name, listener) {
        listeners[name] = (listeners[name] ?? []).filter((item) => item !== listener);
      },
      emit(name) {
        for (const listener of [...(listeners[name] ?? [])]) listener();
      },
    };

    window.__vldTestEvents = eventSource;
    window.SillyTavern = {
      getContext() {
        return {
          streamingProcessor: {},
          eventSource,
          eventTypes: {
            GENERATION_ENDED: 'generation_ended',
            GENERATION_STOPPED: 'generation_stopped',
          },
        };
      },
    };
  });
  await lateRevival.goto('about:blank');
  await lateRevival.setContent(
    `<!doctype html><meta charset="utf-8"><div class="mes_text">${widget}</div>`,
    { waitUntil: 'load' },
  );

  // JS-support revives the inline script after GENERATION_ENDED has already
  // fired. The final message can still morph a few times around that revival.
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 70));
    await lateRevival.evaluate((token) => {
      const pulse = document.createElement('i');
      pulse.textContent = token;
      document.querySelector('.mes_text').appendChild(pulse);
    }, String(i));
  }

  const whileMorphing = await lateRevival.evaluate(() => {
    const root = document.querySelector('.vld-dice');
    return {
      run: Number(root.dataset.diceRun || 0),
    };
  });

  assert.equal(whileMorphing.run, 0, 'final message morphs do not spend the automatic throw');

  await new Promise((resolve) => setTimeout(resolve, 260));
  const afterSettling = await lateRevival.evaluate(() => {
    const root = document.querySelector('.vld-dice');
    return {
      run: Number(root.dataset.diceRun || 0),
      rolling: root.querySelector('.throw').classList.contains('is-rolling'),
    };
  });

  assert.equal(afterSettling.run, 1, 'a late-revived widget throws after its message settles');
  assert.equal(afterSettling.rolling, true, 'the post-stream throw is visible after the answer completes');

  const reduced = await browser.newPage();
  await reduced.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await reduced.setContent(`<!doctype html><meta charset="utf-8">${widget}`, { waitUntil: 'load' });

  const still = await reduced.evaluate(() => {
    const root = document.querySelector('.vld-dice');
    return {
      rolling: root.querySelector('.throw').classList.contains('is-rolling'),
      settled: root.querySelector('.throw').classList.contains('is-settled'),
      result: root.querySelector('.roll').textContent,
      verdictOpacity: getComputedStyle(root.querySelector('.verdict')).opacity,
    };
  });

  assert.equal(still.rolling, false, 'reduced motion does not start the throw');
  assert.equal(still.settled, true, 'reduced motion starts at the resting state');
  assert.equal(still.result, values.R, 'reduced motion keeps the final result');
  assert.equal(still.verdictOpacity, '1', 'reduced motion keeps the verdict readable');

  console.log('✓ dice motion: throw, two impacts, final result, replay');
} finally {
  await browser.close();
}
