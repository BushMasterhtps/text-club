"use client";

import { Task } from '@/stores/useTaskStore';
import { useState } from 'react';
import { useTaskStore } from '@/stores/useTaskStore';
import { Toast } from '@/app/_components/Toast';

interface TaskDetailDrawerProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  agentEmail: string;
  onTaskAction?: (action: 'start' | 'assist' | 'complete', taskId: string) => void;
  isTestMode?: boolean; // Flag to skip API calls in test mode
}

export default function TaskDetailDrawer({
  task,
  isOpen,
  onClose,
  agentEmail,
  onTaskAction,
  isTestMode = false,
}: TaskDetailDrawerProps) {
  const { updateTask } = useTaskStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [assistanceMessage, setAssistanceMessage] = useState('');
  const [showAssistanceInput, setShowAssistanceInput] = useState(false);
  const [disposition, setDisposition] = useState(task.disposition || '');
  const [sfCaseNumber, setSfCaseNumber] = useState('');
  const [dispositionNote, setDispositionNote] = useState('');

  const isStarted = !!task.startTime;
  const isAssistanceRequired = task.status === 'ASSISTANCE_REQUIRED';
  const isResolved = task.status === 'RESOLVED';
  const isCompleted = task.status === 'COMPLETED';
  const isLocked = isAssistanceRequired && !isResolved;

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
    setIsProcessing(true);
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
        setIsProcessing(false);
        return;
      }

      // Call API
      const response = await fetch(`/api/agent/tasks/${task.id}/start`, {
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
      setIsProcessing(false);
    }
  };

  const handleRequestAssistance = async () => {
    if (!assistanceMessage.trim()) {
      setToast({ message: 'Please enter a message', type: 'error' });
      return;
    }

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
      const response = await fetch(`/api/agent/tasks/${task.id}/assistance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: agentEmail,
          message: assistanceMessage,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        // Rollback
        updateTask(task.id, {
          status: 'IN_PROGRESS',
          assistanceNotes: undefined,
          assistanceRequestedAt: undefined,
        });
        setToast({ message: data.error || 'Failed to request assistance', type: 'error' });
      } else {
        setToast({ message: 'Assistance requested', type: 'success' });
        setAssistanceMessage('');
        setShowAssistanceInput(false);
        onTaskAction?.('assist', task.id);
        // Keep drawer open to show locked state
      }
    } catch (error) {
      // Rollback
      updateTask(task.id, {
        status: 'IN_PROGRESS',
        assistanceNotes: undefined,
        assistanceRequestedAt: undefined,
      });
      setToast({ message: 'Failed to request assistance. Please try again.', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompleteTask = async () => {
    if (!disposition.trim()) {
      setToast({ message: 'Please select a disposition', type: 'error' });
      return;
    }

    setIsProcessing(true);
    try {
      // Optimistic update
      updateTask(task.id, {
        status: 'COMPLETED',
        endTime: new Date().toISOString(),
        disposition,
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

      // Call API
      const response = await fetch(`/api/agent/tasks/${task.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: agentEmail,
          disposition,
          sfCaseNumber: sfCaseNumber || undefined,
          dispositionNote: dispositionNote || undefined,
        }),
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
        setToast({ message: 'Task completed successfully', type: 'success' });
        onTaskAction?.('complete', task.id);
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
              <div className="text-xs text-white/50">Task ID: {task.id}</div>
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

          {/* Task Content */}
          <div className="space-y-4">
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
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-4 border-t border-white/10 sticky bottom-0 bg-neutral-900 pb-2">
            {!isStarted && !isCompleted && (
              <button
                onClick={handleStartTask}
                disabled={isProcessing}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {isProcessing ? 'Starting...' : 'Start Task'}
              </button>
            )}

            {isStarted && !isLocked && !isCompleted && (
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

            {isStarted && !isLocked && !isCompleted && (
              <div className="space-y-2">
                <select
                  value={disposition}
                  onChange={(e) => setDisposition(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm"
                >
                  <option value="">Select disposition...</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Unable to Resolve">Unable to Resolve</option>
                  <option value="Duplicate">Duplicate</option>
                  <option value="In Communication">In Communication</option>
                </select>

                {task.taskType === 'YOTPO' && (
                  <input
                    type="text"
                    value={sfCaseNumber}
                    onChange={(e) => setSfCaseNumber(e.target.value)}
                    placeholder="SF Case #"
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder-white/40"
                  />
                )}

                <textarea
                  value={dispositionNote}
                  onChange={(e) => setDispositionNote(e.target.value)}
                  placeholder="Disposition notes (optional)"
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder-white/40"
                  rows={2}
                />

                <button
                  onClick={handleCompleteTask}
                  disabled={isProcessing || !disposition.trim()}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {isProcessing ? 'Completing...' : 'Complete Task'}
                </button>
              </div>
            )}

            {isCompleted && (
              <div className="text-center text-white/60 text-sm">
                Task completed: {task.disposition}
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
