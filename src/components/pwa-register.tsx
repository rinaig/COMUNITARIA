"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // El registro falla en entornos sin HTTPS o durante el desarrollo inicial.
    });
  }, []);

  return null;
}