"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "pure_eq_theme";
export type Theme = "default" | "easy";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("easy-mode", theme === "easy");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("default");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "easy" || stored === "default") {
        setThemeState(stored);
        applyTheme(stored);
      }
    } catch {
      // localStorage unavailable (private mode, etc) — stay on default
    }
  }, []);

  function setTheme(next: Theme) {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  return {
    theme,
    toggle: () => setTheme(theme === "easy" ? "default" : "easy"),
  };
}
