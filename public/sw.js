self.oninstall = () => self.skipWaiting();
self.onactivate = event => event.waitUntil(self.registration.unregister());
