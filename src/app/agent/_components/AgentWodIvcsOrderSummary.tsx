"use client";

import {
  buildAgentOrderSynopsis,
  type AgentOrderSynopsisInput,
} from "@/lib/wod-ivcs/agent-order-synopsis";

type Props = {
  order: AgentOrderSynopsisInput;
  presenceNetSuite: string;
  presenceAging: string;
};

function presenceLabel(state: string): string {
  if (state === "PRESENT") return "On report";
  if (state === "DROPPED") return "Dropped";
  return "Unknown";
}

export function AgentWodIvcsOrderSummary({ order, presenceNetSuite, presenceAging }: Props) {
  const rows = buildAgentOrderSynopsis(order);

  return (
    <section className="rounded-lg bg-neutral-950 ring-1 ring-white/10 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 bg-white/[0.03]">
        <h4 className="text-sm font-semibold text-white">Order summary</h4>
        <p className="text-xs text-white/45 mt-0.5">From imported NetSuite and Aging reports</p>
      </div>
      <dl className="divide-y divide-white/5 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-white/45 shrink-0">{row.label}</dt>
            <dd className="text-white/90 text-right font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="px-4 py-3 border-t border-white/10 flex flex-wrap gap-2">
        <span className="text-[11px] text-white/40 mr-1 self-center">Reports:</span>
        <span className="inline-flex rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/70 ring-1 ring-white/10">
          NetSuite — {presenceLabel(presenceNetSuite)}
        </span>
        <span className="inline-flex rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/70 ring-1 ring-white/10">
          Aging — {presenceLabel(presenceAging)}
        </span>
      </div>
    </section>
  );
}
