"use client";

import { useState } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortableHeaderProps {
  children: React.ReactNode;
  sortKey: string;
  currentSort: { key: string; direction: SortDirection } | null;
  onSort: (key: string, direction: SortDirection) => void;
  className?: string;
}

export default function SortableHeader({ 
  children, 
  sortKey, 
  currentSort, 
  onSort, 
  className = "" 
}: SortableHeaderProps) {
  const isActive = currentSort?.key === sortKey;
  const direction = isActive ? currentSort.direction : null;

  const handleClick = () => {
    let newDirection: SortDirection;
    
    if (!isActive) {
      newDirection = 'asc';
    } else if (direction === 'asc') {
      newDirection = 'desc';
    } else if (direction === 'desc') {
      newDirection = null;
    } else {
      newDirection = 'asc';
    }
    
    onSort(sortKey, newDirection);
  };

  const getSortIcon = () => {
    if (!isActive) {
      return <span className="text-white/30">↕</span>;
    }
    
    switch (direction) {
      case 'asc':
        return <span className="text-white/70">↑</span>;
      case 'desc':
        return <span className="text-white/70">↓</span>;
      default:
        return <span className="text-white/30">↕</span>;
    }
  };

  return (
    <th 
      className={`px-3 py-2 text-left text-white/60 cursor-pointer hover:text-white/80 hover:bg-white/5 transition-colors select-none ${className}`}
      onClick={handleClick}
      title={`Click to sort by ${children}`}
    >
      <div className="flex items-center gap-1">
        <span>{children}</span>
        {getSortIcon()}
      </div>
    </th>
  );
}
