import React, { useMemo } from 'react';
import { ToolViewProps } from '../types';
import { GenericToolView } from '../GenericToolView';
import { BrowserToolView } from '../BrowserToolView';
import { CommandToolView } from '../command-tool/CommandToolView';
import { CheckCommandOutputToolView } from '../command-tool/CheckCommandOutputToolView';
import { ExposePortToolView } from '../expose-port-tool/ExposePortToolView';
import { FileOperationToolView } from '../file-operation/FileOperationToolView';
import { FileEditToolView } from '../file-operation/FileEditToolView';
import { StrReplaceToolView } from '../str-replace/StrReplaceToolView';
import { WebCrawlToolView } from '../WebCrawlToolView';
import { WebScrapeToolView } from '../web-scrape-tool/WebScrapeToolView';
import { WebSearchToolView } from '../web-search-tool/WebSearchToolView';
import { SeeImageToolView } from '../see-image-tool/SeeImageToolView';
import { TerminateCommandToolView } from '../command-tool/TerminateCommandToolView';
import { AskToolView } from '../ask-tool/AskToolView';
import { CompleteToolView } from '../CompleteToolView';
import { ExecuteDataProviderCallToolView } from '../data-provider-tool/ExecuteDataProviderCallToolView';
import { DataProviderEndpointsToolView } from '../data-provider-tool/DataProviderEndpointsToolView';
import { DeployToolView } from '../DeployToolView';
import { SearchMcpServersToolView } from '../search-mcp-servers/search-mcp-servers';
import { GetAppDetailsToolView } from '../get-app-details/get-app-details';
import { CreateCredentialProfileToolView } from '../create-credential-profile/create-credential-profile';
import { ConnectCredentialProfileToolView } from '../connect-credential-profile/connect-credential-profile';
import { CheckProfileConnectionToolView } from '../check-profile-connection/check-profile-connection';
import { ConfigureProfileForAgentToolView } from '../configure-profile-for-agent/configure-profile-for-agent';
import { GetCredentialProfilesToolView } from '../get-credential-profiles/get-credential-profiles';
import { GetCurrentAgentConfigToolView } from '../get-current-agent-config/get-current-agent-config';
import { TaskListToolView } from '../task-list/TaskListToolView';
import { SheetsToolView } from '../sheets-tools/sheets-tool-view';
import { GetProjectStructureView } from '../web-dev/GetProjectStructureView';
import { PodcastToolView } from '../podcast-tool/PodcastToolView';
import { VideoAvatarToolView } from '../video-avatar-tool/VideoAvatarToolView';


export type ToolViewComponent = React.ComponentType<ToolViewProps>;

type ToolViewRegistryType = Record<string, ToolViewComponent>;

const defaultRegistry: ToolViewRegistryType = {
  'browser-navigate-to': BrowserToolView,
  'browser-act': BrowserToolView,
  'browser-extract-content': BrowserToolView,
  'browser-screenshot': BrowserToolView,

  'execute-command': CommandToolView,
  'check-command-output': CheckCommandOutputToolView,
  'terminate-command': TerminateCommandToolView,
  'list-commands': GenericToolView,

  'create-file': FileOperationToolView,
  'delete-file': FileOperationToolView,
  'full-file-rewrite': FileOperationToolView,
  'read-file': FileOperationToolView,
  'edit-file': FileEditToolView,

  'str-replace': StrReplaceToolView,

  'web-search': WebSearchToolView,
  'crawl-webpage': WebCrawlToolView,
  'scrape-webpage': WebScrapeToolView,

  'execute-data-provider-call': ExecuteDataProviderCallToolView,
  'get-data-provider-endpoints': DataProviderEndpointsToolView,

  'search-mcp-servers': SearchMcpServersToolView,
  'get-app-details': GetAppDetailsToolView,
  'create-credential-profile': CreateCredentialProfileToolView,
  'connect-credential-profile': ConnectCredentialProfileToolView,
  'check-profile-connection': CheckProfileConnectionToolView,
  'configure-profile-for-agent': ConfigureProfileForAgentToolView,
  'get-credential-profiles': GetCredentialProfilesToolView,
  'get-current-agent-config': GetCurrentAgentConfigToolView,
  'create-tasks': TaskListToolView,
  'view-tasks': TaskListToolView,
  'update-tasks': TaskListToolView,
  'delete-tasks': TaskListToolView,
  'clear-all': TaskListToolView,


  'expose-port': ExposePortToolView,

  'see-image': SeeImageToolView,

  'ask': AskToolView,
  'complete': CompleteToolView,

  'deploy': DeployToolView,

  // Excel operations
  'excel_operations': GenericToolView,
  
  // PDF form operations
  'read_form_fields': GenericToolView,
  'fill_form': GenericToolView,
  'flatten_form': GenericToolView,
  'get_form_field_value': GenericToolView,
  'fill_form_coordinates': GenericToolView,
  'analyze_form_layout': GenericToolView,
  'create_coordinate_template': GenericToolView,
  'detect_and_remove_overlays': GenericToolView,
  'generate_coordinate_grid': GenericToolView,
  'smart_form_fill': GenericToolView,

  'get-project-structure': GetProjectStructureView,
  'list-web-projects': GenericToolView,

  // Podcast generation
  'generate_podcast': PodcastToolView,
  'generate_podcast_from_url': PodcastToolView,
  'generate_bite_sized_podcast': PodcastToolView,
  'check_podcast_status': PodcastToolView,

  // Video avatar generation
  'generate_avatar_video': VideoAvatarToolView,
  'create_avatar_session': VideoAvatarToolView,
  'make_avatar_speak': VideoAvatarToolView,
  'check_video_status': VideoAvatarToolView,
  'list_avatar_options': VideoAvatarToolView,
  'close_avatar_session': VideoAvatarToolView,

  'default': GenericToolView,
};

class ToolViewRegistry {
  private registry: ToolViewRegistryType;

  constructor(initialRegistry: Partial<ToolViewRegistryType> = {}) {
    this.registry = { ...defaultRegistry };

    Object.entries(initialRegistry).forEach(([key, value]) => {
      if (value !== undefined) {
        this.registry[key] = value;
      }
    });
  }

  register(toolName: string, component: ToolViewComponent): void {
    this.registry[toolName] = component;
  }

  registerMany(components: Partial<ToolViewRegistryType>): void {
    Object.assign(this.registry, components);
  }

  get(toolName: string): ToolViewComponent {
    return this.registry[toolName] || this.registry['default'];
  }

  has(toolName: string): boolean {
    return toolName in this.registry;
  }

  getToolNames(): string[] {
    return Object.keys(this.registry).filter(key => key !== 'default');
  }

  clear(): void {
    this.registry = { default: this.registry['default'] };
  }
}

export const toolViewRegistry = new ToolViewRegistry();

export function useToolView(toolName: string): ToolViewComponent {
  return useMemo(() => toolViewRegistry.get(toolName), [toolName]);
}

export function ToolView({ name = 'default', ...props }: ToolViewProps) {
  const ToolViewComponent = useToolView(name);
  return <ToolViewComponent name={name} {...props} />;
}