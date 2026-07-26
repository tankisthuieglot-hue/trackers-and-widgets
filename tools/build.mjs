// Turns src/<tracker>/ into the two things a user actually installs:
// regex scripts for SillyTavern and a prompts file to paste into a preset.
// Both come from the same tracker.json, so the prompt cannot promise a field
// the regex does not capture.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DIST, ROOT, loadTrackers, markerLiteral, regexScript, renderMarker, renderWidget,
} from './lib.mjs';
import { serviceScripts, FORGET_DEPTH } from './service.mjs';

/** Shared preamble: without it the model has no idea when a marker is warranted. */
const RULES = `
<vld:rules>
Маркеры — это состояние сцены, а не украшение. Регекс превращает их в виджеты.

КОГДА: только если деталь меняет или проясняет сцену. 1–3 маркера на ответ.
Маркер ставит {{char}} или мир, но не {{user}} за кадром.

ФОРМАТ:
- Каждый маркер на своей строке, не внутри прозы.
- Внутри значений запрещены символы | и ]
- Один и тот же маркер — не больше одного раза за ответ.
- Порядок полей произволен, лишние поля можно опустить.
- Не выдумывай новые маркеры и не пиши HTML вручную.

ЯЗЫК: текст внутри маркеров — русский, кроме названий брендов и приложений.
ДЛИНА: коротко, значения читаются на экране телефона.
</vld:rules>`;

/** Every widget filled with its own example, exactly as a reader would see it. */
const filled = (t) =>
  renderWidget(t).replace(/\$(\d+)/g, (_, n) => {
    const field = t.fields[Number(n) - 1];
    return field ? String(t.example[field.key] ?? '') : '';
  });

const trackers = loadTrackers();
const regexDir = join(DIST, 'regex');

rmSync(regexDir, { recursive: true, force: true });
mkdirSync(regexDir, { recursive: true });

const write = (path, body) => writeFileSync(path, body.replace(/\r\n/g, '\n'), 'utf8');

for (const { file, script } of serviceScripts) {
  write(join(regexDir, file), JSON.stringify(script, null, 1));
}

for (const t of trackers) {
  const script = regexScript({
    name: t.title,
    find: markerLiteral(t.tag, t.fields),
    replace: renderWidget(t),
    display: true,
  });
  const file = `${String(t.order).padStart(2, '0')}-vld-${t.name}.json`;
  write(join(regexDir, file), JSON.stringify(script, null, 1));
}

write(join(DIST, 'prompts.md'), promptsFile(trackers));
write(join(ROOT, 'preview', 'widgets.js'), previewData(trackers));
write(join(DIST, 'preview.html'), standalonePreview(trackers));

console.log(
  `built ${trackers.length} tracker(s) + ${serviceScripts.length} service script(s) -> dist/`,
);

/** One preset-ready block per tracker, plus the shared output rules. */
function promptsFile(list) {
  const blocks = list.map((t) => {
    // A hand-written legend earns its keep once repeated slots would turn the
    // generated one-liner into a wall. The validator still requires every key
    // to appear in it, so it cannot drift from the fields.
    const legend = t.legend ?? t.fields.map((f) => `${f.key} ${f.desc}`).join(' · ');
    const lines = [
      `<vld:${t.name}>`,
      `FIRE: ${t.when}`,
      ...(t.dont ? [`SKIP: ${t.dont}`] : []),
      '',
      renderMarker(t.tag, t.fields, {}),
      '',
      legend.trim(),
      '',
      `→ ${renderMarker(t.tag, t.fields, t.example, { trim: true })}`,
      `</vld:${t.name}>`,
    ];
    return `## ${t.title}\n\n\`\`\`\n${lines.join('\n')}\n\`\`\``;
  });

  return [
    '# vladislav — блоки для пресета',
    '',
    'Собрано автоматически, править здесь бессмысленно — правь `src/` и запусти `npm run build`.',
    '',
    'Каждый блок добавляется в пресет отдельным промптом с ролью **system**.',
    'Начни с правил вывода — без них модель не знает, когда маркеры уместны.',
    '',
    '## Правила вывода',
    '',
    '```',
    RULES.trim(),
    '```',
    '',
    ...blocks.flatMap((b) => [b, '']),
  ].join('\n');
}

/**
 * One file that needs no server and no build step to look at — for a README
 * link, a bug report, or showing someone the pack before they install it.
 */
function standalonePreview(list) {
  const sections = list.map((t) => `
<section>
  <h2>${t.title}</h2>
  <code>[[${t.tag}|…]]</code>
  <div class="stages">
    <div class="stage light">${filled(t)}</div>
    <div class="stage dark">${filled(t)}</div>
  </div>
</section>`).join('\n');

  return `<!doctype html>
<meta charset="utf-8">
<title>vladislav — виджеты</title>
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
  const entries = list.map((t) => ({
    name: t.name, title: t.title, tag: t.tag, html: filled(t),
  }));

  return [
    '// Generated by tools/build.mjs — do not edit.',
    `window.VLD_FORGET_DEPTH = ${FORGET_DEPTH};`,
    `window.VLD_PREVIEW = ${JSON.stringify(entries, null, 2)};`,
    '',
  ].join('\n');
}
