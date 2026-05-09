'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fetchManagerAssistance } from '@/lib/manager-assistance-fetch';

const DEBUG = process.env.NEXT_PUBLIC_DEBUG_PERFORMANCE === 'true';

/** Row shape from GET /api/manager/assistance (loose for cross-task-type fields). */
export type ManagerAssistanceRow = Record<string, unknown> & {
  id: string;
  status?: string;
  taskType?: string;
};

function isNonHoldsCrossVisible(req: ManagerAssistanceRow): boolean {
  const t = req.taskType;
  return (
    t !== 'HOLDS' &&
    (t === 'TEXT_CLUB' ||
      t === 'WOD_IVCS' ||
      t === 'EMAIL_REQUESTS' ||
      t === 'YOTPO' ||
      t === 'STANDALONE_REFUNDS')
  );
}

function countPending(
  rows: ManagerAssistanceRow[],
  predicate: (r: ManagerAssistanceRow) => boolean,
): number {
  return rows.filter((r) => predicate(r) && r.status === 'ASSISTANCE_REQUIRED').length;
}

export interface AssistanceRequestsContextValue {
  requests: ManagerAssistanceRow[];
  nonHoldsPendingCount: number;
  holdsPendingCount: number;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastUpdated: number | null;
  refresh: (options?: { bypassCache?: boolean }) => Promise<void>;
  showNotification: boolean;
  newAssistanceCount: number;
  setShowNotification: (show: boolean) => void;
  showHoldsNotification: boolean;
  newHoldsAssistanceCount: number;
  setShowHoldsNotification: (show: boolean) => void;
}

const AssistanceRequestsContext = createContext<AssistanceRequestsContextValue | undefined>(undefined);

export function AssistanceRequestsProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<ManagerAssistanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const [showNotification, setShowNotification] = useState(false);
  const [newAssistanceCount, setNewAssistanceCount] = useState(0);
  const previousNonHoldsPendingRef = useRef(0);
  const isInitialNonHoldsLoadRef = useRef(true);

  const [showHoldsNotification, setShowHoldsNotification] = useState(false);
  const [newHoldsAssistanceCount, setNewHoldsAssistanceCount] = useState(0);
  const previousHoldsPendingRef = useRef(0);
  const isInitialHoldsLoadRef = useRef(true);

  const refresh = useCallback(async (options?: { bypassCache?: boolean }) => {
    setRefreshing(true);
    try {
      if (DEBUG) {
        console.log(
          '[manager-assistance-context]',
          options?.bypassCache ? 'fetch (bypass cache)' : 'fetch',
        );
      }
      const { ok, data } = await fetchManagerAssistance({ bypassCache: options?.bypassCache });
      if (ok && data?.success === true && Array.isArray(data.requests)) {
        setRequests(data.requests as ManagerAssistanceRow[]);
        setError(null);
        setLastUpdated(Date.now());
      } else {
        if (options?.bypassCache) {
          setError('Unable to refresh assistance requests.');
        }
        if (DEBUG && options?.bypassCache) {
          console.warn('[manager-assistance-context] unusable payload after bypass refresh');
        }
      }
    } catch (e) {
      if (options?.bypassCache) {
        setError('Unable to refresh assistance requests.');
      }
      if (DEBUG) console.error('[manager-assistance-context]', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const nonHoldsPendingCount = useMemo(
    () => countPending(requests, isNonHoldsCrossVisible),
    [requests],
  );

  const holdsPendingCount = useMemo(
    () => countPending(requests, (r) => r.taskType === 'HOLDS'),
    [requests],
  );

  useEffect(() => {
    const newPendingCount = nonHoldsPendingCount;
    if (!isInitialNonHoldsLoadRef.current) {
      if (newPendingCount > previousNonHoldsPendingRef.current) {
        const newCount = newPendingCount - previousNonHoldsPendingRef.current;
        setNewAssistanceCount(newCount);
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 8000);
      } else if (newPendingCount === 0 && previousNonHoldsPendingRef.current > 0) {
        setShowNotification(false);
        setNewAssistanceCount(0);
      }
    } else {
      if (newPendingCount > 0) {
        setNewAssistanceCount(newPendingCount);
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 8000);
      }
      isInitialNonHoldsLoadRef.current = false;
    }
    previousNonHoldsPendingRef.current = newPendingCount;
  }, [nonHoldsPendingCount]);

  useEffect(() => {
    const newPendingCount = holdsPendingCount;
    if (!isInitialHoldsLoadRef.current) {
      if (newPendingCount > previousHoldsPendingRef.current) {
        const newCount = newPendingCount - previousHoldsPendingRef.current;
        setNewHoldsAssistanceCount(newCount);
        setShowHoldsNotification(true);
        setTimeout(() => setShowHoldsNotification(false), 8000);
      } else if (newPendingCount === 0 && previousHoldsPendingRef.current > 0) {
        setShowHoldsNotification(false);
        setNewHoldsAssistanceCount(0);
      }
    } else {
      if (newPendingCount > 0) {
        setNewHoldsAssistanceCount(newPendingCount);
        setShowHoldsNotification(true);
        setTimeout(() => setShowHoldsNotification(false), 8000);
      }
      isInitialHoldsLoadRef.current = false;
    }
    previousHoldsPendingRef.current = newPendingCount;
  }, [holdsPendingCount]);

  useEffect(() => {
    /** Defer refresh so this effect does not synchronously chain into setState (react-hooks/set-state-in-effect). */
    const scheduleRefresh = (options?: { bypassCache?: boolean }) => {
      queueMicrotask(() => {
        void refresh(options);
      });
    };

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      scheduleRefresh();
    };

    scheduleRefresh();

    const interval = setInterval(tick, 30000);

    const onVisibilityChange = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      scheduleRefresh({ bypassCache: true });
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refresh]);

  const value = useMemo<AssistanceRequestsContextValue>(
    () => ({
      requests,
      nonHoldsPendingCount,
      holdsPendingCount,
      loading,
      refreshing,
      error,
      lastUpdated,
      refresh,
      showNotification,
      newAssistanceCount,
      setShowNotification,
      showHoldsNotification,
      newHoldsAssistanceCount,
      setShowHoldsNotification,
    }),
    [
      requests,
      nonHoldsPendingCount,
      holdsPendingCount,
      loading,
      refreshing,
      error,
      lastUpdated,
      refresh,
      showNotification,
      newAssistanceCount,
      showHoldsNotification,
      newHoldsAssistanceCount,
    ],
  );

  return (
    <AssistanceRequestsContext.Provider value={value}>{children}</AssistanceRequestsContext.Provider>
  );
}

export function useAssistanceRequestsContext() {
  return useContext(AssistanceRequestsContext);
}
