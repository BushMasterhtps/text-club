"use client";

import { createContext, useContext } from "react";
import { isWodIvcsV2EnabledClient } from "@/lib/wod-ivcs/client-feature-flag";

const WodIvcsV2FlagContext = createContext<boolean | null>(null);

export function WodIvcsV2FlagProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <WodIvcsV2FlagContext.Provider value={enabled}>{children}</WodIvcsV2FlagContext.Provider>
  );
}

/** Prefer server layout flag (runtime env); fall back to inlined NEXT_PUBLIC for tests. */
export function useWodIvcsV2Enabled(): boolean {
  const fromServer = useContext(WodIvcsV2FlagContext);
  if (fromServer !== null) return fromServer;
  return isWodIvcsV2EnabledClient();
}
