/* Manejo de notificaciones push. Este archivo se IMPORTA dentro del service
   worker generado por vite-plugin-pwa (workbox.importScripts), así que convive
   con el precache/offline sin tocarlo. */

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* texto plano */ }
  const title = data.title || 'GEmprende'
  const options = {
    body: data.body || 'Tienes una nueva solicitud.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [80, 40, 80],
    tag: data.tag || 'gemprende',
    renotify: true,
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of all) {
        if ('focus' in c) {
          try { await c.navigate(url) } catch { /* */ }
          return c.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })(),
  )
})
