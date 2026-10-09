// Section 5.1: an X.509 certificate's P-256 key, signed by a secp256k1
// wallet key at m/44'/0'/0'/0/0, the signature and wallet public key carried
// in the certificate. hd-wallet-wasm issues, parses and verifies.
import { Curve, X509Encoding, hex, loadWallet } from '../codec/wallet.js';
import { button, h, inputs, panel, pre, table } from '../ui.js';

export default async function run(ctx) {
  const p = panel(ctx.root, 'Certificate subject');
  const form = inputs(p, [{ id: 'cn', label: 'Common name', type: 'text', value: 'node.example.org', wide: true }], () => issue());
  const actions = h('div', { class: 'model-actions' });
  p.append(actions);
  const steps = panel(ctx.root, 'What any verifier checks');
  const certBox = panel(ctx.root, 'The certificate');
  const w = await loadWallet(ctx);
  let issued = null;
  button(actions, 'Issue with a new wallet key', () => issue(), false);
  button(actions, 'Swap in another wallet’s signature', () => check(true), false);

  async function issue() {
    await ctx.run('hd-wallet-wasm: issuing', async () => {
      const wallet = w.hdkey.fromSeed(w.mnemonic.toSeed(w.mnemonic.generate(24), '')).derivePath("m/44'/0'/0'/0/0");
      const certKey = w.x509.generatePrivateKey(Curve.P256);
      const now = Math.floor(Date.now() / 1000);
      const pem = w.x509.createSelfSignedCertificate({
        subjectDn: `CN=${form.values().cn},O=Example,C=US`, serialHex: '01', notBeforeUnix: now - 60, notAfterUnix: now + 365 * 86400,
        keyUsage: ['digitalSignature'], walletAttestation: { curve: Curve.SECP256K1, privateKey: wallet.privateKey(), keyLabel: "m/44'/0'/0'/0/0" },
      }, Curve.P256, certKey, X509Encoding.PEM);
      issued = { pem, certPublicKey: w.curves.publicKeyFromPrivate(certKey, Curve.P256), wallet };
      await check(false);
    });
  }
  async function check(swap) {
    await ctx.run('hd-wallet-wasm: verifying', async () => {
      const parsed = w.x509.parseCertificate(issued.pem);
      const att = JSON.parse(parsed.walletAttestationComment);
      const walletPub = w.utils.decodeHex(att.public_key_hex.toLowerCase());
      // The certificate key, signed by the wallet key; or by another wallet's.
      const signer = swap ? w.hdkey.fromSeed(w.mnemonic.toSeed(w.mnemonic.generate(12), '')).derivePath("m/44'/0'/0'/0/0") : issued.wallet;
      const digest = w.utils.sha256(issued.certPublicKey);
      const signature = w.curves.secp256k1.sign(digest, signer.privateKey());
      const direct = w.curves.secp256k1.verify(digest, signature, walletPub);
      const embedded = w.x509.verifyWalletAttestation(issued.pem);
      const verdict = (ok, yes, no) => h('span', { class: `verdict ${ok ? 'pass' : 'fail'}` }, ok ? yes : no);
      table(steps, ['Step', 'Result'], [
        ['1. Wallet public key from the extension', { text: att.public_key_hex, class: 'wrap mono' }],
        ['2. Embedded attestation over the certificate', verdict(embedded, 'valid', 'invalid')],
        [`2′. A signature of the P-256 key ${swap ? 'by another wallet' : 'by this wallet'}`, verdict(direct, 'valid', 'rejected')],
        ['3. Bitcoin address of the wallet key', { text: w.bitcoin.getAddress(walletPub, 0), class: 'wrap mono' }],
        ['3. Ethereum address of the wallet key', { text: w.ethereum.getAddress(walletPub), class: 'wrap mono' }],
        ['Certificate key (P-256)', { text: hex(w, issued.certPublicKey), class: 'wrap mono' }],
      ], { existing: steps.querySelector('table') ?? undefined });
      certBox.querySelector('pre')?.remove();
      pre(certBox, `Subject ${parsed.subjectDn}\nValid ${parsed.notBefore} to ${parsed.notAfter}\n\n${issued.pem}`);
      return swap ? 'A signature from any other wallet key fails against the key the certificate names: the binding cannot be transferred.'
        : 'The certificate names its wallet key, the wallet key signs the certificate key, and the wallet key gives the addresses to watch.';
    });
  }
  await issue();
}
