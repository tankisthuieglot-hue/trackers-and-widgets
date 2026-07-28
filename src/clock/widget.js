var unit = root.querySelector('.unit');
var counter = unit.querySelector('.hub b');
var finalFilled = parseInt(counter.textContent, 10);
var totalSegments = parseInt(unit.className.match(/\bs-(\d+)\b/)?.[1], 10);
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

var LEAD = 110;
var STEP = 125;
var IMPACT = 72;
var SETTLE = 110;
var duration = LEAD + finalFilled * STEP + SETTLE;
var frameId = 0;
var startedAt = 0;
var runId = 0;
var autoTimer = 0;
var autoObserver = null;

var valid = [4, 6, 8].includes(totalSegments)
  && !isNaN(finalFilled)
  && finalFilled >= 0
  && finalFilled <= totalSegments;

if (valid) {
  if (reduced || finalFilled === 0) {
    settle();
  } else {
    queueAutomaticRun();
  }
}

/*
 * The GIF recorder seeks this same timeline frame by frame. SillyTavern never
 * calls it; the live widget advances through requestAnimationFrame below.
 */
root.vldSeek = function (ms) {
  cancelAutomaticStart();
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  prepare();
  paintAt(Number(ms) || 0);
};

/*
 * JS-support can revive the script while the streamed message is still being
 * morphed. Wait for a short quiet window so the one-shot locks happen after the
 * final marker has become a stable widget.
 */
function queueAutomaticRun() {
  var message = root.closest('.mes_text');
  if (!message || typeof MutationObserver !== 'function') {
    run();
    return;
  }

  function armAfterQuiet() {
    if (autoTimer) clearTimeout(autoTimer);
    root.dataset.clockAwaitingSettle = '1';
    autoTimer = setTimeout(function () {
      cancelAutomaticStart();
      if (root.isConnected) run();
    }, 180);
  }

  autoObserver = new MutationObserver(armAfterQuiet);
  autoObserver.observe(message, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  armAfterQuiet();
}

function cancelAutomaticStart() {
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = 0;
  if (autoObserver) autoObserver.disconnect();
  autoObserver = null;
  delete root.dataset.clockAwaitingSettle;
}

function run() {
  if (!valid || reduced || finalFilled === 0) return;
  if (frameId) cancelAnimationFrame(frameId);

  runId += 1;
  root.dataset.clockRun = String(runId);
  startedAt = performance.now();
  prepare();
  paintAt(0);
  frameId = requestAnimationFrame(step);
}

function step(now) {
  if (!root.isConnected) {
    frameId = 0;
    return;
  }

  var elapsed = now - startedAt;
  paintAt(elapsed);

  if (elapsed < duration) {
    frameId = requestAnimationFrame(step);
  } else {
    frameId = 0;
  }
}

function prepare() {
  unit.classList.add('is-running');
  unit.classList.remove('is-settled');
}

function paintAt(ms) {
  var time = Math.max(0, Math.min(ms, duration));
  var elapsed = Math.max(0, time - LEAD);
  var locked = Math.min(finalFilled, Math.floor(elapsed / STEP));
  var phase = locked < finalFilled
    ? Math.max(0, Math.min(1, (elapsed - locked * STEP) / STEP))
    : 0;
  var eased = 1 - Math.pow(1 - phase, 3);
  var segmentAngle = 360 / totalSegments;
  var fillAngle = locked * segmentAngle;
  var handAngle = locked < finalFilled
    ? (locked + eased) * segmentAngle
    : fillAngle;

  var sinceImpact = elapsed - locked * STEP;
  var impact = locked > 0 && sinceImpact >= 0 && sinceImpact < IMPACT
    ? 1 - sinceImpact / IMPACT
    : 0;

  unit.dataset.locked = String(locked);
  unit.style.setProperty('--live-turn', angle(fillAngle));
  unit.style.setProperty('--hand-turn', angle(handAngle));
  unit.style.setProperty('--impact', impact.toFixed(3));
  unit.style.setProperty('--kick-y', (impact * 1.8).toFixed(2) + 'px');
  unit.style.setProperty('--kick-r', (impact * -.85).toFixed(2) + 'deg');
  counter.textContent = String(locked);

  if (time >= duration) settle();
}

function settle() {
  if (!valid) return;
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;

  var finalAngle = 360 * finalFilled / totalSegments;
  unit.dataset.locked = String(finalFilled);
  unit.style.setProperty('--live-turn', angle(finalAngle));
  unit.style.setProperty('--hand-turn', angle(finalAngle));
  unit.style.setProperty('--impact', '0');
  unit.style.setProperty('--kick-y', '0px');
  unit.style.setProperty('--kick-r', '0deg');
  counter.textContent = String(finalFilled);
  unit.classList.remove('is-running');
  unit.classList.add('is-settled');
}

function angle(value) {
  return String(Math.round(value * 1000) / 1000) + 'deg';
}
