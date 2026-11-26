/* Push-only worker. Never intercept requests or cache private data. */
self.addEventListener('push', event => {
  const data = (() => { try { return event.data?.json() || {}; } catch { return {}; } })();
  const allowed = new Set(['FCR · Workflow passed','FCR · Workflow recovered','FCR · Pull request merged','FCR · Deployment succeeded','FCR · Test notification']);
  const title = allowed.has(data.title) ? data.title : 'Founder Control Room';
  const tag = typeof data.tag === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(data.tag) ? data.tag : 'fcr-notice';
  event.waitUntil(self.registration.showNotification(title, {
    body: title === 'FCR · Test notification' ? 'This is a test, not a workflow success.' : 'Open Founder Control Room for evidence.',
    tag, icon: '/control-room/notification-icon.svg', renotify: false
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/control-room/notifications'));
});
