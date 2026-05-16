import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAutoLogoutOptions {
  timeoutMinutes?: number;
  warningMinutes?: number;
  onLogout?: () => void;
}

/** Clamp warning window so it never exceeds total session length. */
export function resolveAutoLogoutTiming(timeoutMinutes: number, warningMinutes: number) {
  const totalSeconds = Math.max(1, Math.round(timeoutMinutes * 60));
  const requestedWarningSeconds = Math.max(0, Math.round(warningMinutes * 60));
  const warningSeconds = Math.min(requestedWarningSeconds, Math.max(0, totalSeconds - 1));
  return { totalSeconds, warningSeconds };
}

export function useAutoLogout({
  timeoutMinutes = 120,
  warningMinutes = 5,
  onLogout,
}: UseAutoLogoutOptions = {}) {
  const { totalSeconds, warningSeconds } = resolveAutoLogoutTiming(
    timeoutMinutes,
    warningMinutes,
  );

  const [timeLeft, setTimeLeft] = useState(totalSeconds);
  const [showWarning, setShowWarning] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const logoutAtRef = useRef(0);
  const showWarningRef = useRef(false);
  const isActiveRef = useRef(true);
  const onLogoutRef = useRef(onLogout);
  const suppressActivityRef = useRef(false);

  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  useEffect(() => {
    showWarningRef.current = showWarning;
  }, [showWarning]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const handleLogout = useCallback(() => {
    if (!isActiveRef.current) return;
    isActiveRef.current = false;
    setIsActive(false);
    setShowWarning(false);
    showWarningRef.current = false;

    if (onLogoutRef.current) {
      onLogoutRef.current();
    } else {
      localStorage.removeItem('currentRole');
      void fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    }
  }, []);

  const handleLogoutRef = useRef(handleLogout);
  handleLogoutRef.current = handleLogout;

  const resetTimer = useCallback(() => {
    if (!isActiveRef.current) return;
    logoutAtRef.current = Date.now() + totalSeconds * 1000;
    setTimeLeft(totalSeconds);
    setShowWarning(false);
    showWarningRef.current = false;
  }, [totalSeconds]);

  const extendSession = useCallback(() => {
    suppressActivityRef.current = true;
    resetTimer();
    window.setTimeout(() => {
      suppressActivityRef.current = false;
    }, 100);
  }, [resetTimer]);

  // DOM activity resets the inactivity deadline (not while warning is open).
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => {
      if (suppressActivityRef.current || showWarningRef.current) return;
      resetTimer();
    };

    resetTimer();

    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [resetTimer]);

  // Single live countdown (runs during warning too).
  useEffect(() => {
    if (!isActive) return;

    const tick = () => {
      const remainingSec = Math.max(
        0,
        Math.ceil((logoutAtRef.current - Date.now()) / 1000),
      );
      setTimeLeft(remainingSec);

      const inWarningPhase = remainingSec > 0 && remainingSec <= warningSeconds;
      setShowWarning(inWarningPhase);
      showWarningRef.current = inWarningPhase;

      if (remainingSec <= 0) {
        handleLogoutRef.current();
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [isActive, warningSeconds]);

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  return {
    timeLeft,
    showWarning,
    isActive,
    extendSession,
    formatTime,
    resetTimer,
    timeoutMinutes,
    warningSeconds,
    totalSeconds,
  };
}
