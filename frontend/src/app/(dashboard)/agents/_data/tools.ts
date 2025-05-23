export const DEFAULT_AGENTPRESS_TOOLS: Record<string, { enabled: boolean; description: string; icon: string; color: string }> = {
    'sb_shell_tool': { enabled: true, description: 'Execute shell commands in tmux sessions for terminal operations, CLI tools, and system management', icon: '💻', color: 'bg-slate-100' },
    'sb_files_tool': { enabled: true, description: 'Create, read, update, and delete files in the workspace with comprehensive file management', icon: '📁', color: 'bg-blue-100' },
    'sb_browser_tool': { enabled: false, description: 'Browser automation for web navigation, clicking, form filling, and page interaction', icon: '🌐', color: 'bg-indigo-100' },
    'sb_deploy_tool': { enabled: false, description: 'Deploy applications and services with automated deployment capabilities', icon: '🚀', color: 'bg-green-100' },
    'sb_expose_tool': { enabled: false, description: 'Expose services and manage ports for application accessibility', icon: '🔌', color: 'bg-orange-100' },
    'message_tool': { enabled: true, description: 'Messaging and communication capabilities for agent interactions', icon: '💬', color: 'bg-purple-100' },
    'web_search_tool': { enabled: false, description: 'Search the web using Tavily API and scrape webpages with Firecrawl for research', icon: '🔍', color: 'bg-yellow-100' },
    'sb_vision_tool': { enabled: false, description: 'Vision and image processing capabilities for visual content analysis', icon: '👁️', color: 'bg-pink-100' },
    'data_providers_tool': { enabled: false, description: 'Access to data providers and external APIs (requires RapidAPI key)', icon: '🔗', color: 'bg-cyan-100' },
};

export const getToolDisplayName = (toolName: string): string => {
    const displayNames: Record<string, string> = {
      'sb_shell_tool': 'Shell Terminal',
      'sb_files_tool': 'File Manager',
      'sb_browser_tool': 'Browser Automation',
      'sb_deploy_tool': 'App Deployment',
      'sb_expose_tool': 'Service Exposure',
      'message_tool': 'Messaging',
      'web_search_tool': 'Web Search',
      'sb_vision_tool': 'Vision Processing',
      'data_providers_tool': 'Data Providers',
    };
    
    return displayNames[toolName] || toolName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };