# Pagination Implementation for Agents and Marketplace

This document outlines the implementation of server-side pagination, searching, sorting, and filtering for both the agents page and marketplace page.

## Backend Changes

### 1. Updated API Endpoints

#### Agents Endpoint (`/agents`)
- **New Parameters:**
  - `page`: Page number (1-based, default: 1)
  - `limit`: Items per page (1-100, default: 20)
  - `search`: Search in name and description
  - `sort_by`: Sort field (name, created_at, updated_at, tools_count)
  - `sort_order`: Sort order (asc, desc)
  - `has_default`: Filter by default agents
  - `has_mcp_tools`: Filter by agents with MCP tools
  - `has_agentpress_tools`: Filter by agents with AgentPress tools
  - `tools`: Comma-separated list of tools to filter by

- **Response Format:**
```json
{
  "agents": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

#### Marketplace Endpoint (`/marketplace/agents`)
- **New Parameters:**
  - `page`: Page number (1-based, default: 1)
  - `limit`: Items per page (1-100, default: 20)
  - `search`: Search in name and description
  - `tags`: Comma-separated string of tags
  - `sort_by`: Sort by (newest, popular, most_downloaded, name)
  - `creator`: Filter by creator name

- **Response Format:**
```json
{
  "agents": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 75,
    "pages": 4
  }
}
```

### 2. Database Functions

#### Updated `get_marketplace_agents`
- Added `p_creator` parameter for filtering by creator name
- Enhanced search functionality

#### New `get_marketplace_agents_count`
- Returns total count of marketplace agents matching filters
- Used for pagination calculation

## Frontend Changes

### 1. New Components

#### Pagination Component
- Located at: `frontend/src/app/(dashboard)/agents/_components/pagination.tsx`
- Features:
  - Smart page number display with ellipsis
  - Previous/Next navigation
  - Disabled state during loading
  - Responsive design

### 2. Updated Hooks

#### useAgents Hook
- Now accepts `AgentsParams` for server-side filtering
- Returns `AgentsResponse` with pagination info

#### useMarketplaceAgents Hook
- Updated to support new pagination parameters
- Returns `MarketplaceAgentsResponse` with pagination info

### 3. Updated Pages

#### Agents Page
- Replaced client-side filtering with server-side parameters
- Added pagination component
- Automatic page reset when filters change
- Enhanced results display with pagination info

#### Marketplace Page
- Added pagination support
- Enhanced sorting options (added "Name A-Z")
- Improved results display
- Added pagination component

## Benefits

1. **Performance**: Only loads necessary data, reducing bandwidth and improving load times
2. **Scalability**: Can handle large datasets efficiently
3. **User Experience**: Faster page loads and responsive filtering
4. **Server Resources**: Reduced memory usage and database load
5. **Search**: Real-time search with backend optimization

## Usage

### Agents Page
- Search agents by name or description
- Filter by default status, tool types, or specific tools
- Sort by name, creation date, update date, or tool count
- Navigate through pages with pagination controls

### Marketplace Page
- Search marketplace agents by name or description
- Filter by tags or creator name
- Sort by newest, popularity, downloads, or name
- Browse through paginated results

## Technical Notes

- Page size is limited to 100 items maximum for performance
- Search is case-insensitive and matches partial strings
- Tool filtering supports both MCP and AgentPress tools
- Sorting is handled both in database (for simple fields) and post-processing (for computed fields like tools_count)
- Pagination automatically resets to page 1 when filters change 