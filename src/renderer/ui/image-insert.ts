// AKTeX — image insertion dialog.
//
// The chosen image is copied into `<project>/figures/` through the main
// process so the generated LaTeX uses a portable relative path. A blob URL is
// used for the local preview; the CSP explicitly allows `blob:` images.

import { toast } from './toast';

export interface ImageInsertOptions {
  projectPath: string | null;
  onInsert: (latex: string) => void;
  hasGraphicx: () => boolean;
}

function mimeFor(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'bmp': return 'image/bmp';
    case 'svg': return 'image/svg+xml';
    default: return 'image/png';
  }
}

function normalizeWidth(raw: string): string {
  const value = raw.trim();
  if (!value) return '0.8\\textwidth';
  if (/^[0-9.]+$/.test(value)) return `${value}\\textwidth`;
  return value;
}

function sanitizeLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9:_-]/g, '');
}

export function openImageInserter(options: ImageInsertOptions): void {
  const existing = document.getElementById('image-inserter-overlay');
  if (existing) {
    existing.querySelector<HTMLButtonElement>('[data-image-action="choose"]')?.click();
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'image-inserter-overlay';
  overlay.innerHTML = `
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="image-inserter-title">
      <div class="dialog-head">
        <h2 id="image-inserter-title">Insert Image</h2>
        <span class="dialog-sub">Copied into the project</span>
        <button class="dialog-close" type="button" aria-label="Close image dialog">
          <svg class="ak-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><use href="#ak-icon-close"></use></svg>
        </button>
      </div>
      <div class="dialog-body">
        <div class="image-drop" id="image-drop" role="button" tabindex="0" aria-label="Choose an image">
          <svg class="ak-icon" width="30" height="30" viewBox="0 0 16 16" aria-hidden="true"><use href="#ak-icon-image"></use></svg>
          <strong>Choose an image</strong>
          <span class="hint">PNG, JPG, GIF, WebP, BMP or SVG</span>
          <button class="btn secondary" type="button" data-image-action="choose">Browse…</button>
        </div>
        <div class="image-meta" id="image-meta"></div>
        <div class="warning-badge" id="graphicx-warning" hidden>
          <svg class="ak-icon" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><use href="#ak-icon-warning"></use></svg>
          <span>graphicx was not detected in the open document. Add <code>\\usepackage{graphicx}</code> to the preamble.</span>
        </div>
        <div class="field-row" style="margin-top:14px">
          <div class="field" style="max-width:180px">
            <label for="image-width">Width</label>
            <input id="image-width" type="text" value="0.8\\textwidth" spellcheck="false" />
          </div>
          <div class="field" style="max-width:150px">
            <label for="image-placement">Placement</label>
            <select id="image-placement">
              <option value="h">h — here</option>
              <option value="t">t — top</option>
              <option value="b">b — bottom</option>
              <option value="p">p — page</option>
              <option value="H">H — float here</option>
            </select>
          </div>
          <div class="field">
            <label for="image-caption">Caption (optional)</label>
            <input id="image-caption" type="text" placeholder="A descriptive caption" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="image-label">Label (optional)</label>
            <input id="image-label" type="text" placeholder="fig:diagram" spellcheck="false" />
          </div>
        </div>
        <div class="check-row">
          <label><input type="checkbox" id="image-figure" checked /> Wrap in a figure environment</label>
          <label><input type="checkbox" id="image-center" checked /> Center the graphic</label>
        </div>
        <p class="hint">The image will be copied to <code>figures/</code> inside the current project and referenced with a relative path.</p>
      </div>
      <div class="dialog-foot">
        <button class="btn secondary" type="button" data-image-action="cancel">Cancel</button>
        <span class="foot-spacer"></span>
        <button class="btn secondary" type="button" data-image-action="graphic" disabled>Insert graphic only</button>
        <button class="btn primary" type="button" data-image-action="insert" disabled>Insert</button>
      </div>
    </div>`;

  document.getElementById('overlay-root')?.appendChild(overlay);

  const drop = overlay.querySelector<HTMLElement>('#image-drop');
  const meta = overlay.querySelector<HTMLElement>('#image-meta');
  const warning = overlay.querySelector<HTMLElement>('#graphicx-warning');
  const widthInput = overlay.querySelector<HTMLInputElement>('#image-width');
  const placement = overlay.querySelector<HTMLSelectElement>('#image-placement');
  const caption = overlay.querySelector<HTMLInputElement>('#image-caption');
  const label = overlay.querySelector<HTMLInputElement>('#image-label');
  const figureCheck = overlay.querySelector<HTMLInputElement>('#image-figure');
  const centerCheck = overlay.querySelector<HTMLInputElement>('#image-center');
  const insertButton = overlay.querySelector<HTMLButtonElement>('[data-image-action="insert"]');
  const graphicButton = overlay.querySelector<HTMLButtonElement>('[data-image-action="graphic"]');
  if (!drop || !meta || !warning || !widthInput || !placement || !caption || !label || !figureCheck || !centerCheck || !insertButton || !graphicButton) return;

  let sourcePath: string | null = null;
  let previewUrl: string | null = null;

  const close = (): void => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown, true);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const updateWarning = (): void => {
    warning.hidden = options.hasGraphicx();
  };

  const setEnabled = (enabled: boolean): void => {
    insertButton.disabled = !enabled;
    graphicButton.disabled = !enabled;
  };

  const choose = async (): Promise<void> => {
    try {
      const picked = await window.aktext.pickImage();
      if (!picked) return;
      sourcePath = picked.path;
      const data = await window.aktext.readBinaryFile(picked.path);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const bytes = new Uint8Array(data);
      previewUrl = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: mimeFor(picked.name) }));

      drop.classList.add('has-image');
      drop.innerHTML = '';
      const image = document.createElement('img');
      image.src = previewUrl;
      image.alt = picked.name;
      drop.appendChild(image);

      const base = picked.name.replace(/\.[^.]+$/, '');
      if (label && !label.value.trim()) label.value = `fig:${sanitizeLabel(base)}`;
      if (caption && !caption.value.trim()) caption.value = '';
      meta.textContent = picked.path;
      setEnabled(true);
      updateWarning();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const buildLatex = (wrapInFigure: boolean, relative: string): string => {
    if (!sourcePath || !relative) return '';
    const width = normalizeWidth(widthInput.value);
    const include = `\\includegraphics[width=${width}]{${relative}}`;
    if (!wrapInFigure) return include;

    const lines: string[] = [];
    lines.push(`\\begin{figure}[${placement.value}]`);
    if (centerCheck.checked) lines.push('  \\centering');
    lines.push(`  ${include}`);
    const captionText = caption.value.trim();
    if (captionText) lines.push(`  \\caption{${captionText}}`);
    const labelText = sanitizeLabel(label.value);
    if (labelText) lines.push(`  \\label{${labelText}}`);
    lines.push('\\end{figure}');
    return lines.join('\n');
  };

  const doInsert = async (wrapInFigure: boolean): Promise<void> => {
    if (!sourcePath) {
      await choose();
      if (!sourcePath) return;
    }
    try {
      const imported = await window.aktext.importImage(sourcePath, options.projectPath);
      if (!imported) {
        toast('Open a project before inserting an image.', 'error');
        return;
      }
      const latex = buildLatex(wrapInFigure, imported.relativePath);
      if (!latex) {
        toast('Could not build the LaTeX snippet.', 'error');
        return;
      }
      options.onInsert(latex);
      toast(`Inserted ${imported.relativePath}`);
      close();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  drop.addEventListener('click', () => { void choose(); });
  drop.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void choose();
    }
  });
  overlay.querySelector('[data-image-action="choose"]')?.addEventListener('click', (event) => {
    event.stopPropagation();
    void choose();
  });
  overlay.querySelector('[data-image-action="cancel"]')?.addEventListener('click', close);
  overlay.querySelector('.dialog-close')?.addEventListener('click', close);
  insertButton.addEventListener('click', () => { void doInsert(true); });
  graphicButton.addEventListener('click', () => { void doInsert(false); });
  overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });

  figureCheck.addEventListener('change', () => {
    const wrapped = figureCheck.checked;
    caption.disabled = !wrapped;
    label.disabled = !wrapped;
    placement.disabled = !wrapped;
    centerCheck.disabled = !wrapped;
  });

  document.addEventListener('keydown', onKeyDown, true);
  updateWarning();
  void choose();
}
