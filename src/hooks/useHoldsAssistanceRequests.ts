import { useState, useEffect, useRef } from 'react';
import { fetchManagerAssistance } from '@/lib/manager-assistance-fetch';

interface AssistanceRequest {
  id: string;
  status: string;
  taskType: string;
  [key: string]: any;
}

interface UseHoldsAssistanceRequestsReturn {
  assistanceRequests: AssistanceRequest[];
  pendingCount: number;
  showNotification: boolean;
  newAssistanceCount: number;
  setShowNotification: (show: boolean) => void;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing Holds assistance requests (isolated from other task types).
 * Handles fetching, state management, and new request detection for Holds only.
 */
export function useHoldsAssistanceRequests(): UseHoldsAssistanceRequestsReturn {
  const [assistanceRequests, setAssistanceRequests] = useState<AssistanceRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [showNotification, setShowNotification] = useState(false);
  const [newAssistanceCount, setNewAssistanceCount] = useState(0);
  
  // Track previous pending count to detect new requests
  const previousPendingCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);

  const fetchAssistanceRequests = async (options?: { bypassCache?: boolean }) => {
    try {
      console.log("🔍 [Holds Assistance] Fetching assistance requests...");
      const { ok, data } = await fetchManagerAssistance({
        bypassCache: options?.bypassCache,
      });

      if (!ok || !data || data.success !== true) {
        if (options?.bypassCache) {
          console.warn(
            "🔍 [Holds Assistance] API error or unusable payload; keeping existing list state",
          );
        }
        return;
      }

      const rows = (data.requests ?? []) as AssistanceRequest[];

      // Filter for HOLDS tasks only
      const holdsRequests = rows.filter(
        (req: AssistanceRequest) => req.taskType === 'HOLDS',
      );

      // Count pending requests (status === 'ASSISTANCE_REQUIRED')
      const pendingRequests = holdsRequests.filter(
        (req: AssistanceRequest) => req.status === 'ASSISTANCE_REQUIRED',
      );
      const newPendingCount = pendingRequests.length;

      console.log("🔍 [Holds Assistance] Total requests:", holdsRequests.length);
      console.log("🔍 [Holds Assistance] Pending count:", newPendingCount);
      console.log(
        "🔍 [Holds Assistance] Previous pending count:",
        previousPendingCountRef.current,
      );

      // Detect new requests
      if (!isInitialLoadRef.current) {
        if (newPendingCount > previousPendingCountRef.current) {
          const newCount = newPendingCount - previousPendingCountRef.current;
          console.log("🔍 [Holds Assistance] New assistance requests detected:", newCount);
          setNewAssistanceCount(newCount);
          setShowNotification(true);

          setTimeout(() => {
            setShowNotification(false);
          }, 8000);
        } else if (newPendingCount === 0 && previousPendingCountRef.current > 0) {
          setShowNotification(false);
          setNewAssistanceCount(0);
        }
      } else {
        if (newPendingCount > 0) {
          console.log(
            "🔍 [Holds Assistance] Initial load: Found pending requests:",
            newPendingCount,
          );
          setNewAssistanceCount(newPendingCount);
          setShowNotification(true);

          setTimeout(() => {
            setShowNotification(false);
          }, 8000);
        }
        isInitialLoadRef.current = false;
      }

      setAssistanceRequests(holdsRequests);
      setPendingCount(newPendingCount);
      previousPendingCountRef.current = newPendingCount;
    } catch (error) {
      console.error("🔍 [Holds Assistance] Error fetching assistance requests:", error);
    }
  };

  // Initial fetch and setup polling
  useEffect(() => {
    fetchAssistanceRequests();
    
    // Poll every 30 seconds for new requests
    const interval = setInterval(fetchAssistanceRequests, 30000);
    
    return () => clearInterval(interval);
  }, []);

  return {
    assistanceRequests,
    pendingCount,
    showNotification,
    newAssistanceCount,
    setShowNotification,
    refresh: () => fetchAssistanceRequests({ bypassCache: true }),
  };
}

