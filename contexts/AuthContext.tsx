"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPhoneNumber,
  signOut as firebaseSignOut,
  type User,
  type ConfirmationResult,
  type RecaptchaVerifier,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

interface AuthContextValue {
  user: User | null;
  isAuthLoading: boolean;
  signInWithPhone: (
    phoneNumber: string,
    recaptchaVerifier: RecaptchaVerifier
  ) => Promise<ConfirmationResult>;
  confirmOtp: (
    confirmationResult: ConfirmationResult,
    code: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(() => !!getFirebaseAuth());

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleSignInWithPhone = useCallback(
    async (
      phoneNumber: string,
      recaptchaVerifier: RecaptchaVerifier
    ): Promise<ConfirmationResult> => {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error("Firebase is not configured");
      return signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
    },
    []
  );

  const handleConfirmOtp = useCallback(
    async (
      confirmationResult: ConfirmationResult,
      code: string
    ): Promise<void> => {
      await confirmationResult.confirm(code);
    },
    []
  );

  const handleSignOut = useCallback(async (): Promise<void> => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await firebaseSignOut(auth);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthLoading,
        signInWithPhone: handleSignInWithPhone,
        confirmOtp: handleConfirmOtp,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
