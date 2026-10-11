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
  const view = scene3d(ctx, { title: 'One key: what it signs, what it holds' });
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
      // What one key does, as a table in the box: the record it signs, and
      // the address each network derives from it.
      await view.draw((g) => {
        const key = [1, 1.5, 0];
        g.line([[1, 0, 0], [1, 3, 0]], { color: 'accent', width: 4, alpha: 0.6 });
        g.point(key, { color: 'accent', size: 13, alpha: 0.9 });
        g.label(key, `Public key ${short(hex(w, pub), 6, 4)}`, { color: 'accent', align: 'center', above: true, dy: -18 });
        g.box([0, 0, 0], [0.5, 0.35, 0.25], { color: tamper ? 'alert' : 'text', alpha: 0.25, outline: true });
        g.line([[0, 0, 0], [1, 0, 0]], { color: ok ? 'accent' : 'alert', width: 3, dash: !ok });
        g.label([0.5, 0, 0], ok ? 'signature valid' : 'signature invalid', { color: ok ? 'accent' : 'alert', size: 11, align: 'center', above: true });
        addresses.forEach(([name, address, encoding], k) => {
          const row = k + 1;
          g.line([[1, row, 0], [2, row, 0], [3, row, 0]], { color: 'cyan', width: 2, alpha: 0.8 });
          g.point([2, row, 0], { color: 'muted', size: 7, label: encoding, labelColor: 'muted', labelOptions: { above: true } });
          g.point([3, row, 0], { color: 'cyan', size: 11, alpha: 0.85 });
          g.label([3, row, 0], short(address, 6, 4), { color: 'text', size: 11 });
        });
        g.view({ preset: '3d' });
      }, { axes: ['', '', ''], aspect: 'normal', ticks: [[[0, 'Record'], [1, 'Public key'], [2, 'Encoding'], [3, 'Address']], [[0, 'Signature'], [1, 'Bitcoin'], [2, 'Ethereum'], [3, 'Cosmos']], [[0, '']]],
        caption: 'The verifier holds only the public key: it checks the signature and derives the addresses',
        legend: [['accent', 'Key and signature'], ['cyan', 'Addresses it derives'], ...(ok ? [] : [['alert', 'Failed check', 'dash']])] });
      return ok ? 'The signature checks, and the same public key gives the addresses whose balances bond it.'
        : 'One changed bit and the signature fails; the addresses, and their balances, still belong to the signer’s key.';
    });
  }
  newKey();
  await sign();
}
