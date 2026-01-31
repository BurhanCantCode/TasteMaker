import { UserProfile, CardSession } from "./types";

// Use localStorage as primary storage (5MB+), with cookie as marker
const STORAGE_KEY = "tastemaker_profile";
const SUMMARY_STORAGE_KEY = "tastemaker_summary";
const COOKIE_MARKER = "tastemaker_has_data";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

export interface CachedSummary {
  text: string;
  factsCount: number;
  likesCount: number;
}

export function saveProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  
  try {
    const serialized = JSON.stringify(profile);
    
    // Primary: localStorage (5MB+ capacity)
    localStorage.setItem(STORAGE_KEY, serialized);
    
    // Set cookie marker for SSR awareness
    document.cookie = `${COOKIE_MARKER}=1; max-age=${MAX_AGE_SECONDS}; path=/; SameSite=Lax`;
    
    console.log(`[Tastemaker] Saved profile: ${profile.facts.length} facts, ${profile.likes.length} likes (${serialized.length} bytes)`);
  } catch (error) {
    console.error("[Tastemaker] Failed to save profile:", error);
  }
}

export function loadProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  
  try {
    // Primary: localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const profile = JSON.parse(stored) as UserProfile;
      console.log(`[Tastemaker] Loaded profile: ${profile.facts.length} facts, ${profile.likes.length} likes`);
      return profile;
    }
    
    // Fallback: try to migrate from old cookie storage (one-time migration)
    const migratedProfile = migrateFromCookie();
    if (migratedProfile) {
      // Save to localStorage for future
      saveProfile(migratedProfile);
      return migratedProfile;
    }
    
    return null;
  } catch (error) {
    console.error("[Tastemaker] Failed to load profile:", error);
    return null;
  }
}

// One-time migration from old cookie storage
function migrateFromCookie(): UserProfile | null {
  try {
    const cookies = document.cookie.split(";");
    const profileCookie = cookies.find((cookie) =>
      cookie.trim().startsWith("tastemaker_profile=")
    );
    
    if (!profileCookie) return null;
    
    // FIX: Use substring instead of split to handle = in JSON data
    const trimmed = profileCookie.trim();
    const value = trimmed.substring(trimmed.indexOf("=") + 1);
    const decoded = decodeURIComponent(value);
    const profile = JSON.parse(decoded) as UserProfile;
    
    console.log(`[Tastemaker] Migrated from cookie: ${profile.facts.length} facts, ${profile.likes.length} likes`);
    
    // Clear old cookie after migration
    document.cookie = "tastemaker_profile=; max-age=0; path=/; SameSite=Lax";
    
    return profile;
  } catch (error) {
    console.error("[Tastemaker] Cookie migration failed:", error);
    return null;
  }
}

export function clearProfile(): void {
  if (typeof window === "undefined") return;
  
  localStorage.removeItem(STORAGE_KEY);
  document.cookie = `${COOKIE_MARKER}=; max-age=0; path=/; SameSite=Lax`;
  // Also clear old cookie format
  document.cookie = "tastemaker_profile=; max-age=0; path=/; SameSite=Lax";
}

export function createEmptyProfile(): UserProfile {
  return {
    facts: [],
    likes: [],
  };
}

// Summary caching functions
export function saveSummary(summary: CachedSummary): void {
  if (typeof window === "undefined") return;
  
  try {
    const serialized = JSON.stringify(summary);
    localStorage.setItem(SUMMARY_STORAGE_KEY, serialized);
  } catch (error) {
    console.error("[Tastemaker] Failed to save summary:", error);
  }
}

export function loadSummary(): CachedSummary | null {
  if (typeof window === "undefined") return null;
  
  try {
    // Primary: localStorage
    const stored = localStorage.getItem(SUMMARY_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as CachedSummary;
    }
    
    // Fallback: try old cookie
    const cookies = document.cookie.split(";");
    const summaryCookie = cookies.find((cookie) =>
      cookie.trim().startsWith("tastemaker_summary=")
    );
    
    if (!summaryCookie) return null;
    
    // FIX: Use substring instead of split
    const trimmed = summaryCookie.trim();
    const value = trimmed.substring(trimmed.indexOf("=") + 1);
    const decoded = decodeURIComponent(value);
    const summary = JSON.parse(decoded) as CachedSummary;
    
    // Migrate to localStorage
    saveSummary(summary);
    document.cookie = "tastemaker_summary=; max-age=0; path=/; SameSite=Lax";
    
    return summary;
  } catch (error) {
    console.error("[Tastemaker] Failed to load summary:", error);
    return null;
  }
}

export function clearSummary(): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem(SUMMARY_STORAGE_KEY);
  document.cookie = "tastemaker_summary=; max-age=0; path=/; SameSite=Lax";
}

// Card session persistence for cross-device continuity
const CARD_SESSION_KEY = "tastemaker_card_session";

export function saveCardSession(session: CardSession): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(CARD_SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    console.error("[Tastemaker] Failed to save card session:", error);
  }
}

export function loadCardSession(): CardSession | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(CARD_SESSION_KEY);
    if (stored) {
      return JSON.parse(stored) as CardSession;
    }
    return null;
  } catch (error) {
    console.error("[Tastemaker] Failed to load card session:", error);
    return null;
  }
}

export function clearCardSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CARD_SESSION_KEY);
}
