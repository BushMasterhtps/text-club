import { useState, useEffect, useRef } from 'react';
import { fetchManagerAssistance } from '@/lib/manager-assistance-fetch';

interface AssistanceRequest {
  id: string;
  status: string;
  taskType: string;
  [key: string]: any;
}

interface UseAssistanceRequestsReturn {
  assistanceRequests: AssistanceRequest[];
  pendingCount: number;
  showNotification: boolean;
  newAssistanceCount: number;
  setShowNotification: (show: boolean) => void;
  refresh: () => Promise<void>;
}

/**
 * Unified hook for managing assistance requests across all dashboards.
 * Handles fetching, state management, and new request detection.
 */
export function useAssistanceRequests(): UseAssistanceRequestsReturn {
  const [assistanceRequests, setAssistanceRequests] = useState<AssistanceRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [showNotification, setShowNotification] = useState(false);
  const [newAssistanceCount, setNewAssistanceCount] = useState(0);
  
  // Track previous pending count to detect new requests
  const previousPendingCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);

  const fetchAssistanceRequests = async (options?: { bypassCache?: boolean }) => {
    try {
      console.log("🔍 [Assistance] Fetching assistance requests...");
      const { ok, data } = await fetchManagerAssistance({
        bypassCache: options?.bypassCache,
      });

      if (!ok || !data || data.success !== true) {
        if (options?.bypassCache) {
          console.warn("🔍 [Assistance] API error or unusable payload; keeping existing list state");
        }
        return;
      }

      const rows = (data.requests ?? []) as AssistanceRequest[];

      // Filter out HOLDS tasks - they should only appear in Holds dashboard
      const allNonHoldsRequests = rows.filter((req: AssistanceRequest) =>
        req.taskType !== 'HOLDS' &&
        (req.taskType === 'TEXT_CLUB' ||
          req.taskType === 'WOD_IVCS' ||
          req.taskType === 'EMAIL_REQUESTS' ||
          req.taskType === 'YOTPO' ||
          req.taskType === 'STANDALONE_REFUNDS'),
      );

      // Count pending requests (status === 'ASSISTANCE_REQUIRED')
      const pendingRequests = allNonHoldsRequests.filter(
        (req: AssistanceRequest) => req.status === 'ASSISTANCE_REQUIRED',
      );
      const newPendingCount = pendingRequests.length;

      console.log('🔍 [Assistance] Total requests:', allNonHoldsRequests.length);
      console.log('🔍 [Assistance] Pending count:', newPendingCount);
      console.log('🔍 [Assistance] Previous pending count:', previousPendingCountRef.current);

      // Detect new requests
      if (!isInitialLoadRef.current) {
        // Only show notification if there are new pending requests
        if (newPendingCount > previousPendingCountRef.current) {
          const newCount = newPendingCount - previousPendingCountRef.current;
          console.log('🔍 [Assistance] New assistance requests detected:', newCount);
          setNewAssistanceCount(newCount);
          setShowNotification(true);

          // Auto-hide notification after 8 seconds
          setTimeout(() => {
            setShowNotification(false);
          }, 8000);
        } else if (newPendingCount === 0 && previousPendingCountRef.current > 0) {
          // All requests resolved - hide notification
          setShowNotification(false);
          setNewAssistanceCount(0);
        }
      } else {
        // On initial load, show notification if there are any pending requests
        if (newPendingCount > 0) {
          console.log('🔍 [Assistance] Initial load: Found pending requests:', newPendingCount);
          setNewAssistanceCount(newPendingCount);
          setShowNotification(true);

          // Auto-hide notification after 8 seconds
          setTimeout(() => {
            setShowNotification(false);
          }, 8000);
        }
        isInitialLoadRef.current = false;
      }

      setAssistanceRequests(allNonHoldsRequests);
      setPendingCount(newPendingCount);
      previousPendingCountRef.current = newPendingCount;
    } catch (error) {
      console.error("🔍 [Assistance] Error fetching assistance requests:", error);
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

