import { UserProfile } from "./types";

const COOKIE_NAME = "tastemaker_profile";
const SUMMARY_COOKIE_NAME = "tastemaker_summary";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

export interface CachedSummary {
  text: string;
  factsCount: number;
  likesCount: number;
}

export function saveProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  
  const serialized = JSON.stringify(profile);
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
    serialized
  )}; max-age=${MAX_AGE_SECONDS}; path=/; SameSite=Lax`;
}

export function loadProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  
  const cookies = document.cookie.split(";");
  const profileCookie = cookies.find((cookie) =>
    cookie.trim().startsWith(`${COOKIE_NAME}=`)
  );

  if (!profileCookie) return null;

  try {
    const value = profileCookie.split("=")[1];
    const decoded = decodeURIComponent(value);
    return JSON.parse(decoded) as UserProfile;
  } catch (error) {
    console.error("Failed to parse profile cookie:", error);
    return null;
  }
}

export function clearProfile(): void {
  if (typeof window === "undefined") return;
  
  document.cookie = `${COOKIE_NAME}=; max-age=0; path=/; SameSite=Lax`;
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
  
  const serialized = JSON.stringify(summary);
  document.cookie = `${SUMMARY_COOKIE_NAME}=${encodeURIComponent(
    serialized
  )}; max-age=${MAX_AGE_SECONDS}; path=/; SameSite=Lax`;
}

export function loadSummary(): CachedSummary | null {
  if (typeof window === "undefined") return null;
  
  const cookies = document.cookie.split(";");
  const summaryCookie = cookies.find((cookie) =>
    cookie.trim().startsWith(`${SUMMARY_COOKIE_NAME}=`)
  );

  if (!summaryCookie) return null;

  try {
    const value = summaryCookie.split("=")[1];
    const decoded = decodeURIComponent(value);
    return JSON.parse(decoded) as CachedSummary;
  } catch (error) {
    console.error("Failed to parse summary cookie:", error);
    return null;
  }
}

export function clearSummary(): void {
  if (typeof window === "undefined") return;
  
  document.cookie = `${SUMMARY_COOKIE_NAME}=; max-age=0; path=/; SameSite=Lax`;
}
