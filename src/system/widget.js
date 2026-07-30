var core = root.querySelector('.system-core');
var trigger = root.querySelector('.system-trigger');
var panel = root.querySelector('.system-panel');
var closeButton = root.querySelector('.system-close');
var tabs = Array.from(root.querySelectorAll('[data-system-tab]'));
var stages = Array.from(root.querySelectorAll('[data-stage]'));
var inventoryGrid = root.querySelector('.inventory-grid');
var skillsGrid = root.querySelector('.skills-grid');
var conditionsList = root.querySelector('.conditions-list');
var xpCurrent = root.querySelector('.xp-current');
var xpOrbit = root.querySelector('.xp-orbit');
var eventRitual = root.querySelector('.event-ritual');
var ritualActors = Array.from(root.querySelectorAll('.ritual-actor'));
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var mode = ['sync', 'xp', 'loot', 'skill', 'level', 'status', 'notice']
  .indexOf(core.dataset.mode) >= 0 ? core.dataset.mode : 'sync';
var fx = ['neutral', 'fire', 'ice', 'storm', 'holy', 'shadow', 'poison', 'gold', 'danger']
  .indexOf(core.dataset.fx) >= 0 ? core.dataset.fx : 'neutral';
var frameId = 0;
var startedAt = 0;
var autoTimer = 0;
var autoObserver = null;

var sources = {};
root.querySelectorAll('[data-source]').forEach(function (node) {
  sources[node.dataset.source] = node.textContent.trim();
});

var copy = {};
root.querySelectorAll('[data-copy]').forEach(function (node) {
  copy[node.dataset.copy] = node.textContent.trim();
});

var level = number(sources.level);
var currentXP = number(sources.xp);
var goalXP = Math.max(1, number(sources.goal));
var amount = number(sources.amount);
var startXP = mode === 'xp' ? Math.max(0, currentXP - amount) : currentXP;
var inventory = parseList(sources.inventory, 3);
var skills = parseList(sources.skills, 3);
var conditions = parseList(sources.conditions, 2);

root.dataset.mode = mode;
root.dataset.fx = fx;
root.dataset.level = String(level);
core.classList.add('mode-' + mode, 'fx-' + fx);
eventRitual.dataset.active = mode;
ritualActors.forEach(function (actor) {
  actor.classList.toggle('is-active', actor.classList.contains('ritual-' + mode));
});

renderInventory();
renderSkills();
renderConditions();

trigger.addEventListener('click', function () {
  setOpen(!root.classList.contains('is-open'));
});

closeButton.addEventListener('click', function () {
  setOpen(false);
  trigger.focus({ preventScroll: true });
});

tabs.forEach(function (tab) {
  tab.addEventListener('click', function () {
    activate(tab.dataset.systemTab);
  });
});

inventoryGrid.addEventListener('click', function (event) {
  var item = event.target.closest('.inventory-item');
  if (!item) return;
  item.classList.toggle('is-inspected');
  item.setAttribute('aria-expanded', String(item.classList.contains('is-inspected')));
});

skillsGrid.addEventListener('click', function (event) {
  var card = event.target.closest('.skill-card');
  if (!card) return;
  card.classList.toggle('is-inspected');
  card.setAttribute('aria-expanded', String(card.classList.contains('is-inspected')));
});

core.addEventListener('pointermove', function (event) {
  if (reduced || event.pointerType === 'touch') return;
  var box = core.getBoundingClientRect();
  var x = ((event.clientX - box.left) / box.width - 0.5) * 12;
  var y = ((event.clientY - box.top) / box.height - 0.5) * 10;
  core.style.setProperty('--parallax-x', x.toFixed(2) + 'px');
  core.style.setProperty('--parallax-y', y.toFixed(2) + 'px');
  core.style.setProperty('--parallax-deep-x', (x * -0.2).toFixed(2) + 'px');
  core.style.setProperty('--parallax-deep-y', (y * -0.2).toFixed(2) + 'px');
  core.style.setProperty('--parallax-glass-x', (x * 0.32).toFixed(2) + 'px');
  core.style.setProperty('--parallax-glass-y', (y * 0.32).toFixed(2) + 'px');
  core.style.setProperty('--parallax-holo-x', (x * 0.62).toFixed(2) + 'px');
  core.style.setProperty('--parallax-holo-y', (y * 0.62).toFixed(2) + 'px');
});

core.addEventListener('pointerleave', function () {
  [
    '--parallax-x', '--parallax-y',
    '--parallax-deep-x', '--parallax-deep-y',
    '--parallax-glass-x', '--parallax-glass-y',
    '--parallax-holo-x', '--parallax-holo-y',
  ].forEach(function (property) {
    core.style.setProperty(property, '0px');
  });
});

