// End-to-end test of warden-worker org/collection access control, using real Bitwarden crypto.
// Usage: node e2e.mjs <baseUrl> <unpatched|patched>, against a fresh local database. See "End-to-end test" in
// ../README.md for the .dev.vars it expects.
import crypto from 'node:crypto'

const BASE = process.argv[2] || 'http://127.0.0.1:8787'
const MODE = process.argv[3] || 'unpatched'
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const note = (name, detail) => { results.push({ name, ok: null, detail }); console.log(`INFO  ${name}  (${detail})`) }

// ---- Bitwarden crypto ----
const b64 = (b) => Buffer.from(b).toString('base64')
const hkdfExpand = (prk, info, len) => { const t = crypto.createHmac('sha256', prk).update(Buffer.concat([Buffer.from(info), Buffer.from([1])])).digest(); return t.subarray(0, len) }
function encString(key64, plain) {
  const enc = key64.subarray(0, 32), mac = key64.subarray(32, 64)
  const iv = crypto.randomBytes(16)
  const c = crypto.createCipheriv('aes-256-cbc', enc, iv)
  const ct = Buffer.concat([c.update(plain), c.final()])
  const m = crypto.createHmac('sha256', mac).update(Buffer.concat([iv, ct])).digest()
  return `2.${b64(iv)}|${b64(ct)}|${b64(m)}`
}
function makeUser(email, password) {
  const masterKey = crypto.pbkdf2Sync(password, email, 600000, 32, 'sha256')
  const hash = b64(crypto.pbkdf2Sync(masterKey, password, 1, 32, 'sha256'))
  const stretched = Buffer.concat([hkdfExpand(masterKey, 'enc', 32), hkdfExpand(masterKey, 'mac', 32)])
  const userKey = crypto.randomBytes(64)
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pubDer = publicKey.export({ type: 'spki', format: 'der' })
  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' })
  return { email, password, hash, userKey, publicKey, pub: b64(pubDer), protectedKey: encString(stretched, userKey), encPriv: encString(userKey, privDer) }
}
const rsaWrap = (pubB64, key) => `4.${b64(crypto.publicEncrypt({ key: crypto.createPublicKey({ key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' }), padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' }, key))}`

// ---- HTTP ----
async function api(method, path, { token, body, form } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString() }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
  const res = await fetch(BASE + path, { method, headers, body: payload })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}
const ok2xx = (r) => r.status >= 200 && r.status < 300

async function register(u) {
  return api('POST', '/identity/accounts/register', { body: {
    email: u.email, name: u.email.split('@')[0], masterPasswordHint: null, masterPasswordHash: u.hash, key: u.protectedKey,
    kdf: 0, kdfIterations: 600000, userAsymmetricKeys: { publicKey: u.pub, encryptedPrivateKey: u.encPriv },
  } })
}
async function login(u) {
  const r = await api('POST', '/identity/connect/token', { form: {
    grant_type: 'password', username: u.email, password: u.hash, scope: 'api offline_access', client_id: 'web',
    deviceType: '9', deviceIdentifier: crypto.randomUUID(), deviceName: 'e2e',
  } })
  if (!ok2xx(r)) throw new Error(`login ${u.email}: ${r.status} ${JSON.stringify(r.data)}`)
  u.token = r.data.access_token
  return u
}
const sync = async (u) => (await api('GET', '/api/sync', { token: u.token })).data
const visibleNames = async (u, orgKey) => {
  const s = await sync(u)
  return (s.ciphers || []).filter((c) => c.organizationId).map((c) => c.id)
}

// ---- Scenario ----
const users = {
  coach: makeUser('coach@team302.test', 'correct horse battery coach'),
  ava: makeUser('ava@team302.test', 'correct horse battery ava'),
  marcus: makeUser('marcus@team302.test', 'correct horse battery marcus'),
  sam: makeUser('sam@team302.test', 'correct horse battery sam'),
}
const outsider = makeUser('outsider@evil.test', 'correct horse battery evil')

