"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "./AuthContext";
import { getFirebaseDb } from "@/lib/firebase";
import { UserProfile, CardSession } from "@/lib/types";
import { CachedSummary, loadProfile, saveProfile, loadSummary, saveSummary, loadCardSession, saveCardSession } from "@/lib/cookies";
import { loadProfileFromCloud, mergeProfiles, syncProfileToCloud } from "@/lib/firestore";
import { createDebouncedSync, isOnline } from "@/lib/sync";

export type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";

interface SyncContextValue {
  syncStatus: SyncStatus;
  lastSyncedAt: number | null;
  triggerSync: (
    profile: UserProfile,
    cardSession?: CardSession,
    cachedSummary?: CachedSummary,
    phoneNumber?: string
  ) => void;
  initialSyncDone: boolean;
  hasPendingMerge: boolean;
  mergedProfile: UserProfile | null;
  mergedCardSession: CardSession | null;
  mergedSummary: CachedSummary | null;
  clearMergedData: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    typeof window !== "undefined" && !navigator.onLine ? "offline" : "idle"
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [initialSyncDone, setInitialSyncDone] = useState(false);
  const [hasPendingMerge, setHasPendingMerge] = useState(false);
  const [mergedProfile, setMergedProfile] = useState<UserProfile | null>(null);
  const [mergedCardSession, setMergedCardSession] = useState<CardSession | null>(null);
  const [mergedSummary, setMergedSummary] = useState<CachedSummary | null>(null);
  const debouncedSyncRef = useRef<ReturnType<typeof createDebouncedSync> | null>(null);
  const prevUidRef = useRef<string | null>(null);
  const lastProcessedWriteTimeRef = useRef<number>(0);

  // Create debounced sync function when user changes
  useEffect(() => {
    if (user) {
      debouncedSyncRef.current = createDebouncedSync(user.uid);
    } else {
      debouncedSyncRef.current = null;
    }
  }, [user]);

  // Handle initial sync on sign-in
  useEffect(() => {
    if (!user) {
      const wasSignedIn = !!prevUidRef.current;
      prevUidRef.current = null;
      if (wasSignedIn) {
        // Was signed in, now signed out — reset sync state via async microtask
        queueMicrotask(() => {
          setInitialSyncDone(true);
          setMergedProfile(null);
          setMergedCardSession(null);
          setMergedSummary(null);
          setSyncStatus("idle");
        });
      } else {
        // No user, allow guest mode to proceed
        queueMicrotask(() => setInitialSyncDone(true));
      }
      return;
    }

    // Skip if same user already synced
    if (prevUidRef.current === user.uid) return;
    prevUidRef.current = user.uid;

    const performInitialSync = async () => {
      setSyncStatus("syncing");

      try {
        const localProfile = loadProfile();
        const localSummary = loadSummary();
        const localCardSession = loadCardSession();
        const cloudData = await loadProfileFromCloud(user.uid);

        const hasLocal =
          localProfile &&
          (localProfile.facts.length > 0 ||
            localProfile.likes.length > 0 ||
            !!localProfile.initialFacts);
        const hasCloud =
          cloudData &&
          (cloudData.profile.facts.length > 0 ||
            cloudData.profile.likes.length > 0 ||
            !!cloudData.profile.initialFacts);

        if (!hasLocal && !hasCloud) {
          // Both empty — fresh user
          setSyncStatus("synced");
          setInitialSyncDone(true);
          return;
        }

        if (hasLocal && !hasCloud) {
          // First sign-in with existing local data — push to cloud
          await syncProfileToCloud(
            user.uid,
            localProfile!,
            localCardSession ?? undefined,
            localSummary ?? undefined,
            user.phoneNumber ?? undefined
          );
          setSyncStatus("synced");
          setLastSyncedAt(Date.now());
          setInitialSyncDone(true);
          return;
        }

        if (!hasLocal && hasCloud) {
          // New device — pull cloud data to local
          saveProfile(cloudData!.profile);
          if (cloudData!.cachedSummary) {
            saveSummary(cloudData!.cachedSummary);
          }
          if (cloudData!.cardSession) {
            saveCardSession(cloudData!.cardSession);
          }
          setHasPendingMerge(true);
          setMergedProfile(cloudData!.profile);
          setMergedCardSession(cloudData!.cardSession ?? null);
          setMergedSummary(cloudData!.cachedSummary ?? null);
          setSyncStatus("synced");
          setLastSyncedAt(Date.now());
          setInitialSyncDone(true);
          return;
        }

        // Both have data — merge
        const merged = mergeProfiles(localProfile!, cloudData!.profile);
        saveProfile(merged);
        await syncProfileToCloud(
          user.uid,
          merged,
          cloudData!.cardSession ?? localCardSession ?? undefined,
          localSummary ?? cloudData!.cachedSummary ?? undefined,
          user.phoneNumber ?? undefined
        );

        // Use cloud cardSession (represents last cross-device state)
        const resolvedSession = cloudData!.cardSession ?? localCardSession;
        if (resolvedSession) {
          saveCardSession(resolvedSession);
        }

        setHasPendingMerge(true);
        setMergedProfile(merged);
        setMergedCardSession(resolvedSession ?? null);
        setMergedSummary(localSummary ?? cloudData!.cachedSummary ?? null);
        setSyncStatus("synced");
        setLastSyncedAt(Date.now());
        setInitialSyncDone(true);
      } catch (error) {
        console.error("[Tastemaker] Initial sync failed:", error);
        setSyncStatus("error");
        // Still allow app to proceed with local data
        setInitialSyncDone(true);
      }
    };

    performInitialSync();
  }, [user]);

