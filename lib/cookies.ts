import { UserProfile } from "./types";

const COOKIE_NAME = "tastemaker_profile";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

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
