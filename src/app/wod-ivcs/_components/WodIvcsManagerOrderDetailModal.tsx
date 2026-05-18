"use client";

import { useEffect, useState } from "react";
import { SmallButton } from "@/app/_components/SmallButton";
import { operationalCompletionModeLabel } from "@/lib/wod-ivcs/routing-matrix-labels";
import { queueLabelForKey } from "./wod-ivcs-queue-config";
import { PresenceBadge } from "./WodIvcsQueueUiBits";

type DetailRow = { label: string; value: string };

type LatestSubmission = {
  id: string;
  submittedAt: string;
  submittedBy: { id: string; name: string | null; email: string };
  workStartedAt: string | null;
  durationLabel: string | null;
  workflowVersion: {
    id: string;
    version: number;
    status: string;
    routingMatrixHash: string | null;
  };
  matchedRoutingRule: {
    id: string;
    label: string | null;
    targetQueue: string;
    dropOffBehavior: string;
  } | null;
  matchedOutcome: {
    name: string;
    priority: number | null;
    targetQueue: string;
    operationalCompletionMode: string | null;
  } | null;
  targetQueue: string;
  answerRows: DetailRow[];
};

type AwaitingDropOffReview = {
  whyAwaiting: string;
  agentSubmittedAction: string;
  agentSelectionsSummary: string;
  startedAt: string | null;
  deadlineAt: string | null;
  stillOnNetSuiteReport: boolean;
  stillOnAgingReport: boolean;
  reportsToCheckOnNextImport: string[];
};

type OrderDetailResponse = {
  order: {
    id: string;
    documentNumber: string;
    operationalQueue: string;
    presenceNetSuite: string;
    presenceAging: string;
    isCityBeauty: boolean;
    replacementOrderNumber: string | null;
    processedReship: boolean | null;
  };
  synopsisRows: DetailRow[];
  managerRows: DetailRow[];
  latestSubmission: LatestSubmission | null;
  awaitingDropOffReview: AwaitingDropOffReview | null;
};

