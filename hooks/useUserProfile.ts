"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile>(createEmptyProfile());
  const [isLoaded, setIsLoaded] = useState(false);
  const { user } = useAuth();
  const { triggerSync, mergedProfile, clearMergedData } = useSync();

  // Track when we're applying merged data to avoid re-syncing it back
  const isApplyingMergeRef = useRef(false);

  // Load profile from localStorage on mount
  useEffect(() => {
    const loaded = loadProfile();
    queueMicrotask(() => {
      if (loaded) {
        setProfile(loaded);
      }
      setIsLoaded(true);
    });
  }, []);

  // Apply merged profile from cloud sync (when signing in with existing cloud data)
  useEffect(() => {
    if (mergedProfile) {
      isApplyingMergeRef.current = true;
      queueMicrotask(() => {
        setProfile(mergedProfile);
        clearMergedData();
        // Reset flag after state update settles
        queueMicrotask(() => {
          isApplyingMergeRef.current = false;
        });
      });
    }
  }, [mergedProfile, clearMergedData]);

  // Save profile to localStorage whenever it changes, and sync to cloud if authenticated
  // Skip sync if we're just applying merged data from cloud (prevents infinite loop)
  useEffect(() => {
    if (isLoaded) {
      saveProfile(profile);
      if (user && !isApplyingMergeRef.current) {
        triggerSync(profile, undefined, undefined, user.phoneNumber ?? undefined);
      }
    }
  }, [profile, isLoaded, user, triggerSync]);

  // On reconnect, push current local state to cloud so offline edits are synced
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
        {
          ...fact,
          timestamp: Date.now(),
        },
      ],
    }));
  }, []);

  const addLike = useCallback((like: Omit<UserLike, "timestamp">) => {
    setProfile((prev) => ({
      ...prev,
      likes: [
        ...prev.likes,
        {
          ...like,
          timestamp: Date.now(),
        },
      ],
    }));
  }, []);

  const setInitialFacts = useCallback((facts: string) => {
    setProfile((prev) => ({
      ...prev,
      initialFacts: facts,
    }));
  }, []);

  const setUserLocation = useCallback((city: string, region?: string, country?: string) => {
    setProfile((prev) => ({
      ...prev,
      userLocation: city ? { city, region, country } : undefined,
    }));
  }, []);

  const reset = useCallback(() => {
    const empty = createEmptyProfile();
    setProfile(empty);
    clearProfile();
  }, []);

  return {
    profile,
    isLoaded,
    addFact,
    addLike,
    setInitialFacts,
    setUserLocation,
    reset,
  };
}
