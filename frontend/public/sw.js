// Service worker: shows push notifications and opens the right page when one is tapped.
// It deliberately caches nothing: the app needs the server for every screen anyway, and a stale
// cached copy after a deploy is worse than a "you're offline" page.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let message = {}
  try { message = event.data ? event.data.json() : {} } catch { message = { body: event.data && event.data.text() } }
  event.waitUntil(self.registration.showNotification(message.title || 'Team 302', {
    body: message.body || 'You have a new notification.',
    icon: '/icons/icon-192.png',
    tag: message.tag || undefined,
    renotify: !!message.tag,
    data: { url: message.url || '/inbox' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/inbox', self.location.origin)
  if (url.origin !== self.location.origin) return
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin === url.origin) {
        await client.focus()
        return client.navigate(url.href)
      }
    }
    return self.clients.openWindow(url.href)
  })())
})
