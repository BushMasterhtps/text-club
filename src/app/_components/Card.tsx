import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div className={`bg-white/5 border border-white/10 rounded-xl ${className}`}>
      {children}
    </div>
  );
}
