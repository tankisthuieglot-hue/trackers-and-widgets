# Authoring a tracker

Copy an existing folder from `src/` and rename it. The folder name becomes the
widget's required CSS scope:

```text
src/wallet/
├── tracker.json    marker contract, languages, and examples
├── widget.html     inner widget markup
├── widget.css      scoped visual design
└── widget.js       optional interaction or motion
```

Run:

```bash
npm run check
npm run build
npm run preview
```

The build writes three installable files per language to
`dist/wallet/<language>/`. Prompt and regex are generated from the same field
contract, so they cannot silently drift apart.

## `tracker.json`

```json
{
  "tag": "VLD_WALLET",
  "title": "💳 VLD WALLET",
  "order": 12,
  "previewLang": "en",
  "fields": [
    { "key": "T", "desc": "card or app name" },
    { "key": "B", "desc": "balance" }
  ],
  "lang": {
    "en": {
      "chrome": { "balance": "Balance" },
      "when": "money changes hands and it matters",
      "dont": "every small purchase",
      "example": { "T": "Sapphire", "B": "$184.20" }
    }
  }
}
```

### Tracker properties

| Property | Meaning |
|---|---|
| `tag` | Unique `VLD_` marker written in uppercase |
| `order` | Unique number from 10 to 98; service scripts reserve 00–03 and 99 |
| `previewLang` | Language used by screenshots and previews |
| `fields` | Field order determines `$1`, `$2`, and later replacement slots |
| `preview` | Optional list of preview states instead of one language example |

### Field properties

| Property | Meaning |
|---|---|
| `desc` | Prompt description used when a language has no custom `legend` |
| `type: "num"` | Accept digits only |
| `type: "level"` | Accept an integer from 0 to 10 |
| `of` | Closed lowercase enum; every other value captures as empty |
| `optional` | The language example does not have to populate this field |

An enum can safely become a CSS class:

```json
{ "key": "EF", "optional": true, "of": ["blur", "poison", "bleed"] }
```

```html
<div class="panel fx-$3">
```

```css
.vld-wallet .fx-blur .value { filter: blur(3px); }
```

Check effect classes by exact name. An empty enum becomes the literal class
`fx-`, so `[class*="fx-"]` would incorrectly treat an absent effect as active.

### Language properties

| Property | Meaning |
|---|---|
| `when` | Becomes the prompt's `FIRE:` rule |
| `dont` | Becomes the prompt's `SKIP:` rule |
| `chrome` | Fixed UI labels replacing `%name%` placeholders |
| `example` | Complete model-facing marker example |
| `exampleLabel` | Optional localized “Example” label |
| `legend` | Optional hand-written field rules |

Every generated prompt has a hard 600-token ceiling. This limit covers the
entire block: fire and skip rules, empty marker template, field legend, and
filled example. If a prompt grows too large, remove unnecessary fields and
shorten the example before weakening important constraints.

The model may emit fields in any order and omit any field. The generated marker
grammar handles both.

## `widget.html`

Write only the widget's inner markup. The build adds the root
`<div class="vld-w vld-wallet">`.

Use `$1`, `$2`, and later slots according to field order. Every declared field
must appear at least once; asking the model for an unused field wastes tokens
and fails validation.

### Values inside attributes

Only `num`, `level`, or enum fields may be interpolated into HTML attributes:

```html
<span class="bar lv-$2"><span class="fill"></span></span>
```

```css
.vld-wallet .lv-1 .fill { width: 10%; }
.vld-wallet .lv-2 .fill { width: 20%; }
```

Free text in an attribute is unsafe because a quote supplied by the model could
close the attribute. The validator rejects it.

`level` is intentionally forgiving: a model using `87` on a 0–100 scale is
read as 8, and `100` is read as 10.

### Missing or malformed fields

Text captures stop before `<`, preventing model-written tags from becoming
markup. Empty values should hide their own row:

```css
.vld-wallet .entry:has(.value:empty) { display: none; }
```

Unknown fields are ignored. For unbounded content such as an inventory, prefer
one comma-separated text field over a fixed number of item slots.

## `widget.css`

Every selector must contain `.vld-<folder-name>`:

```css
.vld-wallet { }             /* valid */
.vld-wallet .card { }       /* valid and preferred */
.card { }                   /* invalid: leaks into the chat page */
```

Use fixed colors that remain readable on both light and dark chat backgrounds.
Animations are welcome, but `prefers-reduced-motion` must disable them.
`00-perf.json` pauses off-screen Vladislav widgets.

## `widget.js`

JavaScript is optional and depends on
[SillyTavern-JS-support](https://github.com/MiNtorikaSoul/SillyTavern-JS-support).
Prefer CSS when it can provide the same result.

The build wraps `widget.js` in a function where `root` already points to this
widget instance:

```js
root.querySelectorAll('.item').forEach(function (item) {
  item.addEventListener('click', function () {
    item.classList.toggle('done');
  });
});
```

Keep all queries and mutations inside `root`. One-shot timeouts are fine;
permanent intervals are not. Long chats can contain many widget instances.

A widget must not depend on markers from old messages. Markers are removed from
model context after depth 3, so everything needed to render a widget must be
present in its own marker.

For a one-shot animation in a streamed response, do not subscribe to a
generation event from inside the widget: JS-support may revive the script after
that event has already fired. Instead, wait for the containing `.mes_text` DOM
to stop changing. See `src/dice/widget.js`.

## Validation

`npm run check` verifies:

- unique tags matching `VLD_[A-Z0-9_]+`
- unique order values from 10 to 98
- valid and unique field keys
- descriptions or legends for every field
- exact agreement between field slots and widget markup
- attribute-safe interpolations
- complete and non-redundant `%chrome%` translations
- examples without marker delimiters, newlines, or `<`
- round-trip parsing of every language example through the real regex
- the complete prompt under 600 tokens
- tracker CSS scope in every selector

`npm test` then runs malformed markers through the built regex files in English
and Russian. It checks reordered and missing fields, numeric garbage, invalid
enums, quotes, tag injection, unclosed markers, and tag typos.

## Visual tooling

```bash
node tools/shot.mjs
node tools/shot.mjs --sheet
node tools/adversarial.mjs en
node tools/record.mjs en dice
```

`shot.mjs` writes individual tracker images to `docs/media/shots/` and can build
the collection sheet used by the README. `record.mjs` uses preview states to
create a deterministic looping GIF.
