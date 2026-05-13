import * as React from "react";

type Options = {
  /** When true, do not fire while user is typing in an input/textarea/contenteditable. */
  ignoreInInputs?: boolean;
};

/**
 * Bind a single-key shortcut. Pass an event-target check via `when` if needed.
 */
export function useKeyboardShortcut(
  key: string,
  handler: (e: KeyboardEvent) => void,
  { ignoreInInputs = true }: Options = {},
) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (ignoreInInputs) {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      }
      handler(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, handler, ignoreInInputs]);
}
