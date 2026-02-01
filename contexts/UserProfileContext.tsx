"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { UserProfile, UserFact, UserLike } from "@/lib/types";
import {
  loadProfile,
  saveProfile,
  clearProfile,
  createEmptyProfile,
  loadCardSession,
  loadSummary,
} from "@/lib/cookies";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";

interface UserProfileContextValue {
  profile: UserProfile;
  isLoaded: boolean;
  addFact: (fact: Omit<UserFact, "timestamp">) => void;
  addLike: (like: Omit<UserLike, "timestamp">) => void;
  setInitialFacts: (facts: string) => void;
  setUserLocation: (city: string, region?: string, country?: string) => void;
  reset: () => void;
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(createEmptyProfile());
  const [isLoaded, setIsLoaded] = useState(false);
  const { user } = useAuth();
  const { triggerSync, mergedProfile, clearMergedData } = useSync();
  const isApplyingMergeRef = useRef(false);

  useEffect(() => {
    const loaded = loadProfile();
    queueMicrotask(() => {
      if (loaded) setProfile(loaded);
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!mergedProfile) return;
    isApplyingMergeRef.current = true;
    queueMicrotask(() => {
      setProfile(mergedProfile);
      clearMergedData();
      queueMicrotask(() => {
        isApplyingMergeRef.current = false;
      });
    });
  }, [mergedProfile, clearMergedData]);

  useEffect(() => {
    if (!isLoaded) return;
    saveProfile(profile);
    if (user && !isApplyingMergeRef.current) {
      triggerSync(profile, undefined, undefined, user.phoneNumber ?? undefined);
    }
  }, [profile, isLoaded, user, triggerSync]);

  useEffect(() => {
    const handleReconnect = () => {
      if (user && isLoaded) {
        triggerSync(
          profile,
          loadCardSession() ?? undefined,
          loadSummary() ?? undefined,
          user.phoneNumber ?? undefined
        );
      }
    };
    window.addEventListener("tastemaker-reconnect-sync", handleReconnect);
    return () =>
      window.removeEventListener("tastemaker-reconnect-sync", handleReconnect);
  }, [user, isLoaded, profile, triggerSync]);

  const addFact = useCallback((fact: Omit<UserFact, "timestamp">) => {
    setProfile((prev) => ({
      ...prev,
      facts: [
        ...prev.facts,
        { ...fact, timestamp: Date.now() },
      ],
    }));
  }, []);

  const addLike = useCallback((like: Omit<UserLike, "timestamp">) => {
    setProfile((prev) => ({
      ...prev,
      likes: [
        ...prev.likes,
        { ...like, timestamp: Date.now() },
      ],
    }));
  }, []);

  const setInitialFacts = useCallback((facts: string) => {
    setProfile((prev) => ({ ...prev, initialFacts: facts }));
  }, []);

  const setUserLocation = useCallback((city: string, region?: string, country?: string) => {
    setProfile((prev) => ({
      ...prev,
      userLocation: city ? { city, region, country } : undefined,
    }));
  }, []);

  const reset = useCallback(() => {
    setProfile(createEmptyProfile());
    clearProfile();
  }, []);

  const value: UserProfileContextValue = {
    profile,
    isLoaded,
    addFact,
    addLike,
    setInitialFacts,
    setUserLocation,
    reset,
  };

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile(): UserProfileContextValue {
  const ctx = useContext(UserProfileContext);
  if (!ctx) {
    throw new Error("useUserProfile must be used within UserProfileProvider");
  }
  return ctx;
}
