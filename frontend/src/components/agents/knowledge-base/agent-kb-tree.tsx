'use client';

import React from 'react';
import { KnowledgeBaseManager } from '@/components/knowledge-base/knowledge-base-manager';
import { LlamaCloudKnowledgeBaseManager } from '@/components/agents/llamacloud-knowledge-base';

interface AgentKnowledgeBaseManagerProps {
    agentId: string;
    agentName: string;
}

export const AgentKnowledgeBaseManager = ({ agentId, agentName }: AgentKnowledgeBaseManagerProps) => {
    return (
        <div className="space-y-6 overflow-y-auto max-h-[520px] pr-1">
            {/* Cloud KB toggles */}
            <LlamaCloudKnowledgeBaseManager
                agentId={agentId}
                agentName={agentName}
            />

            {/* File / folder KB */}
            <KnowledgeBaseManager
                agentId={agentId}
                agentName={agentName}
                showHeader={true}
                showRecentFiles={false}
                enableAssignments={true}
                showAddButton={false}
                emptyStateMessage={`Create folders and upload files to provide ${agentName} with searchable knowledge`}
            />
        </div>
    );
};