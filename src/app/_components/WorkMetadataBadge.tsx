"use client";

interface WorkMetadataBadgeProps {
  hasBeenWorked: boolean;
  isRework: boolean;
  recentlyWorked: boolean;
  lastWorkedByName?: string | null;
  workAttempts?: number;
  hoursSinceLastWork?: number | null;
}

export function WorkMetadataBadge({
  hasBeenWorked,
  isRework,
  recentlyWorked,
  lastWorkedByName,
  workAttempts = 0,
  hoursSinceLastWork,
}: WorkMetadataBadgeProps) {
  // Never worked
  if (!hasBeenWorked) {
    return (
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <span className="px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-300 border border-green-500/30">
          🆕 Never Worked
        </span>
      </div>
    );
  }

  // Worked on
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      {/* Re-work badge */}
      {isRework && (
        <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
          🔄 Re-work
        </span>
      )}

      {/* Recently worked badge */}
      {recentlyWorked && (
        <span className="px-2 py-1 rounded text-xs font-medium bg-orange-500/20 text-orange-300 border border-orange-500/30">
          ⏱️ Recently Worked
        </span>
      )}

      {/* Work attempts badge */}
      {workAttempts > 0 && (
        <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
          📊 Attempts: {workAttempts}
        </span>
      )}

      {/* Last agent badge */}
      {lastWorkedByName ? (
        <span className="px-2 py-1 rounded text-xs font-medium bg-gray-500/20 text-gray-300 border border-gray-500/30">
          👤 Last: {lastWorkedByName}
        </span>
      ) : (
        <span className="px-2 py-1 rounded text-xs font-medium bg-gray-500/20 text-gray-300 border border-gray-500/30">
          👤 Last: Unknown Agent
        </span>
      )}

      {/* Hours since last work */}
      {hoursSinceLastWork !== null && hoursSinceLastWork >= 0 && (
        <span className="px-2 py-1 rounded text-xs font-medium bg-gray-500/20 text-gray-300 border border-gray-500/30">
          {hoursSinceLastWork < 24
            ? `${hoursSinceLastWork}h ago`
            : `${Math.floor(hoursSinceLastWork / 24)}d ago`}
        </span>
      )}
    </div>
  );
}
