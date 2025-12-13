import { useState, useRef, useCallback } from 'react';

/**
 * Custom hook for handling shift+click range selection
 * 
 * @param items Array of items with unique IDs
 * @param getItemId Function to extract ID from an item
 * @returns Object with selection state and handlers
 */
export function useRangeSelection<T>(
  items: T[],
  getItemId: (item: T) => string
) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastSelectedIndex = useRef<number | null>(null);

  const toggleSelection = useCallback((itemId: string, index: number, event?: React.MouseEvent) => {
    setSelected((prevSelected) => {
      const newSelected = new Set(prevSelected);
      
      // If shift is held and we have a previous selection
      if (event?.shiftKey && lastSelectedIndex.current !== null) {
        const start = Math.min(lastSelectedIndex.current, index);
        const end = Math.max(lastSelectedIndex.current, index);
        
        // Determine if we should select or deselect the range
        // If the clicked item is already selected, we'll deselect the range
        // Otherwise, we'll select the range
        const clickedItemSelected = prevSelected.has(itemId);
        
        // Select/deselect all items in the range
        for (let i = start; i <= end; i++) {
          const id = getItemId(items[i]);
          if (clickedItemSelected) {
            newSelected.delete(id);
          } else {
            newSelected.add(id);
          }
        }
      } else {
        // Normal click - toggle single item
        if (newSelected.has(itemId)) {
          newSelected.delete(itemId);
        } else {
          newSelected.add(itemId);
        }
      }
      
      // Update last selected index
      lastSelectedIndex.current = index;
      
      return newSelected;
    });
  }, [items, getItemId]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    lastSelectedIndex.current = null;
  }, []);

  const selectAll = useCallback(() => {
    const allIds = new Set(items.map(getItemId));
    setSelected(allIds);
    if (items.length > 0) {
      lastSelectedIndex.current = items.length - 1;
    }
  }, [items, getItemId]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
    lastSelectedIndex.current = null;
  }, []);

  const isSelected = useCallback((itemId: string) => {
    return selected.has(itemId);
  }, [selected]);

  const selectedCount = selected.size;

  return {
    selected,
    selectedCount,
    toggleSelection,
    clearSelection,
    selectAll,
    deselectAll,
    isSelected,
    setSelected, // Allow external control if needed
  };
}

