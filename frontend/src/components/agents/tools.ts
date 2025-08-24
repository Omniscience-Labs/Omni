export const AGENTPRESS_TOOL_DEFINITIONS: Record<string, { enabled: boolean; description: string; icon: string; color: string }> = {
    'sb_shell_tool': { enabled: true, description: 'Execute shell commands in tmux sessions for terminal operations, CLI tools, and system management', icon: '💻', color: 'bg-slate-100 dark:bg-slate-800' },
    'sb_files_tool': { enabled: true, description: 'Create, read, update, and delete files in the workspace with comprehensive file management', icon: '📁', color: 'bg-blue-100 dark:bg-blue-800/50' },
    'browser_tool': { enabled: true, description: 'Browser automation for web navigation, clicking, form filling, and page interaction', icon: '🌐', color: 'bg-indigo-100 dark:bg-indigo-800/50' },
    'sb_deploy_tool': { enabled: true, description: 'Deploy applications and services with automated deployment capabilities', icon: '🚀', color: 'bg-green-100 dark:bg-green-800/50' },
    'sb_expose_tool': { enabled: true, description: 'Expose services and manage ports for application accessibility', icon: '🔌', color: 'bg-orange-100 dark:bg-orange-800/20' },
    'web_search_tool': { enabled: true, description: 'Search the web using Tavily API and scrape webpages with Firecrawl for research', icon: '🔍', color: 'bg-yellow-100 dark:bg-yellow-800/50' },
    'sb_vision_tool': { enabled: true, description: 'Vision and image processing capabilities for visual content analysis', icon: '👁️', color: 'bg-pink-100 dark:bg-pink-800/50' },
    'data_providers_tool': { enabled: true, description: 'Access to data providers and external APIs (requires RapidAPI key)', icon: '🔗', color: 'bg-cyan-100 dark:bg-cyan-800/50' },
    'sb_excel_tool': { enabled: true, description: 'Advanced Excel operations with formatting, formulas, charts, data validation, and multi-sheet support', icon: '📈', color: 'bg-teal-100 dark:bg-teal-800/50' },
    'sb_pdf_form_tool': { enabled: true, description: 'PDF form operations including reading form fields, filling forms, and flattening PDFs', icon: '📄', color: 'bg-purple-100 dark:bg-purple-800/50' },
    'podcast_tool': { enabled: true, description: 'Generate podcasts from agent conversations using OpenAI TTS and ElevenLabs (2-3 min generation)', icon: '🎧', color: 'bg-rose-100 dark:bg-rose-800/50' },
    'sb_video_avatar_tool': { enabled: true, description: 'Generate videos with AI avatars and create interactive streaming avatar sessions using HeyGen', icon: '🎬', color: 'bg-violet-100 dark:bg-violet-800/50' },
    'audio_transcription_tool': { enabled: true, description: 'Transcribe audio files to text using OpenAI Whisper, supports files up to 2 hours with automatic chunking', icon: '🎤', color: 'bg-emerald-100 dark:bg-emerald-800/50' },
};

export const DEFAULT_AGENTPRESS_TOOLS: Record<string, boolean> = Object.entries(AGENTPRESS_TOOL_DEFINITIONS).reduce((acc, [key, value]) => {
  acc[key] = value.enabled;
  return acc;
}, {} as Record<string, boolean>);

export const getToolDisplayName = (toolName: string): string => {
    const displayNames: Record<string, string> = {
      'sb_shell_tool': 'Terminal',
      'sb_files_tool': 'File Manager',
      'browser_tool': 'Browser Automation',
      'sb_deploy_tool': 'Deploy Tool',
      'sb_expose_tool': 'Port Exposure',
      'web_search_tool': 'Web Search',
      'sb_vision_tool': 'Image Processing',
      'data_providers_tool': 'Data Providers',
      'sb_excel_tool': 'Excel Operations',
      'sb_pdf_form_tool': 'PDF Forms',
      'podcast_tool': 'Podcast Generator',
      'sb_video_avatar_tool': 'Video Avatar',
      'audio_transcription_tool': 'Audio Transcription',
    };
    
    return displayNames[toolName] || toolName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };