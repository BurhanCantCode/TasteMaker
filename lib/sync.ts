import { UserProfile, CardSession } from "./types";
import { CachedSummary } from "./cookies";
import { syncProfileToCloud } from "./firestore";

export function createDebouncedSync(
  uid: string,
  delayMs: number = 2000
): (
  profile: UserProfile,
  cardSession?: CardSession,
  cachedSummary?: CachedSummary
) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (
    profile: UserProfile,
    cardSession?: CardSession,
    cachedSummary?: CachedSummary
  ) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(async () => {
      try {
        await syncProfileToCloud(uid, profile, cardSession, cachedSummary);
      } catch (error) {
        console.error("[Tastemaker] Debounced cloud sync failed:", error);
      }
    }, delayMs);
  };
}

export function isOnline(): boolean {
  if (typeof window === "undefined") return true;
  return navigator.onLine;
}
