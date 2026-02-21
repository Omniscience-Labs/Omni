'use client';

import React from 'react';
import { KnowledgeBaseManager } from '@/components/knowledge-base/knowledge-base-manager';
import { LlamaCloudKnowledgeBaseManager } from '@/components/agents/llamacloud-knowledge-base';
import { useAgent } from '@/hooks/agents/use-agents';

interface KnowledgeScreenProps {
    agentId: string;
}

export function KnowledgeScreen({ agentId }: KnowledgeScreenProps) {
    const { data: agent } = useAgent(agentId);

    return (
        <div className="flex-1 overflow-auto pb-6">
            <div className="px-1 pt-1 space-y-8">
                {/* Cloud Knowledge Bases */}
                <LlamaCloudKnowledgeBaseManager
                    agentId={agentId}
                    agentName={agent?.name || 'this agent'}
                />

                {/* File-based Knowledge Base — no Add button (add from /knowledge page) */}
                <KnowledgeBaseManager
                    agentId={agentId}
                    agentName={agent?.name || 'this agent'}
                    showHeader={true}
                    showRecentFiles={false}
                    enableAssignments={true}
                    showAddButton={false}
                    emptyStateMessage="No knowledge base content available. Create folders and upload files to provide this agent with searchable knowledge."
                />
            </div>
        </div>
    );
}
