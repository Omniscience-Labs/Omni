'use client';

import React from 'react';
import { KnowledgeBaseManager } from '@/components/knowledge-base/knowledge-base-manager';

interface AgentKnowledgeBaseManagerProps {
    agentId: string;
    agentName: string;
    readOnly?: boolean;
}

export const AgentKnowledgeBaseManager = ({ agentId, agentName, readOnly }: AgentKnowledgeBaseManagerProps) => {
    return (
        <KnowledgeBaseManager
            agentId={agentId}
            agentName={agentName}
            showHeader={true}
            showRecentFiles={false}
            enableAssignments={true}
            maxHeight="400px"
            emptyStateMessage={`Create folders and upload files to provide ${agentName} with searchable knowledge`}
            readOnly={readOnly}
        />
    );
};