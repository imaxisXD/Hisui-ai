import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeName = "hisui" | "folio";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "hisui",
  setTheme: () => {}
});

const STORAGE_KEY = "app-theme";

function readStoredTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "hisui" || stored === "folio") {
      return stored;
    }
  } catch {}
  return "hisui";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(readStoredTheme);

  useEffect(() => {
    const desktopApi = window.app;
    if (!desktopApi) {
      return;
    }
    void desktopApi.getUiPreferences()
      .then((preferences) => {
        const localTheme = readStoredTheme();
        if (localTheme === "folio" && preferences.theme !== "folio") {
          setThemeState(localTheme);
          void desktopApi.updateUiPreferences({ theme: localTheme });
          return;
        }
        if (preferences.theme === "hisui" || preferences.theme === "folio") {
          setThemeState(preferences.theme);
          try {
            localStorage.setItem(STORAGE_KEY, preferences.theme);
          } catch {}
        }
      })
      .catch(() => {
        // Keep local fallback if preference read fails.
      });
  }, []);

  const setTheme = (next: ThemeName) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    if (window.app) {
      void window.app.updateUiPreferences({ theme: next });
    }
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
