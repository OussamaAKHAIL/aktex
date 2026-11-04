// AKTeX — collapsible Output / Problems terminal.

import { persistLogCollapsed, restoreCollapsedState } from './layout';

type LogTab = 'output' | 'problems';

let collapsed = false;
let activeTab: LogTab = 'output';

const COLLAPSE_ICON_ID = 'ak-icon-log-close';
const EXPAND_ICON_ID = 'ak-icon-log-open';

function useIcon(button: HTMLButtonElement, iconId: string): void {
  const use = button.querySelector('use');
  if (use) use.setAttribute('href', `#${iconId}`);
}

function refreshLogToggle(persist = true): void {
  const panel = document.getElementById('log-panel');
  const splitter = document.getElementById('log-splitter');
  if (!panel || !splitter) return;
  panel.classList.toggle('collapsed', collapsed);
  splitter.classList.toggle('hidden', collapsed);

  const title = collapsed ? 'Open log panel' : 'Collapse log panel';
  for (const id of ['btn-log-collapse', 'btn-toggle-log-title']) {
    const button = document.getElementById(id) as HTMLButtonElement | null;
    if (!button) continue;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.setAttribute('aria-expanded', String(!collapsed));
    useIcon(button, collapsed ? EXPAND_ICON_ID : COLLAPSE_ICON_ID);
  }
  if (persist) persistLogCollapsed(collapsed);
}

export function setLogCollapsed(next: boolean): void {
  collapsed = next;
  refreshLogToggle();
}

export function isLogCollapsed(): boolean {
  return collapsed;
}

export function openLog(): void {
  if (collapsed) setLogCollapsed(false);
}

export function toggleLog(): void {
  setLogCollapsed(!collapsed);
}

export function setLogTab(tab: LogTab): void {
  activeTab = tab;
  const logScroll = document.getElementById('log-scroll');
  if (!logScroll) return;
  document.querySelectorAll<HTMLButtonElement>('.log-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.log === tab);
  });
  logScroll.querySelectorAll<HTMLElement>('.log-line').forEach((line) => {
    line.hidden = tab === 'problems' && line.dataset.type === 'info';
  });
}

export function initLogPanel(): void {
  const state = restoreCollapsedState();
  collapsed = state.log;

  const collapseButton = document.getElementById('btn-log-collapse');
  const titleButton = document.getElementById('btn-toggle-log-title');
  collapseButton?.addEventListener('click', toggleLog);
  titleButton?.addEventListener('click', toggleLog);

  document.querySelectorAll<HTMLButtonElement>('.log-tab').forEach((button) => {
    button.addEventListener('click', () => setLogTab(button.dataset.log === 'problems' ? 'problems' : 'output'));
  });

  refreshLogToggle(false);
  setLogTab(activeTab);
}
