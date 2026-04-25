interface RegisterServiceWorkerOptions {
  force?: boolean;
}

export function registerServiceWorker(options: RegisterServiceWorkerOptions = {}) {
  if (!("serviceWorker" in navigator)) return;
  if (!options.force && !import.meta.env.PROD) return;

  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Service worker registration failed:", error);
      });
    },
    { once: true },
  );
}
