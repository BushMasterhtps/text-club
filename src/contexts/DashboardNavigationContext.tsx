'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface DashboardNavigationContextType {
  activeSection: string;
  setActiveSection: (section: string) => void;
}

const DashboardNavigationContext = createContext<DashboardNavigationContextType | undefined>(undefined);

export function DashboardNavigationProvider({ children }: { children: ReactNode }) {
  const [activeSection, setActiveSection] = useState<string>('overview');

  return (
    <DashboardNavigationContext.Provider value={{ activeSection, setActiveSection }}>
      {children}
    </DashboardNavigationContext.Provider>
  );
}

export function useDashboardNavigationContext() {
  const context = useContext(DashboardNavigationContext);
  if (!context) {
    throw new Error('useDashboardNavigationContext must be used within DashboardNavigationProvider');
  }
  return context;
}

