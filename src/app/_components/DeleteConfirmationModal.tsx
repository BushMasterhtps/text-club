"use client";

import React from 'react';
import { SmallButton } from './SmallButton';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  taskCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  taskDetails?: Array<{ id: string; taskType: string; status: string }>;
}

export function DeleteConfirmationModal({
  isOpen,
  taskCount,
  onConfirm,
  onCancel,
  taskDetails,
}: DeleteConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4 overflow-y-auto">
      <div className="bg-neutral-900 rounded-lg p-6 max-w-2xl w-full border border-red-500/30 shadow-xl my-auto">
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-white mb-2">
            ⚠️ Confirm Task Deletion
          </h3>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
            <p className="text-white font-medium mb-2">
              You are about to delete {taskCount} task{taskCount !== 1 ? 's' : ''} from the database.
            </p>
            <p className="text-red-300 text-sm">
              ⚠️ <strong>Warning:</strong> Once deleted, these tasks cannot be recovered. This action is permanent.
            </p>
          </div>
          
          {taskDetails && taskDetails.length > 0 && (
            <div className="bg-white/5 rounded-lg p-3 mb-4 max-h-48 overflow-y-auto">
              <p className="text-white/80 text-sm font-medium mb-2">Tasks to be deleted:</p>
              <div className="space-y-1">
                {taskDetails.slice(0, 10).map((task) => (
                  <div key={task.id} className="text-xs text-white/60 flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                    <span>{task.taskType}</span>
                    <span className="text-white/40">•</span>
                    <span>{task.status}</span>
                  </div>
                ))}
                {taskDetails.length > 10 && (
                  <div className="text-xs text-white/40 italic">
                    ... and {taskDetails.length - 10} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3">
          <SmallButton
            onClick={onCancel}
            className="bg-white/10 hover:bg-white/20"
          >
            Cancel
          </SmallButton>
          <SmallButton
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            I Agree - Delete Tasks
          </SmallButton>
        </div>
      </div>
    </div>
  );
}

