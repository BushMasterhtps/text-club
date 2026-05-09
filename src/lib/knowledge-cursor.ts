/**
 * Keyset cursor for Knowledge Base browse APIs.
 * Order is always { createdAt: "desc" }, { id: "desc" }.
 */

export type KnowledgeKeyset = { createdAt: Date; id: string };

export function encodeKnowledgeCursor(row: { createdAt: Date; id: string }): string {
  const payload = JSON.stringify({
    ca: row.createdAt.toISOString(),
    id: row.id,
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeKnowledgeCursor(cursor: string | null): KnowledgeKeyset | null {
  if (!cursor?.trim()) return null;
  try {
    const raw = Buffer.from(cursor.trim(), "base64url").toString("utf8");
    const j = JSON.parse(raw) as { ca?: string; id?: string };
    if (typeof j.ca === "string" && typeof j.id === "string") {
      const createdAt = new Date(j.ca);
      if (Number.isNaN(createdAt.getTime())) return null;
      return { createdAt, id: j.id };
    }
  } catch {
    return null;
  }
  return null;
}
