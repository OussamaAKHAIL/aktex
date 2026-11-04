// AKTeX — small transient notifications.

export type ToastKind = 'info' | 'error';

export function toast(message: string, kind: ToastKind = 'info', timeout = 3200): void {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const element = document.createElement('div');
  element.className = `toast${kind === 'error' ? ' error' : ''}`;
  element.textContent = message;
  root.appendChild(element);
  window.setTimeout(() => {
    element.style.transition = 'opacity .18s ease, transform .18s ease';
    element.style.opacity = '0';
    element.style.transform = 'translateY(4px)';
    window.setTimeout(() => element.remove(), 220);
  }, timeout);
}

/** Escape text for safe insertion into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
