"use client";

import { Task } from '@/stores/useTaskStore';
import { useMemo } from 'react';

interface KanbanCardProps {
  task: Task;
  onClick: () => void;
  isReadOnly?: boolean;
}

export default function KanbanCard({ task, onClick, isReadOnly = false }: KanbanCardProps) {
  const isStarted = !!task.startTime;
  const isAssistanceRequired = task.status === 'ASSISTANCE_REQUIRED';
  const isResolved = task.status === 'RESOLVED';
  // To Do = PENDING OR IN_PROGRESS without startTime
  const isInToDo = task.status === 'PENDING' || (task.status === 'IN_PROGRESS' && !task.startTime);

  // Determine card styling based on status
  const cardStyle = useMemo(() => {
    if (isResolved) {
      return 'bg-green-900/10 border-green-500/30'; // Green tint for resolved
    } else if (isAssistanceRequired) {
      return 'bg-red-900/10 border-red-500/30'; // Red tint for blocked
    }
    return 'bg-white/5 border-white/10'; // Default
  }, [isAssistanceRequired, isResolved]);

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

  // Format time
  const formatTime = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg border cursor-pointer transition-all hover:bg-white/10 ${cardStyle}`}
    >
      {/* Task Type & Brand */}
      <div className="flex items-center gap-2 mb-2">
        <span className={taskTypeInfo.color}>{taskTypeInfo.emoji}</span>
        <span className="text-xs text-white/70">{taskTypeInfo.label}</span>
        <span className="text-white/40">•</span>
        <span className="text-xs text-white/90 font-medium">{task.brand}</span>
      </div>

      {/* Blurred Content for To Do */}
      {isInToDo && !isStarted ? (
        <div className="space-y-2">
          <div className="text-xs text-white/50">Task ID: {task.id.substring(0, 8)}...</div>
          <div className="text-xs text-white/50">Created: {formatTime(task.createdAt)}</div>
          <div className="relative">
            <div className="blur-sm text-xs text-white/60">
              {task.text || 'Task content'}
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs text-white/40 bg-white/10 px-2 py-1 rounded">
                🔒 Locked until started
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Task Content */}
          <div className="text-sm text-white/90 line-clamp-2">
            {task.text || 'No description'}
          </div>

          {/* Customer Info (if available) */}
          {task.customerName && (
            <div className="text-xs text-white/60">
              👤 {task.customerName}
            </div>
          )}

          {/* Phone (if available and started) */}
          {isStarted && task.phone && (
            <div className="text-xs text-white/60">
              📞 {task.phone}
            </div>
          )}

          {/* Status Indicators */}
          {isAssistanceRequired && (
            <div className="text-xs text-red-300 bg-red-900/20 px-2 py-1 rounded">
              ⏸️ Waiting on manager
            </div>
          )}

          {isResolved && (
            <div className="text-xs text-green-300 bg-green-900/20 px-2 py-1 rounded">
              ✅ Manager responded
            </div>
          )}

          {/* Timestamps */}
          {isStarted && task.startTime && (
            <div className="text-xs text-white/50">
              Started: {formatTime(task.startTime)}
            </div>
          )}

          {task.status === 'COMPLETED' && task.endTime && (
            <div className="text-xs text-white/50">
              Completed: {formatTime(task.endTime)}
            </div>
          )}
        </div>
      )}

      {/* Disposition Badge (if completed) */}
      {task.status === 'COMPLETED' && task.disposition && (
        <div className="mt-2">
          <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded">
            {task.disposition}
          </span>
        </div>
      )}
    </div>
  );
}
