// Feeds deliberately sloppy markers through the built regex, the way
// SillyTavern will. Prints what a reader would end up seeing.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIST } from './lib.mjs';

const hud = JSON.parse(readFileSync(join(DIST, 'regex', '11-vld-hud.json'), 'utf8'));
const fallback = JSON.parse(readFileSync(join(DIST, 'regex', '99-fallback.json'), 'utf8'));

const compile = (literal) => {
  const body = literal.slice(1, literal.lastIndexOf('/'));
  const flags = literal.slice(literal.lastIndexOf('/') + 1);
  return new RegExp(body, flags);
};

const render = (text) =>
  text.replace(compile(hud.findRegex), hud.replaceString)
      .replace(compile(fallback.findRegex), fallback.replaceString);

const cases = {
  'всё по образцу':
    '[[VLD_HUD|N=Влад|A=32|H=178 см|SV=6|CR=4|C=парка|I=нож, фляга|S=знобит]]',
  'поля в другом порядке':
    '[[VLD_HUD|S=знобит|I=нож, фляга|C=парка|CR=4|SV=6|H=178 см|A=32|N=Влад]]',
  'модель забыла одежду и состояние':
    '[[VLD_HUD|N=Влад|A=32|H=178 см|SV=6|CR=4|I=нож, фляга]]',
  'лишнее поле, которого нет в контракте':
    '[[VLD_HUD|N=Влад|MOOD=злой|A=32|H=178 см|SV=6|CR=4|C=парка|I=нож|S=знобит]]',
  'вместо цифры текст':
    '[[VLD_HUD|N=Влад|A=32|H=178 см|SV=высокое|CR=почти нет|C=парка|I=нож|S=знобит]]',
  'шкала за пределами 0-10':
    '[[VLD_HUD|N=Влад|A=32|H=178 см|SV=87|CR=-3|C=парка|I=нож|S=знобит]]',
  'десять предметов в инвентаре':
    '[[VLD_HUD|N=Влад|A=32|H=178 см|SV=6|CR=4|C=парка|I=нож, верёвка, фляга, спички, паспорт, зажигалка, бинт, компас, фонарь, монета|S=знобит]]',
  'маркер не закрыт':
    'проза [[VLD_HUD|N=Влад|A=32|SV=6',
  'опечатка в имени тега':
    '[[VLD_HUDD|N=Влад|SV=6]]',
  'пустой маркер':
    '[[VLD_HUD]]',
};

for (const [label, input] of Object.entries(cases)) {
  const out = render(input);
  const leaked = /\[\[|\|[A-Z]+=/.test(out);
  const plate = out.match(/class="plate ([^"]*)"/)?.[1] ?? '—';
  const empties = [...out.matchAll(/<span class="v">(\s*)<\/span>/g)].length;
  const lv = [...out.matchAll(/class="strip (lv-[^"]*)"/g)].map((m) => m[1]);

  console.log(
    `${label.padEnd(38)} сырой текст: ${leaked ? 'ДА ⚠' : 'нет'}` +
    `  | plate: ${plate.padEnd(7)} | шкалы: ${(lv.join(' ') || '—').padEnd(13)}` +
    ` | пустых строк: ${empties}`,
  );
}
