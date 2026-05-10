"use client";

import { Task } from '@/stores/useTaskStore';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useTaskStore } from '@/stores/useTaskStore';
import { Toast } from '@/app/_components/Toast';

const DEBUG_PERFORMANCE = process.env.NEXT_PUBLIC_DEBUG_PERFORMANCE === "true";

type AssistanceHistoryRow = {
  id: string;
  authorRole: string;
  messageType: string;
  body: string;
  createdAt: string;
  author: { id: string; email: string; name: string | null } | null;
};

interface TaskDetailDrawerProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  agentEmail: string;
  onTaskAction?: (action: 'start' | 'assist' | 'complete', taskId: string) => void;
  isTestMode?: boolean; // Flag to skip API calls in test mode
  onStatsUpdate?: () => Promise<void>; // Callback to refresh stats after completion
}

export default function TaskDetailDrawer({
  task,
  isOpen,
  onClose,
  agentEmail,
  onTaskAction,
  isTestMode = false,
  onStatsUpdate,
}: TaskDetailDrawerProps) {
  const isWorkSessionSnapshot = task.completionSource === "TASK_WORK_SESSION";
  const effectiveTaskId =
    isWorkSessionSnapshot && task.taskId ? task.taskId : task.id;

  const { updateTask } = useTaskStore();
  const [isProcessing, setIsProcessing] = useState(false);
  /** True while POST /start is in flight — blocks assistance/complete until server confirms (avoids optimistic-start race). */
  const [isStartInFlight, setIsStartInFlight] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [assistanceMessage, setAssistanceMessage] = useState('');
  const [showAssistanceInput, setShowAssistanceInput] = useState(false);
  const [disposition, setDisposition] = useState(task.disposition || '');
  const [subDisposition, setSubDisposition] = useState('');
  const [sfCaseNumber, setSfCaseNumber] = useState('');
  const [orderAmount, setOrderAmount] = useState('');
  const [dispositionNote, setDispositionNote] = useState('');
  const [assistanceHistoryCache, setAssistanceHistoryCache] = useState<{
    taskId: string;
    messages: AssistanceHistoryRow[];
  } | null>(null);
  const [assistanceHistoryLoading, setAssistanceHistoryLoading] = useState(false);
  const [assistanceHistoryError, setAssistanceHistoryError] = useState<string | null>(null);

  // Reset form fields when task ID changes (not on every render/polling update)
  // This prevents form fields from resetting when task data updates during polling
  const prevTaskIdRef = useRef<string | null>(null);
  useEffect(() => {
    // Only reset if task ID actually changed
    if (prevTaskIdRef.current !== task.id) {
      setDisposition(task.disposition || '');
      setSubDisposition('');
      setSfCaseNumber('');
      setOrderAmount('');
      setDispositionNote('');
      setAssistanceMessage('');
      setShowAssistanceInput(false);
      setToast(null);
      setIsStartInFlight(false);
      prevTaskIdRef.current = task.id;
    }
  }, [task.id, task.disposition]);

  const assistanceHistoryMessages = useMemo(() => {
    if (isWorkSessionSnapshot) return [];
    if (!isOpen || !effectiveTaskId || !agentEmail?.trim() || isTestMode) return [];
    if (assistanceHistoryCache?.taskId !== effectiveTaskId) return [];
    return assistanceHistoryCache.messages;
  }, [isWorkSessionSnapshot, isOpen, effectiveTaskId, agentEmail, isTestMode, assistanceHistoryCache]);

  useEffect(() => {
    if (!isOpen || !effectiveTaskId || !agentEmail?.trim() || isTestMode || isWorkSessionSnapshot) {
      return;
    }

    let cancelled = false;
    const fetchTaskId = effectiveTaskId;
    queueMicrotask(() => {
      if (cancelled) return;
      setAssistanceHistoryLoading(true);
      setAssistanceHistoryError(null);
    });

    const url = `/api/agent/tasks/${fetchTaskId}/assistance-thread?email=${encodeURIComponent(agentEmail.trim())}`;

    void fetch(url)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          messages?: AssistanceHistoryRow[];
          error?: string;
        };
        if (!res.ok || !data.success) {
          throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load assistance history');
        }
        return data.messages ?? [];
      })
      .then((rows) => {
        if (!cancelled) setAssistanceHistoryCache({ taskId: fetchTaskId, messages: rows });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setAssistanceHistoryCache({ taskId: fetchTaskId, messages: [] });
          setAssistanceHistoryError(e instanceof Error ? e.message : 'Failed to load assistance history');
        }
      })
      .finally(() => {
        if (!cancelled) setAssistanceHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, effectiveTaskId, agentEmail, isTestMode, isWorkSessionSnapshot]);

  const assistanceHistoryDisplay = useMemo(() => {
    const notes = task.assistanceNotes?.trim() || '';
    const response = task.managerResponse?.trim() || '';
    return assistanceHistoryMessages.filter((m) => {
      if (m.messageType === 'REQUEST' && notes && m.body === task.assistanceNotes) return false;
      if (m.messageType === 'RESPONSE' && response && m.body === task.managerResponse) return false;
      return true;
    });
  }, [assistanceHistoryMessages, task.assistanceNotes, task.managerResponse]);

  // PENDING must stay locked until Start even if stale startTime survived a reassignment bug.
  const isPending = task.status === 'PENDING';
  const isStarted =
    !isPending &&
    (!!task.startTime ||
      task.status === 'ASSISTANCE_REQUIRED' ||
      task.status === 'RESOLVED');
  const isAssistanceRequired = task.status === 'ASSISTANCE_REQUIRED';
  const isResolved = task.status === 'RESOLVED';
  const isCompleted = task.status === 'COMPLETED';
  const isLocked = isAssistanceRequired && !isResolved;
  const showPostStartActions = isStarted && !isStartInFlight && !isCompleted;

  // Get task type info
  const getTaskTypeInfo = (taskType?: string) => {
    const types: Record<string, { emoji: string; label: string; color: string }> = {
      TEXT_CLUB: { emoji: '📱', label: 'Text Club', color: 'text-blue-400' },
      WOD_IVCS: { emoji: '📦', label: 'WOD/IVCS', color: 'text-red-400' },
      EMAIL_REQUESTS: { emoji: '📧', label: 'Email', color: 'text-green-400' },
      YOTPO: { emoji: '⭐', label: 'Yotpo', color: 'text-yellow-400' },
      HOLDS: { emoji: '🚧', label: 'Holds', color: 'text-orange-400' },
      STANDALONE_REFUNDS: { emoji: '💰', label: 'Refund', color: 'text-purple-400' },
    };
    return types[taskType || 'TEXT_CLUB'] || types.TEXT_CLUB;
  };

  const taskTypeInfo = getTaskTypeInfo(task.taskType);

  const handleStartTask = async () => {
    if (isWorkSessionSnapshot) return;
    setIsProcessing(true);
    setIsStartInFlight(true);
    try {
      // Optimistic update
      updateTask(task.id, {
        status: 'IN_PROGRESS',
        startTime: new Date().toISOString(),
      });

      // Skip API call in test mode
      if (isTestMode) {
        setToast({ message: 'Task started (test mode)', type: 'success' });
        onTaskAction?.('start', task.id);
        setIsStartInFlight(false);
        setIsProcessing(false);
        // Don't close drawer on start - keep it open
        return;
      }

      // Call API
      const response = await fetch(`/api/agent/tasks/${effectiveTaskId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: agentEmail }),
      });

      const data = await response.json();

      if (!data.success) {
        // Rollback on failure
        updateTask(task.id, {
          status: 'PENDING',
          startTime: undefined,
        });
        setToast({ message: data.error || 'Failed to start task', type: 'error' });
      } else {
        setToast({ message: 'Task started successfully', type: 'success' });
        onTaskAction?.('start', task.id);
      }
    } catch (error) {
      // Rollback on error
      updateTask(task.id, {
        status: 'PENDING',
        startTime: undefined,
      });
      setToast({ message: 'Failed to start task. Please try again.', type: 'error' });
    } finally {
      setIsStartInFlight(false);
      setIsProcessing(false);
    }
  };

  const handleRequestAssistance = async () => {
    if (isWorkSessionSnapshot) return;
    if (!assistanceMessage.trim()) {
      setToast({ message: 'Please enter a message', type: 'error' });
      return;
    }

    const statusBeforeAssist = task.status;

    setIsProcessing(true);
    try {
      // Optimistic update
      updateTask(task.id, {
        status: 'ASSISTANCE_REQUIRED',
        assistanceNotes: assistanceMessage,
        assistanceRequestedAt: new Date().toISOString(),
      });

      // Skip API call in test mode
      if (isTestMode) {
        setToast({ message: 'Assistance requested (test mode)', type: 'success' });
        setAssistanceMessage('');
        setShowAssistanceInput(false);
        onTaskAction?.('assist', task.id);
        setIsProcessing(false);
        return;
      }

      // Call API
      const response = await fetch(`/api/agent/tasks/${effectiveTaskId}/assistance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: agentEmail,
          message: assistanceMessage,
        }),
      });

      const data = await response.json().catch(() => ({}) as { success?: boolean; error?: string });

      if (!response.ok || !data.success) {
        const msg =
          typeof data.error === 'string' && data.error.trim()
            ? data.error
            : 'Failed to request assistance';
        updateTask(task.id, {
          status: statusBeforeAssist,
          assistanceNotes: undefined,
          assistanceRequestedAt: undefined,
        });
        setToast({ message: msg, type: 'error' });
      } else {
        setToast({ message: 'Assistance requested', type: 'success' });
        setAssistanceMessage('');
        setShowAssistanceInput(false);
        onTaskAction?.('assist', task.id);
        // Keep drawer open to show locked state
      }
    } catch (error) {
      updateTask(task.id, {
        status: statusBeforeAssist,
        assistanceNotes: undefined,
        assistanceRequestedAt: undefined,
      });
      setToast({ message: 'Failed to request assistance. Please try again.', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompleteTask = async () => {
    if (isWorkSessionSnapshot) return;
    if (!disposition.trim()) {
      setToast({ message: 'Please select a disposition', type: 'error' });
      return;
    }

    // Validation logic matching List view
    let finalDisposition = disposition;
    let finalSfCaseNumber: string | undefined = sfCaseNumber;
    let finalOrderAmount = orderAmount;
    let finalDispositionNote: string | undefined = dispositionNote;

    // For WOD/IVCS tasks, require sub-disposition for both main dispositions
    if (task.taskType === "WOD_IVCS" && (disposition === "Completed" || disposition === "Unable to Complete")) {
      if (!subDisposition) {
        setToast({ message: 'Please select a sub-disposition.', type: 'error' });
        return;
      }
      // Combine main disposition with sub-disposition
      finalDisposition = `${disposition} - ${subDisposition}`;
    }
    // For Email Requests "Unable to Complete", require sub-disposition
    else if (task.taskType === "EMAIL_REQUESTS" && disposition === "Unable to Complete") {
      if (!subDisposition) {
        setToast({ message: 'Please select a sub-disposition for Unable to Complete.', type: 'error' });
        return;
      }
      // Combine main disposition with sub-disposition
      finalDisposition = `${disposition} - ${subDisposition}`;
    }
    // For Email Requests "Completed", require SF Case #
    else if (task.taskType === "EMAIL_REQUESTS" && disposition === "Completed") {
      if (!sfCaseNumber.trim()) {
        setToast({ message: 'Please enter the SF Case # for Completed disposition.', type: 'error' });
        return;
      }
      finalSfCaseNumber = sfCaseNumber.trim();
    }
    // For "Answered in SF", require SF Case #
    else if (disposition === "Answered in SF") {
      if (!sfCaseNumber.trim()) {
        setToast({ message: 'Please enter the SF Case # for Answered in SF disposition.', type: 'error' });
        return;
      }
      finalSfCaseNumber = sfCaseNumber.trim();
    }
    // For Yotpo, require SF Case # for all dispositions EXCEPT 4 exemptions
    else if (task.taskType === "YOTPO") {
      const noSfRequired = [
        "Information – Unfeasible request or information not available",
        "Duplicate Request – No new action required",
        "Previously Assisted – Issue already resolved or refund previously issued",
        "No Match – No valid account or order located",
        "Refund – Passed MBG - No Refund Issued"
      ];
      
      // If disposition requires SF # but none provided
      if (!noSfRequired.includes(disposition) && !sfCaseNumber.trim()) {
        setToast({ message: 'Please enter the SF Case # for this Yotpo disposition.', type: 'error' });
        return;
      }
      finalSfCaseNumber = sfCaseNumber.trim() || undefined;
    }
    // For Holds, handle queue movements and completion
    else if (task.taskType === "HOLDS") {
      // MANDATORY: Order Amount required for all Holds completions
      if (!orderAmount || parseFloat(orderAmount) <= 0) {
        setToast({ message: 'Please enter the Order Amount before completing this Holds task.', type: 'error' });
        return;
      }
      
      // MANDATORY: Note required for specific dispositions
      const noteRequiredDispositions = ["Unable to Resolve", "Resolved - other", "Resolved - Other"];
      if (noteRequiredDispositions.includes(disposition) && !dispositionNote.trim()) {
        setToast({ message: 'Please enter a note/reason for this disposition.', type: 'error' });
        return;
      }
      
      finalOrderAmount = orderAmount;
      finalDispositionNote = dispositionNote.trim() || undefined;
    }

    setIsProcessing(true);
    try {
      // Optimistic update
      updateTask(task.id, {
        status: 'COMPLETED',
        endTime: new Date().toISOString(),
        disposition: finalDisposition,
      });

      // Skip API call in test mode
      if (isTestMode) {
        setToast({ message: 'Task completed (test mode)', type: 'success' });
        onTaskAction?.('complete', task.id);
        // Auto-close drawer on completion
        setTimeout(() => {
          onClose();
        }, 500);
        setIsProcessing(false);
        return;
      }

      // Call API with proper parameters based on task type
      const body: Record<string, unknown> = {
        email: agentEmail,
        disposition: finalDisposition,
      };

      // Add SF Case # if provided
      if (finalSfCaseNumber) {
        body.sfCaseNumber = finalSfCaseNumber;
      }

      // For Holds, add order amount and note
      if (task.taskType === "HOLDS") {
        body.orderAmount = finalOrderAmount;
        if (finalDispositionNote) {
          body.dispositionNote = finalDispositionNote;
        }
      } else if (finalDispositionNote) {
        // For other task types, add note if provided
        body.dispositionNote = finalDispositionNote;
      }

      const response = await fetch(`/api/agent/tasks/${effectiveTaskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.success) {
        // Rollback
        updateTask(task.id, {
          status: isResolved ? 'RESOLVED' : 'IN_PROGRESS',
          endTime: undefined,
          disposition: undefined,
        });
        setToast({ message: data.error || 'Failed to complete task', type: 'error' });
      } else {
        // Update task with actual response data (including endTime from server)
        // CRITICAL: Ensure endTime is set correctly for date filtering
        const serverEndTime = data.task?.endTime || new Date().toISOString();
        updateTask(task.id, {
          status: 'COMPLETED',
          endTime: serverEndTime,
          disposition: finalDisposition,
        });
        
        if (DEBUG_PERFORMANCE) {
          console.log('✅ Task completed:', {
            taskId: effectiveTaskId,
            endTime: serverEndTime,
            selectedDate: new Date().toISOString().split('T')[0],
            endDateStr: new Date(serverEndTime).toISOString().split('T')[0]
          });
        }
        
        setToast({ message: 'Task completed successfully', type: 'success' });
        onTaskAction?.('complete', task.id);
        // Refresh stats and scorecard after completion
        if (onStatsUpdate) {
          await onStatsUpdate();
        }
        // Auto-close drawer on completion
        setTimeout(() => {
          onClose();
        }, 500);
      }
    } catch (error) {
      // Rollback
      updateTask(task.id, {
        status: isResolved ? 'RESOLVED' : 'IN_PROGRESS',
        endTime: undefined,
        disposition: undefined,
      });
      setToast({ message: 'Failed to complete task. Please try again.', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Centered Modal (Trello-style) */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-neutral-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden max-w-4xl w-full max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={taskTypeInfo.color}>{taskTypeInfo.emoji}</span>
                <span className="text-white/70 text-sm">{taskTypeInfo.label}</span>
                <span className="text-white/40">•</span>
                <span className="text-white font-medium">{task.brand}</span>
              </div>
              <div className="text-xs text-white/50 space-y-0.5">
                <div>Task ID: {effectiveTaskId}</div>
                {isWorkSessionSnapshot && task.workSessionId && (
                  <div className="text-white/40">Work session: {task.workSessionId}</div>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors text-2xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Status Indicators */}
          {isLocked && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
              <div className="text-red-300 text-sm font-medium">⏸️ Waiting on Manager</div>
              <div className="text-red-200/80 text-xs mt-1">
                This task is locked until the manager responds
              </div>
            </div>
          )}

          {isResolved && (
            <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
              <div className="text-green-300 text-sm font-medium">✅ Manager Responded</div>
              <div className="text-green-200/80 text-xs mt-1">
                You can now continue working on this task
              </div>
            </div>
          )}

          {isWorkSessionSnapshot && (
            <div className="bg-white/[0.06] border border-white/15 rounded-lg p-3 text-sm text-white/70">
              Read-only: completed Holds work session. Start, assistance, and complete actions are disabled.
            </div>
          )}

          {/* Task Content */}
          <div className="space-y-4">
            {!isStarted && !isCompleted ? (
              <>
                {/* Blurred state - show only basic info */}
                <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                  <div className="text-white/60 text-sm mb-2">🔒 Task details are hidden until you start the task</div>
                  <div className="text-white/40 text-xs">Click &quot;Start Task&quot; below to view full details</div>
                </div>
                
                {/* Timestamps - safe to show */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-white/60">Created</div>
                    <div className="text-white/90">
                      {new Date(task.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Unblurred state - show all info */}
                
                {/* Task Type Specific Fields */}
                {task.taskType === "WOD_IVCS" ? (
                  <>
                    {/* WOD/IVCS specific data */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-red-400">📋</span>
                        <span className="text-white/60">Source:</span>
                        <span className="font-mono text-white/90">{task.wodIvcsSource || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-red-400">🔢</span>
                        <span className="text-white/60">Primary ID:</span>
                        <span className="font-mono text-white/90">{task.documentNumber || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-red-400">👤</span>
                        <span className="text-white/60">Customer:</span>
                        <span className="font-mono text-white/90">{task.customerName || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-red-400">💵</span>
                        <span className="text-white/60">Amount:</span>
                        <span className="font-mono text-white/90">{task.amount ? `$${task.amount}` : "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-red-400">📊</span>
                        <span className="text-white/60">Difference:</span>
                        <span className="font-mono text-white/90">{task.webOrderDifference ? `$${task.webOrderDifference}` : "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-red-400">📅</span>
                        <span className="text-white/60">Origin Date:</span>
                        <span className="font-mono text-white/90">{task.purchaseDate ? new Date(task.purchaseDate).toLocaleDateString() : "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-red-400">⏰</span>
                        <span className="text-white/60">Order Age:</span>
                        <span className="font-mono text-white/90">{task.orderAge || "N/A"}</span>
                      </div>
                    </div>
                  </>
                ) : task.taskType === "EMAIL_REQUESTS" ? (
                  <>
                    {/* Email Request specific data */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-green-400">⏰</span>
                        <span className="text-white/60">Completion Time:</span>
                        <span className="font-mono text-white/90">{task.completionTime ? new Date(task.completionTime).toLocaleString() : "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-green-400">🔢</span>
                        <span className="text-white/60">SF Case #:</span>
                        <span className="font-mono text-white/90">{task.salesforceCaseNumber || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-green-400">📧</span>
                        <span className="text-white/60">Request For:</span>
                        <span className="font-mono text-white/90">{task.emailRequestFor || "N/A"}</span>
                      </div>
                      <div className="flex items-start gap-2 col-span-2">
                        <span className="text-green-400 mt-1">📝</span>
                        <div className="flex-1">
                          <span className="text-white/60">Details:</span>
                          <div className="text-sm text-white/90 mt-1 leading-relaxed">{task.details || "N/A"}</div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : task.taskType === "YOTPO" ? (
                  <>
                    {/* Yotpo specific data */}
                    <div className="space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-400">👤</span>
                          <span className="text-white/60">Customer:</span>
                          <span className="font-mono text-white/90">{task.yotpoCustomerName || "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-400">📧</span>
                          <span className="text-white/60">Email:</span>
                          <span className="font-mono text-xs text-white/90">{task.yotpoEmail || "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-400">📅</span>
                          <span className="text-white/60">Order Date:</span>
                          <span className="font-mono text-white/90">{task.yotpoOrderDate ? new Date(task.yotpoOrderDate).toLocaleDateString() : "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-400">📦</span>
                          <span className="text-white/60">Product:</span>
                          <span className="font-mono text-white/90">{task.yotpoProduct || "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-400">🏷️</span>
                          <span className="text-white/60">Issue Topic:</span>
                          <span className="font-mono text-white/90">{task.yotpoIssueTopic || "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-400">📅</span>
                          <span className="text-white/60">Review Date:</span>
                          <span className="font-mono text-white/90">{task.yotpoReviewDate ? new Date(task.yotpoReviewDate).toLocaleDateString() : "N/A"}</span>
                        </div>
                      </div>
                      
                      {/* Review Text */}
                      <div className="flex items-start gap-2">
                        <span className="text-yellow-400 mt-1">⭐</span>
                        <div className="flex-1">
                          <span className="text-white/60">Review:</span>
                          <div className="text-sm text-white/90 mt-1 leading-relaxed bg-white/5 rounded p-3 border border-white/10 whitespace-pre-wrap">
                            {task.yotpoReview || "No review text provided"}
                          </div>
                        </div>
                      </div>
                      
                      {/* SF Order Link */}
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-400">🔗</span>
                        <span className="text-white/60">SF Order:</span>
                        {task.yotpoSfOrderLink ? (
                          <a 
                            href={task.yotpoSfOrderLink} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline text-xs break-all"
                          >
                            Open in Salesforce →
                          </a>
                        ) : (
                          <span className="font-mono text-white/40">Not provided</span>
                        )}
                      </div>
                    </div>
                  </>
                ) : task.taskType === "STANDALONE_REFUNDS" ? (
                  <>
                    {/* Standalone Refund specific data */}
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-purple-400">💰</span>
                        <span className="text-white/60">Refund Amount:</span>
                        <span className="font-mono text-white/90">{task.refundAmount ? `$${task.refundAmount}` : "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-purple-400">💳</span>
                        <span className="text-white/60">Payment Method:</span>
                        <span className="font-mono text-white/90">{task.paymentMethod || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-purple-400">📝</span>
                        <span className="text-white/60">Reason:</span>
                        <span className="font-mono text-white/90">{task.refundReason || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-purple-400">📦</span>
                        <span className="text-white/60">Product SKU:</span>
                        <span className="font-mono text-white/90">{task.productSku || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-purple-400">🔢</span>
                        <span className="text-white/60">Quantity:</span>
                        <span className="font-mono text-white/90">{task.quantity || "N/A"}</span>
                      </div>
                    </div>
                  </>
                ) : task.taskType === "HOLDS" ? (
                  <>
                    {/* Holds specific data */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-orange-400">📦</span>
                        <span className="text-white/60">Order #:</span>
                        <span className="font-mono text-white/90">{task.holdsOrderNumber || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-orange-400">📅</span>
                        <span className="text-white/60">Order Date:</span>
                        <span className="font-mono text-white/90">{task.holdsOrderDate ? new Date(task.holdsOrderDate).toLocaleDateString() : "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-orange-400">📧</span>
                        <span className="text-white/60">Customer Email:</span>
                        <span className="font-mono text-xs text-white/90">{task.holdsCustomerEmail || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-orange-400">💰</span>
                        <span className="text-white/60">Order Amount:</span>
                        <span className="font-mono text-white/90">{task.holdsOrderAmount ? `$${task.holdsOrderAmount}` : "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-orange-400">🚦</span>
                        <span className="text-white/60">Status:</span>
                        <span className="font-mono text-white/90">{task.holdsStatus || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-orange-400">⏰</span>
                        <span className="text-white/60">Days in System:</span>
                        <span className="font-mono text-white/90">{task.holdsDaysInSystem || "N/A"}</span>
                      </div>
                      {task.holdsNotes && (
                        <div className="flex items-start gap-2 col-span-2">
                          <span className="text-orange-400 mt-1">📝</span>
                          <div className="flex-1">
                            <span className="text-white/60">Notes:</span>
                            <div className="text-sm text-white/90 mt-1">{task.holdsNotes}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Text Club - default task content */}
                    <div>
                      <div className="text-xs text-white/60 mb-1">Task Content</div>
                      <div className="text-white/90">{task.text || 'No description'}</div>
                    </div>

                    {/* Customer Info */}
                    {task.customerName && (
                      <div>
                        <div className="text-xs text-white/60 mb-1">Customer</div>
                        <div className="text-white/90">👤 {task.customerName}</div>
                      </div>
                    )}

                    {task.phone && (
                      <div>
                        <div className="text-xs text-white/60 mb-1">Phone</div>
                        <div className="text-white/90">📞 {task.phone}</div>
                      </div>
                    )}
                  </>
                )}

                {/* Timestamps */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-white/60">Created</div>
                    <div className="text-white/90">
                      {new Date(task.createdAt).toLocaleString()}
                    </div>
                  </div>
                  {task.startTime && (
                    <div>
                      <div className="text-white/60">Started</div>
                      <div className="text-white/90">
                        {new Date(task.startTime).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Manager Response */}
            {task.managerResponse && (
              <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                <div className="text-xs text-green-300 mb-1">Manager Response</div>
                <div className="text-white/90 text-sm">{task.managerResponse}</div>
              </div>
            )}

            {/* Assistance Notes */}
            {task.assistanceNotes && (
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
                <div className="text-xs text-blue-300 mb-1">Your Assistance Request</div>
                <div className="text-white/90 text-sm">{task.assistanceNotes}</div>
              </div>
            )}

            {assistanceHistoryLoading && (
              <div className="text-xs text-white/50 py-2">Loading assistance history…</div>
            )}
            {assistanceHistoryError && (
              <div className="text-xs text-amber-300/90 py-1">{assistanceHistoryError}</div>
            )}
            {assistanceHistoryDisplay.length > 0 && (
              <div className="border border-white/10 rounded-lg p-3 bg-white/[0.03] space-y-3">
                <div className="text-xs font-medium text-white/70 uppercase tracking-wide">
                  Assistance History
                </div>
                <p className="text-[11px] text-white/45">
                  Earlier request/response rounds (read-only). Current status still follows the task above.
                </p>
                <ul className="space-y-3">
                  {assistanceHistoryDisplay.map((m) => {
                    const isRequest = m.messageType === 'REQUEST';
                    const isResponse = m.messageType === 'RESPONSE';
                    const label = isRequest
                      ? 'Agent Request'
                      : isResponse
                        ? 'Manager Response'
                        : m.messageType.replace(/_/g, ' ');
                    const bubbleClass = isRequest
                      ? 'border-blue-500/25 bg-blue-900/15'
                      : isResponse
                        ? 'border-green-500/25 bg-green-900/15'
                        : 'border-white/10 bg-white/5';
                    const when = m.createdAt
                      ? new Date(m.createdAt).toLocaleString()
                      : '';
                    const who =
                      m.author?.name || m.author?.email || (isRequest ? 'Agent' : isResponse ? 'Manager' : '—');
                    return (
                      <li
                        key={m.id}
                        className={`rounded-lg border px-3 py-2 text-sm ${bubbleClass}`}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-white/85">{label}</span>
                          <span className="text-[10px] text-white/45">{when}</span>
                        </div>
                        <div className="text-[11px] text-white/50 mb-1">{who}</div>
                        <div className="text-white/90 whitespace-pre-wrap">{m.body}</div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-4 border-t border-white/10 sticky bottom-0 bg-neutral-900 pb-2">
            {!isWorkSessionSnapshot && !isStarted && !isCompleted && (
              <button
                onClick={handleStartTask}
                disabled={isProcessing || isStartInFlight}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {isProcessing || isStartInFlight ? 'Starting...' : 'Start Task'}
              </button>
            )}

            {!isWorkSessionSnapshot && showPostStartActions && !isLocked && (
              <>
                {!showAssistanceInput ? (
                  <button
                    onClick={() => setShowAssistanceInput(true)}
                    className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium"
                  >
                    Request Assistance
                  </button>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={assistanceMessage}
                      onChange={(e) => setAssistanceMessage(e.target.value)}
                      placeholder="What do you need help with?"
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder-white/40"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleRequestAssistance}
                        disabled={isProcessing || !assistanceMessage.trim()}
                        className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium disabled:opacity-50"
                      >
                        {isProcessing ? 'Sending...' : 'Send Request'}
                      </button>
                      <button
                        onClick={() => {
                          setShowAssistanceInput(false);
                          setAssistanceMessage('');
                        }}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {!isWorkSessionSnapshot && showPostStartActions && !isLocked && (
              <div className="space-y-4">
                {/* Order Amount field for Holds tasks - MANDATORY */}
                {task.taskType === "HOLDS" && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-white">
                      Order Amount: <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={orderAmount}
                        onChange={(e) => {
                          setOrderAmount(e.target.value);
                        }}
                        onBlur={(e) => {
                          if (e.target.value && !isNaN(parseFloat(e.target.value))) {
                            setOrderAmount(parseFloat(e.target.value).toFixed(2));
                          }
                        }}
                        className="w-full rounded-lg bg-white/10 text-white pl-8 pr-3 py-2 border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                    <p className="text-xs text-white/50">
                      Enter the order amount to track financial impact per disposition
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white">Disposition:</label>
                  <select
                    value={disposition}
                    onChange={(e) => setDisposition(e.target.value)}
                    className="w-full rounded-lg bg-white/10 text-white px-3 py-2 border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ colorScheme: 'dark' }}
                  >
                    <option value="">Select disposition...</option>
                    {task.taskType === "WOD_IVCS" ? (
                      <>
                        <option value="Completed">✅ Completed</option>
                        <option value="Unable to Complete">❌ Unable to Complete</option>
                      </>
                    ) : task.taskType === "EMAIL_REQUESTS" ? (
                      <>
                        <option value="Completed">✅ Completed</option>
                        <option value="Unable to Complete">❌ Unable to Complete</option>
                      </>
                    ) : task.taskType === "YOTPO" ? (
                      <>
                        <option value="" disabled className="text-white/40 text-xs">— Reship —</option>
                        <option value="Reship – Item or order not received">📦 Item or order not received</option>
                        <option value="Reship – Incorrect item received">🔄 Incorrect item received</option>
                        <option value="Reship – Damaged or quality issue">⚠️ Damaged or quality issue</option>
                        <option value="" disabled className="text-white/40 text-xs">— Refund —</option>
                        <option value="Refund – Full refund issued">💵 Full refund issued</option>
                        <option value="Refund – Partial refund issued">💰 Partial refund issued</option>
                        <option value="Refund – Return to sender (RTS)">📮 Return to sender (RTS)</option>
                        <option value="Refund – Out of stock">📭 Out of stock</option>
                        <option value="Refund – Refund issued with condolences (pet passing or sensitive case)">🐾 Refund with condolences</option>
                        <option value="Refund – Chargeback or fraud (no further action required)">🚫 Chargeback or fraud</option>
                        <option value="Refund – Passed MBG - No Refund Issued">✅ Passed MBG - No Refund Issued</option>
                        <option value="" disabled className="text-white/40 text-xs">— Subscription —</option>
                        <option value="Subscription – Cancelled">❌ Cancelled</option>
                        <option value="Subscription – Updated (next charge date, frequency, etc.)">🔄 Updated (date/frequency)</option>
                        <option value="Subscription – Cancelled due to PayPal limitations">💳 Cancelled (PayPal limitations)</option>
                        <option value="" disabled className="text-white/40 text-xs">— Information —</option>
                        <option value="Information – Billing Inquiry">💳 Billing Inquiry</option>
                        <option value="Information – Tracking or delivery status provided">📍 Tracking or delivery status</option>
                        <option value="Information – Product usage or transition tips sent">💡 Product usage/transition tips</option>
                        <option value="Information – Product Information sent">ℹ️ Product Information sent</option>
                        <option value="Information – Shelf life or storage details sent">🗓️ Shelf life or storage details</option>
                        <option value="Information – Store locator or sourcing information sent">🏪 Store locator/sourcing info</option>
                        <option value="Information – Medical or veterinary guidance provided">🏥 Medical/veterinary guidance</option>
                        <option value="Information – Unfeasible request or information not available">🚫 Unfeasible request</option>
                        <option value="" disabled className="text-white/40 text-xs">— AER —</option>
                        <option value="AER – Serious AER - Refund Issued">🚨 Serious AER - Refund Issued</option>
                        <option value="AER – None Serious AER - RA Issued">⚠️ None Serious AER - RA Issued</option>
                        <option value="" disabled className="text-white/40 text-xs">— Other —</option>
                        <option value="Return Authorization – Created and sent to customer">📋 Return authorization sent</option>
                        <option value="Verification – Requested LOT number and photos from customer">📸 LOT number/photos requested</option>
                        <option value="Duplicate Request – No new action required">🔄 Duplicate request</option>
                        <option value="Previously Assisted – Issue already resolved or refund previously issued">✅ Previously assisted</option>
                        <option value="Unsubscribed – Customer removed from communications">🚫 Unsubscribed</option>
                        <option value="No Match – No valid account or order located">❓ No match found</option>
                        <option value="Escalation – Sent Negative Feedback Macro">⚠️ Escalation (negative feedback)</option>
                        <option value="Passed MBG">🔬 Passed MBG</option>
                        <option value="Delivered – Order delivered after review, no further action required">✅ Delivered</option>
                      </>
                    ) : task.taskType === "HOLDS" ? (
                      <>
                        {task.holdsStatus === "Agent Research" ? (
                          <>
                            <option value="Duplicate">🔄 Duplicate</option>
                            <option value="Refunded & Closed">💰 Refunded & Closed</option>
                            <option value="Refunded & Closed - Customer Requested Cancelation">❌ Refunded & Closed - Customer Requested Cancelation</option>
                            <option value="Refunded & Closed - Out of Stock">📦 Refunded & Closed - Out of Stock</option>
                            <option value="Resolved - fixed format / fixed address">✅ Resolved - fixed format / fixed address</option>
                            <option value="Resolved - other">✅ Resolved - other (requires note)</option>
                            <option value="International Order - Unable to Call/ Sent Email">🌍 International Order - Unable to Call/ Sent Email (→ Customer Contact)</option>
                            <option value="Unable to Resolve">⏭️ Unable to Resolve (→ Customer Contact) (requires note)</option>
                            <option value="Closed & Refunded - Fraud/Reseller">🔒 Closed & Refunded - Fraud/Reseller</option>
                          </>
                        ) : task.holdsStatus === "Customer Contact" ? (
                          <>
                            <option value="In Communication">💬 In Communication (→ Customer Contact)</option>
                            <option value="Refunded & Closed - No Contact">💰 Refunded & Closed - No Contact</option>
                            <option value="Refunded & Closed - Customer Requested Cancelation">❌ Refunded & Closed - Customer Requested Cancelation</option>
                            <option value="Refunded & Closed - Comma Issue">🔧 Refunded & Closed - Comma Issue</option>
                            <option value="Refunded & Closed - Out of Stock">📦 Refunded & Closed - Out of Stock</option>
                            <option value="Resolved - Customer Clarified">✅ Resolved - Customer Clarified</option>
                            <option value="Resolved - FRT Released">📦 Resolved - FRT Released</option>
                            <option value="Resolved - Other">✅ Resolved - Other (requires note)</option>
                            <option value="Closed & Refunded - Fraud/Reseller">🔒 Closed & Refunded - Fraud/Reseller</option>
                          </>
                        ) : task.holdsStatus === "Escalated Call 4+ Day" ? (
                          <>
                            <option value="Unable to Resolve">⏭️ Unable to Resolve (→ Escalation) (requires note)</option>
                            <option value="International Order - Unable to Call / Sent Email">🌍 International Order - Unable to Call / Sent Email (→ Customer Contact)</option>
                            <option value="Refunded & Closed - Customer Requested Cancelation">❌ Refunded & Closed - Customer Requested Cancelation</option>
                            <option value="Refunded & Closed - No Contact">💰 Refunded & Closed - No Contact</option>
                            <option value="Refunded & Closed - Out of Stock">📦 Refunded & Closed - Out of Stock</option>
                            <option value="Resolved - Customer Clarified">✅ Resolved - Customer Clarified</option>
                            <option value="Resolved - FRT Released">📦 Resolved - FRT Released</option>
                            <option value="Resolved - Other">✅ Resolved - Other (requires note)</option>
                            <option value="Closed & Refunded - Fraud/Reseller">🔒 Closed & Refunded - Fraud/Reseller</option>
                          </>
                        ) : (
                          <>
                            <option value="Duplicate">🔄 Duplicate</option>
                            <option value="Refunded & Closed">💰 Refunded & Closed</option>
                            <option value="Refunded & Closed - Customer Requested Cancelation">❌ Refunded & Closed - Customer Requested Cancelation</option>
                            <option value="Resolved - fixed format / fixed address">✅ Resolved - fixed format / fixed address</option>
                            <option value="Resolved - other">✅ Resolved - other (requires note)</option>
                            <option value="Unable to Resolve">⏭️ Unable to Resolve (→ Customer Contact) (requires note)</option>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <option value="Answered in Attentive">✅ Answered in Attentive</option>
                        <option value="Answered in SF">📋 Answered in SF</option>
                        <option value="Previously Assisted">🔄 Previously Assisted</option>
                        <option value="No Response Required (leadership advised)">⏸️ No Response Required</option>
                        <optgroup label="Spam">
                          <option value="Spam - Negative Feedback">🚫 Negative Feedback</option>
                          <option value="Spam - Positive Feedback">👍 Positive Feedback</option>
                          <option value="Spam - Off topic">📝 Off topic</option>
                          <option value="Spam - Gibberish">🤪 Gibberish</option>
                          <option value="Spam - One word statement">💬 One word statement</option>
                          <option value="Spam - Reaction Message">😀 Reaction Message</option>
                        </optgroup>
                      </>
                    )}
                  </select>

                  {/* Sub-disposition dropdown for WOD/IVCS "Completed" */}
                  {task.taskType === "WOD_IVCS" && disposition === "Completed" && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-white/70">Sub-disposition:</label>
                      <select
                        value={subDisposition}
                        onChange={(e) => setSubDisposition(e.target.value)}
                        className="w-full rounded-lg bg-white/10 text-white px-3 py-2 border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{ colorScheme: 'dark' }}
                      >
                        <option value="">Select sub-disposition...</option>
                        <option value="Fixed Amounts">✅ Fixed Amounts</option>
                        <option value="Unable to fix amounts (everything is matching)">✅ Unable to fix amounts (everything is matching)</option>
                        <option value="Added PayPal Payment info">💳 Added PayPal Payment info</option>
                        <option value="Cannot edit CS">📝 Cannot edit CS</option>
                        <option value="Completed SO only - CS line location error">🔧 Completed SO only - CS line location error</option>
                      </select>
                    </div>
                  )}

                  {/* Sub-disposition dropdown for WOD/IVCS "Unable to Complete" */}
                  {task.taskType === "WOD_IVCS" && disposition === "Unable to Complete" && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-white/70">Sub-disposition:</label>
                      <select
                        value={subDisposition}
                        onChange={(e) => setSubDisposition(e.target.value)}
                        className="w-full rounded-lg bg-white/10 text-white px-3 py-2 border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{ colorScheme: 'dark' }}
                      >
                        <option value="">Select sub-disposition...</option>
                        <option value="Not Completed - Canada Lock">🇨🇦 Not Completed - Canada Lock</option>
                        <option value="Not Completed - Meta">📱 Not Completed - Meta</option>
                        <option value="Not Completed - No edit button">🔄 Not Completed - No edit button</option>
                        <option value="Not Completed - Locked (CS was able to be edited)">🔒 Not Completed - Locked (CS was able to be edited)</option>
                        <option value="Not Completed - Reship">📦 Not Completed - Reship</option>
                      </select>
                    </div>
                  )}

                  {/* Sub-disposition dropdown for Email Requests "Unable to Complete" */}
                  {task.taskType === "EMAIL_REQUESTS" && disposition === "Unable to Complete" && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-white/70">Sub-disposition:</label>
                      <select
                        value={subDisposition}
                        onChange={(e) => setSubDisposition(e.target.value)}
                        className="w-full rounded-lg bg-white/10 text-white px-3 py-2 border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{ colorScheme: 'dark' }}
                      >
                        <option value="">Select sub-disposition...</option>
                        <option value="Unfeasable request / Information not available">🚫 Unfeasable request / Information not available</option>
                        <option value="Incomplete or Missing Info">📝 Incomplete or Missing Info</option>
                        <option value="Link/Sale Unavailable">🔗 Link/Sale Unavailable</option>
                        <option value="No Specification on Requests">❓ No Specification on Requests</option>
                        <option value="Requesting info on ALL Products">📦 Requesting info on ALL Products</option>
                        <option value="Duplicate Request">🔄 Duplicate Request</option>
                      </select>
                    </div>
                  )}

                  {/* SF Case # field for "Answered in SF" */}
                  {disposition === "Answered in SF" && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-white/80">
                        SF Case # <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={sfCaseNumber}
                        onChange={(e) => setSfCaseNumber(e.target.value)}
                        placeholder="Enter Salesforce Case Number"
                        className="w-full rounded-lg bg-white/10 text-white placeholder-white/40 px-3 py-2 border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  )}

                  {/* SF Case # field for Email Requests "Completed" */}
                  {task.taskType === "EMAIL_REQUESTS" && disposition === "Completed" && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-white/80">
                        SF Case # <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={sfCaseNumber}
                        onChange={(e) => setSfCaseNumber(e.target.value)}
                        placeholder="Enter Salesforce Case Number"
                        className="w-full rounded-lg bg-white/10 text-white placeholder-white/40 px-3 py-2 border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  )}

                  {/* SF Case # field for Yotpo (required for most dispositions, with 4 exceptions) */}
                  {task.taskType === "YOTPO" && disposition && (() => {
                    const noSfRequired = [
                      "Information – Unfeasible request or information not available",
                      "Duplicate Request – No new action required",
                      "Previously Assisted – Issue already resolved or refund previously issued",
                      "No Match – No valid account or order located",
                      "Refund – Passed MBG - No Refund Issued"
                    ];
                    return !noSfRequired.includes(disposition);
                  })() && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-white/80">
                        SF Case # <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={sfCaseNumber}
                        onChange={(e) => setSfCaseNumber(e.target.value)}
                        placeholder="Enter Salesforce Case Number"
                        className="w-full rounded-lg bg-white/10 text-white placeholder-white/40 px-3 py-2 border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  )}

                  {/* Disposition Notes field for Holds tasks */}
                  {task.taskType === "HOLDS" && disposition && (() => {
                    const requiresNote = [
                      "Unable to Resolve",
                      "Resolved - other",
                      "Resolved - Other",
                      "Resolved - fixed format / fixed address",
                      "Resolved - Customer Clarified",
                      "Resolved - FRT Released"
                    ];
                    const isResolved = disposition.toLowerCase().startsWith("resolved");
                    const isUnableToResolveInEscalation = disposition === "Unable to Resolve" && task.holdsStatus === "Escalated Call 4+ Day";
                    return requiresNote.includes(disposition) || isResolved || isUnableToResolveInEscalation;
                  })() && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-white/80">
                        Reason / Notes: <span className="text-red-400">*</span>
                      </label>
                      <textarea
                        value={dispositionNote}
                        onChange={(e) => setDispositionNote(e.target.value)}
                        placeholder={disposition.toLowerCase().startsWith("resolved") 
                          ? "Provide details about how this order was resolved (required for all Resolved dispositions)..."
                          : "Explain why this order cannot be resolved or provide additional details..."}
                        rows={3}
                        className="w-full rounded-lg bg-white/10 text-white placeholder-white/40 px-3 py-2 border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        required
                      />
                      <p className="text-xs text-white/50">
                        This note will be visible in the Queue Journey, Resolved Orders Report, and to assigned agents
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleCompleteTask}
                    disabled={isProcessing || (() => {
                      if (!disposition) return true;
                      if (disposition === "Answered in SF" && !sfCaseNumber.trim()) return true;
                      if (task.taskType === "EMAIL_REQUESTS") {
                        if (disposition === "Completed" && !sfCaseNumber.trim()) return true;
                        if (disposition === "Unable to Complete" && !subDisposition) return true;
                      }
                      if (task.taskType === "WOD_IVCS") {
                        if ((disposition === "Completed" || disposition === "Unable to Complete") && !subDisposition) return true;
                      }
                      if (task.taskType === "HOLDS") {
                        const orderAmountValid = orderAmount && parseFloat(orderAmount) > 0;
                        if (!orderAmountValid) return true;
                        const isResolved = disposition.toLowerCase().startsWith("resolved");
                        const noteRequiredDispositions = ["Unable to Resolve", "Resolved - other", "Resolved - Other", "Resolved - fixed format / fixed address", "Resolved - Customer Clarified", "Resolved - FRT Released"];
                        if ((noteRequiredDispositions.includes(disposition) || isResolved) && !dispositionNote.trim()) return true;
                      }
                      if (task.taskType === "YOTPO" && disposition) {
                        const noSfRequired = [
                          "Information – Unfeasible request or information not available",
                          "Duplicate Request – No new action required",
                          "Previously Assisted – Issue already resolved or refund previously issued",
                          "No Match – No valid account or order located",
                          "Refund – Passed MBG - No Refund Issued"
                        ];
                        if (!noSfRequired.includes(disposition) && !sfCaseNumber.trim()) return true;
                      }
                      return false;
                    })()}
                    className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? 'Completing...' : 'Complete Task'}
                  </button>
                </div>
              </div>
            )}

            {isCompleted && (
              <div className="text-center text-white/60 text-sm space-y-1">
                <div>Task completed: {task.disposition || "—"}</div>
                {isWorkSessionSnapshot && (
                  <>
                    {task.outcomeType != null && task.outcomeType !== "" && (
                      <div className="text-xs text-white/45">Outcome: {String(task.outcomeType)}</div>
                    )}
                    {task.holdsFromQueue && task.holdsToQueue && (
                      <div className="text-xs text-white/45">
                        Queues: {task.holdsFromQueue} → {task.holdsToQueue}
                      </div>
                    )}
                    {typeof task.isFinalResolution === "boolean" && (
                      <div className="text-xs text-white/45">
                        Final resolution: {task.isFinalResolution ? "Yes" : "No"}
                      </div>
                    )}
                    {task.startTime && (
                      <div className="text-xs text-white/45">
                        Session started: {new Date(task.startTime).toLocaleString()}
                      </div>
                    )}
                    {task.endTime && (
                      <div className="text-xs text-white/45">
                        Session ended: {new Date(task.endTime).toLocaleString()}
                      </div>
                    )}
                    {typeof task.durationSec === "number" && (
                      <div className="text-xs text-white/45">Duration: {task.durationSec}s</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
