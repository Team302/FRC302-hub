// Makes a VAPID key pair for Web Push. Run once per deployment:
//   node scripts/vapid-keys.mjs
// then `npx wrangler secret put VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` with the printed values.
// Changing the keys later means everyone has to turn notifications on again.
const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey)
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))
const b64url = (bytes) => Buffer.from(bytes).toString('base64url')
if (process.argv.includes('--env')) {
  console.log(`VAPID_PUBLIC_KEY=${b64url(raw)}\nVAPID_PRIVATE_KEY=${jwk.d}`)
} else {
  console.log(`VAPID_PUBLIC_KEY  ${b64url(raw)}\nVAPID_PRIVATE_KEY ${jwk.d}\n\nKeep the private key secret. Set both with: npx wrangler secret put <NAME>`)
}
