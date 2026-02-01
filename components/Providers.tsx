"use client";

import { type ReactNode } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { SyncProvider } from "@/contexts/SyncContext";
import { UserProfileProvider } from "@/contexts/UserProfileContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SyncProvider>
        <UserProfileProvider>{children}</UserProfileProvider>
      </SyncProvider>
    </AuthProvider>
  );
}
