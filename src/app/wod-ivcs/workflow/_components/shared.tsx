"use client";

import type { ReactNode } from "react";
import { SmallButton } from "@/app/_components/SmallButton";
import { versionStatusLabel, labelFor } from "@/lib/wod-ivcs/routing-matrix-labels";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-amber-500/20 text-amber-300",
  PUBLISHED: "bg-green-500/20 text-green-300",
  ARCHIVED: "bg-gray-500/20 text-gray-300",
};

export function VersionStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[status] ?? "bg-gray-500/20 text-gray-300"}`}
    >
      {labelFor(versionStatusLabel, status)}
    </span>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-300">Active</span>
  ) : (
    <span className="text-xs px-2 py-0.5 rounded bg-gray-500/20 text-gray-400">Inactive</span>
  );
}

export function YesNoBadge({ value }: { value: boolean }) {
  return value ? (
    <span className="text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-300">Yes</span>
  ) : (
    <span className="text-xs text-white/40">—</span>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      {message}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-200">
      {message}
    </div>
  );
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

export const inputClass =
  "w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-sky-500";

export const selectClass =
  "w-full rounded-md bg-neutral-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500";

export const textareaClass =
  "w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-sky-500";

type WorkflowConfirmModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirming?: boolean;
  confirmClassName?: string;
};

/** Opaque confirmation modal for workflow manager pages. */
export function WorkflowConfirmModal({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  confirming = false,
  confirmClassName = "bg-sky-600 hover:bg-sky-700",
}: WorkflowConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-confirm-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80"
        aria-label="Close dialog"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-white/15 bg-neutral-900 shadow-2xl shadow-black/60 p-6 space-y-4">
        <h4 id="workflow-confirm-title" className="text-lg font-semibold text-white">
          {title}
        </h4>
        <div className="text-sm text-white/80">{children}</div>
        <div className="flex gap-2 justify-end pt-1">
          <SmallButton
            onClick={onCancel}
            disabled={confirming}
            className="bg-white/10 hover:bg-white/20"
          >
            {cancelLabel}
          </SmallButton>
          <SmallButton
            onClick={onConfirm}
            disabled={confirming}
            className={confirmClassName}
          >
            {confirming ? "Please wait…" : confirmLabel}
          </SmallButton>
        </div>
      </div>
    </div>
  );
}
