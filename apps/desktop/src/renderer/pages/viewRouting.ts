export type View = "library" | "script" | "voices" | "render";

export const VIEW_PATHS: Record<View, string> = {
  library: "/library",
  script: "/script",
  voices: "/voices",
  render: "/render"
};

const KNOWN_VIEWS = Object.keys(VIEW_PATHS) as View[];

export function resolveViewFromPathname(pathname: string): View {
  const trimmed = pathname.replace(/\/+$/, "");
  const normalizedPath = trimmed.length === 0 ? "/" : trimmed;

  if (normalizedPath === "/") {
    return "library";
  }

  const match = KNOWN_VIEWS.find((view) => VIEW_PATHS[view] === normalizedPath);
  return match ?? "library";
}
