import { useState, useRef, useCallback, useEffect } from 'react';

function eventHasShiftKey(
  event?: React.MouseEvent | React.ChangeEvent<HTMLInputElement>
): boolean {
  if (!event) return false;
  if ("shiftKey" in event && event.shiftKey) return true;
  const native = event.nativeEvent;
  return native instanceof MouseEvent && native.shiftKey;
}

/**
 * Custom hook for handling shift+click range selection
 *
 * @param items Array of items with unique IDs (current visible page)
 * @param getItemId Function to extract ID from an item
 * @returns Object with selection state and handlers
 */
export function useRangeSelection<T>(
  items: T[],
  getItemId: (item: T) => string
) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastSelectedIndex = useRef<number | null>(null);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const toggleSelection = useCallback(
    (
      itemId: string,
      index: number,
      event?: React.MouseEvent | React.ChangeEvent<HTMLInputElement>
    ) => {
      const shiftKey = eventHasShiftKey(event);
      const anchorIndex = lastSelectedIndex.current;
      const pageItems = itemsRef.current;

      setSelected((prevSelected) => {
        const newSelected = new Set(prevSelected);

        if (shiftKey && anchorIndex !== null) {
          const start = Math.min(anchorIndex, index);
          const end = Math.max(anchorIndex, index);
          const clickedItemSelected = prevSelected.has(itemId);

          for (let i = start; i <= end; i++) {
            const row = pageItems[i];
            if (!row) continue;
            const id = getItemId(row);
            if (clickedItemSelected) {
              newSelected.delete(id);
            } else {
              newSelected.add(id);
            }
          }
        } else {
          if (newSelected.has(itemId)) {
            newSelected.delete(itemId);
          } else {
            newSelected.add(itemId);
          }
        }

        return newSelected;
      });

      // Anchor must update synchronously (Text Club pattern); do not defer to setState flush.
      lastSelectedIndex.current = index;
    },
    [getItemId]
  );

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    lastSelectedIndex.current = null;
  }, []);

  const selectAll = useCallback(() => {
    const pageItems = itemsRef.current;
    const allIds = new Set(pageItems.map(getItemId));
    setSelected(allIds);
    if (pageItems.length > 0) {
      lastSelectedIndex.current = pageItems.length - 1;
    }
  }, [getItemId]);

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
};
