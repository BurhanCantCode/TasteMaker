import { UserProfile, CardSession } from "./types";
import { CachedSummary } from "./cookies";
import { syncProfileToCloudWithMerge } from "./firestore";

export function createDebouncedSync(
  uid: string,
  delayMs: number = 2000
): (
  profile: UserProfile,
  cardSession?: CardSession,
  cachedSummary?: CachedSummary,
  phoneNumber?: string,
  overrideLastModifiedAt?: number
) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (
    profile: UserProfile,
    cardSession?: CardSession,
    cachedSummary?: CachedSummary,
    phoneNumber?: string,
    overrideLastModifiedAt?: number
  ) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(async () => {
      try {
        await syncProfileToCloudWithMerge(
          uid,
          profile,
          cardSession,
          cachedSummary,
          phoneNumber,
          overrideLastModifiedAt
        );
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