skillsGrid.addEventListener('pointermove', function (event) {
  var card = event.target.closest('.skill-card');
  if (!card || event.pointerType === 'touch') return;
  var box = card.getBoundingClientRect();
  var x = (event.clientX - box.left) / box.width - 0.5;
  var y = (event.clientY - box.top) / box.height - 0.5;
  card.style.setProperty('--tilt-x', (y * -9).toFixed(2) + 'deg');
  card.style.setProperty('--tilt-y', (x * 11).toFixed(2) + 'deg');
});

skillsGrid.addEventListener('pointerout', function (event) {
  var card = event.target.closest('.skill-card');
  if (!card || card.contains(event.relatedTarget)) return;
  card.style.removeProperty('--tilt-x');
  card.style.removeProperty('--tilt-y');
});

root.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && root.classList.contains('is-open')) {
    setOpen(false);
    trigger.focus({ preventScroll: true });
  }
});

root.vldSeek = function (ms) {
  cancelAutomaticStart();
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  if (!root.classList.contains('is-armed')) arm();
  paint(Number(ms) || 0);
};

root.vldSystemAct = function (action) {
  if (action === 'open') setOpen(true);
  if (action === 'close') setOpen(false);
  if (action.indexOf('tab-') === 0) activate(action.slice(4));
  if (action.indexOf('inspect-item-') === 0) inspectAt(inventoryGrid, '.inventory-item', action.slice(13));
  if (action.indexOf('inspect-skill-') === 0) inspectAt(skillsGrid, '.skill-card', action.slice(14));
};

if (reduced) {
  arm();
  paint(Infinity);
} else if (mode !== 'sync') {
  queueAutomaticRun();
}

function number(value) {
  var parsed = parseInt(value, 10);
  return isNaN(parsed) ? 0 : Math.max(0, parsed);
}

function parseList(source, width) {
  if (!source) return [];
  return source.split(';').map(function (entry) {
    return entry.split('~').map(function (part) { return part.trim(); }).slice(0, width);
  }).filter(function (parts) {
    return Boolean(parts[0]);
  });
}

