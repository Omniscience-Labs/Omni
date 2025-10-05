# Omni Documentation - Media Placeholder Guide

This guide provides detailed specifications for all images and videos needed in the Omni documentation.

---

## 📸 Image Specifications

### General Guidelines
- **Format**: PNG or WebP for screenshots, SVG for diagrams/illustrations
- **Resolution**: Retina-ready (2x size of display dimensions)
- **Optimization**: Compress images to keep file sizes under 500KB
- **Naming**: Use kebab-case (e.g., `dashboard-overview.png`)
- **Location**: Place in `/images/` directory organized by section

### Color & Style
- **Brand Colors**: Primary #6366f1 (Indigo), Light #818cf8, Dark #4f46e5
- **UI Screenshots**: Include both light and dark mode versions where applicable
- **Annotations**: Use subtle arrows, boxes, or highlights to draw attention
- **Consistency**: Maintain consistent UI state (same user, similar data) across screenshots

---

## 🎥 Video Specifications

### General Guidelines
- **Format**: MP4 (H.264 codec)
- **Resolution**: 1920x1080 (1080p)
- **Frame Rate**: 30fps or 60fps
- **Duration**: Keep videos focused and concise (15-60 seconds typically)
- **Audio**: Optional voiceover, always include captions/subtitles
- **File Size**: Optimize to under 10MB per video

### Recording Tips
- **Screen Recording**: Use clean browser window, hide unnecessary toolbars
- **Cursor**: Enable cursor highlighting or animations
- **Smooth Actions**: Move deliberately, pause briefly between steps
- **Editing**: Add transitions, zoom effects on important UI elements
- **Loop**: Make videos loop seamlessly where appropriate

---

## 📋 Complete Media List by Page

### 1. Introduction (introduction.mdx)

#### Hero Image
- **File**: `hero-light.png` and `hero-dark.png`
- **Size**: 2400x1400px
- **Content**: Full Omni dashboard interface
  - Sidebar navigation visible on left
  - Active agent conversation in center panel
  - Right panel showing files/tools
  - Clean, professional appearance
  - Sample conversation with visible tool usage

#### Browser Automation Screenshot
- **File**: `browser-automation-demo.png`
- **Size**: 1600x900px
- **Content**: Browser tool interface
  - Webpage being automated (form or data extraction)
  - Terminal output showing browser commands
  - Visual confirmation screenshot overlay

#### Knowledge Base Interface
- **File**: `knowledge-base-main.png`
- **Size**: 1600x900px
- **Content**: Knowledge base management page
  - Folder tree structure on left
  - File grid with icons and names
  - Upload interface at top
  - Search bar with example query

#### Integrations Page
- **File**: `integrations-grid.png`
- **Size**: 1600x900px
- **Content**: Available integrations
  - Grid of integration cards (Gmail, Slack, GitHub, etc.)
  - Connected status badges
  - Service logos clearly visible
  - "Connect" buttons and OAuth indicators

#### File Browser
- **File**: `file-browser-interface.png`
- **Size**: 1600x900px
- **Content**: Sandbox file browser
  - Directory tree showing various file types
  - File preview pane
  - Upload/create/delete action buttons
  - Context menus visible

#### Data Analysis Demo (VIDEO)
- **File**: `data-analysis-demo.mp4`
- **Duration**: 30-45 seconds
- **Content**: Complete data analysis workflow
  - Agent receiving CSV file
  - Processing/analyzing animation
  - Charts and graphs being generated
  - Final report compilation
  - Download/share options appearing

#### Research Workflow (VIDEO)
- **File**: `research-workflow-demo.mp4`
- **Duration**: 45-60 seconds
- **Content**: Research task execution
  - User typing research question
  - Agent performing multiple web searches
  - Visiting and extracting from websites
  - Compiling findings into organized report
  - Formatted document as final output

---

### 2. Quick Start (quickstart.mdx)

#### Complete Walkthrough (VIDEO)
- **File**: `quickstart-full-walkthrough.mp4`
- **Duration**: 2-3 minutes
- **Content**: Entire quickstart process
  - Login and dashboard access
  - Creating/installing first agent
  - Starting first conversation
  - Agent working on task
  - Reviewing results
  - Voiceover explaining each step

