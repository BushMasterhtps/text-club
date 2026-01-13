"use client";

import { Task } from '@/stores/useTaskStore';
import KanbanCard from './KanbanCard';

interface KanbanColumnProps {
  title: string;
  tasks: Task[];
  status: Task['status'];
  onCardClick: (taskId: string) => void;
  sortOrder: 'asc' | 'desc';
  readOnly?: boolean;
}

export default function KanbanColumn({
  title,
  tasks,
  status,
  onCardClick,
  sortOrder,
  readOnly = false,
}: KanbanColumnProps) {
  return (
    <div className="flex-shrink-0 w-80 bg-white/5 rounded-lg border border-white/10 flex flex-col" style={{ minWidth: '320px', maxWidth: '480px' }}>
      {/* Column Header */}
      <div className="sticky top-0 z-10 bg-white/5 backdrop-blur-sm border-b border-white/10 p-4 rounded-t-lg">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white text-sm">{title}</h3>
          <span className="text-xs text-white/60 bg-white/10 px-2 py-1 rounded-full">
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Column Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-white/40 text-sm">
            No tasks in this column
          </div>
        ) : (
          tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              onClick={() => onCardClick(task.id)}
              isReadOnly={readOnly}
            />
          ))
        )}
      </div>
    </div>
  );
}
