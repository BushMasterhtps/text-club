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
  onStatsUpdate?: () => Promise<void>; // Callback to refresh stats after completion
}

export default function KanbanBoard({ 
  selectedTaskType, 
  selectedDate, 
  agentEmail,
  onStartTask,
  onCompleteTask,
  onRequestAssistance,
  isTestMode = false,
  onStatsUpdate,
}: KanbanBoardProps) {
  const { tasks, getTasksByStatus, sortOrder, mergeTasks } = useTaskStore();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  // Fetch completed tasks for the selected date and add them to the store
  // This is necessary because the main tasks API doesn't return COMPLETED tasks
  useEffect(() => {
    if (!agentEmail || isTestMode) return;
    
    const fetchCompletedTasks = async () => {
      try {
        // Parse selectedDate (YYYY-MM-DD) and check if it's today
        const [year, month, day] = selectedDate.split('-').map(Number);
        const selectedDateObj = new Date(year, month - 1, day);
        const today = new Date();
        const isToday = selectedDateObj.getFullYear() === today.getFullYear() &&
                       selectedDateObj.getMonth() === today.getMonth() &&
                       selectedDateObj.getDate() === today.getDate();
        
        // Fetch completed tasks for the selected date
        const response = await fetch(`/api/agent/completed-today?email=${encodeURIComponent(agentEmail)}&date=${selectedDate}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.tasks) {
            // Transform tasks to match Task interface and add to store
            const completedTasks: Task[] = data.tasks.map((task: any) => ({
              id: task.id,
              brand: task.brand || 'Unknown',
              phone: task.phone || '',
              text: task.text || '',
              status: 'COMPLETED' as const,
              assignedToId: task.assignedToId || '',
              startTime: task.startTime || undefined,
              endTime: task.endTime || undefined,
              durationSec: task.durationSec || undefined,
              disposition: task.disposition || undefined,
              createdAt: task.createdAt || new Date().toISOString(),
              updatedAt: task.updatedAt || new Date().toISOString(),
              taskType: task.taskType || undefined,
            }));
            
            // Merge completed tasks into store (they won't be overwritten by polling)
            mergeTasks(completedTasks);
            
            // Verify they're actually in the store after merge
            const storeAfter = useTaskStore.getState().tasks;
            const completedInStore = Array.from(storeAfter.values()).filter(t => t.status === 'COMPLETED');
            
            console.log('✅ Loaded completed tasks:', {
              fetched: completedTasks.length,
              inStore: completedInStore.length,
              date: selectedDate,
              taskIds: completedTasks.map(t => t.id),
              storeIds: completedInStore.map(t => t.id)
            });
            
            if (completedTasks.length > completedInStore.length) {
              console.error('🚨 WARNING: Not all completed tasks made it into store!', {
                expected: completedTasks.length,
                actual: completedInStore.length
              });
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch completed tasks:', error);
      }
    };
    
    fetchCompletedTasks();
    
    // Refresh completed tasks when date changes
    const interval = setInterval(fetchCompletedTasks, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [agentEmail, selectedDate, isTestMode, mergeTasks]);

  // Get tasks for each column
  // To Do: PENDING tasks OR IN_PROGRESS tasks without startTime (assigned but not started)
  const toDoTasks = useMemo(() => {
    const allTasks = useTaskStore.getState().tasks;
    let filtered = Array.from(allTasks.values()).filter(task => {
      // PENDING = To Do
      if (task.status === 'PENDING') return true;
      // IN_PROGRESS without startTime = To Do (assigned but not started)
      if (task.status === 'IN_PROGRESS' && !task.startTime) return true;
      return false;
    });
    
    if (selectedTaskType !== 'ALL') {
      filtered = filtered.filter(t => t.taskType === selectedTaskType);
    }
    
    // Sort by createdAt
    return filtered.sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return sortOrder === 'asc' ? aTime - bTime : bTime - aTime;
    });
  }, [tasks, selectedTaskType, sortOrder]);

  // In Progress: IN_PROGRESS tasks WITH startTime (agent clicked Start)
  const inProgressTasks = useMemo(() => {
    const allTasks = useTaskStore.getState().tasks;
    let filtered = Array.from(allTasks.values()).filter(task => {
      // IN_PROGRESS with startTime = In Progress (agent clicked Start)
      return task.status === 'IN_PROGRESS' && !!task.startTime;
    });
    
    if (selectedTaskType !== 'ALL') {
      filtered = filtered.filter(t => t.taskType === selectedTaskType);
    }
    
    // Sort by startTime
    return filtered.sort((a, b) => {
      const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
      const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
      return sortOrder === 'asc' ? aTime - bTime : bTime - aTime;
    });
  }, [tasks, selectedTaskType, sortOrder]);

  const assistanceTasks = useMemo(() => {
    // Includes both ASSISTANCE_REQUIRED and RESOLVED
    let tasks = getTasksByStatus('ASSISTANCE_REQUIRED');
    if (selectedTaskType !== 'ALL') {
      tasks = tasks.filter(t => t.taskType === selectedTaskType);
    }
    return tasks;
  }, [tasks, getTasksByStatus, selectedTaskType]);

  const completedTasks = useMemo(() => {
    // Get all completed tasks from store
    const allCompleted = getTasksByStatus('COMPLETED');
    
    // Filter by selected date (format: YYYY-MM-DD)
    const targetDateStr = selectedDate; // Already in YYYY-MM-DD format

    let tasks = allCompleted.filter(task => {
      if (!task.endTime) {
        console.log('⚠️ Completed task missing endTime:', task.id, task.status);
        return false;
      }
      
      // Parse endTime - handle both ISO string and Date object
      const endDate = new Date(task.endTime);
      
      // Extract date part in YYYY-MM-DD format
      // Use local date (not UTC) to match user's timezone
      const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
      
      const matches = endDateStr === targetDateStr;
      
      if (!matches) {
        console.log('📅 Date filter:', {
          taskId: task.id,
          endTime: task.endTime,
          endDateStr,
          targetDateStr,
          matches
        });
      }
      
      return matches;
    });

    if (selectedTaskType !== 'ALL') {
      tasks = tasks.filter(t => t.taskType === selectedTaskType);
    }
    
    console.log('✅ Completed tasks:', {
      allCompleted: allCompleted.length,
      filtered: tasks.length,
      selectedDate: targetDateStr,
      taskIds: tasks.map(t => ({ id: t.id, endTime: t.endTime }))
    });
    
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
          onStatsUpdate={onStatsUpdate}
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