type Props = {
  orderId: string;
  onClose: () => void;
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function DetailSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg bg-neutral-950 ring-1 ring-white/10 overflow-hidden">
      <SectionHeader title={title} subtitle={subtitle} />
      <div className="px-4 py-3 text-sm">{children}</div>
    </section>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-4 py-3 border-b border-white/10 bg-white/[0.03]">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {subtitle && <p className="text-xs text-white/45 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function RowList({ rows }: { rows: DetailRow[] }) {
  if (rows.length === 0) {
    return <p className="text-white/50 text-sm">No details available.</p>;
  }
  return (
    <div className="divide-y divide-white/5">
      {rows.map((row) => (
        <SummaryRow key={row.label} label={row.label} value={row.value} />
      ))}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <span className="text-white/45 shrink-0 max-w-[45%]">{label}</span>
      <span className="text-white/90 text-right font-medium break-words">{value}</span>
    </div>
  );
}

export function WodIvcsManagerOrderDetailModal({ orderId, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OrderDetailResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      setData(null);
      try {
        const res = await fetch(`/api/manager/wod-ivcs/v2/orders/${orderId}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to load order");
        }
        setData({
          order: json.order,
          synopsisRows: json.synopsisRows ?? [],
          managerRows: json.managerRows ?? [],
          latestSubmission: json.latestSubmission ?? null,
          awaitingDropOffReview: json.awaitingDropOffReview ?? null,
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load order");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const order = data?.order;
  const submission = data?.latestSubmission;
  const dropOff = data?.awaitingDropOffReview;

  const mergedOrderRows = data
    ? [
        ...data.synopsisRows,
        ...data.managerRows.filter(
          (r) => !data.synopsisRows.some((s) => s.label === r.label)
        ),
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wod-ivcs-manager-order-detail-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-neutral-900 px-6 py-4">
          <div className="min-w-0">
            <h2
              id="wod-ivcs-manager-order-detail-title"
              className="text-xl font-semibold text-white font-mono truncate"
            >
              {order?.documentNumber ?? "Order details"}
            </h2>
            <p className="text-xs text-white/45 mt-0.5">Manager order review</p>
          </div>
          <SmallButton onClick={onClose} aria-label="Close">
            Close
          </SmallButton>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 text-white">
          {loading && <p className="text-white/70 text-sm">Loading order details…</p>}
          {error && <p className="text-red-300 text-sm">{error}</p>}

          {data && order && !loading && !error && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <PresenceBadge label="NetSuite" state={order.presenceNetSuite} />
                <PresenceBadge label="Aging" state={order.presenceAging} />
                {order.isCityBeauty && (
                  <span className="text-xs px-2 py-0.5 rounded border border-amber-500/40 text-amber-300/90 bg-amber-500/10">
                    City Beauty
                  </span>
                )}
              </div>

              <DetailSection
                title="Order details"
                subtitle="Imported report data and queue status"
              >
                <RowList rows={mergedOrderRows} />
              </DetailSection>

              {dropOff && (
                <DetailSection
                  title="Awaiting Drop-Off Review"
                  subtitle="Confirm drop-off on the next NetSuite/Aging import"
                >
                  <DropOffReviewContent dropOff={dropOff} />
                </DetailSection>
              )}

              <DetailSection
                title="Latest workflow submission"
                subtitle={
                  submission
                    ? "What the agent submitted when completing the guided workflow"
                    : "No workflow submission recorded for this order yet"
                }
              >
                {!submission && (
                  <p className="text-white/50">No workflow submission available.</p>
                )}
                {submission && <SubmissionDetails submission={submission} order={order} />}
              </DetailSection>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DropOffReviewContent({ dropOff }: { dropOff: AwaitingDropOffReview }) {
  return (
    <div className="space-y-3 text-white/85">
      <p>{dropOff.whyAwaiting}</p>
      <div className="divide-y divide-white/5">
        <SummaryRow label="Agent submitted action" value={dropOff.agentSubmittedAction} />
        <SummaryRow label="Agent selections" value={dropOff.agentSelectionsSummary} />
        <SummaryRow
          label="Awaiting drop-off started"
          value={formatWhen(dropOff.startedAt)}
        />
        <SummaryRow
          label="Awaiting drop-off deadline"
          value={formatWhen(dropOff.deadlineAt)}
        />
        <SummaryRow
          label="Still on NetSuite report"
          value={dropOff.stillOnNetSuiteReport ? "Yes" : "No"}
        />
        <SummaryRow
          label="Still on Aging report"
          value={dropOff.stillOnAgingReport ? "Yes" : "No"}
        />
        <SummaryRow
          label="Check on next import"
          value={dropOff.reportsToCheckOnNextImport.join(", ")}
        />
      </div>
    </div>
  );
}

function SubmissionDetails({
  submission,
  order,
}: {
  submission: LatestSubmission;
  order: OrderDetailResponse["order"];
}) {
  return (
    <div className="space-y-4">
      <div className="divide-y divide-white/5">
        <SummaryRow
          label="Submitted by"
          value={
            submission.submittedBy.name
              ? `${submission.submittedBy.name} (${submission.submittedBy.email})`
              : submission.submittedBy.email
          }
        />
        <SummaryRow label="Submitted at" value={formatWhen(submission.submittedAt)} />
        <SummaryRow label="Work started at" value={formatWhen(submission.workStartedAt)} />
        <SummaryRow label="Duration" value={submission.durationLabel ?? "—"} />
        <SummaryRow
          label="Workflow version"
          value={`v${submission.workflowVersion.version} (${submission.workflowVersion.status})`}
        />
        {submission.workflowVersion.routingMatrixHash && (
          <SummaryRow
            label="Routing matrix hash"
            value={submission.workflowVersion.routingMatrixHash}
          />
        )}
        {submission.matchedRoutingRule && (
          <SummaryRow
            label="Matched routing rule"
            value={submission.matchedRoutingRule.label ?? submission.matchedRoutingRule.id}
          />
        )}
        {submission.matchedOutcome && (
          <>
            <SummaryRow label="Outcome" value={submission.matchedOutcome.name} />
            <SummaryRow label="Target queue" value={queueLabelForKey(submission.targetQueue)} />
            {submission.matchedOutcome.operationalCompletionMode && (
              <SummaryRow
                label="Operational completion mode"
                value={
                  operationalCompletionModeLabel[
                    submission.matchedOutcome.operationalCompletionMode
                  ] ?? submission.matchedOutcome.operationalCompletionMode
                }
              />
            )}
          </>
        )}
      </div>

      {submission.answerRows.length > 0 && (
        <div>
          <p className="text-xs font-medium text-white/50 uppercase tracking-wide mb-2">
            Agent answers
          </p>
          <RowList rows={submission.answerRows} />
        </div>
      )}

      {(order.replacementOrderNumber != null || order.processedReship != null) && (
        <OrderExtras order={order} />
      )}
    </div>
  );
}

function OrderExtras({ order }: { order: OrderDetailResponse["order"] }) {
  return (
    <div className="divide-y divide-white/5 border-t border-white/10 pt-3">
      {order.replacementOrderNumber && (
        <SummaryRow label="Replacement order #" value={order.replacementOrderNumber} />
      )}
      {order.processedReship != null && (
        <SummaryRow label="Processed reship" value={order.processedReship ? "Yes" : "No"} />
      )}
    </div>
  );
}
