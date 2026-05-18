import { WodIvcsV2FlagProvider } from "./WodIvcsV2FlagContext";

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const wodIvcsV2Enabled =
    process.env.WOD_IVCS_V2_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_WOD_IVCS_V2_ENABLED === "true";

  return <WodIvcsV2FlagProvider enabled={wodIvcsV2Enabled}>{children}</WodIvcsV2FlagProvider>;
}
