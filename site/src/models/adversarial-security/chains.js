// Section 7's table, derived: one BIP-39 seed, BIP-32/44 (secp256k1) and
// SLIP-10 (ed25519) paths, each network's address encoding, all in
// hd-wallet-wasm. With the standard test mnemonic, four networks are checked
// against their published vectors.
import { Curve, TEST_MNEMONIC, hex, loadWallet } from '../codec/wallet.js';
import { button, h, inputs, note, panel, short, table } from '../ui.js';
import { scene3d } from '../scene.js';

// Published addresses for the BIP-39 test mnemonic "abandon … about", no passphrase.
const VECTORS = {
  Bitcoin: '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA',
  Ethereum: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
  Solana: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk',
  Cosmos: 'cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4',
};

export function deriveAll(w, mnemonic) {
  const seed = () => w.mnemonic.toSeed(mnemonic, '');
  const master = w.hdkey.fromSeed(seed());
  const k1 = (path) => master.derivePath(path).publicKey();
  const ed = (path) => w.curves.ed25519.publicKeyFromSeed(w.slip10.deriveEd25519Path(seed(), path).privateKey);
  const sui = (pub) => `0x${hex(w, w.utils.blake2b(new Uint8Array([0, ...pub]), 32))}`;
  return [
    { network: 'Bitcoin', path: "m/44'/0'/0'/0/0", curve: 'secp256k1', format: 'Base58Check (P2PKH)', address: () => w.bitcoin.getAddress(k1("m/44'/0'/0'/0/0"), 0) },
    { network: 'Ethereum', path: "m/44'/60'/0'/0/0", curve: 'secp256k1', format: 'Hex (EIP-55)', address: () => w.ethereum.getAddress(k1("m/44'/60'/0'/0/0")) },
    { network: 'Solana', path: "m/44'/501'/0'/0'", curve: 'ed25519', format: 'Base58', address: () => w.solana.getAddress(ed("m/44'/501'/0'/0'")) },
    { network: 'SUI', path: "m/44'/784'/0'/0'/0'", curve: 'ed25519', format: 'Hex, BLAKE2b-256 of flag ‖ key', address: () => sui(ed("m/44'/784'/0'/0'/0'")) },
    { network: 'Cosmos', path: "m/44'/118'/0'/0/0", curve: 'secp256k1', format: 'Bech32 (cosmos1…)', address: () => w.cosmos.getAddress(k1("m/44'/118'/0'/0/0")) },
    { network: 'Cardano', path: "m/1852'/1815'/0'/0/0", curve: 'ed25519 (BIP32-Ed25519)', format: 'Bech32 (addr1…)', address: () => null },
  ].map((row) => ({ ...row, address: row.address() }));
}