#### Dashboard Overview
- **File**: `dashboard-after-login.png`
- **Size**: 2400x1400px
- **Content**: Clean dashboard state
  - Full sidebar with labeled sections
  - Welcome or default view in center
  - User profile menu top right
  - All UI elements clearly visible

#### Agents Page - Empty State
- **File**: `agents-page-empty.png`
- **Size**: 1600x900px
- **Content**: First-time agents view
  - Empty state with helpful message
  - Prominent "Create Agent" button
  - Marketplace preview cards
  - Onboarding hints

#### Marketplace View
- **File**: `agent-marketplace.png`
- **Size**: 1800x1000px
- **Content**: Agent marketplace
  - Grid of agent cards with variety
  - Icons, names, descriptions visible
  - "Install" buttons on each
  - Search bar and filters at top
  - Download counts and ratings

#### Agent Installation Dialog
- **File**: `agent-install-modal.png`
- **Size**: 1200x800px
- **Content**: Installation modal
  - Agent details and capabilities
  - Name input field with example
  - List of tools/integrations to enable
  - "Install Agent" button
  - What will be configured preview

#### Custom Agent Creation
- **File**: `custom-agent-creation.png`
- **Size**: 1400x1000px
- **Content**: Agent creation form
  - All fields expanded and visible
  - Tool toggles shown
  - Knowledge base selector
  - Icon picker and color customization
  - Example values filled in

#### Chat Interface Overview
- **File**: `chat-interface-new.png`
- **Size**: 2400x1400px
- **Content**: Empty chat interface
  - Message input area
  - Thread history sidebar
  - File browser panel
  - Example prompts or suggestions
  - All UI elements labeled for clarity

#### Agent Execution (VIDEO)
- **File**: `agent-working-execution.mp4`
- **Duration**: 45-60 seconds
- **Content**: Agent working on task
  - Planning phase with steps listed
  - Tool usage badges appearing
  - Progress indicators and updates
  - Intermediate results streaming
  - Final complete result
  - Subtle zooms on key moments

#### Results View
- **File**: `task-results-complete.png`
- **Size**: 1800x1000px
- **Content**: Completed task view
  - Formatted output clearly visible
  - Created files with download buttons
  - Copy/share action buttons
  - Follow-up message examples
  - Visual polish

#### Example Task Results Grid
- **File**: `example-results-grid.png`
- **Size**: 1800x1000px
- **Content**: 4-quadrant view
  - Top left: Data visualization chart
  - Top right: Blog post preview formatted
  - Bottom left: Research report document
  - Bottom right: Email summary with categories
  - Professional presentation

---

### 3. Core Concepts (core-concepts.mdx)

#### Architecture Diagram
- **File**: `omni-architecture-diagram.svg`
- **Size**: 1800x1000px (SVG scalable)
- **Content**: Visual architecture flow
  - User → Agent → Sandbox → Tools → Results
  - Icons for each component
  - Omni brand colors (purple/indigo)
  - Arrows showing data flow
  - Clean, modern design

#### Agent Card Examples
- **File**: `agent-cards-variety.png`
- **Size**: 1600x600px
- **Content**: 3-4 diverse agent cards
  - Different icons, colors, names
  - Capabilities listed underneath
  - "Chat" and "Configure" buttons visible
  - Visual variety

#### Projects View
- **File**: `projects-list-grid.png`
- **Size**: 1800x1000px
- **Content**: Projects overview
  - 4-6 project cards
  - Names, descriptions, dates
  - Project icons and member avatars
  - Thread count, activity indicators

#### Thread Sidebar
- **File**: `thread-history-sidebar.png`
- **Size**: 400x1000px (tall, narrow)
- **Content**: Thread list
  - Chronological threads with titles
  - Timestamps and agent avatars
  - "New Thread" button prominent
  - Active thread highlighted

#### File Browser Interface
- **File**: `sandbox-file-browser.png`
- **Size**: 1400x900px
- **Content**: File system view
  - Directory tree structure
  - Various file types displayed
  - File operations menu
  - Search/filter options

#### Code Execution Demo (VIDEO)
- **File**: `code-execution-demo.mp4`
- **Duration**: 20-30 seconds
- **Content**: Code running in sandbox
  - Python script being written
  - Script execution with output
  - Generated files or visualizations
  - Terminal output visible

