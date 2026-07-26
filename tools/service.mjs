// The six scripts that are not trackers: they make the pack behave in a long
// chat. Numbered so that importing the dist folder in filename order gives
// SillyTavern the right execution order.
import { regexScript, NS } from './lib.mjs';

/**
 * How many recent messages keep their markers in the outgoing prompt.
 * Below this depth the markers are stripped, so old widget data stops paying
 * rent in the context window. Raise it if the model loses track of state it
 * should still remember.
 */
export const FORGET_DEPTH = 5;

/** Any marker of ours, however malformed — missing brackets included. */
const ANY_MARKER = `/\\[\\[${NS}_[A-Z0-9_]*[^\\]\\n]*\\]{0,2}/g`;

const PERF_LOADER = `
(function () {
  if (window.__VLD_PERF__) return;
  window.__VLD_PERF__ = true;

  var style = document.createElement('style');
  style.textContent =
    '.vld-idle *{animation-play-state:paused!important;transition:none!important}' +
    '@media (prefers-reduced-motion:reduce){.vld-w *{animation:none!important;transition:none!important}}';
  (document.head || document.documentElement).appendChild(style);

  var io = 'IntersectionObserver' in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          e.target.classList.toggle('vld-idle', !e.isIntersecting);
        });
      }, { rootMargin: '200px 0px', threshold: 0.01 })
    : null;

  function watch(el) {
    if (!io || el.dataset.vldWatched === '1') return;
    el.dataset.vldWatched = '1';
    io.observe(el);
  }

  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.classList.contains('vld-w')) watch(node);
    node.querySelectorAll('.vld-w').forEach(watch);
  }

  scan(document.body || document.documentElement);

  if ('MutationObserver' in window) {
    new MutationObserver(function (records) {
      records.forEach(function (r) { r.addedNodes.forEach(scan); });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();`.trim();

export const serviceScripts = [
  {
    file: '00-perf.json',
    script: regexScript({
      name: '⚙️ VLD 00 PERF',
      // Appends the loader to the end of each rendered message; the global flag
      // means only the first one does any work.
      find: '/([\\s\\S])$/',
      replace: `$1\n<script>\n${PERF_LOADER}\n</script>`,
      display: true,
    }),
  },
  {
    file: '01-clean-comments.json',
    script: regexScript({
      name: '🧹 VLD 01 CLEAN COMMENTS',
      find: '/<!--[\\s\\S]*?-->/g',
      display: false,
      minDepth: 0,
    }),
  },
  {
    file: '02-clean-style.json',
    script: regexScript({
      name: '🧹 VLD 02 CLEAN STYLE',
      find: '/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi',
      display: false,
      minDepth: 0,
    }),
  },
  {
    file: '03-clean-script.json',
    script: regexScript({
      name: '🧹 VLD 03 CLEAN SCRIPT',
      find: '/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi',
      display: false,
      minDepth: 0,
    }),
  },
  {
    file: '04-forget.json',
    script: regexScript({
      name: '🕳️ VLD 04 FORGET',
      find: ANY_MARKER,
      display: false,
      minDepth: FORGET_DEPTH,
    }),
  },
  {
    file: '99-fallback.json',
    script: regexScript({
      name: '🛟 VLD 99 FALLBACK',
      // Last in the list: whatever reaches this point matched no widget, so it
      // is broken. Hide it rather than show the reader raw markup.
      find: ANY_MARKER,
      display: true,
    }),
  },
];
