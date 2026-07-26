// Виджет одноразовый. Он не знает, что было в прошлом сообщении, и знать не
// может: маркеры вырезаются из контекста на глубине 3, так что и сама модель
// не помнит прошлых значений. Всё, что здесь происходит, выводится из одного
// снимка.

var panel = root.querySelector('.panel');
var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// CSS наливает шкалы от нуля. Задача скрипта — чтобы цифра ехала вместе с
// делениями, а не стояла готовой над растущей полосой.
if (!still) {
  root.querySelectorAll('.bar').forEach(function (bar, index) {
    var num = bar.querySelector('.num');
    var target = parseInt(num.textContent, 10);
    if (isNaN(target)) return;

    num.textContent = '0';
    countUp(num, target, index * 70);
  });
}

// Пока {{user}} оглушён или отравлен, показания плывут. Нажатие проясняет их
// и оставляет так — без скрипта то же самое работает удержанием, но одним
// касанием удобнее.
if (/\bfx-\w/.test(panel.className)) {
  panel.addEventListener('click', function (event) {
    if (event.target.closest('summary')) return;
    panel.classList.toggle('peeking');
  });
}

/** Те же 70 мс лесенкой и та же длительность, что у vld-grow в стилях. */
function countUp(el, target, delay) {
  setTimeout(function () {
    var started = null;

    requestAnimationFrame(function step(now) {
      if (started === null) started = now;
      var t = Math.min(1, (now - started) / 580);

      el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    });
  }, delay);
}