#### Browser Automation (VIDEO)
- **File**: `browser-automation-flow.mp4`
- **Duration**: 30-40 seconds
- **Content**: Browser in action
  - Browser opening website
  - Form filling or data extraction
  - Visual confirmation screenshots
  - Extracted data being saved

#### Knowledge Base in Action (VIDEO)
- **File**: `knowledge-base-usage.mp4`
- **Duration**: 45-60 seconds
- **Content**: KB workflow
  - User uploading documents
  - Folder organization shown
  - Agent being asked question
  - Agent searching KB (visual indicator)
  - Response with sourced information
  - File references in answer

#### Knowledge Base Main View
- **File**: `knowledge-base-full.png`
- **Size**: 2000x1200px
- **Content**: Complete KB interface
  - Folder tree on left
  - File grid in center
  - Upload area at top
  - Search bar with semantic search hint
  - Multiple file types visible

#### Tool Configuration Panel
- **File**: `tools-configuration.png`
- **Size**: 1400x1000px
- **Content**: Tools settings
  - Toggle switches for each tool
  - Categorized sections
  - Helpful descriptions
  - Visual hierarchy

#### Communication Integrations
- **File**: `integrations-communication.png`
- **Size**: 1600x800px
- **Content**: Gmail, Slack, Teams cards
  - Connection status shown
  - Available actions listed
  - Example use cases
  - OAuth status

#### Productivity Integrations
- **File**: `integrations-productivity.png`
- **Size**: 1600x800px
- **Content**: Calendar, Notion, Drive cards
  - Sync status visible
  - Capabilities listed
  - Permission indicators

#### Development Integrations
- **File**: `integrations-development.png`
- **Size**: 1600x800px
- **Content**: GitHub, Linear, Jira cards
  - Repository/project connections
  - Example automation scenarios
  - Integration status

#### Workflow Builder
- **File**: `workflow-builder-interface.png`
- **Size**: 1800x1000px
- **Content**: Workflow creation
  - Step-by-step visual builder
  - Variable inputs ({{date}}, etc.)
  - Test/save buttons
  - Drag-and-drop interface

#### Workflow Execution (VIDEO)
- **File**: `workflow-execution.mp4`
- **Duration**: 45 seconds
- **Content**: Automated workflow
  - Scheduled trigger activating
  - Steps executing in sequence
  - Real-time progress through steps
  - Completion notification
  - Final deliverable shown

#### End-to-End Example
- **File**: `complete-workflow-infographic.png`
- **Size**: 2000x1200px
- **Content**: Full workflow visualization
  - All components working together
  - Icons and arrows showing flow
  - Engaging design with branding
  - Professional infographic style

---

### 4. Agent Overview (guides/agents/overview.mdx)

#### Agents Dashboard Overview
- **File**: `agents-dashboard-full.png`
- **Size**: 2400x1400px
- **Content**: Complete agents page
  - Grid of varied agent cards
  - Sidebar with "Agents" highlighted
  - "Create Agent" and "Marketplace" buttons
  - Agent stats (total, active, last used)
  - Multiple agent types visible

#### Agent Configuration Panel
- **File**: `agent-config-full.png`
- **Size**: 1600x1200px
- **Content**: Settings view
  - Name, description fields
  - System prompt textarea with example
  - Icon selector grid
  - Color picker with brand colors
  - Model dropdown

#### Tools Configuration Screen
- **File**: `tools-toggle-interface.png`
- **Size**: 1800x1000px
- **Content**: Tool selection
  - Categorized sections (Core, Communication, etc.)
  - Toggle switches showing on/off states
  - Descriptions for each tool
  - Premium/integration badges

#### Knowledge Base Assignment
- **File**: `kb-assignment-interface.png`
- **Size**: 1400x900px
- **Content**: KB selection
  - Folder tree with checkboxes
  - File counts and sizes
  - "Sync Now" and "Auto-sync" options

#### Integration Status View
- **File**: `integration-status-cards.png`
- **Size**: 1600x800px
- **Content**: Connected services
  - Integration cards with status
  - "Connected" badges with checkmarks
  - "Configure" and "Disconnect" buttons
  - Last sync time, health status

