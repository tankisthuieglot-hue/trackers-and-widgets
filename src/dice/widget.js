var throwEl = root.querySelector('.throw');
var arena = root.querySelector('.arena');
var die = root.querySelector('.die');
var shadow = root.querySelector('.die-shadow');
var facets = root.querySelector('.facets');
var roll = root.querySelector('.roll');
var verdict = root.querySelector('.verdict');
var cost = root.querySelector('.cost');
var finalResult = parseInt(roll.dataset.final, 10);
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

var FIRST_IMPACT = 390;
var SECOND_IMPACT = 790;
var DURATION = 1080;
var frameId = 0;
var runId = 0;
var startedAt = 0;
var timeline = null;

if (!isNaN(finalResult)) {
  if (reduced) {
    settle();
  } else {
    queueAutomaticThrow();
    die.addEventListener('click', function (event) {
      event.preventDefault();
      runThrow();
    });
  }
}

/**
 * Recording uses the same clock as the live widget. In SillyTavern nobody calls
 * this method; record.mjs uses it to seek the physics instead of hoping that a
 * real-time requestAnimationFrame happens between two screenshots.
 */
root.vldDiceSeek = function (ms) {
  if (!timeline || reduced) return;
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  renderAt(Math.max(0, Number(ms) || 0));
};

root.vldDiceReplay = runThrow;

/**
 * During streaming the widget can exist before SillyTavern has finished the
 * message. Starting immediately spends the whole throw behind incoming text.
 * The host already exposes generation lifecycle events, so wait for the real
 * end instead of guessing with a timeout.
 */
function queueAutomaticThrow() {
  var context = null;

  try {
    if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
      context = window.SillyTavern.getContext();
    }
  } catch (error) {
    context = null;
  }

  if (!context || !context.streamingProcessor || !context.eventSource ||
    !context.eventTypes || !context.eventTypes.GENERATION_ENDED) {
    runThrow();
    return;
  }

  var source = context.eventSource;
  var ended = context.eventTypes.GENERATION_ENDED;
  var stopped = context.eventTypes.GENERATION_STOPPED;

  root.dataset.diceAwaitingStream = '1';

  function onGenerationDone() {
    source.removeListener(ended, onGenerationDone);
    if (stopped) source.removeListener(stopped, onGenerationDone);
    delete root.dataset.diceAwaitingStream;

    requestAnimationFrame(function () {
      if (root.isConnected) runThrow();
    });
  }

  source.on(ended, onGenerationDone);
  if (stopped) source.on(stopped, onGenerationDone);
}

/**
 * The result is immutable. A replay generates a new visual trajectory, while
 * data-final — the model's roll — stays untouched.
 */
function runThrow() {
  if (reduced || isNaN(finalResult)) return;
  if (frameId) cancelAnimationFrame(frameId);

  runId += 1;
  root.dataset.diceRun = String(runId);
  timeline = makeTimeline();
  startedAt = performance.now();
  prepare();
  renderAt(0);
  frameId = requestAnimationFrame(step);
}

function step(now) {
  if (!root.isConnected) {
    frameId = 0;
    return;
  }

  var elapsed = now - startedAt;
  renderAt(elapsed);

  if (elapsed < DURATION) {
    frameId = requestAnimationFrame(step);
  } else {
    frameId = 0;
  }
}

function makeTimeline() {
  var direction = Math.random() < .5 ? -1 : 1;
  var turns = 2 + Math.floor(Math.random() * 2);

  return {
    direction: direction,
    startAngle: direction * (55 + Math.random() * 90),
    endAngle: direction * turns * 360,
    sway: 5 + Math.random() * 4,
    seed: Math.floor(Math.random() * 997),
  };
}

function prepare() {
  arena.dataset.bounces = '0';
  throwEl.classList.add('is-rolling');
  throwEl.classList.remove('is-revealing', 'is-settled');
  verdict.setAttribute('aria-hidden', 'true');
  cost.setAttribute('aria-hidden', 'true');
}

