// harness/prw.mjs imports node:crypto for kernelFrame, which hashes a kernel.
// The site ships its kernel frame prebuilt (site/build.mjs), so nothing here
// is ever called in the browser.
export function createHash() {
  throw new Error('node:crypto is not available in the browser; the site uses prebuilt kernel frames.');
}
