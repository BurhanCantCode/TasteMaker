import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import { UserProfile, UserFact, UserLike, CardSession } from "./types";
import { CachedSummary } from "./cookies";

export interface CloudUserDocument {
  facts: UserFact[];
  likes: UserLike[];
  initialFacts?: string;
  userLocation?: {
    city: string;
    region?: string;
    country?: string;
  };
  cardSession?: CardSession;
  cachedSummary?: CachedSummary;
  lastModifiedAt: number;
  lastSyncedAt: ReturnType<typeof serverTimestamp>;
  phoneNumber?: string;
}

export async function syncProfileToCloud(
  uid: string,
  profile: UserProfile,
  cardSession?: CardSession,
  cachedSummary?: CachedSummary,
  phoneNumber?: string
): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;

  try {
    const docRef = doc(db, "users", uid);
    const data: Record<string, unknown> = {
      facts: profile.facts,
      likes: profile.likes,
      lastModifiedAt: Date.now(),
      lastSyncedAt: serverTimestamp(),
    };

    if (profile.initialFacts !== undefined) {
      data.initialFacts = profile.initialFacts;
    }
    if (profile.userLocation !== undefined) {
      data.userLocation = profile.userLocation;
    }
    if (cardSession) {
      data.cardSession = cardSession;
    }
    if (cachedSummary) {
      data.cachedSummary = cachedSummary;
    }
    if (phoneNumber) {
      data.phoneNumber = phoneNumber;
    }

    await setDoc(docRef, data, { merge: true });
    console.log(
      `[Tastemaker] Synced to cloud: ${profile.facts.length} facts, ${profile.likes.length} likes`
    );
  } catch (error) {
    console.error("[Tastemaker] Failed to sync to cloud:", error);
    throw error;
  }
}

export async function loadProfileFromCloud(uid: string): Promise<{
  profile: UserProfile;
  cardSession?: CardSession;
  cachedSummary?: CachedSummary;
} | null> {
  const db = getFirebaseDb();
  if (!db) return null;

  try {
    const docRef = doc(db, "users", uid);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) return null;

    const data = snapshot.data();
    const profile: UserProfile = {
      facts: data.facts || [],
      likes: data.likes || [],
      initialFacts: data.initialFacts,
      userLocation: data.userLocation,
    };

    console.log(
      `[Tastemaker] Loaded from cloud: ${profile.facts.length} facts, ${profile.likes.length} likes`
    );

    return {
      profile,
      cardSession: data.cardSession,
      cachedSummary: data.cachedSummary,
    };
  } catch (error) {
    console.error("[Tastemaker] Failed to load from cloud:", error);
    return null;
  }
}

export function mergeProfiles(
  local: UserProfile,
  cloud: UserProfile
): UserProfile {
  // Facts: union by questionId, keep latest timestamp per ID
  const factsMap = new Map<string, UserFact>();
  for (const fact of cloud.facts) {
    factsMap.set(fact.questionId, fact);
  }
  for (const fact of local.facts) {
    const existing = factsMap.get(fact.questionId);
    if (!existing || fact.timestamp > existing.timestamp) {
      factsMap.set(fact.questionId, fact);
    }
  }

  // Likes: union by itemId, keep latest timestamp per ID
  const likesMap = new Map<string, UserLike>();
  for (const like of cloud.likes) {
    likesMap.set(like.itemId, like);
  }
  for (const like of local.likes) {
    const existing = likesMap.get(like.itemId);
    if (!existing || like.timestamp > existing.timestamp) {
      likesMap.set(like.itemId, like);
    }
  }

  return {
    facts: Array.from(factsMap.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    ),
    likes: Array.from(likesMap.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    ),
    // Prefer whichever is non-empty; if both exist, prefer the longer one
    initialFacts:
      local.initialFacts && cloud.initialFacts
        ? local.initialFacts.length >= cloud.initialFacts.length
          ? local.initialFacts
          : cloud.initialFacts
        : local.initialFacts || cloud.initialFacts,
    userLocation: local.userLocation || cloud.userLocation,
  };
}

export async function deleteCloudProfile(uid: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;

  try {
    const docRef = doc(db, "users", uid);
    await deleteDoc(docRef);
    console.log("[Tastemaker] Deleted cloud profile");
  } catch (error) {
    console.error("[Tastemaker] Failed to delete cloud profile:", error);
  }
}
