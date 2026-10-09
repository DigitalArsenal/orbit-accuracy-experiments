// Files the visitor saves: made in the page from what it computed, or the
// published files themselves.
export function saveBlob(name, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A pill button in `container` that saves `make()` (a string, bytes or Blob).
export function downloadButton(container, label, name, make, type) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button small';
  button.textContent = `↓ ${label}`;
  button.addEventListener('click', async () => saveBlob(name, await make(), type));
  container.appendChild(button);
  return button;
}

// A link to a published file.
export function downloadLink(container, label, href) {
  const a = document.createElement('a');
  a.className = 'button small';
  a.href = href;
  a.download = href.split('/').pop();
  a.textContent = `↓ ${label}`;
  container.appendChild(a);
  return a;
}

export const toCsv = (header, rows) => `${header.join(',')}\n${rows.map((r) => r.join(',')).join('\n')}\n`;
