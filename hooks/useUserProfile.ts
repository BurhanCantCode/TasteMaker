"use client";

import { useState, useEffect, useCallback } from "react";
import { UserProfile, UserFact, UserLike } from "@/lib/types";
import {
  loadProfile,
  saveProfile,
  clearProfile,
  createEmptyProfile,
} from "@/lib/cookies";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile>(createEmptyProfile());
  const [isLoaded, setIsLoaded] = useState(false);
  const { user } = useAuth();
  const { triggerSync, mergedProfile, clearMergedData } = useSync();

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
      queueMicrotask(() => {
        setProfile(mergedProfile);
        clearMergedData();
      });
    }
  }, [mergedProfile, clearMergedData]);

  // Save profile to localStorage whenever it changes, and sync to cloud if authenticated
  useEffect(() => {
    if (isLoaded) {
      saveProfile(profile);
      if (user) {
        triggerSync(profile);
      }
    }
  }, [profile, isLoaded, user, triggerSync]);

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
