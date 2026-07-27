var rate = root.querySelector('.rate b');
var finalRate = parseInt(rate && rate.dataset.final, 10);
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var COUNT_DELAY = 220;
var COUNT_DURATION = 900;
var countTimer = 0;
var countFrame = 0;
var countStartedAt = 0;

if (!isNaN(finalRate)) {
  setRateColor(finalRate);

  if (reduced) {
    paintCount(Infinity);
  } else {
    startCount();
  }
}

// The recorder owns a deterministic clock. In SillyTavern this is never
// called; the same paint function runs from requestAnimationFrame instead.
root.vldSeek = function (ms) {
  stopCount();
  paintCount(Number(ms) || 0);
};

function startCount() {
  rate.textContent = '0%';
  countTimer = setTimeout(function () {
    countTimer = 0;
    countStartedAt = performance.now();
    countFrame = requestAnimationFrame(stepCount);
  }, COUNT_DELAY);
}

function stepCount(now) {
  if (!root.isConnected) {
    countFrame = 0;
    return;
  }

  var elapsed = COUNT_DELAY + now - countStartedAt;
  paintCount(elapsed);

  if (elapsed < COUNT_DELAY + COUNT_DURATION) {
    countFrame = requestAnimationFrame(stepCount);
  } else {
    countFrame = 0;
  }
}

function paintCount(ms) {
  var progress = Math.max(0, Math.min(1, (ms - COUNT_DELAY) / COUNT_DURATION));
  var eased = 1 - Math.pow(1 - progress, 2);
  var shown = ms === Infinity ? finalRate : Math.round(finalRate * eased);
  rate.textContent = String(shown) + '%';
}

function setRateColor(value) {
  var color = value <= 5
    ? '239, 195, 92'
    : value <= 15
      ? '213, 159, 98'
      : value <= 35
        ? '137, 169, 188'
        : '154, 150, 142';

  root.style.setProperty('--rate-color', color);
}

function stopCount() {
  if (countTimer) clearTimeout(countTimer);
  if (countFrame) cancelAnimationFrame(countFrame);
  countTimer = 0;
  countFrame = 0;
}
