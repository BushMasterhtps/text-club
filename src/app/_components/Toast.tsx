'use client';

import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'info' | 'warning' | 'error';
  duration?: number;
  onClose: () => void;
}

/**
 * Toast notification component matching the project's UI style
 * Used for manager response notifications and other alerts
 */
export function Toast({ message, type = 'success', duration = 5000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    setIsAnimating(true);
    setTimeout(() => setIsVisible(true), 10);

    // Auto-dismiss after duration
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => {
        setIsAnimating(false);
        onClose();
      }, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!isAnimating) return null;

  const typeStyles = {
    success: {
      bg: 'bg-gradient-to-br from-green-600 via-green-500 to-emerald-500',
      border: 'border-green-400/50',
      shadow: 'shadow-green-500/50',
      icon: '✅'
    },
    info: {
      bg: 'bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500',
      border: 'border-blue-400/50',
      shadow: 'shadow-blue-500/50',
      icon: '💬'
    },
    warning: {
      bg: 'bg-gradient-to-br from-amber-600 via-amber-500 to-orange-500',
      border: 'border-amber-400/50',
      shadow: 'shadow-amber-500/50',
      icon: '⚠️'
    },
    error: {
      bg: 'bg-gradient-to-br from-red-600 via-red-500 to-rose-500',
      border: 'border-red-400/50',
      shadow: 'shadow-red-500/50',
      icon: '❌'
    }
  };

  const styles = typeStyles[type];

  return (
    <div
      className={`
        fixed top-24 right-6 z-[100] min-w-[320px] max-w-[400px]
        transition-all duration-300 ease-out
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
    >
      <div
        className={`relative ${styles.bg} backdrop-blur-md ${styles.border} border rounded-xl shadow-2xl ${styles.shadow} overflow-hidden`}
      >
        {/* Animated background pulse */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
        
        {/* Glow effect */}
        <div className={`absolute -inset-1 ${styles.bg} rounded-xl blur opacity-75 animate-pulse`} />
        
        <div className="relative p-4 flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0">
            <div className="relative">
              <div className={`absolute inset-0 ${styles.border.replace('/50', '/30')} rounded-full animate-ping opacity-75`} />
              <div className="relative bg-white/20 backdrop-blur-sm rounded-full p-2 border-2 border-white/30">
                <span className="text-xl">{styles.icon}</span>
              </div>
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm leading-relaxed">
              {message}
            </p>
          </div>
          
          {/* Close button */}
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(() => {
                setIsAnimating(false);
                onClose();
              }, 300);
            }}
            className="flex-shrink-0 text-white/70 hover:text-white hover:bg-white/20 rounded-lg p-1 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
            aria-label="Dismiss notification"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

