"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import { isWodIvcsV2EnabledClient } from "@/lib/wod-ivcs/client-feature-flag";
import {
  createDraftVersion,
  discardDraftVersion,
  fetchDispositionGroup,
  fetchRoutingRules,
  fetchWorkflowDefinition,
  fetchWorkflowVersions,
  RoutingMatrixApiError,
  type DispositionGroupDetail,
  type RoutingRule,
  type WorkflowVersionSummary,
} from "@/lib/wod-ivcs/routing-matrix-api-client";
import { RoutingMatrixSection } from "./RoutingMatrixSection";
import { DispositionsSection } from "./DispositionsSection";
import { PreviewAgentFlowSection } from "./PreviewAgentFlowSection";
import { PublishChangesSection } from "./PublishChangesSection";
import { ChangeHistorySection } from "./ChangeHistorySection";
import {
  ErrorBanner,
  SuccessBanner,
  VersionStatusBadge,
  WorkflowConfirmModal,
} from "./shared";

const GROUP_KEYS = ["root_cause", "cash_sale_exists", "merchant", "fix_type"] as const;

type TabId = "matrix" | "dispositions" | "preview" | "publish" | "history";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "matrix", label: "Routing Matrix" },
  { id: "dispositions", label: "Dispositions" },
  { id: "preview", label: "Preview Agent Flow" },
  { id: "publish", label: "Publish Changes" },
  { id: "history", label: "Change History" },
];

