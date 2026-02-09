import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeName = "caster" | "folio";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "caster",
  setTheme: () => {}
});

const STORAGE_KEY = "app-theme";

function readStoredTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "caster" || stored === "folio") {
      return stored;
    }
  } catch {}
  return "caster";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(readStoredTheme);

  const setTheme = (next: ThemeName) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.className = `layout-${theme}`;
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
