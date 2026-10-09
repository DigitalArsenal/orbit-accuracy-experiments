// Section 2.1: one key pair serves authentication and value custody. A key
// at m/44'/0'/0'/0/0 signs a record; a verifier holding only the public key
// checks the signature and derives the addresses whose balances it watches.
// All cryptography in hd-wallet-wasm.
import { hex, loadWallet } from '../codec/wallet.js';
import { button, h, inputs, panel, table } from '../ui.js';

export default async function run(ctx) {
  const p = panel(ctx.root, 'The signer');
  const form = inputs(p, [{ id: 'record', label: 'Record to sign', type: 'textarea', value: 'OMM NORAD 25544 EPOCH 2026-10-09T00:00:00Z', wide: true, rows: 2 }], () => sign());
  const actions = h('div', { class: 'model-actions' });
  p.append(actions);
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
      return ok ? 'The signature checks, and the same public key gives the addresses whose balances bond it.'
        : 'One changed bit and the signature fails; the addresses, and their balances, still belong to the signer’s key.';
    });
  }
  newKey();
  await sign();
}
