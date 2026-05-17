"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Card } from "@/app/_components/Card";
import {
  fetchAuditLog,
  type AuditLogEntry,
  RoutingMatrixApiError,
} from "@/lib/wod-ivcs/routing-matrix-api-client";
import {
  auditActionLabel,
  auditEntityTypeLabel,
  labelFor,
} from "@/lib/wod-ivcs/routing-matrix-labels";
import { formatDate } from "./shared";

type Props = {
  onError: (msg: string) => void;
};

function describeChange(entry: AuditLogEntry): string {
  const after =
    entry.afterJson && typeof entry.afterJson === "object"
      ? (entry.afterJson as Record<string, unknown>)
      : null;
  const before =
    entry.beforeJson && typeof entry.beforeJson === "object"
      ? (entry.beforeJson as Record<string, unknown>)
      : null;

  if (after?.label && typeof after.label === "string") {
    return after.label;
  }
  if (after?.version != null) {
    return `Version ${after.version}`;
  }
  if (after?.stepCount != null && after?.outcomeRuleCount != null) {
    return `Prepared workflow (${after.stepCount} steps, ${after.outcomeRuleCount} outcomes)`;
  }
  if (before?.label && after?.label) {
    return `${before.label} → ${after.label}`;
  }
  if (entry.reason) return entry.reason;
  return labelFor(auditEntityTypeLabel, entry.entityType);
}

export function ChangeHistorySection({ onError }: Props) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAuditLog(80);
      setEntries(data.entries);
      setTotal(data.total);
    } catch (e) {
      onError(e instanceof RoutingMatrixApiError ? e.message : "Failed to load change history");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <Card className="p-8 text-center text-white/50">Loading change history…</Card>;
  }

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">Change History</h3>
        <p className="text-sm text-white/50 mt-1">
          Recent routing matrix and disposition changes ({entries.length} of {total} shown).
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-white/50 text-sm py-4">No changes recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/50 border-b border-white/10">
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Changed by</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">What changed</th>
                <th className="py-2 w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entries.map((entry) => (
                <Fragment key={entry.id}>
                  <tr className="hover:bg-white/[0.02]">
                    <td className="py-2.5 pr-4 text-white/70 whitespace-nowrap">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="py-2.5 pr-4">
                      {entry.actor?.name || entry.actor?.email || "System"}
                    </td>
                    <td className="py-2.5 pr-4">
                      {labelFor(auditActionLabel, entry.action)}
                    </td>
                    <td className="py-2.5 pr-4 text-white/80">{describeChange(entry)}</td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        className="text-xs text-white/40 hover:text-white/70"
                        onClick={() =>
                          setExpandedId(expandedId === entry.id ? null : entry.id)
                        }
                      >
                        {expandedId === entry.id ? "Hide" : "View details"}
                      </button>
                    </td>
                  </tr>
                  {expandedId === entry.id && (
                    <tr>
                      <td colSpan={5} className="pb-3">
                        <details className="text-xs">
                          <summary className="cursor-pointer text-white/40 hover:text-white/60 mb-2 select-none">
                            Support details
                          </summary>
                          <pre className="bg-black/30 rounded p-3 overflow-x-auto text-white/50 max-h-40">
                            {JSON.stringify(
                              {
                                before: entry.beforeJson,
                                after: entry.afterJson,
                                reason: entry.reason,
                              },
                              null,
                              2
                            )}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
