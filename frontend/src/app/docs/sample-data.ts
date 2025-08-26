import { 
  BookOpen, 
  Rocket, 
  Settings, 
  Code, 
  Zap, 
  FileText,
  Users,
  Shield,
  Database,
  Layers,
  Palette,
  MessageSquare,
  Image,
  Table,
  Map
} from 'lucide-react';

import type { DocsNavigationSection, DocsTableColumn } from '@/components/ui/docs-index';

export const sampleNavigation: DocsNavigationSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    items: [
      {
        id: 'introduction',
        title: 'Introduction',
        href: '#introduction',
        icon: BookOpen,
        isActive: true
      },
      {
        id: 'quick-start',
        title: 'Quick Start',
        href: '#quick-start',
        icon: Rocket,
        badge: 'New'
      },
      {
        id: 'installation',
        title: 'Installation',
        href: '#installation',
        icon: Settings
      }
    ]
  },
  {
    id: 'components',
    title: 'Components',
    items: [
      {
        id: 'overview',
        title: 'Overview',
        href: '#overview',
        icon: Layers,
        children: [
          {
            id: 'overview-getting-started',
            title: 'Getting Started',
            href: '#overview-getting-started'
          },
          {
            id: 'overview-customization',
            title: 'Customization',
            href: '#overview-customization'
          }
        ]
      },
      {
        id: 'accordion',
        title: 'Accordion',
        href: '#accordion',
        icon: FileText
      },
      {
        id: 'card',
        title: 'Card',
        href: '#card',
        icon: Layers
      },
      {
        id: 'feedback',
        title: 'Feedback',
        href: '#feedback',
        icon: MessageSquare
      },
      {
        id: 'media',
        title: 'Media',
        href: '#media',
        icon: Image
      }
    ]
  },
  {
    id: 'resources',
    title: 'Resources',
    items: [
      {
        id: 'roadmap',
        title: 'Roadmap',
        href: '#roadmap',
        icon: Map
      },
      {
        id: 'changelog',
        title: 'Changelog',
        href: '#changelog',
        icon: FileText
      }
    ]
  }
];

export const sampleBreadcrumbs = [
  { title: 'Docs', onClick: () => console.log('Navigate to docs') },
  { title: 'Getting Started' }
];

export const sampleFeatures = [
  {
    title: 'MDX Integration',
    description: 'Write content in Markdown and seamlessly embed React components',
    icon: Code
  },
  {
    title: 'Hierarchical Navigation',
    description: 'Intuitive section-based navigation with custom ordering',
    icon: FileText
  },
  {
    title: 'Component Showcase',
    description: 'Interactive examples of Once UI components',
    icon: Palette
  },
  {
    title: 'Responsive Design',
    description: 'Perfect viewing experience across all devices',
    icon: Layers
  },
  {
    title: 'Dark/Light Mode',
    description: 'Automatic theme switching based on system preferences',
    icon: Settings
  },
  {
    title: 'Search Functionality',
    description: 'Powerful command palette for quick content access',
    icon: Zap
  },
  {
    title: 'SEO Optimization',
    description: 'Built-in metadata generation for better search engine visibility',
    icon: Shield
  },
  {
    title: 'Custom Ordering',
    description: 'Control the exact order of pages using meta.json files',
    icon: Database
  }
];

export const sampleTableData = [
  {
    component: 'Button',
    status: 'Stable',
    version: '1.0.0',
    description: 'Interactive button component with variants'
  },
  {
    component: 'Card',
    status: 'Stable',
    version: '1.2.0',
    description: 'Container component for grouping content'
  },
  {
    component: 'Modal',
    status: 'Beta',
    version: '0.9.0',
    description: 'Overlay component for focused interactions'
  },
  {
    component: 'Table',
    status: 'Stable',
    version: '1.1.0',
    description: 'Data display component with sorting'
  }
];

export const sampleTableColumns: DocsTableColumn[] = [
  {
    key: 'component',
    title: 'Component',
    width: '200px'
  },
  {
    key: 'status',
    title: 'Status',
    width: '120px'
  },
  {
    key: 'version',
    title: 'Version',
    width: '100px',
    align: 'center'
  },
  {
    key: 'description',
    title: 'Description'
  }
]; 