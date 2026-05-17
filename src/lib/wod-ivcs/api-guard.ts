import { NextResponse } from "next/server";
import { isWodIvcsV2Enabled } from "./feature-flag";

export function wodIvcsV2DisabledResponse() {
  return NextResponse.json(
    { success: false, error: "WOD/IVCS v2 is not enabled" },
    { status: 404 }
  );
}

export function assertWodIvcsV2Enabled(): NextResponse | null {
  if (!isWodIvcsV2Enabled()) return wodIvcsV2DisabledResponse();
  return null;
}
