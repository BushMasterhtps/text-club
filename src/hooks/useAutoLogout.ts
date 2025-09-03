import { useEffect, useRef, useState } from 'react';

interface UseAutoLogoutOptions {
  timeoutMinutes?: number;
  warningMinutes?: number;
  onLogout?: () => void;
}

export function useAutoLogout({
  timeoutMinutes = 120, // 2 hours default
  warningMinutes = 5,   // 5 minutes warning
  onLogout
}: UseAutoLogoutOptions = {}) {
  const [timeLeft, setTimeLeft] = useState<number>(timeoutMinutes * 60); // seconds
  const [showWarning, setShowWarning] = useState(false);
  const [isActive, setIsActive] = useState(true);
  
  const timeoutRef = useRef<NodeJS.Timeout>();
  const warningTimeoutRef = useRef<NodeJS.Timeout>();
  const lastActivityRef = useRef<number>(Date.now());

  // Reset timer on user activity
  const resetTimer = () => {
    if (!isActive) return;
    
    lastActivityRef.current = Date.now();
    setTimeLeft(timeoutMinutes * 60);
    setShowWarning(false);
    
    // Clear existing timeouts
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    
    // Set warning timeout
    warningTimeoutRef.current = setTimeout(() => {
      setShowWarning(true);
    }, (timeoutMinutes - warningMinutes) * 60 * 1000);
    
    // Set logout timeout
    timeoutRef.current = setTimeout(() => {
      handleLogout();
    }, timeoutMinutes * 60 * 1000);
  };

  // Handle logout
  const handleLogout = () => {
    setIsActive(false);
    setShowWarning(false);
    
    // Clear all timeouts
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    
    // Call custom logout handler or default
    if (onLogout) {
      onLogout();
    } else {
      // Default logout behavior
      localStorage.removeItem('currentRole');
      fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    }
  };

  // Extend session (called from parent component)
  const extendSession = () => {
    resetTimer();
  };

  // Activity detection
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      resetTimer();
    };

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Initial timer setup
    resetTimer();

    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    };
  }, [timeoutMinutes, warningMinutes]);

  // Countdown timer
  useEffect(() => {
    if (!isActive || showWarning) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, showWarning]);

  // Format time for display
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  return {
    timeLeft,
    showWarning,
    isActive,
    extendSession,
    formatTime,
    resetTimer
  };
}
