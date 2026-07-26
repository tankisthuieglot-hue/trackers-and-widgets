// Catches the failures that actually ship in packs like this: a prompt that
// advertises a field the regex never captures, a stylesheet that leaks into the
// chat, an example that cannot survive its own grammar.
import { ATTRIBUTE_SAFE, languages, loadTrackers, markerRegExp, renderMarker } from './lib.mjs';

const SEP = '\u0000';
const problems = [];
const seenTags = new Map();
const seenOrders = new Map();

const fail = (where, message) => problems.push(`${where}: ${message}`);

for (const t of loadTrackers()) {
  const at = `src/${t.name}`;

  if (!t.title) fail(at, 'нет поля title');

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
  }

  if (!t.lang || !Object.keys(t.lang).length) {
    fail(at, 'нет ни одного языка в lang');
  }

  checkPlaceholders(t, at);
  checkChrome(t, at);
  checkPreview(t, at);
  checkCss(t, at);

  for (const lang of languages(t)) checkLanguage(t, lang, `${at} [${lang.code}]`);
}

/** Каждый язык — это отдельный промпт, и врать он может независимо от других. */
function checkLanguage(t, lang, at) {
  if (!lang.when) fail(at, 'нет when — модель не узнает, когда ставить маркер');

  const mentioned = lang.legend ? mentionedKeys(lang.legend) : null;
  for (const f of t.fields) {
    if (mentioned) {
      if (!mentioned.has(f.key)) fail(at, `ключ ${f.key} не упомянут в legend`);
    } else if (!f.desc) {
      fail(at, `у поля ${f.key} нет ни desc, ни legend — оно не попадёт в промпт`);
    }
  }

  checkExample(t, lang.example ?? {}, at);
}

// One broken field can trip the same check twice; the author needs the fact once.
const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`✗ ${unique.length} проблем(ы):\n`);
  for (const p of unique) console.error('  ' + p);
  process.exit(1);
}
console.log('✓ все трекеры прошли проверку');

/**
 * Which keys a hand-written legend actually names. Ranges count: `B1–B5` reads
 * better to the model than five separate lines, so it has to read as five keys
 * here too.
 */
function mentionedKeys(legend) {
  const found = new Set(legend.match(/\b[A-Z]+[0-9]*\b/g) ?? []);

  for (const [, prefix, from, to] of legend.matchAll(/\b([A-Z]+)(\d+)\s*[-–—]\s*(?:[A-Z]+)?(\d+)\b/g)) {
    for (let i = Number(from); i <= Number(to); i += 1) found.add(prefix + i);
  }
  return found;
}

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
    if (field && !ATTRIBUTE_SAFE.has(field.type)) {
      fail(at, `$${m[1]} (${field.key}) подставляется в HTML-атрибут — объяви поле как "type": "num" или "level"`);
    }
  }
}

/** Каждая подстановка %имя% в разметке должна быть переведена на каждый язык. */
function checkChrome(t, at) {
  const used = new Set([...t.html.matchAll(/%([a-z][\w]*)%/g)].map((m) => m[1]));

  for (const lang of languages(t)) {
    for (const key of used) {
      if (!lang.chrome?.[key]) fail(at, `нет подписи %${key}% для языка ${lang.code}`);
    }
    for (const key of Object.keys(lang.chrome ?? {})) {
      if (!used.has(key)) fail(at, `подпись %${key}% (${lang.code}) нигде не используется`);
    }
  }
}

function checkPreview(t, at) {
  if (t.previewLang && !t.lang?.[t.previewLang]) {
    fail(at, `previewLang «${t.previewLang}» не объявлен в lang`);
  }

  for (const [i, state] of (t.preview ?? []).entries()) {
    for (const [key, value] of Object.entries(state)) {
      if (!t.fields.some((f) => f.key === key)) {
        fail(at, `preview[${i}] задаёт неизвестное поле ${key}`);
      }
      if (/[|\]\r\n]/.test(String(value))) {
        fail(at, `preview[${i}].${key} содержит | ] или перенос строки`);
      }
    }
  }
}

/**
 * The example is what the model imitates, so it has to survive the real
 * grammar. Building the marker and parsing it back is the only check that
 * proves prompt and regex agree.
 */
function checkExample(t, example, at) {
  for (const f of t.fields) {
    const value = example[f.key];
    if (value === undefined || value === '') {
      // An optional slot with no example is the point: the example shows the
      // model that leaving slots out is allowed.
      if (!f.optional) {
        fail(at, `в example нет значения для ${f.key} — промпт покажет пустоту`);
      }
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

  const marker = renderMarker(t.tag, t.fields, example, { trim: true });
  const template = t.fields.map((_, i) => `${SEP}$${i + 1}`).join('');
  const parsed = marker.replace(markerRegExp(t.tag, t.fields), template);

  if (!parsed.startsWith(SEP)) {
    fail(at, `собранный из example маркер не матчится своим же регексом:\n      ${marker}`);
    return;
  }

  const got = parsed.split(SEP).slice(1);
  t.fields.forEach((f, i) => {
    const want = String(example[f.key] ?? '').replace(/^[ \t]+/, '');
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

      for (const selector of splitSelectors(text)) {
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
 * Split a selector list on its own commas. The commas inside `:has(.a, .b)`
 * and `:is(…)` belong to the pseudo-class, not to the list.
 */
function splitSelectors(text) {
  const out = [];
  let depth = 0;
  let current = '';

  for (const ch of text) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;

    if (ch === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

/**
 * The class has to appear somewhere in the chain, as a whole token — `.vld-hud
 * .card` and `.vld-hud.compact` pass, a bare `.card` does not. Position is not
 * checked: an ancestor selector before the scope is legitimate, and demanding
 * the scope come first would outlaw the safest form of nesting.
 */
function scoped(selector, scope) {
  return new RegExp(`\\${scope}(?![\\w-])`).test(selector);
}
