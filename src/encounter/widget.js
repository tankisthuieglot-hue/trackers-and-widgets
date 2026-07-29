var folder = root.querySelector('.folder-object');
var trigger = root.querySelector('.folder-trigger');
var closeButton = root.querySelector('.dossier-close');
var weaknessNote = root.querySelector('.weakness-note');
var tabs = Array.from(root.querySelectorAll('.dossier-tab'));
var pages = Array.from(root.querySelectorAll('.dossier-page'));
var nameNodes = [
  root.querySelector('.trigger-name'),
  root.querySelector('.subject-name'),
];
var portrait = root.querySelector('.subject-portrait');
var cipherStream = root.querySelector('.cipher-stream');
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var mode = folder.dataset.mode;
var vision = folder.dataset.vision;
var dictionary = {};
var finalName = nameNodes[0].textContent.trim();
var persistent = [];
var frameId = 0;
var startedAt = 0;
var autoTimer = 0;
var autoObserver = null;
var GLYPHS = 'ΔЖΨ7Ø∴⌁Я⊘Λ9Ξ◇';

root.dataset.mode = mode;
root.dataset.theme = folder.dataset.theme;
root.dataset.kind = folder.dataset.kind;
root.dataset.vision = vision;

root.querySelectorAll('.dictionary [data-mode]').forEach(function (item) {
  dictionary[item.dataset.mode] = item.textContent;
});
dictionary.noData = root.querySelector('[data-copy="noData"]').textContent;
root.querySelector('.event-label').textContent = dictionary[mode] || dictionary.intro;
root.querySelector('.identity-code').textContent =
  mode === 'reveal' ? 'ID // DECRYPT' : mode === 'warning' ? 'CLASS // UNRESOLVED' : 'FIELD RECORD';

root.querySelectorAll('.field').forEach(function (field, index) {
  var value = field.querySelector('.field-value');
  var finalValue = value.textContent.trim();
  if (finalValue) return;

  if (vision === 'obscured') {
    value.classList.add('persistent-cipher');
    persistent.push({ node: value, seed: index + 17, length: 11 });
  } else {
    value.textContent = dictionary.noData;
    value.classList.add('no-data');
  }
});

var threatValue = root.querySelector('.threat-value');
if (!threatValue.textContent.trim()) {
  threatValue.textContent = '??';
  threatValue.parentElement.classList.add('unknown');
}

trigger.addEventListener('click', function () {
  setOpen(!root.classList.contains('is-open'));
});

closeButton.addEventListener('click', function () {
  setOpen(false);
  trigger.focus({ preventScroll: true });
});

weaknessNote.addEventListener('click', function () {
  setWeakness(!weaknessNote.classList.contains('is-unfolded'));
});

tabs.forEach(function (tab) {
  tab.addEventListener('click', function () {
    activatePage(tab.dataset.target);
  });
});

root.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && root.classList.contains('is-open')) {
    setOpen(false);
    trigger.focus({ preventScroll: true });
  }
});

if (reduced) {
  root.classList.add('is-armed');
  paint(Infinity);
} else {
  queueAutomaticRun();
}

root.vldSeek = function (ms) {
  cancelAutomaticStart();
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  root.classList.add('is-armed');
  paint(Number(ms) || 0);
};

root.vldEncounterAct = function (action) {
  if (action === 'open') setOpen(true);
  if (action === 'close') setOpen(false);
  if (action === 'weakness') setWeakness(true);
  if (action === 'fold-weakness') setWeakness(false);
  if (action.indexOf('tab-') === 0) activatePage(action.slice(4));
};

function setOpen(open) {
  root.classList.toggle('is-unlatched', open);
  root.classList.toggle('is-open', open);
  trigger.setAttribute('aria-expanded', String(open));
  if (open) activatePage(root.dataset.page || 'profile');
  else setWeakness(false);
}

function activatePage(target) {
  root.dataset.page = target;
  tabs.forEach(function (tab) {
    var selected = tab.dataset.target === target;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  pages.forEach(function (page) {
    var selected = page.dataset.page === target;
    page.classList.toggle('is-active', selected);
    page.setAttribute('aria-hidden', String(!selected));
  });
}

function setWeakness(open) {
  weaknessNote.classList.toggle('is-unfolded', open);
  weaknessNote.setAttribute('aria-expanded', String(open));
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

function run() {
  cancelAutomaticStart();
  if (frameId) cancelAnimationFrame(frameId);
  root.classList.remove('is-armed');
  void root.offsetWidth;
  root.classList.add('is-armed');
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
  if (elapsed < 1900) frameId = requestAnimationFrame(step);
  else frameId = 0;
}

function paint(ms) {
  var finalFrame = ms === Infinity;
  var decrypting = mode === 'reveal' || vision === 'obscured';
  var resolved = finalFrame || !decrypting || ms >= 1400;

  nameNodes.forEach(function (node, index) {
    node.textContent = resolved
      ? finalName
      : cipher(finalName.length || 10, index + 3, ms);
  });

  cipherStream.textContent = cipher(29, 41, finalFrame ? 1700 : ms);
  persistent.forEach(function (item) {
    item.node.textContent = cipher(item.length, item.seed, finalFrame ? 1700 : ms);
  });

  portrait.classList.toggle('is-resolved', resolved && vision !== 'obscured');
  root.classList.toggle('is-decrypted', resolved);
}

function cipher(length, seed, ms) {
  var bucket = Math.max(0, Math.floor((Number(ms) || 0) / 90));
  var out = '';
  for (var index = 0; index < Math.max(4, length); index += 1) {
    var at = (seed * 7 + bucket * 5 + index * 11 + index * bucket) % GLYPHS.length;
    out += GLYPHS.charAt(at);
  }
  return out;
}
