// Shared vocabulary for the build and the validator: where sources live, how a
// marker is parsed, and how a tracker directory turns into an in-memory object.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SRC = join(ROOT, 'src');
export const DIST = join(ROOT, 'dist');
export const NS = 'VLD';

/**
 * One field of a marker, as a zero-width lookahead.
 *
 * Zero width is the whole point: every field scans the marker from the same
 * position, so field order in the model's output does not matter. The trailing
 * empty alternative `|` makes the field optional. The obvious `(?=...)?` cannot
 * be used — per ECMAScript RepeatMatcher an iteration that matches the empty
 * string is abandoned, and abandoning it discards the capture. An assertion is
 * always zero width, so `(?=X)?` never yields a captured group in JS.
 *
 * `[^\]]` never crosses `]`, which keeps the scan inside its own marker.
 */
const CAPTURE = {
  // Anything printable. Safe in a text node, never in an attribute.
  text: '([^|\\]]*)',
  // Digits only, so the value can reach an attribute without ending it.
  num: '([0-9]{0,3})',
  // A 0–10 step, and forgiving of a model that decided to count to 100:
  // the alternation takes 10 from "100" and 8 from "87", which lands close
  // enough to be right instead of silently blanking every gauge.
  level: '(10|[0-9])',
};

export const fieldLookahead = (field) => {
  // A field with `of` accepts nothing but the words on its list. Anything the
  // model invents captures empty, so the widget falls back to its plain state
  // instead of carrying an unknown word into the markup.
  const capture = field.of
    ? `(${field.of.join('|')})`
    : (CAPTURE[field.type] ?? CAPTURE.text);

  return `(?=[^\\]]*\\|\\s*${field.key}\\s*=[ \\t]*${capture}|)`;
};

/** Whether a field's capture is narrow enough to sit inside an attribute. */
export const attributeSafe = (field) =>
  Boolean(field.of) || field.type === 'num' || field.type === 'level';

/**
 * Full marker pattern for a tag, as a bare source string (no delimiters).
 *
 * The negative lookahead after the tag stops a shorter tag from swallowing a
 * longer one: without it `VLD_HUD` matches the front of `VLD_HUDD` and renders
 * a hollow widget instead of letting the fallback hide the typo.
 */
export const markerSource = (tag, fields) =>
  `\\[\\[${tag}(?![A-Z0-9_])${fields.map(fieldLookahead).join('')}[^\\]]*\\]\\]`;

/** The same pattern in SillyTavern's stored form: `/.../g`. */
export const markerLiteral = (tag, fields) => `/${markerSource(tag, fields)}/g`;

export const markerRegExp = (tag, fields) =>
  new RegExp(markerSource(tag, fields), 'g');

/**
 * Render a marker the way the model is asked to write it.
 *
 * `trim` drops optional slots that carry no value. The blank template keeps
 * them, so the model can see every slot it may use; the worked example drops
 * them, so the model can see that leaving slots out is allowed.
 */
export const renderMarker = (tag, fields, values, { trim = false } = {}) =>
  `[[${tag}` +
  fields
    .filter((f) => !(trim && f.optional && !values[f.key]))
    .map((f) => `|${f.key}=${values[f.key] ?? ''}`)
    .join('') +
  ']]';

/**
 * Roughly how many tokens a prompt block costs, without pulling in a tokenizer.
 *
 * The pack's whole argument is that a widget is cheap, and a prompt that grows
 * to a page of rules quietly repeals it. So the budget is checked, not promised.
 *
 * Deliberately pessimistic. Latin words run about four characters to a token;
 * Cyrillic is far worse in every BPE vocabulary trained mostly on English, and
 * counting it at two keeps the estimate above the real number rather than
 * below it. Punctuation is counted whole — it rarely merges with its neighbour.
 */
export function estimateTokens(text) {
  let total = 0;

  for (const [word] of text.matchAll(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu)) {
    const cyrillic = /\p{Script=Cyrillic}/u.test(word);
    total += Math.ceil(word.length / (cyrillic ? 2 : 4));
  }
  return total;
}

/** Одна страница правил на трекер. Больше — это уже не дешёвый маркер. */
export const TOKEN_BUDGET = 600;

/**
 * The block that goes into the preset, as raw text ready to paste.
 *
 * Lives here rather than in the build so the validator can weigh the exact
 * bytes the reader will install, instead of an approximation of them.
 */
