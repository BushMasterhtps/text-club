/** Client-side v2 flag (set NEXT_PUBLIC_WOD_IVCS_V2_ENABLED=true in .env.local). */
export function isWodIvcsV2EnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_WOD_IVCS_V2_ENABLED === "true";
}