export function RoutingMatrixAdminContent() {
  const v2Enabled = isWodIvcsV2EnabledClient();
  const [activeTab, setActiveTab] = useState<TabId>("matrix");
  const [workflowName, setWorkflowName] = useState("");
  const [versions, setVersions] = useState<WorkflowVersionSummary[]>([]);
  const [publishedVersion, setPublishedVersion] = useState<WorkflowVersionSummary | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [groups, setGroups] = useState<DispositionGroupDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [discardingDraft, setDiscardingDraft] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const draftVersion = versions.find((v) => v.status === "DRAFT") ?? null;
  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? null;
  const isEditable = selectedVersion?.status === "DRAFT";

  const loadGroups = useCallback(async () => {
    const details = await Promise.all(
      GROUP_KEYS.map((key) => fetchDispositionGroup(key))
    );
    setGroups(details);
  }, []);

  const refreshVersions = useCallback(async () => {
    const [def, vers] = await Promise.all([
      fetchWorkflowDefinition(),
      fetchWorkflowVersions(),
    ]);
    setWorkflowName(def.definition.displayName);
    setPublishedVersion(def.publishedVersion);
    setVersions(vers);
    return { def, vers };
  }, []);

  const loadRules = useCallback(async (versionId: string) => {
    const data = await fetchRoutingRules(versionId);
    setRules(data.rules);
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setGlobalError("");
    try {
      const { def, vers } = await refreshVersions();
      await loadGroups();

      const draft = vers.find((v) => v.status === "DRAFT");
      const published = def.publishedVersion;
      const versionId = draft?.id ?? published?.id ?? vers[0]?.id ?? null;
      setSelectedVersionId(versionId);

      if (versionId) {
        await loadRules(versionId);
      }
    } catch (e) {
      setGlobalError(
        e instanceof RoutingMatrixApiError ? e.message : "Failed to load routing matrix"
      );
    } finally {
      setLoading(false);
    }
  }, [refreshVersions, loadGroups, loadRules]);

  useEffect(() => {
    if (!v2Enabled) return;
    bootstrap();
  }, [v2Enabled, bootstrap]);

  useEffect(() => {
    if (!v2Enabled || !selectedVersionId) return;
    loadRules(selectedVersionId).catch((e) => {
      setGlobalError(e instanceof RoutingMatrixApiError ? e.message : "Failed to load rules");
    });
  }, [v2Enabled, selectedVersionId, loadRules]);

  const handleCreateDraft = async () => {
    setCreatingDraft(true);
    setGlobalError("");
    setSuccessMessage("");

    if (draftVersion) {
      setSelectedVersionId(draftVersion.id);
      await loadRules(draftVersion.id);
      setActiveTab("matrix");
      setSuccessMessage("Opened existing draft for editing.");
      setCreatingDraft(false);
      return;
    }

    try {
      const liveRuleCount = publishedVersion
        ? (await fetchRoutingRules(publishedVersion.id)).rules.length
        : 0;

      const { version: created, cloneSummary } = await createDraftVersion(
        "Routing matrix draft"
      );

      if (
        liveRuleCount > 0 &&
        (cloneSummary?.clonedRoutingRuleCount ?? 0) === 0
      ) {
        setGlobalError(
          "Draft was created but routing rules were not copied from live. Do not edit this draft — try again or contact support."
        );
        return;
      }

      await refreshVersions();
      setSelectedVersionId(created.id);
      await loadRules(created.id);
      setActiveTab("matrix");
      setSuccessMessage("Draft created from live routing matrix.");
    } catch (e) {
      if (e instanceof RoutingMatrixApiError && e.code === "DRAFT_EXISTS") {
        const { vers } = await refreshVersions();
        const draft = vers.find((v) => v.status === "DRAFT");
        if (draft) {
          setSelectedVersionId(draft.id);
          await loadRules(draft.id);
          setActiveTab("matrix");
          setSuccessMessage("Opened existing draft for editing.");
        }
      } else {
        setGlobalError(e instanceof Error ? e.message : "Could not create draft");
      }
    } finally {
      setCreatingDraft(false);
    }
  };

  const refreshAfterPublish = async () => {
    const { vers } = await refreshVersions();
    const published = vers.find((v) => v.status === "PUBLISHED");
    if (published) {
      setSelectedVersionId(published.id);
      await loadRules(published.id);
    }
    await loadGroups();
  };

  const handleDiscardDraft = async () => {
    if (!draftVersion) return;
    setGlobalError("");
    await discardDraftVersion(draftVersion.id);
    const { def } = await refreshVersions();
    const published = def.publishedVersion;
    if (published) {
      setSelectedVersionId(published.id);
      await loadRules(published.id);
    } else {
      setSelectedVersionId(null);
      setRules([]);
    }
    setActiveTab("matrix");
    setSuccessMessage("Draft discarded. Showing live routing matrix.");
    setDiscardConfirmOpen(false);
  };

  if (!v2Enabled) {
    return (
      <Card className="p-8 text-center space-y-3">
        <h2 className="text-xl font-semibold text-white">Routing matrix unavailable</h2>
        <p className="text-white/60 text-sm max-w-md mx-auto">
          WOD/IVCS v2 is turned off in this environment. Enable{" "}
          <code className="text-sky-300">NEXT_PUBLIC_WOD_IVCS_V2_ENABLED=true</code> in{" "}
          <code className="text-sky-300">.env.local</code> for local development.
        </p>
        <Link href="/wod-ivcs">
          <SmallButton className="mt-2">← Back to Task Management</SmallButton>
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 bg-violet-500/10 border border-violet-500/30">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-violet-300/80 mb-1">
              Manager configuration
            </p>
            <h2 className="text-lg font-semibold text-white">Routing Matrix</h2>
            <p className="text-sm text-violet-200/90 mt-1">
              {workflowName || "Invalid Cash Sale"} — define how agents route orders through root
              cause, fix type, and follow-up actions.
            </p>
            <div className="flex flex-wrap gap-3 mt-3 text-sm">
              {publishedVersion && (
                <span className="text-white/70">
                  Live: v{publishedVersion.version}{" "}
                  <VersionStatusBadge status={publishedVersion.status} />
                </span>
              )}
              {draftVersion ? (
                <span className="text-white/70">
                  Editing: v{draftVersion.version}{" "}
                  <VersionStatusBadge status={draftVersion.status} />
                </span>
              ) : (
                <span className="text-amber-200/90">No draft — create one to edit</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-start">
            {draftVersion && (
              <SmallButton
                onClick={() => setDiscardConfirmOpen(true)}
                disabled={discardingDraft}
                className="bg-white/10 hover:bg-red-900/40 text-red-200 border border-red-500/30"
              >
                Discard Draft
              </SmallButton>
            )}
            <Link href="/wod-ivcs">
              <SmallButton className="bg-white/10 hover:bg-white/20">
                ← Task Management
              </SmallButton>
            </Link>
          </div>
        </div>
      </Card>

      <WorkflowConfirmModal
        open={discardConfirmOpen}
        title="Discard draft changes?"
        cancelLabel="Keep editing"
        confirmLabel="Discard draft"
        confirming={discardingDraft}
        confirmClassName="bg-red-600 hover:bg-red-700"
        onCancel={() => setDiscardConfirmOpen(false)}
        onConfirm={async () => {
          setDiscardingDraft(true);
          try {
            await handleDiscardDraft();
          } catch (e) {
            setGlobalError(
              e instanceof RoutingMatrixApiError
                ? e.message
                : e instanceof Error
                  ? e.message
                  : "Could not discard draft"
            );
            setDiscardConfirmOpen(false);
          } finally {
            setDiscardingDraft(false);
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

      {globalError && <ErrorBanner message={globalError} />}
      {successMessage && <SuccessBanner message={successMessage} />}

      {!draftVersion && (
        <Card className="p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium text-white">Create draft to edit routing matrix</p>
            <p className="text-sm text-white/50 mt-1">
              The live workflow is read-only. A new draft copies all current live routing rules so
              you can edit safely.
            </p>
          </div>
          <SmallButton
            onClick={handleCreateDraft}
            disabled={creatingDraft}
            className="bg-sky-600 hover:bg-sky-700"
          >
            {creatingDraft ? "Creating…" : "Create Draft to Edit Routing Matrix"}
          </SmallButton>
        </Card>
      )}

      {draftVersion && selectedVersionId !== draftVersion.id && (
        <Card className="p-3 flex flex-wrap items-center justify-between gap-2 bg-amber-500/10 border-amber-500/30">
          <p className="text-sm text-amber-100">
            Viewing {selectedVersion?.status === "PUBLISHED" ? "live" : "archived"} version — switch
            to draft to edit.
          </p>
          <SmallButton
            onClick={() => setSelectedVersionId(draftVersion.id)}
            className="text-xs bg-amber-600/80 hover:bg-amber-700"
          >
            Open draft v{draftVersion.version}
          </SmallButton>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === "history") setHistoryLoaded(true);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-sky-600 text-white"
                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && activeTab === "matrix" ? (
        <Card className="p-8 text-center text-white/50">Loading routing matrix…</Card>
      ) : (
        <>
          {activeTab === "matrix" && selectedVersionId && (
            <RoutingMatrixSection
              versionId={selectedVersionId}
              isEditable={isEditable}
              rules={rules}
              groups={groups}
              onRefresh={async () => {
                await loadRules(selectedVersionId);
                await loadGroups();
              }}
              onError={setGlobalError}
            />
          )}

          {activeTab === "dispositions" && (
            <DispositionsSection
              onError={setGlobalError}
              onGroupsChanged={loadGroups}
            />
          )}

          {activeTab === "preview" && selectedVersionId && (
            <PreviewAgentFlowSection
              versionId={selectedVersionId}
              rules={rules}
              onError={setGlobalError}
            />
          )}

          {activeTab === "publish" && (
            <PublishChangesSection
              draftVersion={draftVersion}
              publishedVersion={publishedVersion}
              isEditable={!!draftVersion}
              onPublished={refreshAfterPublish}
              onDiscardDraft={draftVersion ? handleDiscardDraft : undefined}
              onError={setGlobalError}
            />
          )}

          {activeTab === "history" && historyLoaded && (
            <ChangeHistorySection onError={setGlobalError} />
          )}
        </>
      )}
    </div>
  );
}
