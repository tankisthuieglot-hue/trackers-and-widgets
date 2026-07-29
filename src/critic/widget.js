var cards = Array.from(root.querySelectorAll('.critic-card'));
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var dictionary = {};
var validKinds = ['public', 'anime', 'history'];
var active = [];
var frameId = 0;
var startedAt = 0;
var autoTimer = 0;
var autoObserver = null;

root.querySelectorAll('.dictionary [data-kind]').forEach(function (item) {
  dictionary[item.dataset.kind] = item.textContent;
});

cards.forEach(function (card, index) {
  var name = card.querySelector('.critic-name');
  var kind = validKinds.indexOf(card.dataset.kind) >= 0 ? card.dataset.kind : '';
  var rawScore = parseInt(card.dataset.score, 10);
  var score = isNaN(rawScore) ? 0 : Math.max(0, Math.min(10, rawScore));
  var comment = card.querySelector('.comment');
  var finalComment = comment.textContent.trim();

  if (!name.textContent.trim() || !kind) {
    card.classList.add('is-empty');
    return;
  }

  card.dataset.kind = kind;
  card.style.setProperty('--d', String(index * 280) + 'ms');
  card.querySelector('.origin').textContent = dictionary[kind] || kind;
  card.querySelector('.initial').textContent =
    Array.from(name.textContent.trim())[0] || '?';
  card.querySelector('.score-number').textContent = reduced ? String(score) : '0';
  comment.textContent = reduced ? finalComment : '';

  active.push({
    card: card,
    score: score,
    scoreNode: card.querySelector('.score-number'),
    comment: comment,
    finalComment: finalComment,
    delay: index * 280,
  });
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

root.addEventListener('click', function () {
  if (!reduced) run();
});

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
  if (elapsed < duration()) frameId = requestAnimationFrame(step);
  else frameId = 0;
}

function duration() {
  return active.reduce(function (latest, item) {
    return Math.max(latest, item.delay + 520 + item.finalComment.length * 15);
  }, 0);
}

function paint(ms) {
  active.forEach(function (item) {
    var scoreDelay = item.delay + 260;
    var progress = ms === Infinity
      ? 1
      : Math.max(0, Math.min(1, (ms - scoreDelay) / 680));
    var eased = 1 - Math.pow(1 - progress, 3);
    item.scoreNode.textContent = String(Math.round(item.score * eased));

    var commentDelay = item.delay + 420;
    var letters = ms === Infinity
      ? item.finalComment.length
      : Math.max(0, Math.min(
          item.finalComment.length,
          Math.floor((ms - commentDelay) / 15),
        ));
    item.comment.textContent = item.finalComment.slice(0, letters);
    item.card.classList.toggle(
      'is-settled',
      ms === Infinity || ms >= item.delay + 1100,
    );
  });
}
