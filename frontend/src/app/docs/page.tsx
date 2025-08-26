'use client';

import * as React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';

import { 
  DocsSidebar,
  DocsHeader,
  DocsCard,
  DocsBody,
  DocsBullets,
  DocsBulletItem,
  DocsTable,
  DocsImage
} from '@/components/ui/docs-index';
import { DocsThemeToggle } from '@/components/ui/docs-theme-toggle';

import { 
  sampleNavigation, 
  sampleBreadcrumbs, 
  sampleFeatures,
  sampleTableData,
  sampleTableColumns 
} from './sample-data';

export default function DocsPage() {
  const [activeItem, setActiveItem] = React.useState('introduction');

  const handleNavigation = (item: any) => {
    setActiveItem(item.id);
    console.log('Navigate to:', item);
  };

  const handleSearch = () => {
    console.log('Open search');
  };

    return (
      <div className="h-screen w-full bg-background flex overflow-hidden relative">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <DocsSidebar
            title="Suna Docs"
            subtitle="Build powerful AI agents"
            version="v1.0.0"
            navigation={sampleNavigation}
            activeItemId={activeItem}
            onNavigate={handleNavigation}
            onSearch={handleSearch}
          />
        </div>

        {/* Mobile Header */}
        <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm h-16">
          <div className="flex items-center justify-between px-4 h-full">
            <h1 className="font-semibold truncate">Suna Docs</h1>
            <div className="flex items-center gap-2 flex-shrink-0">
              <DocsThemeToggle />
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[calc(100vw-3rem)] max-w-sm p-0">
                  <div className="h-full">
                    <DocsSidebar
                      title="Suna Docs"
                      subtitle="Build powerful AI agents"
                      version="v1.0.0"
                      navigation={sampleNavigation}
                      activeItemId={activeItem}
                      onNavigate={handleNavigation}
                      onSearch={handleSearch}
                      className="border-0"
                      sidebarWidth="100%"
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col h-full">
          <div className="hidden lg:flex justify-end p-4 flex-shrink-0">
            <DocsThemeToggle />
          </div>
          <div className="flex-1 overflow-hidden pt-16 lg:pt-0 w-full">
            <ScrollArea className="h-full w-full">
              <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 w-full min-w-0">
                <DocsHeader
                  title="Get Started"
                  subtitle="Learn about Suna AI Worker and how it can transform your automation workflows"
                  breadcrumbs={sampleBreadcrumbs}
                  badge="Documentation"
                  lastUpdated="March 5, 2024"
                  showSeparator
                  size="lg"
                  className="mb-8 sm:mb-12"
                />
              <DocsBody className="mb-12">
                <h2>Key Features</h2>
                <p>
                  Suna Docs offers a comprehensive set of features that make documentation creation and
                  consumption a breeze:
                </p>
              </DocsBody>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-12 sm:mb-16 w-full">
                 {sampleFeatures.slice(0, 6).map((feature, index) => (
                   <DocsCard
                     key={index}
                     title={feature.title}
                     description={feature.description}
                     icon={feature.icon}
                     hover
                     size="default"
                   />
                 ))}
               </div>
              <DocsBody className="mb-8">
                <h2>Built with Suna UI</h2>
                <p>
                  Suna Docs leverages the Suna UI component system, providing a consistent, accessible, and
                  beautiful interface. For the complete Suna Docs and Suna UI documentation, visit Suna UI.
                </p>
              </DocsBody>
              <DocsImage
                src="/banner.png"
                alt="Suna Docs Interface"
                caption="Modern documentation interface built with Suna UI"
                zoom
                download
                size="full"
                aspect="video"
                className="mb-12"
              />
              <DocsBody className="mb-6">
                <h3>What makes Suna special:</h3>
              </DocsBody>
              <DocsBullets variant="check" spacing="default" className="mb-12">
                <DocsBulletItem
                  title="Powerful AI Workers"
                  description="Create intelligent automation that handles complex workflows"
                />
                <DocsBulletItem
                  title="Easy Integration"
                  description="Connect with your existing tools and services seamlessly"
                />
                <DocsBulletItem
                  title="Scalable Architecture"
                  description="Built to handle everything from simple tasks to enterprise workflows"
                />
                <DocsBulletItem
                  title="Developer Friendly"
                  description="Comprehensive APIs and SDKs for custom integrations"
                />
              </DocsBullets>
              <DocsBody className="mb-6">
                <h3>Component Status</h3>
                <p>Current status of available components in the Suna UI library:</p>
              </DocsBody>

                              <div className="w-full overflow-x-auto">
                  <DocsTable
                    columns={sampleTableColumns}
                    data={sampleTableData}
                    variant="striped"
                    className="mb-12 min-w-full"
                    caption="Component library status and versions"
                  />
                </div>
                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-12 sm:mb-16 w-full">
                 <DocsCard
                   title="Overview"
                   description="Learn about the core UI components in the Suna UI system and how to use them effectively in your projects."
                   badge="Components"
                   clickable
                   hover
                   actions={[
                     { 
                       label: 'Get Started', 
                       variant: 'default',
                       onClick: () => console.log('Navigate to overview') 
                     }
                   ]}
                 />
                 <DocsCard
                   title="Accordion"
                   description="Learn how to use the Accordion component to create collapsible content sections and save space in your UI."
                   badge="Components" 
                   clickable
                   hover
                   actions={[
                     { 
                       label: 'View Component', 
                       variant: 'outline',
                       onClick: () => console.log('Navigate to accordion') 
                     }
                   ]}
                 />
               </div>
              <DocsBody prose={false} className="border-t pt-8 text-center">
                <p className="text-muted-foreground">
                  Need help? Join our community or reach out to support.
                </p>
              </DocsBody>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
} 