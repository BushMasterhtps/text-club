import { create } from 'zustand';

// Task interface matching agent page
export interface Task {
  id: string;
  brand: string;
  phone: string;
  text: string;
  status: "PENDING" | "IN_PROGRESS" | "ASSISTANCE_REQUIRED" | "RESOLVED" | "COMPLETED";
  assignedToId: string;
  startTime?: string;
  endTime?: string;
  durationSec?: number;
  disposition?: string;
  assistanceNotes?: string;
  managerResponse?: string;
  assistanceRequestedAt?: string; // Added for assistance ordering
  createdAt: string;
  updatedAt: string;
  taskType?: string;
  // All other task type specific fields...
  [key: string]: any; // Allow additional fields
}

interface TaskStore {
  // Normalized task map keyed by taskId
  tasks: Map<string, Task>;
  
  // Sort order preference
  sortOrder: 'asc' | 'desc';
  setSortOrder: (order: 'asc' | 'desc') => void;
  
  // Actions
  setTasks: (tasks: Task[]) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  mergeTasks: (newTasks: Task[]) => void; // Merge without reordering
  getTasksByStatus: (status: Task['status']) => Task[];
  getTask: (taskId: string) => Task | undefined;
  clearTasks: () => void;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: new Map(),
  sortOrder: 'asc',
  
  setSortOrder: (order) => {
    set({ sortOrder: order });
  },

  setTasks: (tasks) => {
    const taskMap = new Map<string, Task>();
    tasks.forEach(task => {
      taskMap.set(task.id, task);
    });
    set({ tasks: taskMap });
  },

  updateTask: (taskId, updates) => {
    const { tasks } = get();
    const task = tasks.get(taskId);
    if (task) {
      const updated = { ...task, ...updates };
      const newMap = new Map(tasks);
      newMap.set(taskId, updated);
      set({ tasks: newMap });
    }
  },

  mergeTasks: (newTasks) => {
    const { tasks } = get();
    const newMap = new Map(tasks);
    
    // Get list of new task IDs to know what to keep
    const newTaskIds = new Set(newTasks.map(t => t.id));
    
    // Check if this is a "completed tasks only" merge (all tasks are COMPLETED)
    // vs a "main tasks" merge (active tasks from polling)
    const isCompletedOnlyMerge = newTasks.length > 0 && newTasks.every(t => t.status === 'COMPLETED');
    
    // Merge new tasks into existing map
    // Only update fields that changed, preserve position
    newTasks.forEach(newTask => {
      const existing = newMap.get(newTask.id);
      if (existing) {
        // CRITICAL: Don't overwrite COMPLETED tasks with data from API
        // API doesn't return COMPLETED tasks, so preserve them as-is
        if (existing.status === 'COMPLETED' && !isCompletedOnlyMerge) {
          // Keep existing COMPLETED task unchanged (don't overwrite with API data from polling)
          return;
        }
        
        // Merge: update fields but preserve position/ordering
        // Only update if status hasn't changed (status change = column move)
        if (existing.status === newTask.status) {
          // Same column: merge fields without changing position
          newMap.set(newTask.id, { ...existing, ...newTask });
        } else {
          // Status changed: full update (will move to new column)
          newMap.set(newTask.id, newTask);
        }
      } else {
        // New task: add it
        newMap.set(newTask.id, newTask);
      }
    });
    
    // Remove tasks that are no longer in the fetched list
    // BUT: 
    // 1. Keep COMPLETED and RESOLVED tasks (they may not be in API response but should stay in store)
    // 2. If this is a completed-only merge, DON'T remove active tasks (they're not in the completed fetch)
    if (!isCompletedOnlyMerge) {
      // Only clean up if this is a main tasks merge (from polling)
      newMap.forEach((task, id) => {
        if (!newTaskIds.has(id) && task.status !== 'COMPLETED' && task.status !== 'RESOLVED') {
          newMap.delete(id);
        }
      });
    }
    // If it's a completed-only merge, we don't remove anything - just add/update completed tasks
    
    set({ tasks: newMap });
  },

  getTasksByStatus: (status) => {
    const { tasks, sortOrder } = get();
    const filtered = Array.from(tasks.values()).filter(task => {
      // Handle RESOLVED status - show in Assistance Request column
      if (status === 'ASSISTANCE_REQUIRED') {
        return task.status === 'ASSISTANCE_REQUIRED' || task.status === 'RESOLVED';
      }
      return task.status === status;
    });
    
    const sorted = filtered.sort((a, b) => {
      let aTime = 0;
      let bTime = 0;
      
      // Stable ordering based on status
      if (status === 'PENDING' || (status === 'ASSISTANCE_REQUIRED' && a.status === 'PENDING')) {
        aTime = new Date(a.createdAt).getTime();
        bTime = new Date(b.createdAt).getTime();
      } else if (status === 'IN_PROGRESS') {
        aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
        bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
      } else if (status === 'ASSISTANCE_REQUIRED') {
        // For assistance: sort by assistanceRequestedAt, then by resolvedAt for RESOLVED
        if (a.status === 'RESOLVED' && b.status === 'RESOLVED') {
          // Both resolved: sort by resolution time (manager response)
          aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        } else if (a.status === 'RESOLVED') {
          // Resolved tasks come after pending assistance
          return 1;
        } else if (b.status === 'RESOLVED') {
          return -1;
        } else {
          // Both pending assistance: sort by assistanceRequestedAt
          aTime = a.assistanceRequestedAt ? new Date(a.assistanceRequestedAt).getTime() : 0;
          bTime = b.assistanceRequestedAt ? new Date(b.assistanceRequestedAt).getTime() : 0;
        }
      } else if (status === 'COMPLETED') {
        aTime = a.endTime ? new Date(a.endTime).getTime() : 0;
        bTime = b.endTime ? new Date(b.endTime).getTime() : 0;
      }
      
      const diff = aTime - bTime;
      return sortOrder === 'asc' ? diff : -diff;
    });
    
    return sorted;
  },

  getTask: (taskId) => {
    const { tasks } = get();
    return tasks.get(taskId);
  },

  clearTasks: () => {
    set({ tasks: new Map() });
  },
}));