function renderAt(ms) {
  var t = Math.min(ms, DURATION);
  var x;
  var y;

  if (t < FIRST_IMPACT) {
    var fall = t / FIRST_IMPACT;
    // The die is already inside its slot: it falls a short distance while
    // tumbling, rather than crossing the entire card from off-screen.
    x = Math.sin(fall * Math.PI * 2 + .5) * timeline.sway * (1 - fall * .35);
    y = -24 * (1 - fall * fall);
    arena.dataset.bounces = '0';
  } else if (t < SECOND_IMPACT) {
    var hop = (t - FIRST_IMPACT) / (SECOND_IMPACT - FIRST_IMPACT);
    x = Math.sin(hop * Math.PI * 2) * timeline.sway * .48 * (1 - hop);
    y = -Math.sin(hop * Math.PI) * 12;
    arena.dataset.bounces = '1';
  } else {
    var rest = (t - SECOND_IMPACT) / (DURATION - SECOND_IMPACT);
    x = Math.sin(rest * Math.PI * 4) * 2.4 * (1 - rest);
    y = 0;
    arena.dataset.bounces = '2';
  }

  var spinProgress = Math.min(1, t / SECOND_IMPACT);
  var easedSpin = 1 - Math.pow(1 - spinProgress, 3);
  var angle = timeline.startAngle +
    (timeline.endAngle - timeline.startAngle) * easedSpin;

  if (t >= SECOND_IMPACT) {
    var settleProgress = (t - SECOND_IMPACT) / (DURATION - SECOND_IMPACT);
    angle += Math.sin(settleProgress * Math.PI * 5) * 7 * (1 - settleProgress);
  }

  var impact = Math.max(
    impactPulse(t, FIRST_IMPACT),
    impactPulse(t, SECOND_IMPACT),
  );

  paint(x, y, angle, impact);

  if (t < SECOND_IMPACT) {
    showFalseFace(Math.floor(t / 58));
  } else {
    roll.textContent = String(finalResult);
    throwEl.classList.add('is-revealing');
    verdict.setAttribute('aria-hidden', 'false');
    cost.setAttribute('aria-hidden', 'false');
  }

  if (t >= DURATION) settle();
}

function impactPulse(ms, at) {
  if (ms < at || ms > at + 105) return 0;
  return 1 - (ms - at) / 105;
}

function paint(x, y, angle, impact) {
  var sx = 1 + impact * .17;
  var sy = 1 - impact * .14;
  var altitude = Math.min(1, Math.abs(Math.min(0, y)) / 26);
  var light = 1 + Math.sin(angle * Math.PI / 180) * .14;

  die.style.transform =
    'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)' +
    ' rotate(' + angle.toFixed(2) + 'deg)' +
    ' scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ')';
  die.style.filter = 'brightness(' + light.toFixed(3) + ')';
  facets.style.setProperty('--facet-turn', (-angle * .34).toFixed(2) + 'deg');
  facets.style.opacity = String(.7 + Math.cos(angle * Math.PI / 90) * .22);

  shadow.style.transform =
    'translateX(' + x.toFixed(2) + 'px)' +
    ' scale(' + (.96 - altitude * .42).toFixed(3) + ',' +
    (.78 - altitude * .22).toFixed(3) + ')';
  shadow.style.opacity = String(.18 + (1 - altitude) * .35);
  shadow.style.filter = 'blur(' + (2 + altitude * 5).toFixed(2) + 'px)';
}

function showFalseFace(index) {
  var next = ((index * 7 + timeline.seed) % 20) + 1;
  if (next === finalResult) next = (next % 20) + 1;
  roll.textContent = String(next);
}

function settle() {
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;

  roll.textContent = String(finalResult);
  die.style.transform = '';
  die.style.filter = '';
  facets.style.removeProperty('--facet-turn');
  facets.style.opacity = '';
  shadow.style.transform = '';
  shadow.style.opacity = '';
  shadow.style.filter = '';

  throwEl.classList.remove('is-rolling', 'is-revealing');
  throwEl.classList.add('is-settled');
  arena.dataset.bounces = '2';
  verdict.setAttribute('aria-hidden', 'false');
  cost.setAttribute('aria-hidden', 'false');
}