for (const u of Object.values(users)) { const r = await register(u); check(`register ${u.email}`, ok2xx(r), `${r.status}`) }
const ro = await register(outsider)
check('email not in ALLOWED_EMAILS cannot register', !ok2xx(ro), `${ro.status}`)
for (const u of Object.values(users)) await login(u)
const { coach, ava, marcus, sam } = users

// Org
const orgKey = crypto.randomBytes(64)
const orgRsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const orgPayload = (owner) => ({
  name: 'Team 302', billingEmail: owner.email, collectionName: encString(orgKey, 'Leads'), key: rsaWrap(owner.pub, orgKey),
  keys: { publicKey: b64(orgRsa.publicKey.export({ type: 'spki', format: 'der' })), encryptedPrivateKey: encString(orgKey, orgRsa.privateKey.export({ type: 'pkcs8', format: 'der' })) },
  planType: 0,
})
const rAvaOrg = await api('POST', '/api/organizations', { token: ava.token, body: orgPayload(ava) })
if (MODE === 'patched') check('student cannot create an organization (P3)', !ok2xx(rAvaOrg), `${rAvaOrg.status}`)
else note('student can create an organization (M1)', `${rAvaOrg.status}`)
const rOrg = await api('POST', '/api/organizations', { token: coach.token, body: orgPayload(coach) })
check('coach creates organization', ok2xx(rOrg), `${rOrg.status} ${ok2xx(rOrg) ? '' : JSON.stringify(rOrg.data)}`)
const orgId = rOrg.data.id

const mkColl = async (name) => { const r = await api('POST', `/api/organizations/${orgId}/collections`, { token: coach.token, body: { name: encString(orgKey, name), users: [], groups: [] } }); check(`create collection ${name}`, ok2xx(r), `${r.status}`); return r.data.id }
const mech = await mkColl('Mechanical')
const elec = await mkColl('Electrical')

const invite = async (u, coll, readOnly = true) => {
  const r = await api('POST', `/api/organizations/${orgId}/users/invite`, { token: coach.token, body: { emails: [u.email], type: 2, accessAll: false, collections: [{ id: coll, readOnly, hidePasswords: false, manage: false }], groups: [] } })
  check(`invite ${u.email}`, ok2xx(r), `${r.status}`)
  const list = await api('GET', `/api/organizations/${orgId}/users`, { token: coach.token })
  u.memberId = list.data.data.find((m) => m.email === u.email).id
}
await invite(ava, mech); await invite(sam, elec); await invite(marcus, mech)

// Confirm before accept (marcus never accepts)
const rEarly = await api('POST', `/api/organizations/${orgId}/users/${marcus.memberId}/confirm`, { token: coach.token, body: { key: rsaWrap(marcus.pub, orgKey) } })
if (MODE === 'patched') check('cannot confirm a member who has not accepted (P2)', !ok2xx(rEarly), `${rEarly.status}`)
else note('member can be confirmed without accepting (L2)', `${rEarly.status}`)

// Ava tries to accept sam's invite
const rStealAccept = await api('POST', `/api/organizations/${orgId}/users/${sam.memberId}/accept`, { token: ava.token })
check('cannot accept someone else\'s invite', !ok2xx(rStealAccept), `${rStealAccept.status}`)

for (const u of [ava, sam]) {
  const a = await api('POST', `/api/organizations/${orgId}/users/${u.memberId}/accept`, { token: u.token })
  check(`${u.email} accepts`, ok2xx(a), `${a.status}`)
  // Mentor fetches the public key from the server and compares its fingerprint out of band.
  const pk = await api('GET', `/api/users/${(await api('GET', `/api/organizations/${orgId}/users/${u.memberId}`, { token: coach.token })).data.userId}/public-key`, { token: coach.token })
  check(`server returns ${u.email}'s real public key (fingerprint check)`, pk.data.publicKey === u.pub)
  const c = await api('POST', `/api/organizations/${orgId}/users/${u.memberId}/confirm`, { token: coach.token, body: { key: rsaWrap(u.pub, orgKey) } })
  check(`coach confirms ${u.email}`, ok2xx(c), `${c.status}`)
}

