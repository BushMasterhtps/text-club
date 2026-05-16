import React from 'react';

interface AutoLogoutWarningProps {
  isOpen: boolean;
  timeLeft: number;
  onExtend: () => void;
  onLogout: () => void;
  /** Full session length after "Stay Logged In" (for copy only). */
  sessionTimeoutMinutes?: number;
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatSessionLength(minutes: number): string {
  if (minutes < 1) {
    const secs = Math.round(minutes * 60);
    return secs === 1 ? "1 second" : `${secs} seconds`;
  }
  if (minutes === 1) return "1 minute";
  if (Number.isInteger(minutes)) return `${minutes} minutes`;
  return `${minutes.toFixed(1)} minutes`;
}

export default function AutoLogoutWarning({
  isOpen,
  timeLeft,
  onExtend,
  onLogout,
  sessionTimeoutMinutes,
}: AutoLogoutWarningProps) {
  if (!isOpen) return null;

  const extensionMinutes =
    sessionTimeoutMinutes ?? Math.max(1, Math.ceil(timeLeft / 60) || 1);

  const handleExtend = (e: React.MouseEvent) => {
    e.stopPropagation();
    onExtend();
  };

  const handleLogout = (e: React.MouseEvent) => {
    e.stopPropagation();
    onLogout();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="bg-neutral-900 border border-red-500/30 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
      >
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
            <span className="text-3xl" aria-hidden>
              ⚠️
            </span>
          </div>

          <h2 id="session-timeout-title" className="text-xl font-semibold text-white">
            Session Timeout Warning
          </h2>

          <p className="text-white/80 text-sm leading-relaxed">
            You&apos;ve been inactive for a while. Your session will expire in{' '}
            <span className="font-mono font-bold text-red-400">{formatCountdown(timeLeft)}</span>{' '}
            for security reasons.
          </p>

          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <div className="text-sm text-white/60 mb-1">Time Remaining:</div>
            <div className="text-2xl font-mono font-bold text-red-400">
              {formatCountdown(timeLeft)}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={handleExtend}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Stay Logged In
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex-1 px-4 py-2 bg-neutral-600 hover:bg-neutral-700 text-white rounded-lg font-medium transition-colors"
            >
              Logout Now
            </button>
          </div>

          <p className="text-xs text-white/50">
            Click &quot;Stay Logged In&quot; to extend your session for another{' '}
            {formatSessionLength(extensionMinutes)}.
          </p>
        </div>
      </div>
    </div>
  );
}
