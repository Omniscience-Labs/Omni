'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Edit2,
  Trash2,
  Clock,
  AlertCircle,
  FileText,
  Globe,
  Search,
  Loader2,
  Bot,
  Upload,
  GitBranch,
  Archive,
  CheckCircle,
  XCircle,
  RefreshCw,
  File as FileIcon,
  BookOpen,
  PenTool,
  X,
  ArrowLeft,
  FolderIcon,
  Settings,
  Grid,
  List,
  Database
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useAgentKnowledgeBaseEntries,
  useCreateAgentKnowledgeBaseEntry,
  useUpdateKnowledgeBaseEntry,
  useDeleteKnowledgeBaseEntry,
  useUploadAgentFiles,
  useCloneGitRepository,
  useAgentProcessingJobs,
  useAgentUnifiedKnowledgeBase,
} from '@/hooks/react-query/knowledge-base/use-knowledge-base-queries';
import { cn, truncateString } from '@/lib/utils';
import { CreateKnowledgeBaseEntryRequest, KnowledgeBaseEntry, UpdateKnowledgeBaseEntryRequest, ProcessingJob } from '@/hooks/react-query/knowledge-base/types';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { LlamaCloudKnowledgeBaseManager } from '../llamacloud-knowledge-base/llamacloud-kb-manager';
import { useAgentLlamaCloudKnowledgeBases, useCreateLlamaCloudKnowledgeBase } from '@/hooks/react-query/llamacloud-knowledge-base/use-llamacloud-knowledge-base-queries';
import { createClient } from '@/lib/supabase/client';
import { SharedTreeItem } from '@/components/knowledge-base/shared-kb-tree';
import { AgentKnowledgeSelector } from './agent-knowledge-selector';

import {
  Code2 as SiJavascript,
  Code2 as SiTypescript,
  Code2 as SiPython,
  Code2 as SiReact,
  Code2 as SiHtml5,
  Code2 as SiCss3,
  FileText as SiJson,
  FileText as SiMarkdown,
  FileText as SiYaml,
  FileText as SiXml,
  FileText as FaFilePdf,
  FileText as FaFileWord,
  FileText as FaFileExcel,
  FileImage as FaFileImage,
  Archive as FaFileArchive,
  Code as FaFileCode,
  FileText as FaFileAlt,
  File as FaFile
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// Helper function to get auth headers
const getAuthHeaders = async () => {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
  };
};

interface TreeItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  expanded?: boolean;
  children?: TreeItem[];
  data?: any;
}

interface AgentKnowledgeBaseManagerProps {
  agentId: string;
  agentName: string;
}

interface EditDialogData {
  entry?: KnowledgeBaseEntry;
  isOpen: boolean;
}

interface UploadedFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error' | 'extracting';
  error?: string;
  isFromZip?: boolean;
  zipParentId?: string;
  originalPath?: string;
}

const USAGE_CONTEXT_OPTIONS = [
  {
    value: 'always',
    label: 'Always Active',
    icon: Globe,
    color: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
  },
] as const;

const getFileTypeIcon = (filename: string, mimeType?: string) => {
  const extension = filename.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'js':
      return SiJavascript;
    case 'ts':
      return SiTypescript;
    case 'jsx':
    case 'tsx':
      return SiReact;
    case 'py':
      return SiPython;
    case 'html':
      return SiHtml5;
    case 'css':
      return SiCss3;
    case 'json':
      return SiJson;
    case 'md':
      return SiMarkdown;
    case 'yaml':
    case 'yml':
      return SiYaml;
    case 'xml':
      return SiXml;
    case 'pdf':
      return FaFilePdf;
    case 'doc':
    case 'docx':
      return FaFileWord;
    case 'xls':
    case 'xlsx':
    case 'csv':
      return FaFileExcel;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico':
      return FaFileImage;
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return FaFileArchive;
    default:
      if (['java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'scala'].includes(extension || '')) {
        return FaFileCode;
      }
      if (['txt', 'rtf', 'log'].includes(extension || '')) {
        return FaFileAlt;
      }
      return FaFile;
  }
};

const getFileIconColor = (filename: string) => {
  const extension = filename.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'js':
      return 'text-yellow-500';
    case 'ts':
    case 'tsx':
      return 'text-blue-500';
    case 'jsx':
      return 'text-cyan-500';
    case 'py':
      return 'text-green-600';
    case 'html':
      return 'text-orange-600';
    case 'css':
      return 'text-blue-600';
    case 'json':
      return 'text-yellow-600';
    case 'md':
      return 'text-gray-700 dark:text-gray-300';
    case 'yaml':
    case 'yml':
      return 'text-red-500';
    case 'xml':
      return 'text-orange-500';
    case 'pdf':
      return 'text-red-600';
    case 'doc':
    case 'docx':
      return 'text-blue-700';
    case 'xls':
    case 'xlsx':
    case 'csv':
      return 'text-green-700';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico':
      return 'text-purple-500';
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return 'text-yellow-700';
    default:
      return 'text-gray-500';
  }
};

const getSourceIcon = (sourceType: string, filename?: string) => {
  switch (sourceType) {
    case 'file':
      return filename ? getFileTypeIcon(filename) : FileIcon;
    case 'git_repo':
      return GitBranch;
    case 'zip_extracted':
      return Archive;
    default:
      return FileText;
  }
};

const AgentKnowledgeBaseSkeleton = () => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div className="relative w-full">
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="h-10 w-32 ml-4" />
    </div>

    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="border rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-4 w-64" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const AgentKnowledgeBaseManager = ({ agentId, agentName }: AgentKnowledgeBaseManagerProps) => {
  // Simply use the new AgentKnowledgeSelector component
    return (
    <div className="h-full">
      <AgentKnowledgeSelector agentId={agentId} />
    </div>
  );
}; 
