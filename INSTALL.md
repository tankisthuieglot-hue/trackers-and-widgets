# Installation

This guide installs one Trackers & Widgets language bundle and any number of its widgets.

## Requirements

- SillyTavern
- The
  [SillyTavern-JS-support](https://github.com/MiNtorikaSoul/SillyTavern-JS-support)
  extension
- One Trackers & Widgets bundle:
  [English](https://github.com/tankisthuieglot-hue/trackers-and-widgets/releases/latest/download/trackers-and-widgets-en.zip)
  or
  [Russian](https://github.com/tankisthuieglot-hue/trackers-and-widgets/releases/latest/download/trackers-and-widgets-ru.zip)

The widgets can still render basic HTML and CSS without JS-support, but
JavaScript interactions and one-shot animations will not work correctly.

## 1. Import the shared service regexes once

Open **Extensions → Regex → Import** and import every JSON file from the
bundle's `service/` folder in filename order.

| File | Purpose |
|---|---|
| `00-perf.json` | Pauses widget animations outside the viewport |
| `01-clean-comments.json` | Removes model-written HTML comments from outgoing context |
| `02-clean-style.json` | Removes model-written style blocks from outgoing context |
| `03-clean-script.json` | Removes model-written script blocks from outgoing context |
| `99-fallback.json` | Hides malformed Trackers & Widgets markers from the visible chat |

Order matters: `99-fallback` must remain below every widget renderer. Otherwise,
it can hide the marker before the widget regex gets a chance to render it.

## 2. Install a widget

Each widget folder contains exactly three files:

```text
1-prompt.txt
2-regex.json
3-cleaner.json
```

### Add the prompt

Open `1-prompt.txt` and copy its complete raw text.

In SillyTavern, open **AI Response Configuration → Prompts**, create a prompt
with the **System** role, paste the text, place it after your main roleplay
instructions, and enable it.

### Import the renderer

Open **Extensions → Regex → Import** and select `2-regex.json`.

This display-only regex replaces a short marker with the visual widget. The
generated HTML, CSS, and JavaScript are not sent to the model.

### Import the cleaner

Import `3-cleaner.json` in the same place.

The cleaner removes that widget's markers from outgoing context after they are
more than three messages deep. Recent markers remain available briefly so the
model can maintain continuity.

## 3. Check the Regex order

The list should follow this structure:

```text
00-perf
01-clean-comments
02-clean-style
03-clean-script

widget renderers and cleaners

99-fallback
```

The exact order between different widget renderers does not matter because each
uses a unique `VLD_*` marker.

## Languages

Install either `en` or `ru`, never both versions of the same widget.

The bundle language controls fixed labels such as “Carrying” or “Throw again”.
The prompt instructs the model to write generated values in the language of the
current roleplay.

## Updating

Download the latest bundle and import the changed `2-regex.json` again. Replace
the old renderer when SillyTavern asks about the duplicate script. Replace the
prompt text if `1-prompt.txt` changed.

The cleaner usually changes only when the marker format changes.

## Troubleshooting

### A raw `[[VLD_...]]` marker appears

The widget's `2-regex.json` is missing, disabled, or below `99-fallback`.

### Nothing appears even though the model produced a marker

Move the widget renderer above `99-fallback`. The fallback is intentionally
designed to hide malformed or otherwise unhandled markers.

### The widget appears, but clicking or one-shot animation does nothing

Install or update
[SillyTavern-JS-support](https://github.com/MiNtorikaSoul/SillyTavern-JS-support),
then refresh SillyTavern.

### The model never produces the widget

Confirm that `1-prompt.txt` was copied in full, uses the System role, and is
enabled in the active preset.

### The model produces it too often

Do not add stronger global instructions. Edit the `FIRE:` and `SKIP:` lines in
that widget's prompt to fit your roleplay style.
