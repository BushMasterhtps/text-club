import type { WodIvcsSourceReportType } from "@prisma/client";

export async function readCsvUpload(request: Request): Promise<
  | { ok: true; fileName: string; csvText: string }
  | { ok: false; error: string; status: number }
> {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return { ok: false, error: "No file provided", status: 400 };
  }
  const csvText = await file.text();
  return { ok: true, fileName: file.name, csvText };
}

export function parseSourceReportType(
  value: FormDataEntryValue | null
): WodIvcsSourceReportType | null {
  if (value === "NETSUITE_REPORT" || value === "AGING_REPORT") return value;
  return null;
}
