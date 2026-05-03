import React, { createContext, useCallback, useContext, useState } from "react";

/**
 * PageTitleContext — lets a page override the topbar title without
 * coupling the topbar to the page's data fetching.
 *
 * Default flow:
 *   - Topbar derives a static title from the URL path.
 *   - A page that needs a dynamic title (e.g. ProjectDetail showing the
 *     project name) calls usePageTitle(name) once data lands.
 *   - The override is cleared when the component unmounts so the next
 *     route falls back to the URL-derived default.
 *
 * Document.title is set in lockstep so browser tabs match the topbar.
 */
const PageTitleContext = createContext({
  override: null,
  setOverride: () => {},
});

export function PageTitleProvider({ children }) {
  const [override, setOverrideState] = useState(null);
  const setOverride = useCallback((value) => {
    setOverrideState(value);
  }, []);
  return (
    <PageTitleContext.Provider value={{ override, setOverride }}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitleOverride() {
  return useContext(PageTitleContext);
}
