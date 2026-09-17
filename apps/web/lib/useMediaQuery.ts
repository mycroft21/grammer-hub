"use client";
import { useEffect, useState } from "react";

/** SSR에서는 fallback, 클라이언트에서 matchMedia로 갱신. */
export function useMediaQuery(query: string, fallback = false): boolean {
  const [match, setMatch] = useState(fallback);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on(); m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}
