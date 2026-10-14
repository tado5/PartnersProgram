"use client";

import { getSession, signOut } from "next-auth/react";
import { useEffect } from "react";

const refreshIntervalMs = 5 * 60_000;

export function SessionActivity() {
  useEffect(() => {
    let lastRefreshAt = Date.now();

    async function refreshAfterActivity() {
      if (Date.now() - lastRefreshAt < refreshIntervalMs) {
        return;
      }
      lastRefreshAt = Date.now();
      const session = await getSession();
      if (!session || !session.user.isSessionValid) {
        await signOut({ redirectTo: "/login" });
      }
    }

    window.addEventListener("pointerdown", refreshAfterActivity, {
      passive: true,
    });
    window.addEventListener("pointermove", refreshAfterActivity, {
      passive: true,
    });
    window.addEventListener("keydown", refreshAfterActivity);
    window.addEventListener("touchstart", refreshAfterActivity, {
      passive: true,
    });
    window.addEventListener("wheel", refreshAfterActivity, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", refreshAfterActivity);
      window.removeEventListener("pointermove", refreshAfterActivity);
      window.removeEventListener("keydown", refreshAfterActivity);
      window.removeEventListener("touchstart", refreshAfterActivity);
      window.removeEventListener("wheel", refreshAfterActivity);
    };
  }, []);

  return null;
}
