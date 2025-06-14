"use client";

import { createContext, useContext, ReactNode } from "react";

interface WorkflowContextType {
  updateNodeData: (nodeId: string, updates: any) => void;
}

const WorkflowContext = createContext<WorkflowContextType | null>(null);

export function WorkflowProvider({ 
  children, 
  updateNodeData 
}: { 
  children: ReactNode;
  updateNodeData: (nodeId: string, updates: any) => void;
}) {
  return (
    <WorkflowContext.Provider value={{ updateNodeData }}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error("useWorkflow must be used within a WorkflowProvider");
  }
  return context;
} 