export default async function run(ctx) {
  const p = panel(ctx.root, 'Seed');
  const form = inputs(p, [{ id: 'mnemonic', label: 'BIP-39 mnemonic', type: 'textarea', value: TEST_MNEMONIC, wide: true, rows: 2 }], () => derive());
  const actions = h('div', { class: 'model-actions' });
  p.append(actions);
  const view = scene3d(ctx, { title: 'One seed, two curves, six networks', earth: false });
  const out = panel(ctx.root, 'Derived addresses');
  note(ctx.root, 'Cardano’s BIP32-Ed25519 derivation is not in hd-wallet-wasm 2.0.21; its row shows the path only. Keys never leave this page.');
  const w = await loadWallet(ctx);
  button(actions, 'New random seed', () => { p.querySelector('textarea').value = w.mnemonic.generate(24); derive(); }, false);
  button(actions, 'Test mnemonic', () => { p.querySelector('textarea').value = TEST_MNEMONIC; derive(); }, false);

  async function derive() {
    const mnemonic = form.values().mnemonic.trim().replace(/\s+/g, ' ');
    await ctx.run('hd-wallet-wasm: deriving six paths', async () => {
      if (!w.mnemonic.validate(mnemonic)) throw new Error('Not a valid BIP-39 mnemonic.');
      const rows = deriveAll(w, mnemonic);
      const test = mnemonic === TEST_MNEMONIC;
      const verdict = (r) => (VECTORS[r.network] ? h('span', { class: `verdict ${VECTORS[r.network] === r.address ? 'pass' : 'fail'}` }, VECTORS[r.network] === r.address ? 'published vector' : 'differs from vector') : null);
      table(out, ['Network', 'Address'], rows.map((r) => [
        { text: h('div', { class: 'kv' }, h('code', {}, r.network), h('span', {}, r.path), h('span', {}, `${r.curve} · ${r.format}`)), class: 'wrap' },
        { text: h('div', { class: 'kv' }, h('span', { class: 'mono' }, r.address ?? 'not derived by this package'), test ? verdict(r) : null), class: 'wrap mono' },
      ]), { existing: out.querySelector('table') ?? undefined });
      const checked = rows.filter((r) => VECTORS[r.network]);
      const matched = checked.filter((r) => VECTORS[r.network] === r.address).length;
      await view.draw((g) => {
        g.grid([0, 0, 0], [1, 0, 0], [0, 1, 0], 9, 1.5);
        const seed = [0, 0, 0.6];
        g.box(seed, [1.6, 1.6, 1.2], { color: 'text', alpha: 0.35, outline: true });
        g.label(seed, 'BIP-39 seed', { color: 'text', align: 'center', dy: 30 });
        const hubs = { 'secp256k1': [-3.2, 0, 3.4], ed25519: [3.2, 0, 3.4] };
        g.sphere(hubs.secp256k1, 0.6, { color: 'accent', alpha: 0.8 });
        g.sphere(hubs.ed25519, 0.6, { color: 'cyan', alpha: 0.8 });
        g.label(hubs.secp256k1, 'BIP-32 · secp256k1', { color: 'accent', align: 'right', dx: -16, size: 11 });
        g.label(hubs.ed25519, 'SLIP-10 · ed25519', { color: 'cyan', size: 11, dx: 16 });
        g.line([seed, hubs.secp256k1], { color: 'accent', width: 2 });
        g.line([seed, hubs.ed25519], { color: 'cyan', width: 2 });
        rows.forEach((r, k) => {
          const hub = r.curve === 'secp256k1' ? 'secp256k1' : 'ed25519';
          const side = hub === 'secp256k1' ? -1 : 1, j = rows.filter((x, i) => i < k && (x.curve === 'secp256k1') === (hub === 'secp256k1')).length;
          const leaf = [side * (1.6 + 2.9 * j), 0, 6.2 + ((j + (side > 0 ? 1 : 0)) % 2) * 1.6];
          const derived = r.address !== null, vector = test && VECTORS[r.network];
          const tone = !derived ? 'muted' : vector ? (VECTORS[r.network] === r.address ? 'accent' : 'alert') : hub === 'secp256k1' ? 'accent' : 'cyan';
          g.line([hubs[hub], leaf], { color: tone, width: 1.8, dash: !derived, alpha: derived ? 0.9 : 0.6 });
          g.sphere(leaf, 0.42, { color: tone, alpha: derived ? 0.85 : 0.25, outline: !derived });
          g.label(leaf, `${r.network}\n${derived ? short(r.address, 5, 3) : 'not derived'}`, { color: derived ? 'text' : 'muted', size: 10, weight: 500, align: 'center', above: true, dy: -12 });
        });
        g.view({ center: [0, 0, 4], radius: 8.6, direction: [0.08, -1, 0.3] });
      }, { caption: test ? `${matched} of ${checked.length} published vectors matched` : 'Derived from the seed in this page',
        legend: [['accent', 'secp256k1 paths'], ['cyan', 'ed25519 paths'], ['muted', 'Not derived by this package', 'dash']] });
      return test ? `${matched} of ${checked.length} addresses match their published vectors; five networks from one seed.` : 'Five addresses from one seed, derived in this page.';
    });
  }
  await derive();
}
