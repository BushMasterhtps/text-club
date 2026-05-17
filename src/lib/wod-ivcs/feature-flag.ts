/**
 * WOD/IVCS v2 feature gate. Default off unless explicitly enabled.
 */
export function isWodIvcsV2Enabled(): boolean {
  return process.env.WOD_IVCS_V2_ENABLED === "true";
}
