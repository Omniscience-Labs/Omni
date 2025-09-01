'use client';

import { useState, useCallback } from 'react';
import type { Editor as TiptapEditor } from '@tiptap/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { FileText, Check, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Editor } from '@/components/agents/docs-agent/editor';
import { AdvancedToolbar } from '@/components/agents/docs-agent/advanced-toolbar';
import { saveAs } from 'file-saver';
import html2pdf from 'html2pdf.js';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { KortixLogo } from '../sidebar/kortix-logo';

interface TipTapDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string;
  documentData: {
    type?: string;
    version?: string;
    title?: string;
    content: string;
    metadata?: any;
    doc_id?: string;
  };
  sandboxId: string;
  onSave?: () => void;
}

export function TipTapDocumentModal({
  open,
  onOpenChange,
  filePath,
  documentData,
  sandboxId,
  onSave,
}: TipTapDocumentModalProps) {
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'unsaved'>('saved');
  const [editorInstance, setEditorInstance] = useState<TiptapEditor | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [characterCount, setCharacterCount] = useState(0);
  const fileName = documentData.title || filePath.split('/').pop()?.replace('.json', '') || 'document';

  const documentId = `${sandboxId}-${filePath.replace(/\//g, '-')}`;

  const handleEditorChange = useCallback(async (content: string) => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No access token available');
      }

      const updatedDocument = {
        ...documentData,
        content: content,
        updated_at: new Date().toISOString(),
      };

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/sandboxes/${sandboxId}/files`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            path: filePath,
            content: JSON.stringify(updatedDocument, null, 2),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to save document');
      }

      if (onSave) {
        onSave();
      }
    } catch (error) {
      console.error('Auto-save error:', error);
      toast.error(`Auto-save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }, [filePath, sandboxId, documentData, onSave]);

  const handleEditorReady = useCallback((editor: TiptapEditor) => {
    setEditorInstance(editor);
  }, []);

  const handleSaveStateChange = useCallback((state: 'saving' | 'saved' | 'unsaved') => {
    setSaveState(state);
  }, []);

  const handleStatsChange = useCallback((stats: { words: number; characters: number }) => {
    setWordCount(stats.words);
    setCharacterCount(stats.characters);
  }, []);

  const handleExport = useCallback(async (format: 'pdf' | 'docx' | 'html' | 'markdown' | 'txt') => {
    if (!editorInstance) return;

    const content = editorInstance.getHTML();
    const text = editorInstance.getText();

    try {
      switch (format) {
        case 'pdf': {
          const element = document.createElement('div');
          element.innerHTML = `
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #000;
              }
              h1 { font-size: 2em; margin: 0.67em 0; }
              h2 { font-size: 1.5em; margin: 0.83em 0; }
              h3 { font-size: 1.17em; margin: 1em 0; }
              p { margin: 1em 0; }
              ul, ol { margin: 1em 0; padding-left: 40px; }
              blockquote { 
                margin: 1em 0; 
                padding-left: 1em; 
                border-left: 3px solid #ddd; 
              }
              pre { 
                background: #f4f4f4; 
                padding: 1em; 
                border-radius: 4px; 
                overflow-x: auto; 
              }
              code { 
                background: #f4f4f4; 
                padding: 0.2em 0.4em; 
                border-radius: 3px; 
              }
              table { 
                border-collapse: collapse; 
                width: 100%; 
                margin: 1em 0; 
              }
              th, td { 
                border: 1px solid #ddd; 
                padding: 8px; 
                text-align: left; 
              }
              th { 
                background-color: #f2f2f2; 
              }
            </style>
            ${content}
          `;
          
          const options = {
            margin: 1,
            filename: `${fileName}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
          };
          
          await html2pdf().from(element).set(options).save();
          toast.success('PDF exported successfully');
          break;
        }

        case 'docx': {
          const response = await fetch('/api/export/docx', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content: content,
              fileName: fileName,
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to export DOCX');
          }

          const blob = await response.blob();
          saveAs(blob, `${fileName}.docx`);
          toast.success('DOCX exported successfully');
          break;
        }

        case 'html': {
          const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #fff;
    }
    h1 { 
      font-size: 2.5em; 
      margin-top: 0.67em; 
      margin-bottom: 0.67em;
      font-weight: 600;
      color: #111;
    }
    h2 { 
      font-size: 2em; 
      margin-top: 0.83em; 
      margin-bottom: 0.83em;
      font-weight: 600;
      color: #222;
    }
    h3 { 
      font-size: 1.5em; 
      margin-top: 1em; 
      margin-bottom: 1em;
      font-weight: 600;
      color: #333;
    }
    h4 { 
      font-size: 1.2em; 
      margin-top: 1.33em; 
      margin-bottom: 1.33em;
      font-weight: 600;
    }
    h5 { 
      font-size: 1em; 
      margin-top: 1.67em; 
      margin-bottom: 1.67em;
      font-weight: 600;
    }
    h6 { 
      font-size: 0.9em; 
      margin-top: 2.33em; 
      margin-bottom: 2.33em;
      font-weight: 600;
    }
    p { 
      margin-top: 1em; 
      margin-bottom: 1em; 
    }
    ul, ol { 
      margin-top: 1em; 
      margin-bottom: 1em; 
      padding-left: 40px; 
    }
    li {
      margin-bottom: 0.5em;
    }
    blockquote { 
      margin: 1em 0; 
      padding-left: 1em; 
      border-left: 4px solid #e0e0e0; 
      color: #666; 
      font-style: italic;
    }
    pre { 
      background: #f8f8f8; 
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 1em; 
      overflow-x: auto; 
      margin: 1em 0;
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 0.9em;
    }
    code { 
      background: #f5f5f5; 
      padding: 0.2em 0.4em; 
      border-radius: 3px; 
      font-family: 'SF Mono', Monaco, 'Courier New', monospace; 
      font-size: 0.9em;
    }
    pre code {
      background: none;
      padding: 0;
    }
    table { 
      border-collapse: collapse; 
      width: 100%; 
      margin: 1em 0; 
      overflow-x: auto;
      display: block;
    }
    th, td { 
      border: 1px solid #ddd; 
      padding: 12px 16px; 
      text-align: left; 
    }
    th { 
      background-color: #f8f9fa; 
      font-weight: 600; 
    }
    tr:nth-child(even) {
      background-color: #f8f9fa;
    }
    img { 
      max-width: 100%; 
      height: auto; 
      display: block;
      margin: 1em 0;
    }
    a { 
      color: #0066cc; 
      text-decoration: none; 
    }
    a:hover {
      text-decoration: underline;
    }
    hr {
      border: none;
      border-top: 2px solid #e0e0e0;
      margin: 2em 0;
    }
    .task-list-item {
      list-style: none;
      margin-left: -20px;
    }
    .task-list-item input {
      margin-right: 8px;
    }
    @media print {
      body {
        max-width: none;
      }
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
          const htmlBlob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
          saveAs(htmlBlob, `${fileName}.html`);
          toast.success('HTML exported successfully');
          break;
        }

        case 'markdown': {
          const turndownService = new TurndownService({
            headingStyle: 'atx',
            bulletListMarker: '-',
            codeBlockStyle: 'fenced',
            emDelimiter: '*',
            strongDelimiter: '**',
            linkStyle: 'inlined',
            preformattedCode: true,
          });
          
          turndownService.use(gfm);
          
          const markdown = turndownService.turndown(content);
          const finalMarkdown = markdown.startsWith('#') ? markdown : `# ${fileName}\n\n${markdown}`;
          
          const mdBlob = new Blob([finalMarkdown], { type: 'text/markdown;charset=utf-8' });
          saveAs(mdBlob, `${fileName}.md`);
          toast.success('Markdown exported successfully');
          break;
        }

        case 'txt': {
          const formattedText = text
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          
          const txtContent = `${fileName}\n${'='.repeat(fileName.length)}\n\n${formattedText}`;
          const txtBlob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
          saveAs(txtBlob, `${fileName}.txt`);
          toast.success('Text file exported successfully');
          break;
        }
      }
    } catch (error) {
      console.error(`Export error (${format}):`, error);
      toast.error(`Failed to export as ${format.toUpperCase()}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [editorInstance, fileName]);

  const SaveStateIndicator = () => {
    switch (saveState) {
      case 'saving':
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving...
          </Badge>
        );
      case 'saved':
        return (
          <Badge variant="secondary" className="gap-1">
            <Check className="h-3 w-3" />
            Saved
          </Badge>
        );
      case 'unsaved':
        return (
          <Badge variant="secondary" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Unsaved changes
          </Badge>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-screen w-full h-screen rounded-none flex flex-col p-0">
        <DialogHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KortixLogo size={24} />
              <DialogTitle>{fileName}</DialogTitle>
              <SaveStateIndicator />
            </div>
          </div>
        </DialogHeader>
        
        {editorInstance && (
          <AdvancedToolbar 
            editor={editorInstance}
            onExport={handleExport}
            wordCount={wordCount}
            characterCount={characterCount}
          />
        )}
        
        <div className="flex-1 overflow-auto bg-background">
          <Editor
            content={documentData.content || '<p></p>'}
            onChange={handleEditorChange}
            onEditorReady={handleEditorReady}
            onSaveStateChange={handleSaveStateChange}
            onStatsChange={handleStatsChange}
            useStore={false}
            documentId={documentId}
            autoSave={true}
            autoSaveDelay={2000}
            showWordCount={true}
            className="h-full"
            editorClassName="prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none focus:outline-none min-h-[400px] p-4 bg-white dark:bg-gray-900"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
} 