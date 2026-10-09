// hd-wallet-wasm, the public npm package, loaded once per page.
import init, { Curve, X509Encoding } from 'hd-wallet-wasm';

export { Curve, X509Encoding };
export const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
let wallet;
export async function loadWallet(ctx) {
  if (!wallet) {
    wallet = init().then((w) => { w.injectEntropy?.(crypto.getRandomValues(new Uint8Array(32))); return w; });
    ctx.record({ path: 'hd-wallet-wasm', version: __HD_WALLET_VERSION__, source: 'npm' });
  }
  return wallet;
}
export const hex = (w, bytes) => w.utils.encodeHex(bytes);
