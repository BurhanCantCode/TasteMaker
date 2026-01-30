"use client";

import { useState, useEffect, useCallback } from "react";
import { UserProfile, UserFact, UserLike } from "@/lib/types";
import {
  loadProfile,
  saveProfile,
  clearProfile,
  createEmptyProfile,
} from "@/lib/cookies";

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile>(createEmptyProfile());
  const [isLoaded, setIsLoaded] = useState(false);

  // Load profile from cookies on mount
  useEffect(() => {
    const loaded = loadProfile();
    if (loaded) {
      setProfile(loaded);
    }
    setIsLoaded(true);
  }, []);

  // Save profile to cookies whenever it changes
  useEffect(() => {
    if (isLoaded) {
      saveProfile(profile);
    }
  }, [profile, isLoaded]);

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
