// Core Components
export { DocsSidebar } from './docs-sidebar';
export { DocsHeader } from './docs-header';
export { DocsCard } from './docs-card';
export { DocsBody } from './docs-body';
export { DocsBullets, DocsBulletItem } from './docs-bullets';
export { DocsTable, createDocsTableColumn } from './docs-table';
export { DocsImage } from './docs-image';
export { DocsThemeToggle } from './docs-theme-toggle';

// Types
export type { 
  DocsNavigationItem, 
  DocsNavigationSection, 
  DocsSidebarProps 
} from './docs-sidebar';

export type { 
  DocsBreadcrumbItem, 
  DocsHeaderProps 
} from './docs-header';

export type { 
  DocsCardAction, 
  DocsCardProps 
} from './docs-card';

export type { 
  DocsBodyProps 
} from './docs-body';

export type { 
  DocsBulletItemProps, 
  DocsBulletsProps 
} from './docs-bullets';

export type { 
  DocsTableColumn, 
  DocsTableRow, 
  DocsTableProps 
} from './docs-table';

export type { 
  DocsImageProps 
} from './docs-image';

export type { 
  DocsThemeToggleProps 
} from './docs-theme-toggle';

// Utility functions for common use cases
import type { DocsNavigationSection } from './docs-sidebar';
import type { DocsBreadcrumbItem } from './docs-header';

export const createDocsNavigation = (sections: DocsNavigationSection[]) => ({
  sections
});

export const createDocsBreadcrumbs = (items: DocsBreadcrumbItem[]) => items;

// Default configurations
export const defaultDocsConfig = {
  sidebar: {
    width: '280px',
    showSearch: true,
    searchPlaceholder: 'Search docs...'
  },
  header: {
    size: 'default' as const,
    showSeparator: true
  },
  card: {
    size: 'default' as const,
    variant: 'default' as const,
    hover: true
  },
  body: {
    size: 'default' as const,
    spacing: 'default' as const,
    prose: true,
    maxWidth: '3xl' as const
  },
  bullets: {
    variant: 'default' as const,
    size: 'default' as const,
    spacing: 'default' as const
  },
  table: {
    size: 'default' as const,
    variant: 'default' as const,
    showHeader: true
  },
  image: {
    size: 'default' as const,
    aspect: 'auto' as const,
    rounded: true,
    loading: 'lazy' as const
  }
} as const; 