"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useSync, type SyncStatus } from "@/contexts/SyncContext";
import { LogOut, LogIn, Smartphone } from "lucide-react";

interface AccountMenuProps {
  onSignInClick: () => void;
}

function SyncDot({ status }: { status: SyncStatus }) {
  const colors: Record<SyncStatus, string> = {
    idle: "bg-gray-400",
    syncing: "bg-yellow-400 animate-pulse",
    synced: "bg-green-400",
    offline: "bg-orange-400",
    error: "bg-red-400",
  };

  const labels: Record<SyncStatus, string> = {
    idle: "Idle",
    syncing: "Syncing...",
    synced: "Synced",
    offline: "Offline",
    error: "Sync error",
  };

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[status]}`}
      title={labels[status]}
      aria-label={labels[status]}
    />
  );
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return "***" + phone.slice(-4);
}

export function AccountMenu({ onSignInClick }: AccountMenuProps) {
  const { user, signOut } = useAuth();
  const { syncStatus } = useSync();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("[Tastemaker] Sign out failed:", error);
    }
  };

  if (!user) {
    return (
      <button
        onClick={onSignInClick}
        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-blue-600 bg-white rounded-full shadow-[0_2px_8px_rgb(0,0,0,0.06)] hover:shadow-[0_4px_12px_rgb(0,0,0,0.1)] transition-all active:scale-95"
      >
        <LogIn className="w-3.5 h-3.5" />
        <span>Sign In</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white rounded-full shadow-[0_2px_8px_rgb(0,0,0,0.06)]">
        <Smartphone className="w-3.5 h-3.5" />
        <span>{maskPhone(user.phoneNumber || "")}</span>
        <SyncDot status={syncStatus} />
      </div>
      <button
        onClick={handleSignOut}
        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 bg-white rounded-full shadow-[0_2px_8px_rgb(0,0,0,0.06)] hover:shadow-[0_4px_12px_rgb(0,0,0,0.1)] transition-all active:scale-95"
        title="Sign Out"
        aria-label="Sign Out"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
