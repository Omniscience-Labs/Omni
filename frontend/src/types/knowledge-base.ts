// Knowledge Base Types and Constants

// Constants
export const ENTRY_TYPE_FILE = 'file' as const;
export const ENTRY_TYPE_CLOUD_KB = 'cloud_kb' as const;
export const CLOUD_KB_ID_PREFIX = 'cloud-';

export type EntryType = typeof ENTRY_TYPE_FILE | typeof ENTRY_TYPE_CLOUD_KB;

export interface BaseEntry {
    entry_id: string;
    entry_type: EntryType;
    name: string;
    summary?: string;
    description?: string | null;
    usage_context: 'always' | 'on_request' | 'contextual';
    is_active: boolean;
    created_at: string;
    updated_at: string;
    folder_id?: string | null;
    account_id: string;
}

export interface FileEntry extends BaseEntry {
    entry_type: typeof ENTRY_TYPE_FILE;
    filename: string;
    file_path: string;
    file_size: number;
    mime_type: string;
    // Cloud KB fields are null for files
    index_name?: null;
}

export interface CloudKBEntry extends BaseEntry {
    entry_type: typeof ENTRY_TYPE_CLOUD_KB;
    index_name: string;
    // File fields are null for cloud KBs
    filename?: null;
    file_path?: null;
    file_size?: null;
    mime_type?: null;
}

export type KnowledgeBaseEntry = FileEntry | CloudKBEntry;

export interface Folder {
    folder_id: string;
    name: string;
    description?: string;
    entry_count: number;
    created_at: string;
}

export interface TreeItem {
    id: string;
    type: 'folder' | 'file';
    name: string;
    parentId?: string;
    data?: Folder | KnowledgeBaseEntry;
    children?: TreeItem[];
    expanded?: boolean;
}

// Type guards
export function isFileEntry(entry: KnowledgeBaseEntry): entry is FileEntry {
    return entry.entry_type === ENTRY_TYPE_FILE;
}

export function isCloudKBEntry(entry: KnowledgeBaseEntry): entry is CloudKBEntry {
    return entry.entry_type === ENTRY_TYPE_CLOUD_KB;
}

export function getCloudKBId(entry_id: string): string {
    return `${CLOUD_KB_ID_PREFIX}${entry_id}`;
}

export function extractCloudKBId(prefixed_id: string): string {
    return prefixed_id.replace(CLOUD_KB_ID_PREFIX, '');
}

export function isCloudKBId(id: string): boolean {
    return id.startsWith(CLOUD_KB_ID_PREFIX);
}
