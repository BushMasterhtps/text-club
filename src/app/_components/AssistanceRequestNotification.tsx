'use client';

import { useEffect, useState } from 'react';
import { useDashboardNavigationContext } from '@/contexts/DashboardNavigationContext';

interface AssistanceRequestNotificationProps {
  show: boolean;
  count: number;
  onDismiss: () => void;
  onView: () => void;
}

/**
 * Sleek, modern assistance request notification component
 * Matches the new unified UI style with attention-grabbing design
 */
export default function AssistanceRequestNotification({
  show,
  count,
  onDismiss,
  onView,
}: AssistanceRequestNotificationProps) {
  const { setActiveSection } = useDashboardNavigationContext();
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (show) {
      // Trigger entrance animation
      setIsAnimating(true);
      setTimeout(() => setIsVisible(true), 10);
    } else {
      // Trigger exit animation
      setIsVisible(false);
      setTimeout(() => setIsAnimating(false), 300);
    }
  }, [show]);

  if (!show && !isAnimating) return null;

  const handleView = () => {
    setActiveSection('assistance');
    onView();
  };

  return (
    <div
      className={`
        fixed top-24 right-6 z-50
        transition-all duration-300 ease-out
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        ${isAnimating ? 'block' : 'hidden'}
      `}
    >
      <div
        className="
          relative
          bg-gradient-to-br from-red-600 via-red-500 to-orange-500
          backdrop-blur-md
          border border-red-400/50
          rounded-xl
          shadow-2xl
          shadow-red-500/50
          overflow-hidden
          min-w-[320px]
          max-w-[400px]
        "
      >
        {/* Animated background pulse */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
        
        {/* Glow effect */}
        <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-orange-500 rounded-xl blur opacity-75 animate-pulse" />
        
        <div className="relative p-4 flex items-start gap-4">
          {/* Icon with animation */}
          <div className="flex-shrink-0">
            <div className="relative">
              <div className="absolute inset-0 bg-red-400 rounded-full animate-ping opacity-75" />
              <div className="relative bg-white/20 backdrop-blur-sm rounded-full p-3 border-2 border-white/30">
                <span className="text-2xl">🆘</span>
              </div>
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <h3 className="text-white font-bold text-base mb-1">
                  New Assistance Request{count > 1 ? 's' : ''}!
                </h3>
                <p className="text-white/90 text-sm">
                  {count} agent{count > 1 ? 's' : ''} need{count === 1 ? 's' : ''} help
                </p>
              </div>
              
              {/* Close button */}
              <button
                onClick={onDismiss}
                className="
                  flex-shrink-0
                  text-white/70 hover:text-white
                  hover:bg-white/20
                  rounded-lg
                  p-1
                  transition-colors
                  focus:outline-none focus:ring-2 focus:ring-white/50
                "
                aria-label="Dismiss notification"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleView}
                className="
                  flex-1
                  bg-white/20 hover:bg-white/30
                  backdrop-blur-sm
                  border border-white/30
                  text-white
                  font-semibold
                  text-sm
                  px-4 py-2
                  rounded-lg
                  transition-all
                  hover:scale-105
                  active:scale-95
                  focus:outline-none focus:ring-2 focus:ring-white/50
                "
              >
                View Requests
              </button>
            </div>
          </div>
        </div>
        
        {/* Progress bar (optional - shows auto-dismiss countdown) */}
        {show && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
            <div 
              className="h-full bg-white/30"
              style={{
                animation: 'shrink 8s linear forwards',
              }}
            />
          </div>
        )}
      </div>
      
      <style jsx>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  );
}

