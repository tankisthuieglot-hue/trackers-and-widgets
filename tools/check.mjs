// Catches the failures that actually ship in packs like this: a prompt that
// advertises a field the regex never captures, a stylesheet that leaks into the
// chat, an example that cannot survive its own grammar.
import { loadTrackers, markerRegExp, renderMarker } from './lib.mjs';

const SEP = '\u0000';
const problems = [];
const seenTags = new Map();
const seenOrders = new Map();

const fail = (where, message) => problems.push(`${where}: ${message}`);

for (const t of loadTrackers()) {
  const at = `src/${t.name}`;

  if (!t.title) fail(at, 'нет поля title');
  if (!t.when) fail(at, 'нет поля when — модель не узнает, когда ставить маркер');

  if (!/^VLD_[A-Z0-9_]+$/.test(t.tag ?? '')) {
    fail(at, `тег «${t.tag}» должен подходить под VLD_[A-Z0-9_]+`);
  } else if (seenTags.has(t.tag)) {
    fail(at, `тег ${t.tag} уже занят трекером ${seenTags.get(t.tag)}`);
  } else {
    seenTags.set(t.tag, t.name);
  }

  if (!Number.isInteger(t.order) || t.order < 10 || t.order > 98) {
    fail(at, `order должен быть целым от 10 до 98 (00–04 и 99 заняты служебными)`);
  } else if (seenOrders.has(t.order)) {
    fail(at, `order ${t.order} уже занят трекером ${seenOrders.get(t.order)}`);
  } else {
    seenOrders.set(t.order, t.name);
  }

  if (!t.fields?.length) {
    fail(at, 'нет ни одного поля');
    continue;
  }

  const keys = new Set();
  for (const f of t.fields) {
    if (!/^[A-Z][A-Z0-9]*$/.test(f.key ?? '')) fail(at, `ключ «${f.key}» должен быть вида T, D, I1`);
    if (keys.has(f.key)) fail(at, `ключ ${f.key} объявлен дважды`);
    keys.add(f.key);
    if (!f.desc) fail(at, `у поля ${f.key} нет описания — оно идёт в промпт`);
  }

  checkPlaceholders(t, at);
  checkExample(t, at);
  checkCss(t, at);
}

// One broken field can trip the same check twice; the author needs the fact once.
const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`✗ ${unique.length} проблем(ы):\n`);
  for (const p of unique) console.error('  ' + p);
  process.exit(1);
}
console.log('✓ все трекеры прошли проверку');

/** Every field must land somewhere in the markup, and nothing may point past the end. */
function checkPlaceholders(t, at) {
  const used = new Set([...t.html.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
  const missing = t.fields.map((_, i) => i + 1).filter((n) => !used.has(n));
  const extra = [...used].filter((n) => n < 1 || n > t.fields.length);

  if (missing.length) {
    const names = missing.map((n) => `$${n} (${t.fields[n - 1].key})`).join(', ');
    fail(at, `widget.html не использует ${names} — поле уйдёт в промпт и пропадёт`);
  }
  for (const n of extra) {
    fail(at, `widget.html ссылается на $${n}, а полей всего ${t.fields.length}`);
  }

  // Inside a text node any character is harmless. Inside an attribute a quote
  // ends the attribute and whatever follows becomes markup, so only fields
  // declared numeric — capped to digits by the grammar — are allowed there.
  for (const m of t.html.matchAll(/=\s*"[^"]*?\$(\d+)/g)) {
    const field = t.fields[Number(m[1]) - 1];
    if (field && field.type !== 'num') {
      fail(at, `$${m[1]} (${field.key}) подставляется в HTML-атрибут — объяви поле как "type": "num"`);
    }
  }
}

/**
 * The example is what the model imitates, so it has to survive the real
 * grammar. Building the marker and parsing it back is the only check that
 * proves prompt and regex agree.
 */
function checkExample(t, at) {
  for (const f of t.fields) {
    const value = t.example?.[f.key];
    if (value === undefined || value === '') {
      fail(at, `в example нет значения для ${f.key} — превью и промпт покажут пустоту`);
      continue;
    }
    if (/[|\]]/.test(String(value))) {
      fail(at, `example.${f.key} содержит | или ] — эти символы ломают разбор`);
    }
    if (/[\r\n]/.test(String(value))) {
      fail(at, `example.${f.key} содержит перенос строки — маркер должен быть однострочным`);
    }
  }
  if (problems.some((p) => p.startsWith(at + ':'))) return;

  const marker = renderMarker(t.tag, t.fields, t.example);
  const template = t.fields.map((_, i) => `${SEP}$${i + 1}`).join('');
  const parsed = marker.replace(markerRegExp(t.tag, t.fields), template);

  if (!parsed.startsWith(SEP)) {
    fail(at, `собранный из example маркер не матчится своим же регексом:\n      ${marker}`);
    return;
  }

  const got = parsed.split(SEP).slice(1);
  t.fields.forEach((f, i) => {
    const want = String(t.example[f.key]).replace(/^[ \t]+/, '');
    if (got[i] !== want) {
      fail(at, `поле ${f.key} разобралось как «${got[i]}», ожидалось «${want}»`);
    }
  });
}

/**
 * Widgets share a page with the chat and with each other. Every rule must be
 * scoped under this tracker's own class or it will style somebody else.
 */
function checkCss(t, at) {
  if (!t.css) return;
  const scope = `.vld-${t.name}`;
  const css = t.css.replace(/\/\*[\s\S]*?\*\//g, '');

  let prelude = '';
  let depth = 0;
  let keyframesDepth = -1;

  for (const ch of css) {
    if (ch === '{') {
      const text = prelude.trim();
      prelude = '';
      depth += 1;

      if (text.startsWith('@')) {
        if (/^@(keyframes|-\w+-keyframes)\b/.test(text)) keyframesDepth = depth;
        continue;
      }
      if (keyframesDepth !== -1 && depth > keyframesDepth) continue;
      if (!text) continue;

      for (const selector of text.split(',')) {
        if (!scoped(selector, scope)) {
          fail(at, `селектор «${selector.trim()}» не содержит ${scope} — стиль утечёт в чат`);
        }
      }
      continue;
    }
    if (ch === '}') {
      if (keyframesDepth === depth) keyframesDepth = -1;
      depth -= 1;
      prelude = '';
      continue;
    }
    if (ch === ';' && depth === 0) {
      prelude = '';
      continue;
    }
    prelude += ch;
  }
}

/**
 * The class has to appear somewhere in the chain, as a whole token — `.vld-demo
 * .card` and `.vld-demo.compact` pass, a bare `.card` does not. Position is not
 * checked: an ancestor selector before the scope is legitimate, and demanding
 * the scope come first would outlaw the safest form of nesting.
 */
function scoped(selector, scope) {
  return new RegExp(`\\${scope}(?![\\w-])`).test(selector);
}
