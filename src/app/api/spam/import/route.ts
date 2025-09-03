import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SpamMode } from "@prisma/client";

/** Normalize for matching + unique key */
function norm(s: string | null | undefined) {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// very light CSV parser (handles headers + commas inside quotes)
function parseCSV(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  if (!lines.length) return rows;

  // parse a single CSV line into fields (supports quotes)
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        q = !q;
      } else if (ch === "," && !q) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = split(lines[0]).map((h) => h.toLowerCase());
  for (let i = 1; i < lines.length; i++) {
    const fields = split(lines[i]);
    if (fields.every((f) => f === "")) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, j) => (row[h] = fields[j] ?? ""));
    rows.push(row);
  }
  return rows;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
    }

    const text = Buffer.from(await file.arrayBuffer()).toString("utf8");

    // allow either CSV with headers or plain list (one phrase per line)
    let rows = parseCSV(text);

    let totalRead = 0;
    const data: Array<{
      pattern: string;
      patternNorm: string;
      mode: SpamMode;
      brand: string | null;
      enabled: boolean;
    }> = [];

    if (rows.length) {
      // Headered CSV path
      for (const r of rows) {
        totalRead++;
        const pattern =
          r["pattern"] ||
          r["phrase"] ||
          r["text"] ||
          r["spam"] ||
          r["value"] ||
          "";

        const rawMode = (r["mode"] || "").toLowerCase();
        const mode =
          rawMode === "lone"
            ? SpamMode.LONE
            : SpamMode.CONTAINS; // default

        const brand = r["brand"] ? r["brand"].trim() : null;
        const enabled =
          (r["enabled"] || r["on"] || "").toLowerCase().trim() === "false"
            ? false
            : true;

        const p = pattern.trim();
        if (!p) continue;

        data.push({
          pattern: p,
          patternNorm: norm(p),
          mode,
          brand,
          enabled,
        });
      }
    } else {
      // Plain list: one phrase per non-empty line
      const lines = text.replace(/\r\n/g, "\n").split("\n");
      for (const line of lines) {
        const p = line.trim();
        if (!p) continue;
        totalRead++;
        data.push({
          pattern: p,
          patternNorm: norm(p),
          mode: SpamMode.CONTAINS,
          brand: null,
          enabled: true,
        });
      }
    }

    if (data.length === 0) {
      return NextResponse.json({ success: false, error: "No phrases found." }, { status: 400 });
    }

    // createMany with skipDuplicates — relies on @@unique([patternNorm, mode, brand])
    const result = await prisma.spamRule.createMany({
      data,
      skipDuplicates: true,
    });

    const inserted = result.count;
    const skippedExisting = Math.max(0, totalRead - inserted);

    return NextResponse.json({
      success: true,
      totalRead,
      inserted,
      skippedExisting,
      skippedBlank: totalRead - data.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Import failed" },
      { status: 500 }
    );
  }
}