// Items
const mkCipher = async (who, coll, name) => {
  const r = await api('POST', '/api/ciphers/create', { token: who.token, body: { cipher: { type: 1, organizationId: orgId, name: encString(orgKey, name), notes: null, favorite: false, login: { username: encString(orgKey, 'team302'), password: encString(orgKey, 'hunter2-' + name), uris: [] }, reprompt: 0 }, collectionIds: [coll] } })
  return r
}
const rWifi = await mkCipher(coach, mech, 'Shop Wi-Fi'); check('coach adds Shop Wi-Fi to Mechanical', ok2xx(rWifi), `${rWifi.status}`)
const rDk = await mkCipher(coach, elec, 'DigiKey'); check('coach adds DigiKey to Electrical', ok2xx(rDk), `${rDk.status}`)
const wifi = rWifi.data.id, digikey = rDk.data.id

const avaSees = await visibleNames(ava); const samSees = await visibleNames(sam); const marcusSees = await visibleNames(marcus)
check('ava (Mechanical) sees Shop Wi-Fi', avaSees.includes(wifi))
check('ava does not see Electrical\'s DigiKey', !avaSees.includes(digikey))
check('sam (Electrical) sees DigiKey, not Shop Wi-Fi', samSees.includes(digikey) && !samSees.includes(wifi))
if (MODE === 'patched') check('marcus (invited, never accepted or confirmed) sees nothing', marcusSees.length === 0, `${marcusSees.length}`)
else note('marcus (confirmed without accepting) sees', `${marcusSees.length} item(s)`)

// IDOR attempts by ava against Electrical's item
const g = await api('GET', `/api/ciphers/${digikey}`, { token: ava.token }); check('ava cannot GET DigiKey by id', !ok2xx(g), `${g.status}`)
const putBody = (id, coll) => ({ type: 1, organizationId: orgId, name: encString(orgKey, 'pwned'), notes: null, favorite: false, login: { username: null, password: encString(orgKey, 'x'), uris: [] }, reprompt: 0, collectionIds: [coll] })
const p = await api('PUT', `/api/ciphers/${digikey}`, { token: ava.token, body: putBody(digikey, elec) }); check('ava cannot edit DigiKey', !ok2xx(p), `${p.status}`)
const d = await api('DELETE', `/api/ciphers/${digikey}`, { token: ava.token }); check('ava cannot hard-delete DigiKey', !ok2xx(d), `${d.status}`)
const sd = await api('PUT', `/api/ciphers/${digikey}/delete`, { token: ava.token }); check('ava cannot trash DigiKey', !ok2xx(sd), `${sd.status}`)
const mv = await api('PUT', `/api/ciphers/${digikey}/collections`, { token: ava.token, body: { collectionIds: [mech] } }); check('ava cannot move DigiKey into Mechanical', !ok2xx(mv), `${mv.status}`)
const pw = await api('PUT', `/api/ciphers/${wifi}`, { token: ava.token, body: putBody(wifi, mech) }); check('ava cannot edit Shop Wi-Fi (Can view)', !ok2xx(pw), `${pw.status}`)
const dw = await api('DELETE', `/api/ciphers/${wifi}`, { token: ava.token }); check('ava cannot delete Shop Wi-Fi (Can view)', !ok2xx(dw), `${dw.status}`)
const ac = await api('POST', '/api/ciphers/create', { token: ava.token, body: { cipher: { type: 2, organizationId: orgId, name: encString(orgKey, 'planted'), secureNote: { type: 0 }, reprompt: 0 }, collectionIds: [elec] } })
check('ava cannot add an item to Electrical', !ok2xx(ac), `${ac.status}`)
const acm = await api('POST', '/api/ciphers/create', { token: ava.token, body: { cipher: { type: 2, organizationId: orgId, name: encString(orgKey, 'planted'), secureNote: { type: 0 }, reprompt: 0 }, collectionIds: [mech] } })
check('ava cannot add an item to Mechanical (Can view)', !ok2xx(acm), `${acm.status}`)

