// Turns src/<tracker>/ into what a user actually installs.
//
// Each tracker ships one folder per language, holding exactly three files in
// the order they are used: the prompt you paste into the preset, the regex that
// renders the widget, and the cleaner that takes the marker back out of the
// context window. Prompt and regex are generated from the same field list, so
// the prompt cannot promise a field the regex does not capture.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DIST, ROOT, languages, loadTrackers, markerLiteral, NS,
  regexScript, renderMarker, renderWidget,
} from './lib.mjs';
import { serviceScripts, FORGET_DEPTH } from './service.mjs';

const trackers = loadTrackers();

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const write = (path, body) => writeFileSync(path, body.replace(/\r\n/g, '\n'), 'utf8');

const writeJson = (path, value) => write(path, JSON.stringify(value, null, 1));

// Installed once, shared by every tracker.
const serviceDir = join(DIST, 'service');
mkdirSync(serviceDir, { recursive: true });
for (const { file, script } of serviceScripts) writeJson(join(serviceDir, file), script);

// One self-contained folder per language and look: the three files a reader
// installs, in the order they install them.
for (const t of trackers) {
  for (const lang of languages(t)) {
    for (const skin of t.skins) {
      const dir = join(DIST, t.name, lang.code, skin.name);
      mkdirSync(dir, { recursive: true });

      const suffix = skin.name ? ` · ${skin.name}` : '';

      write(join(dir, '1-prompt.txt'), promptBlock(t, lang));

      writeJson(join(dir, '2-regex.json'), regexScript({
        name: `${t.title} · ${lang.code}${suffix}`,
        find: markerLiteral(t.tag, t.fields),
        replace: renderWidget(t, lang.chrome, skin.css),
        display: true,
      }));

      // Display-only rendering leaves the raw marker in the stored message, so
      // without this the marker keeps paying rent in every later request.
      writeJson(join(dir, '3-cleaner.json'), regexScript({
        name: `${t.title} · clean`,
        find: `/\\[\\[${t.tag}(?![A-Z0-9_])[^\\]\\n]*\\]{0,2}/g`,
        display: false,
        minDepth: FORGET_DEPTH,
      }));
    }
  }
}

write(join(DIST, 'preview.html'), standalonePreview(trackers));
write(join(ROOT, 'preview', 'widgets.js'), previewData(trackers));

const bundles = trackers.reduce((n, t) => n + languages(t).length * t.skins.length, 0);
console.log(
  `built ${trackers.length} tracker(s) as ${bundles} bundle(s)` +
  ` + ${serviceScripts.length} service script(s) -> dist/`,
);

/** The block that goes into the preset, as raw text ready to paste. */
function promptBlock(t, lang) {
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
    `→ ${renderMarker(t.tag, t.fields, lang.example, { trim: true })}`,
    `</vld:${t.name}>`,
    '',
  ].join('\n');
}

/**
 * One preview entry per look, each holding every state the tracker declares.
 *
 * Declared, not assigned to a const: the top-level code above runs before any
 * `const` further down is initialised, and a const here would throw.
 */
function shown(t) {
  const lang = t.lang[t.previewLang] ?? languages(t)[0];
  const states = t.preview ?? [lang.example];
  const scope = `.vld-${t.name}`;

  return t.skins.map((skin) => {
    // Only one skin is ever installed, so the shipped stylesheets are free to
    // share selectors. On the preview page they all load at once and the last
    // one would win, so each gets its own marker class — preview only, the
    // built regex keeps the stylesheet exactly as written.
    const mark = skin.name && `pv-${skin.name}`;
    const css = mark ? skin.css.replaceAll(scope, `${scope}.${mark}`) : skin.css;

    return {
      label: skin.name ? `${t.title} · ${skin.name}` : t.title,
      html: states.map((values) =>
        renderWidget(t, lang.chrome, css, mark).replace(/\$(\d+)/g, (_, n) => {
          const field = t.fields[Number(n) - 1];
          return field ? String(values[field.key] ?? '') : '';
        })).join('\n'),
    };
  });
}

/**
 * One file that needs no server and no build step to look at — for a README
 * link, a bug report, or showing someone the pack before they install it.
 */
function standalonePreview(list) {
  const sections = list.flatMap((t) => shown(t).map((v) => `
<section>
  <h2>${v.label}</h2>
  <code>[[${t.tag}|…]]</code>
  <div class="stages">
    <div class="stage light">${v.html}</div>
    <div class="stage dark">${v.html}</div>
  </div>
</section>`)).join('\n');

  return `<!doctype html>
<meta charset="utf-8">
<title>${NS} — виджеты</title>
<style>
  body { margin:0; padding:8px 0 32px; background:#e9eaee;
         font:14px/1.5 ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif; color:#16181d }
  section { padding:20px 18px 0 }
  h2 { margin:0 0 3px; font-size:13px; font-weight:650; letter-spacing:.02em;
       text-transform:uppercase; color:#6b7280 }
  code { font-size:11px; color:#9aa1ad }
  .stages { display:flex; flex-wrap:wrap; gap:14px; margin-top:10px }
  .stage { flex:1 1 300px; min-width:0; padding:6px 14px 18px; border-radius:12px }
  .stage.light { background:#fff; border:1px solid rgba(0,0,0,.09) }
  .stage.dark  { background:#1b1d22; border:1px solid rgba(255,255,255,.1) }
</style>
${sections}
`;
}

/** The same widgets as data, for the served preview page. */
function previewData(list) {
  const entries = list.flatMap((t) => shown(t).map((v) => ({
    name: t.name,
    title: v.label,
    tag: t.tag,
    html: v.html,
  })));

  return [
    '// Generated by tools/build.mjs — do not edit.',
    `window.VLD_FORGET_DEPTH = ${FORGET_DEPTH};`,
    `window.VLD_PREVIEW = ${JSON.stringify(entries, null, 2)};`,
    '',
  ].join('\n');
}
