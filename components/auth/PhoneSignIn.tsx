"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RecaptchaVerifier } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { X, Phone, Loader2, ArrowLeft } from "lucide-react";

interface PhoneSignInProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = "phone" | "otp";

const ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-phone-number":
    "Please enter a valid phone number with country code (e.g., +1 234 567 8900)",
  "auth/too-many-requests":
    "Too many attempts. Please wait a few minutes and try again",
  "auth/quota-exceeded":
    "Service temporarily unavailable. Please try again later",
  "auth/invalid-verification-code": "Incorrect code. Please check and try again",
  "auth/code-expired": "Code expired. Please request a new one",
  "auth/network-request-failed":
    "No internet connection. Please check your network",
  "auth/missing-phone-number": "Please enter your phone number",
};

function sanitizePhoneNumber(phone: string): string {
  // Remove ALL whitespace (including Unicode whitespace) and invisible characters
  // Keep only: digits, +, -, (, ), and space (normalize spaces after)
  return phone
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // Zero-width spaces
    .replace(/\u00A0/g, " ") // Non-breaking space to regular space
    .replace(/[\s\u00A0]+/g, " ") // Normalize all whitespace to single space
    .trim(); // Remove leading/trailing
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: string }).code;
    return ERROR_MESSAGES[code] || "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

export function PhoneSignIn({ isOpen, onClose, onSuccess }: PhoneSignInProps) {
  const { signInWithPhone, confirmOtp } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<Awaited<
    ReturnType<typeof signInWithPhone>
  > | null>(null);

  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Initialize reCAPTCHA when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const auth = getFirebaseAuth();
    if (!auth || !recaptchaContainerRef.current) return;

    // Clean up any existing verifier
    if (recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current.clear();
      recaptchaVerifierRef.current = null;
    }

    recaptchaVerifierRef.current = new RecaptchaVerifier(
      auth,
      recaptchaContainerRef.current,
      { size: "invisible" }
    );

    return () => {
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
    };
  }, [isOpen]);

  // Auto-focus inputs
  useEffect(() => {
    if (isOpen && step === "phone") {
      phoneInputRef.current?.focus();
    } else if (isOpen && step === "otp") {
      otpInputRef.current?.focus();
    }
  }, [isOpen, step]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep("phone");
      setPhoneNumber("");
      setOtpCode("");
      setError(null);
      setIsLoading(false);
      setConfirmationResult(null);
    }
  }, [isOpen]);

  const handleSendOtp = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const sanitizedPhone = sanitizePhoneNumber(phoneNumber);
      if (!sanitizedPhone || !recaptchaVerifierRef.current) return;

      setError(null);
      setIsLoading(true);

      try {
        const result = await signInWithPhone(
          sanitizedPhone,
          recaptchaVerifierRef.current
        );
        setConfirmationResult(result);
        setStep("otp");
      } catch (err) {
        // Debug logging for development
        if (process.env.NODE_ENV === "development") {
          console.error("Firebase auth error:", err);
        }
        setError(getErrorMessage(err));
        // Recreate reCAPTCHA after error
        const auth = getFirebaseAuth();
        if (auth && recaptchaContainerRef.current) {
          if (recaptchaVerifierRef.current) {
            recaptchaVerifierRef.current.clear();
          }
          recaptchaVerifierRef.current = new RecaptchaVerifier(
            auth,
            recaptchaContainerRef.current,
            { size: "invisible" }
          );
        }
      } finally {
        setIsLoading(false);
      }
    },
    [phoneNumber, signInWithPhone]
  );

  const handleVerifyOtp = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!otpCode.trim() || !confirmationResult) return;

      setError(null);
      setIsLoading(true);

      try {
        await confirmOtp(confirmationResult, otpCode.trim());
        onSuccess();
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    },
    [otpCode, confirmationResult, confirmOtp, onSuccess]
  );

  const handleBack = useCallback(() => {
    setStep("phone");
    setOtpCode("");
    setError(null);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-[420px] bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-2">
          <div className="flex items-center gap-3">
            {step === "otp" && (
              <button
                onClick={handleBack}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-xl font-bold text-[#171717]">
              {step === "phone" ? "Sign In" : "Enter Code"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-8 pt-4">
          {step === "phone" ? (
            <>
              <p className="text-sm text-gray-500 mb-6">
                Enter your phone number to sync your taste profile across
                devices.
              </p>

              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium text-gray-700 mb-1.5"
                  >
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      ref={phoneInputRef}
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      value={phoneNumber}
                      onChange={(e) =>
                        setPhoneNumber(sanitizePhoneNumber(e.target.value))
                      }
                      placeholder="+1 234 567 8900"
                      className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-[#171717] text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isLoading || !sanitizePhoneNumber(phoneNumber)}
                  className="w-full py-3.5 bg-[#171717] text-white font-semibold rounded-2xl hover:bg-[#2a2a2a] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending Code...
                    </>
                  ) : (
                    "Send Code"
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-6">
                We sent a 6-digit code to{" "}
                <span className="font-medium text-[#171717]">
                  {phoneNumber}
                </span>
              </p>

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label
                    htmlFor="otp"
                    className="block text-sm font-medium text-gray-700 mb-1.5"
                  >
                    Verification Code
                  </label>
                  <input
                    ref={otpInputRef}
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="123456"
                    className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-[#171717] text-center text-2xl font-mono tracking-[0.3em] placeholder:text-gray-400 placeholder:text-base placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    disabled={isLoading}
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isLoading || otpCode.length < 6}
                  className="w-full py-3.5 bg-[#171717] text-white font-semibold rounded-2xl hover:bg-[#2a2a2a] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify"
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleBack}
                  disabled={isLoading}
                  className="w-full py-2 text-sm text-gray-500 hover:text-[#171717] transition-colors"
                >
                  Use a different number
                </button>
              </form>
            </>
          )}
        </div>

        {/* Invisible reCAPTCHA container */}
        <div ref={recaptchaContainerRef} />
      </div>
    </div>
  );
}
