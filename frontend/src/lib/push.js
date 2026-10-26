// base64url (the VAPID public key) → bytes, for PushManager.subscribe.
export function b64ToUint8(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

// On sign-out: stop this browser's push subscription and remove it from the server, so the next
// person on a shared laptop doesn't get the previous person's notifications. Best effort, and
// never holds up signing out for more than a couple of seconds.
export async function forgetThisDevice(api) {
  const work = (async () => {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager?.getSubscription()
    if (!sub) return
    try { await api('/push/subscriptions', { method: 'DELETE', body: { endpoint: sub.endpoint } }) } catch { /* server cleans up on next send */ }
    await sub.unsubscribe()
  })()
  await Promise.race([work.catch(() => {}), new Promise((r) => setTimeout(r, 2500))])
}
