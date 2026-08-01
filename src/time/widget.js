var shell = root.querySelector('.chronometer');
var face = root.querySelector('.timepiece');
var trigger = root.querySelector('.watch-trigger');
var card = root.querySelector('.lid-inscription');
var digital = root.querySelector('.digital-time');
var drums = Array.from(root.querySelectorAll('.digit-window > b'));
var date = root.querySelector('.moment-date');
var elapsed = root.querySelector('.moment-elapsed');
var note = root.querySelector('.moment-note');
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

var hour = clamp(parseInt(shell.dataset.hour, 10), 0, 23);
var minute = clamp(parseInt(shell.dataset.minute, 10), 0, 59);
var targetMinute = minute * 6;
var targetHour = (hour % 12) * 30 + minute * 0.5;
var duration = 2300;
var frameId = 0;
var startedAt = 0;
var autoTimer = 0;
var autoObserver = null;
var runId = 0;

digital.setAttribute('aria-label', two(hour) + ':' + two(minute));
setPhase(hour);

var hasDetails = [date, elapsed, note].some(function (node) {
  return node && node.textContent.trim();
});
trigger.disabled = !hasDetails;
root.classList.toggle('is-bare', !hasDetails);

trigger.addEventListener('click', function () {
  setOpen(!root.classList.contains('is-open'));
});

if (!reduced) {
  root.addEventListener('pointermove', moveGlass);
  root.addEventListener('pointerdown', moveGlass);
  root.addEventListener('pointerleave', resetGlass);
}

root.vldTimeAct = function (action) {
  if (action === 'open') setOpen(true);
  if (action === 'close') setOpen(false);
  if (action === 'toggle') setOpen(!root.classList.contains('is-open'));
};

root.vldSeek = function (ms) {
  cancelAutomaticStart();
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  prepare();
  paintAt(ms === Infinity ? Infinity : (Number(ms) || 0));
};

if (reduced) {
  prepare();
  paintAt(Infinity);
} else {
  queueAutomaticRun();
}

function setOpen(open) {
  if (!hasDetails) open = false;
  root.classList.toggle('is-open', open);
  trigger.setAttribute('aria-expanded', String(open));
  trigger.setAttribute('aria-label', open ? '%close%' : '%open%');
  card.setAttribute('aria-hidden', String(!open));
}

function setPhase(value) {
  var phase = value >= 5 && value < 8
    ? 'dawn'
    : value >= 8 && value < 18
      ? 'day'
      : value >= 18 && value < 21
        ? 'dusk'
        : 'night';
  ['dawn', 'day', 'dusk', 'night'].forEach(function (name) {
    root.classList.toggle('phase-' + name, name === phase);
  });
}

function moveGlass(event) {
  var box = root.querySelector('.watch-body').getBoundingClientRect();
  if (!box.width || !box.height) return;
  var x = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width - 0.5) * 2));
  var y = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height - 0.5) * 2));
  root.style.setProperty('--glass-x', (x * 5).toFixed(2) + 'px');
  root.style.setProperty('--glass-y', (y * 4).toFixed(2) + 'px');
  root.style.setProperty('--dial-x', (x * -1.6).toFixed(2) + 'px');
  root.style.setProperty('--dial-y', (y * -1.2).toFixed(2) + 'px');
}

function resetGlass() {
  root.style.setProperty('--glass-x', '0px');
  root.style.setProperty('--glass-y', '0px');
  root.style.setProperty('--dial-x', '0px');
  root.style.setProperty('--dial-y', '0px');
}

function queueAutomaticRun() {
  var message = root.closest('.mes_text');
  if (!message || typeof MutationObserver !== 'function') {
    run();
    return;
  }

  function armAfterQuiet() {
    if (autoTimer) clearTimeout(autoTimer);
    root.dataset.timeAwaitingSettle = '1';
    autoTimer = setTimeout(function () {
      cancelAutomaticStart();
      if (root.isConnected) run();
    }, 180);
  }

  autoObserver = new MutationObserver(armAfterQuiet);
  autoObserver.observe(message, { childList: true, subtree: true, characterData: true });
  armAfterQuiet();
}

function cancelAutomaticStart() {
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = 0;
  if (autoObserver) autoObserver.disconnect();
  autoObserver = null;
  delete root.dataset.timeAwaitingSettle;
}

function run() {
  if (frameId) cancelAnimationFrame(frameId);
  runId += 1;
  root.dataset.timeRun = String(runId);
  startedAt = performance.now();
  prepare();
  paintAt(0);
  frameId = requestAnimationFrame(step);
}

function step(now) {
  if (!root.isConnected) { frameId = 0; return; }
  var elapsedMs = now - startedAt;
  paintAt(elapsedMs);
  if (elapsedMs < duration) frameId = requestAnimationFrame(step);
  else frameId = 0;
}

function prepare() {
  root.classList.add('is-alive', 'is-running');
  root.classList.remove('is-settled');
  face.style.setProperty('--hour-angle', '0deg');
  face.style.setProperty('--minute-angle', '0deg');
  face.style.setProperty('--pin-kick', '0');
  paintDrums(0);
}

function paintAt(ms) {
  var time = ms === Infinity ? duration : Math.max(0, Math.min(ms, duration));
  var minuteProgress = clamp01((time - 260) / 1550);
  var hourProgress = clamp01((time - 430) / 1370);
  var drumProgress = clamp01((time - 360) / 1510);
  var minuteEased = 1 - Math.pow(1 - minuteProgress, 4);
  var hourEased = 1 - Math.pow(1 - hourProgress, 4);
  var recoil = minuteProgress < 1
    ? Math.sin(minuteProgress * Math.PI * 3) * (1 - minuteProgress) * 1.25
    : 0;
  face.style.setProperty('--hour-angle', angle(targetHour * hourEased + recoil * .45));
  face.style.setProperty('--minute-angle', angle((360 + targetMinute) * minuteEased + recoil * 2.1));
  face.style.setProperty('--pin-kick', Math.abs(recoil).toFixed(3));
  root.style.setProperty('--wind-progress', minuteProgress.toFixed(4));
  paintDrums(drumProgress);
  if (time >= duration) settle();
}

function settle() {
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  root.classList.remove('is-running');
  root.classList.add('is-alive', 'is-settled');
  face.style.setProperty('--hour-angle', angle(targetHour));
  face.style.setProperty('--minute-angle', angle(targetMinute));
  face.style.setProperty('--pin-kick', '0');
  root.style.setProperty('--wind-progress', '1');
  paintDrums(1);
}

function paintDrums(progress) {
  var target = two(hour) + two(minute);
  drums.forEach(function (drum, index) {
    if (progress >= 1) {
      drum.textContent = target[index];
      drum.dataset.next = target[index];
      drum.style.setProperty('--drum-phase', '0');
      return;
    }
    var local = clamp01((progress - index * 0.045) / (1 - index * 0.045));
    var travel = local * (11 + index * 2 + Number(target[index]));
    var current = Math.floor(travel) % 10;
    var phase = travel - Math.floor(travel);
    drum.textContent = String(current);
    drum.dataset.next = String((current + 1) % 10);
    drum.style.setProperty('--drum-phase', phase.toFixed(4));
  });
}

function clamp(value, minimum, maximum) {
  if (isNaN(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

function clamp01(value) { return Math.max(0, Math.min(1, value)); }

function two(value) { return String(value).padStart(2, '0'); }
function angle(value) { return String(Math.round(value * 1000) / 1000) + 'deg'; }
