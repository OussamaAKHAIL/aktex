// AKTeX — launch fade-in.

/**
 * The splash is part of the static HTML so it is painted before the renderer
 * bundle runs. This module simply schedules its fade-out once the window has
 * loaded, with a hard fallback so a load error can never trap the UI behind it.
 */
export function initSplash(): void {
  const splash = document.getElementById('splash');
  if (!splash) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minimum = reduceMotion ? 120 : 1500;

  const hide = (): void => {
    splash.classList.add('done');
    window.setTimeout(() => splash.remove(), 750);
  };

  const schedule = (): void => {
    const elapsed = performance.now();
    const delay = Math.max(0, minimum - elapsed);
    window.setTimeout(hide, delay);
  };

  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });

  // Safety net for unusual load failures.
  window.setTimeout(() => {
    if (!splash.classList.contains('done')) hide();
  }, 5000);
}
