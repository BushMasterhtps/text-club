"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import {
  addDispositionOption,
  fetchDispositionGroup,
  fetchDispositionGroups,
  updateDispositionOption,
  type DispositionGroupDetail,
  type DispositionGroupSummary,
  RoutingMatrixApiError,
} from "@/lib/wod-ivcs/routing-matrix-api-client";
import { dispositionGroupTitle, labelFor, nameToOptionKey } from "@/lib/wod-ivcs/routing-matrix-labels";
import { inputClass } from "./shared";

type Props = {
  onError: (msg: string) => void;
  onGroupsChanged?: () => Promise<void>;
};

export function DispositionsSection({ onError, onGroupsChanged }: Props) {
  const [groups, setGroups] = useState<DispositionGroupSummary[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, DispositionGroupDetail>>({});
  const [inactiveOpen, setInactiveOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchDispositionGroups();
      setGroups(list.sort((a, b) => a.displayOrder - b.displayOrder));
    } catch (e) {
      onError(e instanceof RoutingMatrixApiError ? e.message : "Failed to load dispositions");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const loadDetail = async (groupKey: string) => {
    if (details[groupKey]) return;
    const group = await fetchDispositionGroup(groupKey);
    setDetails((d) => ({ ...d, [groupKey]: group }));
  };

  const toggle = async (groupKey: string) => {
    if (expanded === groupKey) {
      setExpanded(null);
      return;
    }
    try {
      await loadDetail(groupKey);
      setExpanded(groupKey);
    } catch (e) {
      onError(e instanceof RoutingMatrixApiError ? e.message : "Failed to load group");
    }
  };

  const handleAdd = async (group: DispositionGroupSummary) => {
    const name = (newName[group.groupKey] ?? "").trim();
    if (!name) return;
    try {
      await addDispositionOption(group.catalogType, {
        label: name,
        value: nameToOptionKey(name),
        sortOrder: (details[group.groupKey]?.options.length ?? group.optionCount) * 10 + 10,
        isActive: true,
      });
      setNewName((n) => ({ ...n, [group.groupKey]: "" }));
      const fresh = await fetchDispositionGroup(group.groupKey);
      setDetails((d) => ({ ...d, [group.groupKey]: fresh }));
      await loadGroups();
      await onGroupsChanged?.();
    } catch (e) {
      onError(e instanceof RoutingMatrixApiError ? e.message : "Failed to add option");
    }
  };

  const saveEdit = async (optionId: string, groupKey: string) => {
    try {
      await updateDispositionOption(optionId, { label: editLabel.trim() });
      setEditingId(null);
      const fresh = await fetchDispositionGroup(groupKey);
      setDetails((d) => ({ ...d, [groupKey]: fresh }));
      await onGroupsChanged?.();
    } catch (e) {
      onError(e instanceof RoutingMatrixApiError ? e.message : "Failed to update option");
    }
  };

  const setActive = async (optionId: string, groupKey: string, isActive: boolean) => {
    try {
      await updateDispositionOption(optionId, { isActive });
      const fresh = await fetchDispositionGroup(groupKey);
      setDetails((d) => ({ ...d, [groupKey]: fresh }));
      await onGroupsChanged?.();
    } catch (e) {
      onError(e instanceof RoutingMatrixApiError ? e.message : "Failed to update option");
    }
  };

  if (loading) {
    return (
      <Card className="p-8 text-center text-white/50">Loading disposition groups…</Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">Dispositions</h3>
        <p className="text-sm text-white/50 mt-1">
          Choices agents and managers see in the routing matrix. Names shown here appear in matrix
          columns.
        </p>
        <p className="text-xs text-white/40 mt-2">
          Archived options are hidden from new routing rules but can be restored later.
        </p>
      </div>

      <div className="space-y-2">
        {groups.map((group) => {
          const title =
            labelFor(dispositionGroupTitle, group.groupKey) || group.displayName;
          const detail = details[group.groupKey];
          const isOpen = expanded === group.groupKey;
          const activeOptions = detail?.options.filter((o) => o.isActive) ?? [];
          const inactiveOptions = detail?.options.filter((o) => !o.isActive) ?? [];

          return (
            <div
              key={group.id}
              className="rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggle(group.groupKey)}
                className="w-full flex justify-between items-center px-4 py-3 text-left hover:bg-white/5"
              >
                <span className="font-medium text-white">{title}</span>
                <span className="text-xs text-white/50">
                  {group.optionCount} options {isOpen ? "▲" : "▼"}
                </span>
              </button>

              {isOpen && detail && (
                <div className="px-4 pb-4 border-t border-white/10 space-y-3">
                  <ul className="divide-y divide-white/5">
                    {activeOptions.map((opt) => (
                      <OptionRow
                        key={opt.id}
                        label={opt.label}
                        isEditing={editingId === opt.id}
                        editLabel={editLabel}
                        onEditLabelChange={setEditLabel}
                        onStartEdit={() => {
                          setEditingId(opt.id);
                          setEditLabel(opt.label);
                        }}
                        onSaveEdit={() => saveEdit(opt.id, group.groupKey)}
                        onCancelEdit={() => setEditingId(null)}
                        secondaryAction={{
                          label: "Archive",
                          onClick: () => setActive(opt.id, group.groupKey, false),
                          className: "text-white/50 hover:text-amber-300",
                        }}
                      />
                    ))}
                    {activeOptions.length === 0 && (
                      <li className="py-3 text-sm text-white/40">No active options yet.</li>
                    )}
                  </ul>

                  {inactiveOptions.length > 0 && (
                    <details
                      className="rounded-md border border-white/5 bg-black/20"
                      open={inactiveOpen[group.groupKey] ?? false}
                      onToggle={(e) =>
                        setInactiveOpen((prev) => ({
                          ...prev,
                          [group.groupKey]: (e.target as HTMLDetailsElement).open,
                        }))
                      }
                    >
                      <summary className="cursor-pointer px-3 py-2 text-sm text-white/50 hover:text-white/70 select-none">
                        Inactive options ({inactiveOptions.length})
                      </summary>
                      <ul className="divide-y divide-white/5 px-3 pb-2">
                        {inactiveOptions.map((opt) => (
                          <li
                            key={opt.id}
                            className="py-2 flex flex-wrap items-center justify-between gap-2 opacity-70"
                          >
                            <span className="text-white/60 line-through decoration-white/20">
                              {opt.label}
                            </span>
                            <button
                              type="button"
                              className="text-xs text-sky-400 hover:underline"
                              onClick={() => setActive(opt.id, group.groupKey, true)}
                            >
                              Reactivate
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <div className="flex gap-2 pt-2">
                    <input
                      className={inputClass}
                      placeholder="New option name"
                      value={newName[group.groupKey] ?? ""}
                      onChange={(e) =>
                        setNewName((n) => ({ ...n, [group.groupKey]: e.target.value }))
                      }
                    />
                    <SmallButton
                      onClick={() => handleAdd(group)}
                      className="bg-sky-600 hover:bg-sky-700 shrink-0"
                    >
                      Add
                    </SmallButton>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function OptionRow({
  label,
  isEditing,
  editLabel,
  onEditLabelChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  secondaryAction,
}: {
  label: string;
  isEditing: boolean;
  editLabel: string;
  onEditLabelChange: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  secondaryAction: { label: string; onClick: () => void; className?: string };
}) {
  return (
    <li className="py-2 flex flex-wrap items-center justify-between gap-2">
      {isEditing ? (
        <div className="flex gap-2 flex-1 min-w-[200px]">
          <input
            className={inputClass}
            value={editLabel}
            onChange={(e) => onEditLabelChange(e.target.value)}
          />
          <SmallButton onClick={onSaveEdit} className="text-xs">
            Save
          </SmallButton>
          <SmallButton onClick={onCancelEdit} className="text-xs bg-white/10">
            Cancel
          </SmallButton>
        </div>
      ) : (
        <>
          <span className="text-white/90">{label}</span>
          <div className="flex gap-2 items-center">
            <button
              type="button"
              className="text-xs text-sky-400 hover:underline"
              onClick={onStartEdit}
            >
              Rename
            </button>
            <button
              type="button"
              className={`text-xs hover:underline ${secondaryAction.className ?? ""}`}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          </div>
        </>
      )}
    </li>
  );
}
