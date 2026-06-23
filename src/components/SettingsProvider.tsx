"use client";

/**
 * Client-side scoring-settings context, persisted to localStorage so changes
 * on /settings apply across /dashboard, /match/[id], /streak and /boosts
 * without a backend.
 */

import { createContext, useContext, useEffect, useState } from "react";
import type { ScoringSettings } from "@/types";
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from "@/lib/settings";

interface SettingsContextValue {
  settings: ScoringSettings;
  setSettings: (s: ScoringSettings) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<ScoringSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) setSettingsState({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {
      // ignore malformed/unavailable storage
    }
  }, []);

  function setSettings(next: ScoringSettings) {
    setSettingsState(next);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore unavailable storage (e.g. private mode)
    }
  }

  function resetSettings() {
    setSettings(DEFAULT_SETTINGS);
  }

  return (
    <SettingsContext.Provider value={{ settings, setSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