#### General Purpose Agent Card
- **File**: `general-agent-card.png`
- **Size**: 800x500px
- **Content**: Single agent card
  - Tool badges visible
  - "All-purpose Assistant" description
  - Usage stats (tasks, hours saved)

#### Specialized Agent Examples
- **File**: `specialized-agents-grid.png`
- **Size**: 1800x1000px
- **Content**: 4 specialized agents
  - Unique icons, colors, purposes
  - Specific tools per agent
  - Sample tasks/outputs
  - Professional variety

#### Workflow Agent Configuration
- **File**: `workflow-agent-setup.png`
- **Size**: 1600x900px
- **Content**: Workflow agent with trigger
  - Workflow steps listed
  - Schedule configuration
  - Execution history with timestamps

#### Active Agent Indicator
- **File**: `agent-active-badge.png`
- **Size**: 400x300px
- **Content**: Close-up of agent card
  - Green "Active" badge
  - Pulsing or static green dot

#### Agent Working (VIDEO)
- **File**: `agent-working-state.mp4`
- **Duration**: 15-20 seconds
- **Content**: State transition
  - Agent card changing to "Working"
  - Progress bar or activity indicator
  - Tool usage badges appearing
  - Live status updates

#### Agent Dashboard Tabs
- **File**: `agent-tabs-interface.png`
- **Size**: 1800x1000px
- **Content**: Tabbed view
  - "My Agents", "Shared", "Marketplace" tabs
  - Active tab with content
  - Filter and sort options visible

#### Agent Card Context Menu
- **File**: `agent-context-menu.png`
- **Size**: 600x500px
- **Content**: Dropdown menu
  - All actions listed with icons
  - Hover state or active selection visible

---

## 📊 Media Organization

```
/docs/mintlify/images/
├── hero/
│   ├── hero-light.png
│   └── hero-dark.png
├── dashboard/
│   ├── dashboard-after-login.png
│   ├── dashboard-overview.png
│   └── ...
├── agents/
│   ├── agents-dashboard-full.png
│   ├── agent-cards-variety.png
│   └── ...
├── knowledge/
│   ├── knowledge-base-main.png
│   ├── knowledge-base-full.png
│   └── ...
├── integrations/
│   ├── integrations-grid.png
│   ├── integrations-communication.png
│   └── ...
├── workflows/
│   ├── workflow-builder-interface.png
│   └── ...
├── diagrams/
│   ├── omni-architecture-diagram.svg
│   └── ...
└── videos/
    ├── quickstart-full-walkthrough.mp4
    ├── agent-working-execution.mp4
    ├── data-analysis-demo.mp4
    └── ...
```

---

## ✅ Production Checklist

Before adding media to documentation:

- [ ] Images compressed and optimized (<500KB each)
- [ ] Videos compressed and optimized (<10MB each)
- [ ] Both light and dark mode versions where needed
- [ ] Consistent UI state across screenshots (same user, similar data)
- [ ] Brand colors used correctly (#6366f1, #818cf8, #4f46e5)
- [ ] No sensitive information visible in screenshots
- [ ] Alt text descriptions added to all images
- [ ] Videos have captions/subtitles if containing instructions
- [ ] File names follow kebab-case convention
- [ ] Media organized in appropriate subdirectories

---

## 🎨 Style Guide

### Screenshot Aesthetics
- Clean, uncluttered interface
- Consistent window size and browser chrome
- Professional sample data (no "Lorem ipsum" or "test" entries)
- Realistic usernames and content
- Proper spacing and alignment

### Video Production
- Smooth cursor movement
- Brief pauses between actions (0.5-1 second)
- Highlight or zoom on important UI elements
- Professional transitions (fade, dissolve)
- Optional background music (subtle, non-distracting)

### Annotations
- Use subtle arrows or boxes to highlight features
- Keep annotations minimal and clear
- Use brand colors for consistency
- Ensure annotations don't obscure important UI elements

---

## 📝 Notes

**Important**: All media placeholders in the MDX files include detailed comments describing exactly what should be captured. Use these comments as the source of truth when creating media assets.

**Flexibility**: Dimensions are guidelines. Adjust as needed while maintaining aspect ratios and overall quality standards.

**Updates**: As the UI evolves, update screenshots to reflect the latest design. Keep this guide synchronized with actual documentation.
