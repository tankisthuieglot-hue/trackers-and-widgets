// Feeds deliberately sloppy markers through the built regex, the way
// SillyTavern will, and reports what a reader would end up seeing.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DIST } from './lib.mjs';

const [LANG = 'ru', SKIN = ''] = process.argv.slice(2);
const load = (...path) => JSON.parse(readFileSync(join(DIST, ...path), 'utf8'));

// Widgets in tracker order, then the fallback — the order the install imposes.
const scripts = [
  ...readdirSync(DIST, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'service')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => load(e.name, LANG, SKIN, '2-regex.json')),
  load('service', '99-fallback.json'),
];

console.log(`— ${LANG} —`);

const compile = (literal) =>
  new RegExp(literal.slice(1, literal.lastIndexOf('/')), literal.slice(literal.lastIndexOf('/') + 1));

/** Widgets first, fallback last — exactly the order the filenames impose in ST. */
const render = (text) =>
  scripts.reduce((acc, s) => acc.replace(compile(s.findRegex), s.replaceString), text);

const cases = {
  'всё по образцу':
    '[[VLD_HUD|N=Влад|A=32|H=178|B1=Здоровье|V1=6|B2=Силы|V2=3|C=парка|I=нож, фляга|S=мокрый]]',
  'поля в другом порядке':
    '[[VLD_HUD|S=мокрый|I=нож|C=парка|V1=6|B1=Здоровье|H=178|A=32|N=Влад]]',
  'все пять шкал':
    '[[VLD_HUD|N=Влад|A=32|H=178|B1=Здоровье|V1=6|B2=Силы|V2=3|B3=Тепло|V3=2|B4=Голод|V4=8|B5=Розыск|V5=1|C=парка|I=нож|S=мокрый]]',
  'одна шкала':
    '[[VLD_HUD|N=Влад|A=32|H=178|B1=Здоровье|V1=9|C=парка|I=нож|S=мокрый]]',
  'шкала без значения':
    '[[VLD_HUD|N=Влад|A=32|H=178|B1=Здоровье|V1=6|B2=Мана|C=парка|I=нож|S=мокрый]]',
  'значение без шкалы':
    '[[VLD_HUD|N=Влад|A=32|H=178|B1=Здоровье|V1=6|V2=4|C=парка|I=нож|S=мокрый]]',
  'нет одежды и вида':
    '[[VLD_HUD|N=Влад|A=32|H=178|B1=Здоровье|V1=6|I=нож]]',
  'лишнее поле':
    '[[VLD_HUD|N=Влад|MOOD=злой|A=32|H=178|B1=Здоровье|V1=6|C=парка|I=нож|S=мокрый]]',
  'текст вместо числа':
    '[[VLD_HUD|N=Влад|A=32|H=178|B1=Здоровье|V1=много|C=парка|I=нож|S=мокрый]]',
  'значение вне 0-10':
    '[[VLD_HUD|N=Влад|A=32|H=178|B1=Здоровье|V1=87|B2=Мана|V2=-3|C=парка|I=нож|S=мокрый]]',
  'кавычка в текстовом поле':
    '[[VLD_HUD|N=Влад" onclick="alert(1)|A=32|H=178|B1=Здоровье|V1=6|C=парка|I=нож|S=мокрый]]',
  'маркер не закрыт':
    'проза [[VLD_HUD|N=Влад|B1=Здоровье|V1=6',
  'опечатка в теге':
    '[[VLD_HUDD|N=Влад|B1=Здоровье|V1=6]]',
  'пустой маркер':
    '[[VLD_HUD]]',
};

const pad = Math.max(...Object.keys(cases).map((k) => k.length));

for (const [label, input] of Object.entries(cases)) {
  const out = render(input);
  const rendered = out.includes('class="panel"');
  const leaked = /\[\[|\|[A-Z]+\d*=/.test(out);
  // A bar only paints when its level landed in the range the stylesheet covers.
  const painted = [...out.matchAll(/class="bar lv-(\d+)"/g)]
    .map((m) => m[1])
    .filter((n) => Number(n) >= 1 && Number(n) <= 10);
  const blanks = [...out.matchAll(/class="bar lv-(?![1-9]0?")[^"]*"/g)].length;
  // Injection means an event attribute on a real tag, not the text `onclick=`
  // sitting harmlessly inside a text node.
  const escaped = /<[^>]*\son\w+\s*=/.test(out);

  console.log(
    `${label.padEnd(pad)} | виджет: ${rendered ? 'да ' : 'нет'}` +
    ` | сырой текст: ${leaked ? 'ДА ⚠' : 'нет '}` +
    ` | шкал видно: ${String(painted.length).padEnd(2)} ${`[${painted.join(' ')}]`.padEnd(16)}` +
    ` | пустых: ${blanks}${escaped ? '  ⚠ ВЫРВАЛОСЬ ИЗ АТРИБУТА' : ''}`,
  );
}
