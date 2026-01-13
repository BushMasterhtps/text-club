"use client";

import { useEffect, useMemo } from 'react';
import { useTaskStore, Task } from '@/stores/useTaskStore';
import KanbanColumn from './KanbanColumn';
import TaskDetailDrawer from './TaskDetailDrawer';
import { useState } from 'react';

interface KanbanBoardProps {
  selectedTaskType: string;
  selectedDate: string; // For filtering completed tasks
  agentEmail: string;
  onStartTask?: (taskId: string) => void;
  onCompleteTask?: (taskId: string, disposition: string, sfCaseNumber?: string, dispositionNote?: string) => void;
  onRequestAssistance?: (taskId: string, message: string) => void;
  isTestMode?: boolean; // Pass test mode flag to drawer
}

export default function KanbanBoard({ 
  selectedTaskType, 
  selectedDate, 
  agentEmail,
  onStartTask,
  onCompleteTask,
  onRequestAssistance,
  isTestMode = false,
}: KanbanBoardProps) {
  const { tasks, getTasksByStatus, sortOrder } = useTaskStore();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Get tasks for each column
  const toDoTasks = useMemo(() => {
    let tasks = getTasksByStatus('PENDING');
    if (selectedTaskType !== 'ALL') {
      tasks = tasks.filter(t => t.taskType === selectedTaskType);
    }
    return tasks;
  }, [tasks, getTasksByStatus, selectedTaskType]);

  const inProgressTasks = useMemo(() => {
    let tasks = getTasksByStatus('IN_PROGRESS');
    if (selectedTaskType !== 'ALL') {
      tasks = tasks.filter(t => t.taskType === selectedTaskType);
    }
    return tasks;
  }, [tasks, getTasksByStatus, selectedTaskType]);

  const assistanceTasks = useMemo(() => {
    // Includes both ASSISTANCE_REQUIRED and RESOLVED
    let tasks = getTasksByStatus('ASSISTANCE_REQUIRED');
    if (selectedTaskType !== 'ALL') {
      tasks = tasks.filter(t => t.taskType === selectedTaskType);
    }
    return tasks;
  }, [tasks, getTasksByStatus, selectedTaskType]);

  const completedTasks = useMemo(() => {
    // Filter by selected date
    const selectedDateObj = new Date(selectedDate);
    const startOfDay = new Date(selectedDateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDateObj);
    endOfDay.setHours(23, 59, 59, 999);

    let tasks = getTasksByStatus('COMPLETED').filter(task => {
      if (!task.endTime) return false;
      const completedDate = new Date(task.endTime);
      return completedDate >= startOfDay && completedDate <= endOfDay;
    });

    if (selectedTaskType !== 'ALL') {
      tasks = tasks.filter(t => t.taskType === selectedTaskType);
    }
    return tasks;
  }, [tasks, getTasksByStatus, selectedTaskType, selectedDate]);

  const handleCardClick = (taskId: string) => {
    setSelectedTaskId(taskId);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedTaskId(null);
  };

  const selectedTask = selectedTaskId ? useTaskStore.getState().getTask(selectedTaskId) : null;

  return (
    <div className="w-full h-full">
      {/* Kanban Board - Full Width */}
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 300px)' }}>
        <KanbanColumn
          title="To Do"
          tasks={toDoTasks}
          status="PENDING"
          onCardClick={handleCardClick}
          sortOrder={sortOrder}
        />
        <KanbanColumn
          title="In Progress"
          tasks={inProgressTasks}
          status="IN_PROGRESS"
          onCardClick={handleCardClick}
          sortOrder={sortOrder}
        />
        <KanbanColumn
          title="Assistance Request"
          tasks={assistanceTasks}
          status="ASSISTANCE_REQUIRED"
          onCardClick={handleCardClick}
          sortOrder={sortOrder}
        />
        <KanbanColumn
          title="Completed"
          tasks={completedTasks}
          status="COMPLETED"
          onCardClick={handleCardClick}
          sortOrder={sortOrder}
          readOnly
        />
      </div>

      {/* Task Detail Drawer */}
      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          isOpen={isDrawerOpen}
          onClose={handleCloseDrawer}
          agentEmail={agentEmail}
          isTestMode={isTestMode}
          onTaskAction={(action, taskId) => {
            // Handle task actions from drawer
            if (action === 'start' && onStartTask) {
              onStartTask(taskId);
            } else if (action === 'complete' && onCompleteTask) {
              // Complete action is handled in drawer itself
            } else if (action === 'assist' && onRequestAssistance) {
              // Assist action is handled in drawer itself
            }
          }}
        />
      )}
    </div>
  );
}
