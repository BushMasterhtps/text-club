import React from 'react';

interface AutoLogoutWarningProps {
  isOpen: boolean;
  timeLeft: number;
  onExtend: () => void;
  onLogout: () => void;
}

export default function AutoLogoutWarning({ 
  isOpen, 
  timeLeft, 
  onExtend, 
  onLogout 
}: AutoLogoutWarningProps) {
  if (!isOpen) return null;

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-neutral-900 border border-red-500/30 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center space-y-4">
          {/* Warning Icon */}
          <div className="mx-auto w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
            <span className="text-3xl">⚠️</span>
          </div>
          
          {/* Title */}
          <h2 className="text-xl font-semibold text-white">
            Session Timeout Warning
          </h2>
          
          {/* Message */}
          <p className="text-white/80 text-sm leading-relaxed">
            You've been inactive for a while. Your session will expire in{' '}
            <span className="font-mono font-bold text-red-400">
              {formatTime(timeLeft)}
            </span>
            {' '}for security reasons.
          </p>
          
          {/* Time Remaining */}
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <div className="text-sm text-white/60 mb-1">Time Remaining:</div>
            <div className="text-2xl font-mono font-bold text-red-400">
              {formatTime(timeLeft)}
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={onExtend}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Stay Logged In
            </button>
            <button
              onClick={onLogout}
              className="flex-1 px-4 py-2 bg-neutral-600 hover:bg-neutral-700 text-white rounded-lg font-medium transition-colors"
            >
              Logout Now
            </button>
          </div>
          
          {/* Info */}
          <p className="text-xs text-white/50">
            Click "Stay Logged In" to extend your session for another 2 hours
          </p>
        </div>
      </div>
    </div>
  );
}
