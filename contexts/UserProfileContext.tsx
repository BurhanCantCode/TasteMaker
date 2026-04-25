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
import {
  UserProfile,
  UserFact,
  UserLike,
  PersonalityReport,
  Question,
} from "@/lib/types";
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
import {
  applyAnswer,
  applyMBTIProbeAnswer,
  emptyState,
} from "@/lib/probabilityState";
import {
  applyProbeAnswer,
  emptyDemographicState,
} from "@/lib/demographicState";
import { getProbeById, isProbeId } from "@/lib/indirectProbes";
import { getMBTIProbeById, isMBTIProbeId } from "@/lib/personalityProbes";

interface UserProfileContextValue {
  profile: UserProfile;
  isLoaded: boolean;
  addFact: (fact: Omit<UserFact, "timestamp">, question?: Question) => void;
  addLike: (like: Omit<UserLike, "timestamp">) => void;
  addSkip: (questionId: string) => void;
  undoLast: () => "fact" | "skip" | null;
  addReport: (report: Omit<PersonalityReport, "createdAt" | "id">) => PersonalityReport;
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

  const addFact = useCallback(
    (fact: Omit<UserFact, "timestamp">, question?: Question) => {
      setProfile((prev) => {
        const stamped: UserFact = { ...fact, timestamp: Date.now() };

        // Personality (framework) scoring updates ProbabilityState from
        // question.tags like "mbti:I". Demographic scoring updates
        // DemographicState from probe.onYes/onNo implications. A card is
        // either a personality question or a probe — never both — so
        // exactly one branch fires per answer.
        const baseProbState = prev.probabilityState ?? emptyState();
        const baseDemoState =
          prev.demographicState ?? emptyDemographicState();

        let nextProbState = baseProbState;
        let nextDemoState = baseDemoState;

        if (question && isProbeId(question.id)) {
          const probe = getProbeById(question.id);
          if (probe) {
            const sentiment =
              stamped.sentiment ??
              (stamped.positive ? "affirmative" : "non-affirmative");
            nextDemoState = applyProbeAnswer(baseDemoState, probe, sentiment);
          }
        } else if (question && isMBTIProbeId(question.id)) {
          const mbtiProbe = getMBTIProbeById(question.id);
          if (mbtiProbe) {
            const sentiment =
              stamped.sentiment ??
              (stamped.positive ? "affirmative" : "non-affirmative");
            nextProbState = applyMBTIProbeAnswer(
              baseProbState,
              mbtiProbe,
              sentiment
            );
          }
        } else if (question) {
          nextProbState = applyAnswer(baseProbState, stamped, question);
        }

        return {
          ...prev,
          facts: [...prev.facts, stamped],
          probabilityState: nextProbState,
          demographicState: nextDemoState,
        };
      });
    },
    []
  );

  const addLike = useCallback((like: Omit<UserLike, "timestamp">) => {
    setProfile((prev) => ({
      ...prev,
      likes: [
        ...prev.likes,
        { ...like, timestamp: Date.now() },
      ],
    }));
  }, []);

  const addSkip = useCallback((questionId: string) => {
    setProfile((prev) => ({
      ...prev,
      skippedIds: [...(prev.skippedIds ?? []), questionId],
    }));
  }, []);

  const undoLast = useCallback((): "fact" | "skip" | null => {
    // Decide what to undo from the latest snapshot — NOT from a closure variable
    // mutated inside the setProfile updater. React may run the updater lazily,
    // so the closure pattern returned null before the pop landed and the caller
    // bailed out (leaving the card index un-rewound).
    const lastFact = profile.facts[profile.facts.length - 1];
    const lastSkip = profile.skippedIds?.[profile.skippedIds.length - 1];
    if (lastFact) {
      setProfile((prev) => {
        if (prev.facts.length === 0) return prev;
        return { ...prev, facts: prev.facts.slice(0, -1) };
      });
      return "fact";
    }
    if (lastSkip) {
      setProfile((prev) => {
        const skipped = prev.skippedIds ?? [];
        if (skipped.length === 0) return prev;
        return { ...prev, skippedIds: skipped.slice(0, -1) };
      });
      return "skip";
    }
    return null;
  }, [profile]);

  const addReport = useCallback(
    (report: Omit<PersonalityReport, "createdAt" | "id">): PersonalityReport => {
      const full: PersonalityReport = {
        ...report,
        id: `report_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: Date.now(),
      };
      setProfile((prev) => ({
        ...prev,
        reports: [...(prev.reports ?? []), full],
      }));
      return full;
    },
    []
  );

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
    addSkip,
    undoLast,
    addReport,
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
