export function norm(s: unknown): string {
  const str = String(s ?? "").toLowerCase().normalize("NFKD");
  const noMarks = str.replace(/[\u0300-\u036f]/g, "");
  const onlyWords = noMarks.replace(/[^\p{L}\p{N}\s]+/gu, " ");
  return onlyWords.replace(/\s+/g, " ").trim();
}