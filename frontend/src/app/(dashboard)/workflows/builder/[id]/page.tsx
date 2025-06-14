"use client";

import WorkflowBuilder from "@/components/workflows/WorkflowBuilder";
import { use } from "react";

export default function EditWorkflowPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = use(params);
  
  return (
    <div className="h-screen flex flex-col">
      <WorkflowBuilder workflowId={id} />
    </div>
  );
} 