export function promptBlock(t, lang) {
  const legend = lang.legend ?? t.fields.map((f) => `${f.key} ${f.desc}`).join(' · ');

  return [
    `<vld:${t.name}>`,
    `FIRE: ${lang.when}`,
    ...(lang.dont ? [`SKIP: ${lang.dont}`] : []),
    '',
    renderMarker(t.tag, t.fields, {}),
    '',
    legend.trim(),
    '',
    `→ ${renderMarker(t.tag, t.fields, lang.example ?? {}, { trim: true })}`,
    `</vld:${t.name}>`,
    '',
  ].join('\n');
}

/**
 * Stable id derived from the tag, so rebuilding does not churn the diff.
 * SillyTavern only needs the id to be unique and uuid-shaped.
 */
export function stableId(seed) {
  const h = createHash('sha1').update(`vladislav:${seed}`).digest('hex');
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `5${h.slice(13, 16)}`,
    variant + h.slice(17, 20),
    h.slice(20, 32),
  ].join('-');
}

/** A SillyTavern regex script, with the defaults this pack always uses. */
export function regexScript({
  name,
  find,
  replace = '',
  display = true,
  minDepth = null,
  maxDepth = null,
}) {
  return {
    id: stableId(name),
    scriptName: name,
    findRegex: find,
    replaceString: replace,
    trimStrings: [],
    placement: [2],
    disabled: false,
    markdownOnly: display,
    promptOnly: !display,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth,
    maxDepth,
  };
}

/** Read every tracker under src/, sorted by its declared order. */
export function loadTrackers() {
  if (!existsSync(SRC)) return [];
  return readdirSync(SRC, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => loadTracker(e.name))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/**
 * A tracker ships once per language it declares. The marker grammar, markup and
 * styles are shared; the prompt and the widget's fixed captions are not, because
 * the model writes in whatever language the roleplay runs in.
 */
export const languages = (t) =>
  Object.entries(t.lang).map(([code, l]) => ({ code, ...l }));

export function loadTracker(name) {
  const dir = join(SRC, name);
  const read = (...file) =>
    (existsSync(join(dir, ...file)) ? readFileSync(join(dir, ...file), 'utf8').trimEnd() : '');
  const meta = JSON.parse(readFileSync(join(dir, 'tracker.json'), 'utf8'));

  return {
    ...meta,
    name,
    dir,
    html: read('widget.html'),
    js: read('widget.js'),
    skins: loadSkins(dir, read),
  };
}

/**
 * A tracker can ship several looks over one markup. Only the stylesheet
 * differs — grammar, fields and behaviour are shared, and the reader installs
 * whichever one suits the world being played. A tracker with a plain
 * widget.css has exactly one, unnamed.
 */
function loadSkins(dir, read) {
  if (!existsSync(join(dir, 'skins'))) return [{ name: '', css: read('widget.css') }];

  return readdirSync(join(dir, 'skins'))
    .filter((f) => f.endsWith('.css'))
    .sort()
    .map((f) => ({ name: f.replace(/\.css$/, ''), css: read('skins', f) }));
}

/**
 * Assemble the widget that replaces a matched marker.
 *
 * The root element is generated rather than authored, so every widget is
 * guaranteed to carry the class the performance script observes and the class
 * the stylesheet is scoped under.
 *
 * The script wrapper resolves `root` two ways. `document.currentScript` works
 * when the browser parses the tag inline; the query fallback covers hosts that
 * re-create script elements, where `currentScript` is null. The init flag makes
 * re-rendering the same message idempotent.
 */
export function renderWidget(t, chrome = {}, css = t.skins[0].css, extraClass = '') {
  const cls = `vld-${t.name}${extraClass ? ` ${extraClass}` : ''}`;
  // %key% are the widget's own fixed captions. They are not fields: the model
  // never writes them, but they still have to speak the player's language.
  const html = t.html.replace(/%([a-z][\w]*)%/g, (whole, key) => chrome[key] ?? whole);
  const parts = [`<div class="vld-w ${cls}">`, indent(html, 2)];

  if (css) parts.push(`  <style>\n${indent(css, 4)}\n  </style>`);

  if (t.js) {
    parts.push(
      '  <script>',
      '    (function () {',
      `      var root = (document.currentScript && document.currentScript.parentElement)`,
      `        || document.querySelector('.${cls}:not([data-vld-init])');`,
      "      if (!root || root.dataset.vldInit === '1') return;",
      "      root.dataset.vldInit = '1';",
      indent(t.js, 6),
      '    })();',
      '  </script>',
    );
  }

  parts.push('</div>');
  return parts.join('\n');
}

const indent = (text, n) =>
  text
    .split('\n')
    .map((line) => (line.trim() ? ' '.repeat(n) + line : ''))
    .join('\n');
