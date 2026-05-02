'use client';

import { useEffect, useState } from 'react';

/**
 * Returns whether the given CSS media query currently matches.
 * SSR-safe: returns `false` until mounted, then syncs with `matchMedia`.
 *
 * Use one instance per page tree rather than scattering matchMedia listeners
 * across many components — derive multiple booleans from a single mount.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);

  return matches;
}
