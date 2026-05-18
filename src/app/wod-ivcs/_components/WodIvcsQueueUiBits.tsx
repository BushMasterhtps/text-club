"use client";

export function PresenceBadge({ label, state }: { label: string; state: string }) {
  const color =
    state === "PRESENT"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
      : state === "DROPPED"
        ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
        : "bg-white/10 text-white/50 border-white/15";
  const friendly =
    state === "PRESENT" ? "On report" : state === "DROPPED" ? "Dropped" : "Unknown";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border ${color}`} title={`${label}: ${state}`}>
      {label}: {friendly}
    </span>
  );
}

export function InlineMessage({
  tone,
  children,
}: {
  tone: "success" | "error" | "info";
  children: React.ReactNode;
}) {
  const styles = {
    success: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
    error: "bg-red-500/15 border-red-500/30 text-red-200",
    info: "bg-sky-500/15 border-sky-500/30 text-sky-200",
  };
  return (
    <div className={`text-sm px-3 py-2 rounded-lg border ${styles[tone]}`}>{children}</div>
  );
}
