import { ReactNode } from "react";

interface SmallButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function SmallButton({ children, onClick, disabled = false, className = "" }: SmallButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
        disabled 
          ? "bg-gray-600/50 text-white/50 cursor-not-allowed" 
          : "bg-blue-600 hover:bg-blue-700 text-white"
      } ${className}`}
    >
      {children}
    </button>
  );
}