// Escalation attempts by ava
const esc = await api('PUT', `/api/organizations/${orgId}/users/${ava.memberId}`, { token: ava.token, body: { type: 0, accessAll: true, collections: [{ id: elec, readOnly: false, hidePasswords: false, manage: true }], groups: [] } })
check('ava cannot make herself owner / grant herself Electrical', !ok2xx(esc), `${esc.status}`)
const inv = await api('POST', `/api/organizations/${orgId}/users/invite`, { token: ava.token, body: { emails: ['marcus@team302.test'], type: 0, collections: [], groups: [] } })
check('ava cannot invite people', !ok2xx(inv), `${inv.status}`)
const cc = await api('POST', `/api/organizations/${orgId}/collections`, { token: ava.token, body: { name: encString(orgKey, 'mine'), users: [], groups: [] } })
check('ava cannot create collections', !ok2xx(cc), `${cc.status}`)
const ce = await api('PUT', `/api/organizations/${orgId}/collections/${elec}`, { token: ava.token, body: { name: encString(orgKey, 'Electrical'), users: [{ id: ava.memberId, readOnly: false, hidePasswords: false, manage: true }], groups: [] } })
check('ava cannot add herself to Electrical', !ok2xx(ce), `${ce.status}`)
const ok = await api('POST', `/api/organizations/${orgId}/keys`, { token: ava.token, body: { publicKey: 'x', encryptedPrivateKey: '2.x|x|x' } })
check('ava cannot replace the organization keys', !ok2xx(ok), `${ok.status}`)
const ou = await api('PUT', `/api/organizations/${orgId}`, { token: ava.token, body: { name: 'Pwned', billingEmail: 'x@x' } })
check('ava cannot rename the organization', !ok2xx(ou), `${ou.status}`)
const avaAfter = await visibleNames(ava)
check('after all that, ava still sees only Mechanical', avaAfter.length === 1 && avaAfter[0] === wifi, `${avaAfter.length}`)
const coachSees = await visibleNames(coach)
check('both items intact', coachSees.includes(wifi) && coachSees.includes(digikey))

// H1: a member who created org items deletes their account
const up = await api('PUT', `/api/organizations/${orgId}/users/${sam.memberId}`, { token: coach.token, body: { type: 2, accessAll: false, collections: [{ id: elec, readOnly: false, hidePasswords: false, manage: false }], groups: [] } })
check('coach gives sam Can edit on Electrical', ok2xx(up), `${up.status}`)
const rSol = await mkCipher(sam, elec, 'Soldering station licence'); check('sam adds an item to Electrical', ok2xx(rSol), `${rSol.status}`)
const sol = rSol.data.id
const del = await api('DELETE', '/api/accounts', { token: sam.token, body: { masterPasswordHash: sam.hash } })
check('sam deletes his account', ok2xx(del), `${del.status}`)
const afterDel = await visibleNames(coach)
check('the item sam created survives his account deletion (H1/P1)', afterDel.includes(sol), afterDel.includes(sol) ? 'kept' : 'deleted with the account')

// Removal
const rm = await api('DELETE', `/api/organizations/${orgId}/users/${ava.memberId}`, { token: coach.token })
check('coach removes ava', ok2xx(rm), `${rm.status}`)
const avaGone = await visibleNames(ava)
check('removed member sees no org items', avaGone.length === 0, `${avaGone.length}`)
const g2 = await api('GET', `/api/ciphers/${wifi}`, { token: ava.token }); check('removed member cannot GET Shop Wi-Fi by id', !ok2xx(g2), `${g2.status}`)

// Last owner deletes account
const cdel = await api('DELETE', '/api/accounts', { token: coach.token, body: { masterPasswordHash: coach.hash } })
check('the only owner cannot delete their account (L1/P1)', !ok2xx(cdel), `${cdel.status}`)

const fails = results.filter((r) => r.ok === false)
console.log(`\n${MODE}: ${results.filter((r) => r.ok).length} passed, ${fails.length} failed, ${results.filter((r) => r.ok === null).length} info`)
process.exit(fails.length ? 1 : 0)
