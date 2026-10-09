// Section 2.1: one key pair serves authentication and value custody. A key
// at m/44'/0'/0'/0/0 signs a record; a verifier holding only the public key
// checks the signature and derives the addresses whose balances it watches.
// All cryptography in hd-wallet-wasm.
import { hex, loadWallet } from '../codec/wallet.js';
import { button, h, inputs, panel, short, table } from '../ui.js';
import { scene3d } from '../scene.js';

export default async function run(ctx) {
  const p = panel(ctx.root, 'The signer');
  const form = inputs(p, [{ id: 'record', label: 'Record to sign', type: 'textarea', value: 'OMM NORAD 25544 EPOCH 2026-10-09T00:00:00Z', wide: true, rows: 2 }], () => sign());
  const actions = h('div', { class: 'model-actions' });
  p.append(actions);
  const view = scene3d(ctx, { title: 'One key: what it signs, what it holds', earth: false });
  const v = panel(ctx.root, 'The verifier, with the public key only');
  const w = await loadWallet(ctx);
  let key = null, signed = null;
  const newKey = () => { key = w.hdkey.fromSeed(w.mnemonic.toSeed(w.mnemonic.generate(24), '')).derivePath("m/44'/0'/0'/0/0"); };
  button(actions, 'New key', () => { newKey(); sign(); }, false);
  button(actions, 'Tamper with the record', () => verify(true), false);

  async function sign() {
    await ctx.run('hd-wallet-wasm: signing', async () => {
      const record = new TextEncoder().encode(form.values().record);
      signed = { record, signature: w.curves.secp256k1.sign(w.utils.sha256(record), key.privateKey()), publicKey: key.publicKey() };
      await verify(false);
    });
  }
  async function verify(tamper) {
    await ctx.run('hd-wallet-wasm: verifying', async () => {
      const record = tamper ? signed.record.map((b, i) => (i === 0 ? b ^ 1 : b)) : signed.record;
      const ok = w.curves.secp256k1.verify(w.utils.sha256(record), signed.signature, signed.publicKey);
      const pub = signed.publicKey;
      table(v, ['Field', 'Value'], [
        ['Public key', { text: hex(w, pub), class: 'wrap mono' }],
        ['Signature', { text: hex(w, signed.signature), class: 'wrap mono' }],
        ['Record', tamper ? 'one bit changed' : 'as signed'],
        ['Signature valid', h('span', { class: `verdict ${ok ? 'pass' : 'fail'}` }, ok ? 'valid' : 'invalid')],
        ['Bitcoin address', { text: w.bitcoin.getAddress(pub, 0), class: 'wrap mono' }],
        ['Ethereum address', { text: w.ethereum.getAddress(pub), class: 'wrap mono' }],
        ['Cosmos address', { text: w.cosmos.getAddress(pub), class: 'wrap mono' }],
      ], { existing: v.querySelector('table') ?? undefined });
      const addresses = [['Bitcoin', w.bitcoin.getAddress(pub, 0), 'Base58Check'], ['Ethereum', w.ethereum.getAddress(pub), 'Keccak-256'], ['Cosmos', w.cosmos.getAddress(pub), 'Bech32']];
      await view.draw((g) => {
        g.grid([0, 0, 0], [1, 0, 0], [0, 1, 0], 8, 2);
        const key = [0, 0, 1.4];
        g.sphere(key, 0.9, { color: 'accent', alpha: 0.85 });
        g.label([0, 0, 2.3], `Public key ${short(hex(w, pub), 6, 4)}`, { color: 'accent', align: 'center', above: true });
        addresses.forEach(([name, address, encoding], k) => {
          const a = (Math.PI * (200 + 70 * k)) / 180, at = [6 * Math.cos(a), 6 * Math.sin(a), 0.5];
          g.line([key, at], { color: 'cyan', width: 2, alpha: 0.8 });
          g.sphere(at, 0.45, { color: 'cyan', alpha: 0.85 });
          g.label(at, `${name}\n${short(address, 6, 4)}`, { color: 'text', size: 11, align: 'center', dy: 26 });
          g.label([0.62 * at[0] + 0.38 * key[0], 0.62 * at[1] + 0.38 * key[1], 0.62 * at[2] + 0.38 * key[2]], encoding, { color: 'muted', size: 10, weight: 500 });
        });
        const doc = [0, 5.5, 3.2];
        g.box(doc, [1.7, 0.2, 2.2], { color: tamper ? 'alert' : 'text', alpha: 0.25, outline: true });
        g.line([key, doc], { color: ok ? 'accent' : 'alert', width: 3, dash: !ok });
        g.label(doc, tamper ? 'Record, one bit changed' : 'Signed record', { color: 'text', align: 'center', dy: -34 });
        g.label([0, 2.75, 2.3], ok ? 'signature valid' : 'signature invalid', { color: ok ? 'accent' : 'alert', size: 11, align: 'center', above: true });
        g.view({ center: [0, 0.3, 1.6], radius: 7.6, direction: [0.25, -1, 0.75] });
      }, { caption: 'The verifier holds only the public key: it checks the signature and derives the addresses',
        legend: [['accent', 'Key and signature'], ['cyan', 'Addresses it derives'], ...(ok ? [] : [['alert', 'Failed check', 'dash']])] });
      return ok ? 'The signature checks, and the same public key gives the addresses whose balances bond it.'
        : 'One changed bit and the signature fails; the addresses, and their balances, still belong to the signer’s key.';
    });
  }
  newKey();
  await sign();
}
