// The site's hd-wallet-wasm calls (models/adversarial-security: X.509 P-256 with a secp256k1 wallet attestation,
// BIP-32/44 and SLIP-10 addresses of the test mnemonic) on the version the site's lock installs.
//   node site/tests/hd-wallet.e2e.mjs   (after npm ci in site/)
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const wasm = path.join(fileURLToPath(new URL("..", import.meta.url)), "node_modules/hd-wallet-wasm");
const pkg = JSON.parse(fs.readFileSync(path.join(wasm, "package.json"), "utf8"));
assert.ok(/^2\.1\.([1-9]|\d\d)/.test(pkg.version) || /^2\.([2-9]|\d\d)\./.test(pkg.version), `hd-wallet-wasm ${pkg.version} is in GHSA-gvwv-r86g-4q35's range`);
const { default: init, Curve, X509Encoding } = await import(pathToFileURL(path.join(wasm, "dist/runtime/index.mjs")));
const w = await init();
w.injectEntropy?.(crypto.getRandomValues(new Uint8Array(32)));
const seed = w.mnemonic.toSeed("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about", "");
const node = (p) => w.hdkey.fromSeed(seed).derivePath(p), k1 = (p) => node(p).publicKey();
const btc = w.bitcoin.getAddress(k1("m/44'/0'/0'/0/0"), 0);
const eth = w.ethereum.getAddress(k1("m/44'/60'/0'/0/0"));
const sol = w.solana.getAddress(w.curves.ed25519.publicKeyFromSeed(w.slip10.deriveEd25519Path(seed, "m/44'/501'/0'/0'").privateKey));
const cosmos = w.cosmos.getAddress(k1("m/44'/118'/0'/0/0"));
// The published addresses of the BIP-39 test mnemonic, as site/src/models/adversarial-security/chains.js checks them.
assert.deepEqual({ btc, eth, sol, cosmos }, { btc: "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA", eth: "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
  sol: "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk", cosmos: "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4" });
const wallet = node("m/44'/0'/0'/0/0"), certKey = w.x509.generatePrivateKey(Curve.P256), now = Math.floor(Date.now() / 1000);
const pem = w.x509.createSelfSignedCertificate({ subjectDn: "CN=e2e,O=Example,C=US", serialHex: "01", notBeforeUnix: now - 60, notAfterUnix: now + 86400,
  keyUsage: ["digitalSignature"], walletAttestation: { curve: Curve.SECP256K1, privateKey: wallet.privateKey(), keyLabel: "m/44'/0'/0'/0/0" } }, Curve.P256, certKey, X509Encoding.PEM);
const att = JSON.parse(w.x509.parseCertificate(pem).walletAttestationComment);
const digest = crypto.getRandomValues(new Uint8Array(32)), sig = w.curves.secp256k1.sign(digest, wallet.privateKey());
assert.ok(w.curves.secp256k1.verify(digest, sig, w.utils.decodeHex(att.public_key_hex.toLowerCase())), "the attestation key verifies the wallet signature");
console.log(`hd-wallet-wasm ${pkg.version}: BIP-32/44 and SLIP-10 vectors, X.509 P-256 with secp256k1 attestation: PASS`);
