/** Registers the service worker in production builds only, so development never serves stale files. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app works without it; offline support is a bonus.
    });
  });
}
