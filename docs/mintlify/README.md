# Omni Documentation

Modern, comprehensive documentation for Omni - your enterprise AI agent platform.

## 📚 Documentation Structure

This documentation is built with [Mintlify](https://mintlify.com) and organized into clear sections for enterprise users.

### Current Pages

#### ✅ Completed
- **Introduction** - Hero page with platform overview
- **Quick Start** - 5-minute guide to first agent
- **Core Concepts** - Understanding the building blocks
- **Agent Overview** - Complete agent system guide

#### 📋 To Be Created
All remaining pages have placeholders in the navigation structure and need content:

**Agent Management:**
- `guides/agents/creating-agents.mdx` - Step-by-step agent creation
- `guides/agents/configuring-agents.mdx` - Tool and integration setup
- `guides/agents/marketplace.mdx` - Installing pre-built agents
- `guides/agents/chat-interface.mdx` - Mastering the chat UI

**Projects & Threads:**
- `guides/projects/overview.mdx` - Projects system introduction
- `guides/projects/creating-projects.mdx` - Project setup guide
- `guides/projects/managing-threads.mdx` - Thread organization
- `guides/projects/sharing.mdx` - Collaboration features

**Knowledge Base:**
- `guides/knowledge/overview.mdx` - KB system introduction
- `guides/knowledge/uploading-files.mdx` - File upload guide
- `guides/knowledge/organizing-folders.mdx` - Folder management
- `guides/knowledge/search.mdx` - Semantic search usage

**Integrations:**
- `guides/integrations/overview.mdx` - Integration system intro
- `guides/integrations/connecting-services.mdx` - OAuth setup
- `guides/integrations/gmail.mdx` - Gmail integration
- `guides/integrations/slack.mdx` - Slack integration
- `guides/integrations/github.mdx` - GitHub integration
- `guides/integrations/calendar.mdx` - Calendar integration

**Automation:**
- `guides/automation/workflows.mdx` - Creating workflows
- `guides/automation/triggers.mdx` - Event-driven automation
- `guides/automation/scheduling.mdx` - Scheduled execution

**Advanced Features:**
- `guides/advanced/browser-automation.mdx` - Web automation
- `guides/advanced/file-operations.mdx` - File management
- `guides/advanced/data-processing.mdx` - Data analysis
- `guides/advanced/web-scraping.mdx` - Content extraction

**Use Cases:**
- `use-cases/research-analysis.mdx` - Research workflows
- `use-cases/content-creation.mdx` - Content generation
- `use-cases/data-processing.mdx` - Data pipelines
- `use-cases/customer-support.mdx` - Support automation
- `use-cases/marketing.mdx` - Marketing workflows
- `use-cases/development.mdx` - Dev automation

**Support:**
- `support/faq.mdx` - Common questions
- `support/troubleshooting.mdx` - Problem solving
- `support/best-practices.mdx` - Pro tips

## 🎨 Design System

### Brand Colors
- Primary: `#6366f1` (Indigo)
- Light: `#818cf8`
- Dark: `#4f46e5`

### Component Usage
Following Mintlify best practices with:
- `<Card>` and `<CardGroup>` for feature highlights
- `<Steps>` for sequential tutorials
- `<Tabs>` for alternative approaches
- `<Accordion>` for detailed content
- `<Note>`, `<Tip>`, `<Warning>`, `<Info>` for callouts

## 📸 Media Requirements

### Comprehensive Media Guide
See `MEDIA_GUIDE.md` for detailed specifications including:
- Complete list of all required screenshots
- Video recording specifications
- Exact content descriptions for each media asset
- File naming conventions
- Organization structure

### Quick Summary
- **Images**: 2400x1400px (hero), 1800x1000px (standard), PNG/WebP
- **Videos**: 1920x1080px, 30-60 seconds, MP4, <10MB
- **Style**: Clean UI, professional sample data, brand colors
- **Location**: `/images/` directory, organized by section

## 🚀 Development

### Local Preview
```bash
cd docs/mintlify
npm i -g mintlify
mintlify dev
```

### Building
```bash
mintlify build
```

### Validation
The `docs.json` configuration follows Mintlify's schema:
- Theme: `mint`
- Navigation: Flat structure with groups
- Branding: Omni colors and logos
- No API reference (managed deployment, UI-only)

## ✨ Key Features

### Enterprise Focus
- UI-based usage only (no API/deployment docs)
- Managed deployment context
- Team collaboration emphasis
- Security and compliance friendly

### Rich Media Support
- Screenshot placeholders with detailed descriptions
- Video walkthroughs for complex workflows
- Interactive diagrams and infographics
- Both light and dark mode assets

### Best Practices
Following documentation patterns from:
- **Stripe** - Clear examples, minimal design
- **Vercel** - Beautiful visuals, concise content
- **Linear** - Focused workflows, practical guides
- **Supabase** - Code samples, use cases

## 📝 Content Guidelines

### Writing Style
- **Clear & Concise**: Short paragraphs, bullet points
- **Action-Oriented**: Start with verbs (Create, Configure, Deploy)
- **Visual**: Screenshots and videos for every major feature
- **Practical**: Real-world examples and use cases

### Consistent Terminology
- "Omni" (not "Suna" or "Kortix")
- "Agent" (not "bot" or "assistant")
- "Thread" (for conversations)
- "Project" (for workspaces)
- "Knowledge Base" (not "documents" or "files")

## 🎯 Next Steps

1. **Add Media Assets** - Follow `MEDIA_GUIDE.md` specifications
2. **Create Remaining Pages** - Use existing pages as templates
3. **Test Navigation** - Ensure all links work
4. **Review Content** - Technical accuracy and clarity
5. **Get Feedback** - Internal team review
6. **Launch** - Deploy to production

## 📞 Contact

For questions about this documentation:
- **Email**: support@becomeomni.com
- **Community**: Discord (link in nav)
- **Issues**: GitHub repository

---

**Built with ❤️ using Mintlify**