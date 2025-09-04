"use client";

import { useTheme } from '@/contexts/ThemeContext';
import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  
  // Always call useTheme hook (Rules of Hooks)
  const { theme, toggleTheme } = useTheme();
  
  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render until mounted on client
  if (!mounted) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 dark:bg-white/10 light:bg-gray-100 border border-white/20 dark:border-white/20 light:border-gray-300">
        <div className="w-5 h-5 text-gray-400 dark:text-gray-400 light:text-gray-600">🌙</div>
      </div>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 transition-colors duration-200 border border-white/20 hover:border-white/30"
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        // Moon icon for dark mode
        <svg 
          className="w-5 h-5 text-gray-700" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" 
          />
        </svg>
      ) : (
        // Sun icon for light mode
        <svg 
          className="w-5 h-5 text-yellow-400" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" 
          />
        </svg>
      )}
    </button>
  );
}
