import { useCallback, useEffect, useSyncExternalStore } from "react";
import { syncBrowserChromeTheme } from "./useTheme";

/**
 * Available color schemes. "default" uses the base index.css palette;
 * every other value maps to a `.scheme-<id>` class in colorSchemes.css.
 */
export const COLOR_SCHEMES = [
  { value: "default", label: "Default" },
  { value: "tokyonight", label: "Tokyo Night" },
  { value: "darcula", label: "Darcula" },
  { value: "github", label: "GitHub" },
  { value: "catppuccin", label: "Catppuccin" },
  { value: "nord", label: "Nord" },
  { value: "solarized", label: "Solarized" },
  { value: "gruvbox", label: "Gruvbox" },
  { value: "rosepine", label: "Rosé Pine" },
] as const;

export type ColorSchemeId = (typeof COLOR_SCHEMES)[number]["value"];

const STORAGE_KEY = "t3code:colorScheme";
const CLASS_PREFIX = "scheme-";

let listeners: Array<() => void> = [];
let lastSnapshot: ColorSchemeId | null = null;

function emitChange() {
  for (const listener of listeners) listener();
}

function hasStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function getStored(): ColorSchemeId {
  if (!hasStorage()) return "default";
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw && COLOR_SCHEMES.some((s) => s.value === raw)) return raw as ColorSchemeId;
  return "default";
}

function applyScheme(scheme: ColorSchemeId, suppressTransitions = false) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  if (suppressTransitions) {
    root.classList.add("no-transitions");
  }

  // Remove any existing scheme class
  for (const cls of Array.from(root.classList)) {
    if (cls.startsWith(CLASS_PREFIX)) {
      root.classList.remove(cls);
    }
  }

  // Apply new scheme class (skip for "default" — it uses base :root vars)
  if (scheme !== "default") {
    root.classList.add(`${CLASS_PREFIX}${scheme}`);
  }

  // Re-sync the browser chrome (titlebar color) to the new palette
  syncBrowserChromeTheme();

  if (suppressTransitions) {
    // Force reflow so no-transitions class takes effect before removal
    // oxlint-disable-next-line no-unused-expressions
    root.offsetHeight;
    requestAnimationFrame(() => {
      root.classList.remove("no-transitions");
    });
  }
}

// Apply on module load to prevent flash of wrong scheme
if (typeof document !== "undefined" && hasStorage()) {
  applyScheme(getStored());
}

function getSnapshot(): ColorSchemeId {
  if (!hasStorage()) return "default";
  const stored = getStored();
  if (lastSnapshot === stored) return lastSnapshot;
  lastSnapshot = stored;
  return stored;
}

function getServerSnapshot(): ColorSchemeId {
  return "default";
}

// Single module-level storage listener, registered once on first subscribe
let storageListenerAttached = false;

function ensureStorageListener() {
  if (storageListenerAttached || typeof window === "undefined") return;
  storageListenerAttached = true;
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      applyScheme(getStored(), true);
      emitChange();
    }
  });
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.push(listener);
  ensureStorageListener();

  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function useColorScheme() {
  const colorScheme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setColorScheme = useCallback((next: ColorSchemeId) => {
    if (!hasStorage()) return;
    localStorage.setItem(STORAGE_KEY, next);
    applyScheme(next, true);
    emitChange();
  }, []);

  // Keep DOM in sync on mount
  useEffect(() => {
    applyScheme(colorScheme);
  }, [colorScheme]);

  return { colorScheme, setColorScheme } as const;
}
