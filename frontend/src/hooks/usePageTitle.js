import { useEffect } from "react";
import { usePageTitleOverride } from "../contexts/PageTitleContext";

/**
 * usePageTitle(title)
 *
 * Sets both `document.title` (so browser tabs and history reflect the
 * current page) and the topbar override (so the visible page heading
 * shows the same string). Pass `null`/`undefined`/empty to clear.
 *
 * The hook clears the override on unmount so the next route falls back
 * to the URL-derived default. document.title is left at the last value
 * — a subsequent usePageTitle call will overwrite it; the App always
 * sets a baseline anyway.
 */
const SUFFIX = "FirmOS";

export function usePageTitle(title) {
  const { setOverride } = usePageTitleOverride();
  useEffect(() => {
    if (!title) {
      setOverride(null);
      document.title = SUFFIX;
      return undefined;
    }
    setOverride(title);
    document.title = `${title} · ${SUFFIX}`;
    return () => setOverride(null);
  }, [title, setOverride]);
}

export default usePageTitle;