function element(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeToken(value, allowed) {
  var token = String(value || '').toLowerCase();
  return allowed.indexOf(token) >= 0 ? token : 'neutral';
}

function renderInventory() {
  var rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  if (!inventory.length) {
    inventoryGrid.appendChild(element('p', 'stage-empty', copy.emptyInventory));
    return;
  }

  inventory.forEach(function (parts, index) {
    var rarity = safeToken(parts[2], rarities);
    var item = element('button', 'inventory-item rarity-' + rarity);
    item.type = 'button';
    item.setAttribute('aria-expanded', 'false');
    item.style.setProperty('--item-index', index);

    var liquid = element('span', 'item-liquid');
    var lid = element('span', 'item-lid');
    lid.appendChild(element('i', '', ''));
    lid.appendChild(element('i', '', ''));
    var prism = element('span', 'item-prism');
    prism.appendChild(element('i', '', rarity === 'neutral' ? '?' : rarity));
    var seal = element('span', 'item-seal', rarity === 'neutral' ? '?' : rarity.charAt(0).toUpperCase());
    var body = element('span', 'item-body');
    body.appendChild(element('strong', 'item-name', parts[0]));
    body.appendChild(element('small', 'item-meta', copy.quantity + ' ' + (parts[1] || '1')));
    item.appendChild(liquid);
    item.appendChild(lid);
    item.appendChild(prism);
    item.appendChild(seal);
    item.appendChild(body);
    inventoryGrid.appendChild(item);
  });
}

function renderSkills() {
  var elements = ['fire', 'ice', 'storm', 'holy', 'shadow'];
  if (!skills.length) {
    skillsGrid.appendChild(element('p', 'stage-empty', copy.emptySkills));
    return;
  }

  skills.forEach(function (parts, index) {
    var affinity = safeToken(parts[1], elements);
    var card = element('button', 'skill-card element-' + affinity);
    card.type = 'button';
    card.setAttribute('aria-expanded', 'false');
    card.style.setProperty('--skill-index', index);
    card.style.setProperty('--tilt-x', '0deg');
    card.style.setProperty('--tilt-y', '0deg');

    card.appendChild(element('span', 'skill-rune', runeFor(affinity)));
    var name = element('strong', 'skill-name');
    Array.from(parts[0]).forEach(function (letter, letterIndex) {
      var glyph = element('i', 'skill-letter', letter);
      glyph.style.setProperty('--letter-index', letterIndex);
      name.appendChild(glyph);
    });
    card.appendChild(name);
    card.appendChild(element('small', 'skill-rank', copy.rank + ' ' + (parts[2] || '—')));
    card.appendChild(element('span', 'skill-pulse'));
    var lens = element('span', 'skill-lens');
    lens.appendChild(element('i', 'skill-lens-rune', runeFor(affinity)));
    var lensText = element('span', 'skill-lens-copy');
    lensText.appendChild(element('strong', '', parts[0]));
    lensText.appendChild(element('small', '', (parts[1] || 'neutral') + ' / ' + copy.rank + ' ' + (parts[2] || '—')));
    lens.appendChild(lensText);
    card.appendChild(lens);
    skillsGrid.appendChild(card);
  });
}

function renderConditions() {
  var effects = ['burn', 'poison', 'freeze', 'bleed', 'stun'];
  if (!conditions.length) {
    conditionsList.appendChild(element('p', 'stage-empty status-stable', copy.stable));
    return;
  }

  conditions.forEach(function (parts, index) {
    var effect = safeToken(parts[1], effects);
    var chip = element('div', 'condition-chip effect-' + effect);
    chip.style.setProperty('--condition-index', index);
    chip.appendChild(element('span', 'condition-node'));
    chip.appendChild(element('span', 'condition-thread'));
    chip.appendChild(element('span', 'condition-satellite'));
    var text = element('span', 'condition-text');
    text.appendChild(element('strong', '', parts[0]));
    text.appendChild(element('small', '', copy.condition + ' / ' + (parts[1] || 'unknown')));
    chip.appendChild(text);
    conditionsList.appendChild(chip);
  });
}

function runeFor(affinity) {
  return {
    fire: '△',
    ice: '◇',
    storm: 'ϟ',
    holy: '✦',
    shadow: '◐',
    neutral: '·',
  }[affinity] || '·';
}

function setOpen(open) {
  root.classList.toggle('is-unlatched', open);
  root.classList.toggle('is-open', open);
  trigger.setAttribute('aria-expanded', String(open));
  panel.setAttribute('aria-hidden', String(!open));
  if (open) activate(root.dataset.tab || 'core');
}

function activate(name) {
  var exists = stages.some(function (stage) { return stage.dataset.stage === name; });
  if (!exists) name = 'core';
  root.dataset.tab = name;
  tabs.forEach(function (tab) {
    var selected = tab.dataset.systemTab === name;
    tab.classList.toggle('is-active', selected);
    tab.classList.toggle('is-engaged', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  stages.forEach(function (stage) {
    var selected = stage.dataset.stage === name;
    stage.classList.toggle('is-active', selected);
    stage.setAttribute('aria-hidden', String(!selected));
  });
}

function inspectAt(container, selector, index) {
  var nodes = container.querySelectorAll(selector);
  var node = nodes[Math.max(0, Number(index) || 0)];
  if (node) node.classList.toggle('is-inspected');
}

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

function arm() {
  root.classList.remove('is-armed', 'is-settled');
  void root.offsetWidth;
  root.classList.add('is-armed');
}

function run() {
  cancelAutomaticStart();
  if (frameId) cancelAnimationFrame(frameId);
  arm();
  paint(0);
  startedAt = performance.now();
  frameId = requestAnimationFrame(step);
}

function step(now) {
  if (!root.isConnected) {
    frameId = 0;
    return;
  }
  var elapsed = now - startedAt;
  paint(elapsed);
  if (elapsed < 2400) frameId = requestAnimationFrame(step);
  else frameId = 0;
}

function paint(ms) {
  var finalFrame = ms === Infinity;
  var time = finalFrame ? 2400 : Math.max(0, Number(ms) || 0);
  var progress = Math.min(1, time / 1750);
  var eased = 1 - Math.pow(1 - progress, 3);
  var shownXP = Math.round(startXP + (currentXP - startXP) * eased);
  var ratio = Math.max(0, Math.min(1, shownXP / goalXP));
  var degrees = ratio * 360;
  var rounded = Math.abs(degrees - Math.round(degrees)) < 0.001
    ? String(Math.round(degrees))
    : degrees.toFixed(2);

  xpCurrent.textContent = String(shownXP);
  xpOrbit.style.setProperty('--xp-angle', rounded + 'deg');
  core.style.setProperty('--system-time', String(time));
  root.classList.toggle('is-settled', finalFrame || time >= 2200);
  root.classList.toggle('is-ritual-complete', finalFrame || time >= 2100);
}
