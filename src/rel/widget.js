var card = root.querySelector('.card');
var name = card.querySelector('h3');
var comment = card.querySelector('.comment span');
var finalComment = comment.textContent.trim();
var monogram = card.querySelector('.monogram');
var heart = card.querySelector('.heart');
var signals = Array.from(card.querySelectorAll('.signal'));
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
card.dataset.vldRelReady = '1';
var dictionary = {};
var tones = {
  friendship: '86, 190, 133',
  love: '225, 76, 103',
  trust: '101, 178, 212',
  respect: '210, 164, 90',
  interest: '164, 118, 216',
  fear: '157, 216, 231',
  jealousy: '157, 195, 68',
  hostility: '220, 93, 62',
};
var validKinds = Object.keys(tones);

card.querySelectorAll('.dictionary [data-kind]').forEach(function (item) {
  dictionary[item.dataset.kind] = item.textContent;
});

var readings = signals.map(function (signal, index) {
  var kind = validKinds.find(function (candidate) {
    return signal.classList.contains('e-' + candidate);
  });
  var raw = parseInt(signal.dataset.value, 10);
  var value = isNaN(raw) ? 0 : Math.max(0, Math.min(100, raw));

  if (!kind) {
    signal.classList.add('is-empty');
    return { signal: signal, kind: '', value: 0, index: index };
  }

  signal.querySelector('.label').textContent = dictionary[kind] || kind;
  signal.classList.add(band(value));
  card.style.setProperty('--orbit-' + (index + 1), tones[kind]);
  return { signal: signal, kind: kind, value: value, index: index };
});

var active = readings.filter(function (reading) { return reading.kind; });
var dominant = active.reduce(function (best, reading) {
  return !best || reading.value > best.value ? reading : best;
}, null);

if (dominant) {
  dominant.signal.classList.add('is-dominant');
  card.classList.add('mood-' + dominant.kind);
  card.dataset.dominant = dominant.kind;
  card.style.setProperty('--dominant', tones[dominant.kind]);
}

var love = active.find(function (reading) { return reading.kind === 'love'; });
if (love && love.value > 0) heart.classList.add('is-visible', band(love.value));
monogram.textContent = Array.from(name.textContent.trim())[0] || '';
comment.textContent = reduced ? finalComment : '';

var COMMENT_DELAY = 50;
var COMMENT_STEP = 14;
var COUNT_DELAY = 160;
var STAGGER = 80;
var COUNT_DURATION = 720;
var commentDuration = COMMENT_DELAY + finalComment.length * COMMENT_STEP;
var countDuration = COUNT_DELAY + STAGGER * Math.max(0, active.length - 1) + COUNT_DURATION;
var totalDuration = Math.max(commentDuration, countDuration);
var frameId = 0;
var startedAt = 0;
var autoTimer = 0;
var autoObserver = null;

if (reduced) paint(Infinity);
else queueAutomaticRun();

root.vldSeek = function (ms) {
  cancelAutomaticStart();
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  paint(Number(ms) || 0);
};

groupDeck();

function queueAutomaticRun() {
  var message = root.closest('.mes_text');
  if (!message || typeof MutationObserver !== 'function') {
    run();
    return;
  }

  function armAfterQuiet() {
    if (autoTimer) clearTimeout(autoTimer);
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
}

function run() {
  if (frameId) cancelAnimationFrame(frameId);
  startedAt = performance.now();
  paint(0);
  frameId = requestAnimationFrame(step);
}

function step(now) {
  if (!root.isConnected) {
    frameId = 0;
    return;
  }
  var elapsed = now - startedAt;
  paint(elapsed);
  if (elapsed < totalDuration) frameId = requestAnimationFrame(step);
  else frameId = 0;
}

function paint(ms) {
  active.forEach(function (reading) {
    var delay = COUNT_DELAY + reading.index * STAGGER;
    var progress = ms === Infinity ? 1 : Math.max(0, Math.min(1, (ms - delay) / COUNT_DURATION));
    var eased = 1 - Math.pow(1 - progress, 2);
    var shown = Math.round(reading.value * eased);
    reading.signal.style.setProperty('--shown', shown + '%');
    reading.signal.querySelector('.value').textContent = String(shown);
  });

  var letters = ms === Infinity
    ? finalComment.length
    : Math.max(0, Math.min(finalComment.length, Math.floor((ms - COMMENT_DELAY) / COMMENT_STEP)));
  comment.textContent = finalComment.slice(0, letters);
  card.classList.toggle('is-settled', ms === Infinity || ms >= totalDuration);
}

function groupDeck() {
  var message = root.closest('.mes_text');
  var scope = message || root.parentElement;
  if (!scope) return;

  var roots = Array.from(scope.querySelectorAll('.vld-rel')).filter(function (item) {
    return message ? item.closest('.mes_text') === message : item.parentElement === scope;
  });
  if (!roots.length) return;

  var host = roots[0];
  host.classList.add('deck-host');
  roots.slice(1).forEach(function (item) { item.classList.add('deck-member'); });

  var tabs = directChild(host, 'deck-tabs');
  var pages = directChild(host, 'deck-pages');
  if (!tabs) {
    tabs = document.createElement('nav');
    tabs.className = 'deck-tabs';
    tabs.setAttribute('role', 'tablist');
    host.insertBefore(tabs, host.firstChild);
  }
  if (!pages) {
    pages = document.createElement('div');
    pages.className = 'deck-pages';
    host.insertBefore(pages, tabs.nextSibling);
  }

  roots.forEach(function (item) {
    var ownCard = Array.from(item.children).find(function (child) {
      return child.classList
        && child.classList.contains('card')
        && child.dataset.vldRelReady === '1';
    });
    if (ownCard) pages.appendChild(ownCard);
  });

  var cards = Array.from(pages.children).filter(function (item) {
    return item.classList.contains('card');
  });
  tabs.hidden = cards.length < 2;
  tabs.textContent = '';

  cards.forEach(function (page, index) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'deck-tab';
    button.setAttribute('role', 'tab');
    button.style.setProperty('--tab-tone', page.style.getPropertyValue('--dominant'));
    button.textContent = page.querySelector('h3').textContent;
    button.addEventListener('click', function () { activate(index); });
    tabs.appendChild(button);
  });

  activate(Math.min(Number(host.dataset.active || 0), Math.max(0, cards.length - 1)));

  function activate(index) {
    host.dataset.active = String(index);
    cards.forEach(function (page, cardIndex) {
      var selected = cardIndex === index;
      page.hidden = !selected;
      page.classList.toggle('is-active', selected);
    });
    Array.from(tabs.children).forEach(function (button, tabIndex) {
      button.setAttribute('aria-selected', String(tabIndex === index));
      button.tabIndex = tabIndex === index ? 0 : -1;
    });
  }
}

function directChild(parent, className) {
  return Array.from(parent.children).find(function (child) {
    return child.classList && child.classList.contains(className);
  });
}

function band(value) {
  if (value < 10) return 'band-zero';
  if (value <= 50) return 'band-low';
  if (value <= 80) return 'band-high';
  return 'band-peak';
}
