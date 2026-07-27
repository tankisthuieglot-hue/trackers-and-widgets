var throwEl = root.querySelector('.throw');
var arena = root.querySelector('.arena');
var die = root.querySelector('.die');
var shadow = root.querySelector('.die-shadow');
var facets = root.querySelector('.facets');
var roll = root.querySelector('.roll');
var read = root.querySelector('.read');
var finalResult = parseInt(roll.dataset.final, 10);
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var frameId = 0;
var runId = 0;

if (!isNaN(finalResult)) {
  if (reduced) {
    settle();
  } else {
    runThrow();
    die.addEventListener('click', function (event) {
      event.preventDefault();
      runThrow();
    });
  }
}

/**
 * Physics is transient presentation only. The model has already rolled and put
 * the immutable result in data-final; every replay changes the path, never it.
 */
function runThrow() {
  if (frameId) cancelAnimationFrame(frameId);

  runId += 1;
  root.dataset.diceRun = String(runId);
  arena.dataset.bounces = '0';
  throwEl.classList.add('is-rolling');
  throwEl.classList.remove('is-settled');
  read.setAttribute('aria-hidden', 'true');

  var x = 165 + Math.random() * 28;
  var y = -58 - Math.random() * 18;
  var vx = -278 - Math.random() * 34;
  var vy = -58 - Math.random() * 42;
  var angle = -130 + Math.random() * 260;
  var spin = (Math.random() < .5 ? -1 : 1) * (760 + Math.random() * 310);
  var gravity = 1120;
  var bounces = 0;
  var grounded = false;
  var started = 0;
  var previous = 0;
  var lastFaceAt = 0;
  var impactAt = -1000;

  showFalseFace();
  paint(x, y, angle, 0, impactAt);
  frameId = requestAnimationFrame(step);

  function step(now) {
    if (!started) {
      started = now;
      previous = now;
    }

    var dt = Math.min(.032, Math.max(.001, (now - previous) / 1000));
    var elapsed = (now - started) / 1000;
    previous = now;

    if (!grounded) {
      vy += gravity * dt;
      x += vx * dt;
      y += vy * dt;
      angle += spin * dt;

      if (y >= 0 && vy > 0) {
        y = 0;
        bounces += 1;
        arena.dataset.bounces = String(bounces);
        impactAt = now;

        if (bounces === 1) {
          vy = -vy * .42;
          vx *= .69;
          spin *= .72;
        } else {
          vy = 0;
          grounded = true;
        }
      }
    } else {
      var settleRate = Math.min(1, dt * 9);
      x += (0 - x) * settleRate;
      angle += spin * dt;
      spin *= Math.exp(-8 * dt);
    }

    if (now - lastFaceAt > 58 && !grounded) {
      showFalseFace();
      lastFaceAt = now;
    }

    paint(x, y, angle, elapsed, impactAt);

    if (grounded && elapsed > 1.02 && Math.abs(x) < 1.2 && Math.abs(spin) < 16) {
      settle();
      return;
    }

    // A throttled background tab must not leave the result hidden forever.
    if (elapsed > 1.45) {
      settle();
      return;
    }

    frameId = requestAnimationFrame(step);
  }
}

function paint(x, y, angle, elapsed, impactAt) {
  var now = performance.now();
  var impact = Math.max(0, 1 - (now - impactAt) / 105);
  var sx = 1 + impact * .17;
  var sy = 1 - impact * .14;
  var altitude = Math.min(1, Math.abs(Math.min(0, y)) / 88);
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
    ' scale(' + (.96 - altitude * .47).toFixed(3) + ',' +
    (.78 - altitude * .25).toFixed(3) + ')';
  shadow.style.opacity = String(.17 + (1 - altitude) * .36);
  shadow.style.filter = 'blur(' + (2 + altitude * 7).toFixed(2) + 'px)';
}

function showFalseFace() {
  var current = parseInt(roll.textContent, 10);
  var next;

  do {
    next = 1 + Math.floor(Math.random() * 20);
  } while (next === finalResult || next === current);

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

  throwEl.classList.remove('is-rolling');
  throwEl.classList.add('is-settled');
  read.setAttribute('aria-hidden', 'false');
}
