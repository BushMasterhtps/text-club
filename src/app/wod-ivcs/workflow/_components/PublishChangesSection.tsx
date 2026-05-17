"use client";

import { useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import {
  compileRoutingMatrix,
  publishWorkflowVersion,
  validateRoutingMatrix,
  type RoutingMatrixValidation,
  type WorkflowVersionSummary,
} from "@/lib/wod-ivcs/routing-matrix-api-client";
import { VersionStatusBadge, ErrorBanner, SuccessBanner, WorkflowConfirmModal } from "./shared";

type Props = {
  draftVersion: WorkflowVersionSummary | null;
  publishedVersion: WorkflowVersionSummary | null;
  isEditable: boolean;
  onPublished: () => Promise<void>;
  onDiscardDraft?: () => Promise<void>;
  onError: (msg: string) => void;
};

export function PublishChangesSection({
  draftVersion,
  publishedVersion,
  isEditable,
  onPublished,
  onDiscardDraft,
  onError,
}: Props) {
  const [validation, setValidation] = useState<RoutingMatrixValidation | null>(null);
  const [compileResult, setCompileResult] = useState<{
    stepCount: number;
    outcomeRuleCount: number;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [success, setSuccess] = useState("");

  if (!draftVersion) {
    return (
      <Card className="p-6 text-center space-y-2">
        <p className="text-white/70">No draft to publish. Create a draft from the live workflow first.</p>
      </Card>
    );
  }

  const runValidate = async () => {
    setChecking(true);
    setSuccess("");
    try {
      const v = await validateRoutingMatrix(draftVersion.id);
      setValidation(v);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setChecking(false);
    }
  };

  const runCompile = async () => {
    setCompiling(true);
    setSuccess("");
    try {
      const v = await validateRoutingMatrix(draftVersion.id);
      setValidation(v);
      if (!v.valid) {
        onError("Fix issues before preparing the workflow.");
        return;
      }
      const result = await compileRoutingMatrix(draftVersion.id);
      setCompileResult(result.compiled);
      setSuccess(
        `Workflow prepared: ${result.compiled.stepCount} agent steps, ${result.compiled.outcomeRuleCount} routing outcomes.`
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : "Prepare workflow failed");
    } finally {
      setCompiling(false);
    }
  };

  const runPublish = async () => {
    setPublishing(true);
    setSuccess("");
    try {
      const v = await validateRoutingMatrix(draftVersion.id);
      if (!v.valid) {
        onError("Fix issues before publishing.");
        setConfirmOpen(false);
        return;
      }
      await compileRoutingMatrix(draftVersion.id);
      await publishWorkflowVersion(draftVersion.id);
      setSuccess("Changes published. Agents will use the updated routing matrix.");
      setConfirmOpen(false);
      await onPublished();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">Publish Changes</h3>
        <p className="text-sm text-white/50 mt-1">
          Validate your draft, prepare the agent workflow, then publish to make it live.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <VersionCard
          title="Live workflow"
          version={publishedVersion}
          emptyText="Nothing published yet"
        />
        <VersionCard
          title="Editing draft"
          version={draftVersion}
          highlight
        />
      </div>

      {success && <SuccessBanner message={success} />}

      {validation && (
        <div className="space-y-2">
          {validation.errors.length > 0 && (
            <ErrorBanner message={validation.errors.join(" ")} />
          )}
          {validation.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <p className="font-medium mb-1">Warnings</p>
              <ul className="list-disc list-inside space-y-1">
                {validation.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {validation.valid && validation.errors.length === 0 && (
            <p className="text-sm text-green-300">No blocking issues found.</p>
          )}
        </div>
      )}

      {compileResult && (
        <p className="text-sm text-white/60">
          Last prepared: {compileResult.stepCount} steps, {compileResult.outcomeRuleCount} outcomes.
        </p>
      )}

      {isEditable ? (
        <div className="flex flex-wrap gap-2 items-center">
          <SmallButton
            onClick={runValidate}
            disabled={checking}
            className="bg-white/10 hover:bg-white/20"
          >
            {checking ? "Checking…" : "Check for Issues"}
          </SmallButton>
          <SmallButton
            onClick={runCompile}
            disabled={compiling}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {compiling ? "Preparing…" : "Prepare Workflow"}
          </SmallButton>
          <SmallButton
            onClick={() => setConfirmOpen(true)}
            disabled={publishing}
            className="bg-green-600 hover:bg-green-700"
          >
            Publish Changes
          </SmallButton>
          {onDiscardDraft && (
            <SmallButton
              onClick={() => setDiscardOpen(true)}
              disabled={discarding}
              className="bg-white/10 hover:bg-red-900/40 text-red-200 border border-red-500/30"
            >
              Discard Draft
            </SmallButton>
          )}
        </div>
      ) : (
        <p className="text-sm text-white/50">Only draft versions can be published.</p>
      )}

      <WorkflowConfirmModal
        open={confirmOpen}
        title="Publish routing matrix?"
        cancelLabel="Cancel"
        confirmLabel="Yes, publish"
        confirming={publishing}
        confirmClassName="bg-green-600 hover:bg-green-700"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={runPublish}
      >
        <p>
          This will replace the live workflow (v{publishedVersion?.version ?? "—"}) with draft v
          {draftVersion.version}. Agents will follow the updated routing paths.
        </p>
      </WorkflowConfirmModal>

      <WorkflowConfirmModal
        open={discardOpen}
        title="Discard draft changes?"
        cancelLabel="Keep editing"
        confirmLabel="Discard draft"
        confirming={discarding}
        confirmClassName="bg-red-600 hover:bg-red-700"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={async () => {
          if (!onDiscardDraft) return;
          setDiscarding(true);
          try {
            await onDiscardDraft();
            setDiscardOpen(false);
            setSuccess("");
          } catch (e) {
            onError(e instanceof Error ? e.message : "Could not discard draft");
            setDiscardOpen(false);
          } finally {
            setDiscarding(false);
          }
        }}
      >
        <p>
          This will delete the current draft and return to the live routing matrix. Published rules
          will not be affected.
        </p>
        <p className="mt-2 text-white/60">
          Any unpublished changes in this draft will be lost permanently.
        </p>
      </WorkflowConfirmModal>
    </Card>
  );
}

function VersionCard({
  title,
  version,
  emptyText,
  highlight,
}: {
  title: string;
  version: WorkflowVersionSummary | null;
  emptyText?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight ? "border-amber-500/40 bg-amber-500/5" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <p className="text-xs text-white/50 uppercase tracking-wide mb-2">{title}</p>
      {version ? (
        <>
          <p className="text-white font-medium">Version {version.version}</p>
          <VersionStatusBadge status={version.status} />
          {version.compiledAt && (
            <p className="text-xs text-white/40 mt-2">
              Prepared {new Date(version.compiledAt).toLocaleString()}
            </p>
          )}
        </>
      ) : (
        <p className="text-white/50 text-sm">{emptyText}</p>
      )}
    </div>
  );
}
