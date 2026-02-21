'use client';

import React from 'react';
import { KnowledgeBasePageHeader } from './knowledge-base-header';
import { KnowledgeBaseManager } from './knowledge-base-manager';
import { CloudKnowledgeBaseSection } from './cloud-kb-section';

export function KnowledgeBasePage() {
    return (
        <div>
            <div className="min-h-screen">
                <div className="container mx-auto max-w-7xl px-4 py-8">
                    <KnowledgeBasePageHeader />
                </div>
                <div className="container mx-auto max-w-7xl px-4 py-2 space-y-8">
                    {/* Cloud Knowledge Bases (LlamaCloud) */}
                    <CloudKnowledgeBaseSection />

                    {/* File / Folder Knowledge Bases */}
                    <div className="w-full min-h-[calc(100vh-400px)]">
                        <KnowledgeBaseManager
                            showHeader={true}
                            showRecentFiles={false}
                            enableAssignments={false}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}