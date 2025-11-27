'use client';

import { createContext, useContext, ReactNode } from 'react';

interface AssistanceRequestsContextType {
  refresh: () => Promise<void>;
}

const AssistanceRequestsContext = createContext<AssistanceRequestsContextType | undefined>(undefined);

export function AssistanceRequestsProvider({ 
  children, 
  refresh 
}: { 
  children: ReactNode; 
  refresh: () => Promise<void>;
}) {
  return (
    <AssistanceRequestsContext.Provider value={{ refresh }}>
      {children}
    </AssistanceRequestsContext.Provider>
  );
}

export function useAssistanceRequestsContext() {
  const context = useContext(AssistanceRequestsContext);
  return context;
}

