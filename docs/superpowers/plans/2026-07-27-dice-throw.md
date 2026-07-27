# Dice Throw Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a replayable JS-driven D20 throw whose final value is the model-provided `R`.

**Architecture:** `widget.html` gains a stage and a shadow; `widget.css` owns the
static fallback and result styling; `widget.js` owns transient physics only.
No marker fields or prompt text change.

**Tech Stack:** Vanilla JavaScript, requestAnimationFrame, CSS transforms,
SillyTavern-JS-support.

## Global Constraints

- Final roll is always the existing `$2` value.
- No cross-message state and no new marker fields.
- Static result remains readable without JavaScript.
- Reduced-motion users see no throw.

---

### Task 1: Physics and presentation

**Files:**
- Modify: `src/dice/widget.html`
- Modify: `src/dice/widget.css`
- Create: `src/dice/widget.js`

**Interfaces:**
- Consumes: `.throw`, `.die`, `.roll`, and outcome classes `o-*`.
- Produces: `runThrow(): void`, replayed by clicking `.die`.

- [ ] Add `.arena` and `.shadow` while preserving all `$1`–`$5` placeholders.
- [ ] Add stage, rolling, landed, and reduced-motion styles.
- [ ] Implement gravity, two bounces, angular velocity, fake-number cycling,
  cancellation, final-value restoration, and click replay.
- [ ] Run `node tools/check.mjs`; expect `✓ все трекеры прошли проверку`.

### Task 2: Regression and visual verification

**Files:**
- Modify only if verification finds a defect.

**Interfaces:**
- Consumes: built `dist/dice/{ru,en}/2-regex.json`.
- Produces: `docs/media/dice-ru.gif`.

- [ ] Run `npm run all`; expect both-language adversarial suites to pass.
- [ ] Run `node tools/record.mjs ru dice`; expect a non-empty GIF.
- [ ] Inspect the GIF: flight, two impacts, final `$2`, and replay-safe resting state.
- [ ] Commit source, regenerated dist, spec, plan, and GIF.