  // Real-time listener: pull cloud changes and merge into local so other devices' updates appear
  // Skip if this snapshot is from our own pending write to prevent sync loops
  useEffect(() => {
    if (!user) return;
    const db = getFirebaseDb();
    if (!db) return;

    const unsub = onSnapshot(doc(db, "users", user.uid), (snapshot) => {
      // Skip if this is our own pending write (not yet confirmed by server)
      if (snapshot.metadata.hasPendingWrites) return;

      if (!snapshot.exists()) return;
      const data = snapshot.data();

      // Timestamp guard: Ignore updates that are older than or equal to the last time we wrote/processed
      // This filters out "echoes" from our own writes and stale data
      const remoteModifiedAt = data.lastModifiedAt as number | undefined;
      if (remoteModifiedAt && remoteModifiedAt <= lastProcessedWriteTimeRef.current) {
        return;
      }
      if (remoteModifiedAt) {
        lastProcessedWriteTimeRef.current = remoteModifiedAt;
      }

      const cloudProfile: UserProfile = {
        facts: data.facts || [],
        likes: data.likes || [],
        initialFacts: data.initialFacts,
        userLocation: data.userLocation,
      };

      const localProfile = loadProfile();

      // Skip if cloud data matches local (nothing new to merge)
      if (localProfile &&
        localProfile.facts.length === cloudProfile.facts.length &&
        localProfile.likes.length === cloudProfile.likes.length) {
        return;
      }

      const merged = localProfile
        ? mergeProfiles(localProfile, cloudProfile)
        : cloudProfile;
      saveProfile(merged);
      if (data.cardSession) saveCardSession(data.cardSession);
      if (data.cachedSummary) saveSummary(data.cachedSummary);
      queueMicrotask(() => {
        setMergedProfile(merged);
        setMergedCardSession(data.cardSession ?? null);
        setMergedSummary(data.cachedSummary ?? null);
      });
    });

    return () => unsub();
  }, [user?.uid]);

  // Listen for online/offline events; on reconnect, ask app to push current state
  useEffect(() => {
    const handleOnline = () => {
      if (syncStatus === "offline") {
        setSyncStatus("idle");
        window.dispatchEvent(new CustomEvent("tastemaker-reconnect-sync"));
      }
    };

    const handleOffline = () => {
      setSyncStatus("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncStatus]);

  const triggerSync = useCallback(
    (
      profile: UserProfile,
      cardSession?: CardSession,
      cachedSummary?: CachedSummary,
      phoneNumber?: string
    ) => {
      if (!debouncedSyncRef.current) return;
      if (!isOnline()) {
        setSyncStatus("offline");
        return;
      }
      setSyncStatus("syncing");

      const now = Date.now();
      lastProcessedWriteTimeRef.current = now;

      debouncedSyncRef.current(
        profile,
        cardSession,
        cachedSummary,
        phoneNumber,
        now
      );

      // The debounced function will complete asynchronously
      // We optimistically set syncing; actual success updates happen in the debounced callback
      setTimeout(() => {
        setSyncStatus((prev) => (prev === "syncing" ? "synced" : prev));
        setLastSyncedAt(now);
      }, 2500); // slightly after the 2s debounce
    },
    []
  );

  const clearMergedData = useCallback(() => {
    setMergedProfile(null);
    setMergedCardSession(null);
    setMergedSummary(null);
    setHasPendingMerge(false);
  }, []);

  return (
    <SyncContext.Provider
      value={{
        syncStatus,
        lastSyncedAt,
        triggerSync,
        initialSyncDone,
        hasPendingMerge,
        mergedProfile,
        mergedCardSession,
        mergedSummary,
        clearMergedData,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync must be used within a SyncProvider");
  }
  return context;
}
