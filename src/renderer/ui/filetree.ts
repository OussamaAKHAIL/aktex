// AKTeX — File Tree Sidebar
// Codex: render project directory tree and handle file selection.

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

export function renderFileTree(
  container: HTMLElement,
  nodes: FileNode[],
  onFileClick: (path: string) => void,
): void {
  container.innerHTML = '';
  const ul = document.createElement('ul');
  ul.style.listStyle = 'none';
  ul.style.padding = '4px 0';

  for (const node of nodes) {
    const li = renderNode(node, onFileClick, 0);
    ul.appendChild(li);
  }

  container.appendChild(ul);
}

function renderNode(
  node: FileNode,
  onFileClick: (path: string) => void,
  depth: number,
): HTMLLIElement {
  const li = document.createElement('li');
  li.style.paddingLeft = `${12 + depth * 12}px`;
  li.style.padding = '4px 8px 4px ' + `${12 + depth * 12}px`;
  li.style.cursor = node.isDirectory ? 'default' : 'pointer';
  li.style.fontSize = '13px';
  li.style.color = node.isDirectory ? '#8892a4' : '#eaeaea';
  li.style.userSelect = 'none';

  const icon = node.isDirectory ? '📁' : getFileIcon(node.name);
  li.textContent = `${icon} ${node.name}`;

  if (!node.isDirectory) {
    li.addEventListener('click', () => onFileClick(node.path));
    li.addEventListener('mouseenter', () => { li.style.background = '#0f3460'; });
    li.addEventListener('mouseleave', () => { li.style.background = ''; });
  }

  if (node.isDirectory && node.children) {
    const childUl = document.createElement('ul');
    childUl.style.listStyle = 'none';
    childUl.style.padding = '0';
    for (const child of node.children) {
      childUl.appendChild(renderNode(child, onFileClick, depth + 1));
    }
    li.appendChild(childUl);
  }

  return li;
}

function getFileIcon(filename: string): string {
  if (filename.endsWith('.tex')) return '📄';
  if (filename.endsWith('.bib')) return '📚';
  if (filename.endsWith('.pdf')) return '📕';
  if (filename.endsWith('.png') || filename.endsWith('.jpg')) return '🖼';
  return '📄';
}
