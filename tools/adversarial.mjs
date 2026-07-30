// Feeds deliberately sloppy markers through the built regexes, in the order
// SillyTavern applies them, and reports what a reader would end up seeing.
//
// The cases are generated from each tracker's own field list rather than
// written by hand. A hand-written suite only ever covers the tracker its
// author was thinking about, and this pack has eleven.
//
//   node tools/adversarial.mjs [lang] [skin]
//
// Two things are treated as failures rather than findings, because both are
// visible to the reader and neither has a benign form: raw marker text
// reaching the chat, and a value breaking out of an HTML attribute.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DIST, loadTrackers, renderMarker } from './lib.mjs';

const [LANG = 'ru', SKIN = ''] = process.argv.slice(2);
const load = (...path) => JSON.parse(readFileSync(join(DIST, ...path), 'utf8'));

// Widgets in filename order, then the fallback — the order the install imposes.
const scripts = [
  ...readdirSync(DIST, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'service')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => load(e.name, LANG, SKIN, '2-regex.json')),
  load('service', '99-fallback.json'),
];

const compile = (literal) =>
  new RegExp(literal.slice(1, literal.lastIndexOf('/')), literal.slice(literal.lastIndexOf('/') + 1));

const compiled = scripts.map((s) => ({ find: compile(s.findRegex), replace: s.replaceString }));

const render = (text) =>
  compiled.reduce((acc, s) => acc.replace(s.find, s.replace), text);

const trackers = loadTrackers();
const names = trackers.map((t) => t.name);
let failures = 0;

console.log(`— ${LANG}${SKIN ? ` · ${SKIN}` : ''} —\n`);

for (const t of trackers) {
  const lang = t.lang[LANG] ?? Object.values(t.lang)[0];
  const example = lang.example ?? {};
  const numeric = t.fields.filter((f) =>
    f.type === 'num' || f.type === 'level' || f.type === 'counter');
  const listed = t.fields.filter((f) => f.of);
  const text = t.fields.filter((f) =>
    !f.of && (!f.type || f.type === 'text' || f.type === 'plain'));

  const mark = (values, fields = t.fields) =>
    renderMarker(t.tag, fields, values, { trim: true });

  const swap = (keys, value) =>
    Object.fromEntries(Object.entries(example).map(([k, v]) => [k, keys.includes(k) ? value : v]));

  const cases = {
    'образец': mark(example),
    'поля наоборот': mark(example, [...t.fields].reverse()),
    'только обязательные': mark(example, t.fields.filter((f) => !f.optional)),
    'лишнее поле': mark(example).replace(']]', '|ZZZ=не из контракта]]'),
    'мусор в числах': mark(swap(numeric.map((f) => f.key), 'очень много')),
    'вне шкалы': mark(swap(numeric.map((f) => f.key), '87')),
    'отрицательное': mark(swap(numeric.map((f) => f.key), '-3')),
    'чужое слово в списке': mark(swap(listed.map((f) => f.key), 'паника')),
    'список по-русски': mark(swap(listed.map((f) => f.key), 'ложь')),
    'кавычка в тексте': mark(swap(text.slice(0, 1).map((f) => f.key), 'Влад" onclick="alert(1)')),
    'угловые скобки': mark(swap(text.slice(0, 1).map((f) => f.key), '<script>alert(1)</script>')),
    'пробелы вокруг =': mark(example).replace(/\|(\w+)=/g, '| $1 = '),
    'не закрыт': `проза ${mark(example).slice(0, -2)}`,
    'опечатка в теге': mark(example).replace(t.tag, `${t.tag}X`),
    'пустой маркер': `[[${t.tag}]]`,
  };

  const pad = Math.max(...Object.keys(cases).map((k) => k.length));
  console.log(`${t.tag}`);

  for (const [label, input] of Object.entries(cases)) {
    const out = render(input);

    const leaked = /\[\[|\|\s*[A-Z]+\d*\s*=/.test(out);
    // Injection means an event attribute or a tag on a real element, not the
    // text `onclick=` sitting harmlessly inside a text node.
    const escaped = /<[^>]*\son\w+\s*=/.test(out) || /<script>alert/.test(out);
    const mine = out.includes(`vld-${t.name}"`) || out.includes(`vld-${t.name} `);
    const others = names.filter((n) => n !== t.name && out.includes(`vld-${n}"`));

    if (leaked || escaped || others.length) failures += 1;

    const notes = [
      leaked && 'СЫРОЙ ТЕКСТ',
      escaped && 'ВЫРВАЛОСЬ ИЗ АТРИБУТА',
      others.length && `ПОЙМАЛ ЧУЖОЙ: ${others.join(', ')}`,
    ].filter(Boolean);

    console.log(
      `  ${label.padEnd(pad)} | виджет: ${mine ? 'да ' : 'нет'}` +
      (notes.length ? `  ⚠ ${notes.join(' · ')}` : ''),
    );
  }
  console.log('');
}

if (failures) {
  console.error(`✗ ${failures} случа(ев) с утечкой — читатель увидит лишнее`);
  process.exit(1);
}
console.log('✓ ни один кривой маркер не дошёл до читателя');
