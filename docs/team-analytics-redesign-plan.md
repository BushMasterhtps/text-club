# Team Analytics Redesign Plan

## Overview
Redesign the Team Analytics page to improve organization, navigation, and usability while maintaining all existing functionality.

## Key Requirements
- ✅ All existing functionality must remain intact
- ✅ Time Period selector affects ALL sections
- ✅ Performance Scorecard and One-on-One Notes always visible side-by-side
- ✅ Dark theme matching manager portal (`bg-neutral-900`)
- ✅ Easy to use, navigate, and visually appealing

## Layout Structure

### Top Sticky Header (Always Visible)
```
┌─────────────────────────────────────────────────────────────┐
│ [← Back to Manager Portal]  [Time Period: Today ▼] [Compare Mode ☐] │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
- "← Back to Manager Portal" button (replaces Quick Actions)
- Time Period selector (Today, Week, Month, Quarter, Year, Custom Range)
- Compare Mode toggle checkbox

**Styling:**
- Sticky position (`sticky top-0 z-30`)
- Dark background matching manager portal
- Border bottom for separation

---

### Main Content: Two-Column Layout

#### Left Column (65% width, scrollable)
**Tab Navigation:**
- Tab 1: "Overview"
- Tab 2: "Agents"
- Tab 3: "Trends" (optional, for future expansion)

**Tab 1: Overview**

**Section 1: "Key Metrics & Queue Status" (Collapsible)**
- Layout: Metrics on left (60%), Queues on right (40%)
- Left side: 5 metric cards in grid (2 columns, 3 rows)
  - Completed Today
  - Total Completed
  - Avg Handle Time
  - Total In Progress
  - Active Agents
- Right side: 4 queue cards in grid (2 columns, 2 rows)
  - Text Club
  - WOD/IVCS
  - Email Requests
  - Standalone Refunds
- Collapsible with expand/collapse icon

**Section 2: "Task Type Performance" (Collapsible)**
- Left: Task Type Performance breakdown (list)
- Right: Task Distribution pie chart
- Side-by-side layout (50/50)

**Section 3: "Daily Performance Trends" (Collapsible)**
- Full-width area chart
- Enhanced with better tooltips and interactions

---

**Tab 2: Agents**

**Section: "Agent Overview" (Collapsible)**
- Toggle between "Quick View" and "Detailed View"
- **Quick View:**
  - Live Agent Status grid (compact cards)
  - Shows: Name, Status, Completed Today, In Progress
  - "Peek In Progress" buttons
- **Detailed View:**
  - Team Performance Metrics (full breakdown)
  - Agent filter dropdown
  - Task filter dropdown
  - Detailed task type breakdown per agent
- Toggle button: "Switch to [Quick/Detailed] View"

---

**Tab 3: Trends** (Future expansion)
- Reserved for additional trend analysis
- Can be hidden if not needed initially

---

#### Right Column (35% width, sticky, expands to fit content)

**Section 1: Performance Scorecard**
- Always visible
- Scrollable if content is long
- No max height (expands to fit)
- Refresh button
- Expand/collapse scorecard functionality

**Section 2: One-on-One Meeting Notes**
- Always visible below Scorecard
- Scrollable if content is long
- No max height (expands to fit)
- "+ New One-on-One" button
- List of recent notes

**Styling:**
- Sticky position (`sticky top-[header-height]`)
- Independent scrolling
- Dark background with subtle border
- Padding for visual separation

---

## Technical Implementation

### Component Structure
```
AnalyticsPage
├── StickyHeader
│   ├── BackButton
│   ├── TimePeriodSelector
│   └── CompareModeToggle
├── MainContent (flex)
│   ├── LeftColumn (65%)
│   │   ├── TabNavigation
│   │   ├── OverviewTab
│   │   │   ├── MetricsAndQueuesSection (collapsible)
│   │   │   ├── TaskTypePerformanceSection (collapsible)
│   │   │   └── DailyTrendsSection (collapsible)
│   │   ├── AgentsTab
│   │   │   └── AgentOverviewSection (collapsible, with view toggle)
│   │   └── TrendsTab (optional)
│   └── RightColumn (35%, sticky)
│       ├── PerformanceScorecard
│       └── OneOnOneNotes
```

### State Management
- `selectedTab`: 'overview' | 'agents' | 'trends'
- `selectedDateRange`: 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom'
- `compareMode`: boolean
- `collapsedSections`: Record<string, boolean>
- `agentViewMode`: 'quick' | 'detailed'

### Data Flow
1. Time Period selector change → triggers refresh of ALL sections
2. All API calls include date range parameters
3. Performance Scorecard receives date range prop
4. One-on-One Notes independent (no date filtering)

### API Updates Needed
- Ensure all endpoints accept date range parameters:
  - `/api/analytics/overview?startDate=...&endDate=...`
  - `/api/analytics/task-types?startDate=...&endDate=...`
  - `/api/analytics/daily-trends?startDate=...&endDate=...`
  - `/api/analytics/agent-status?startDate=...&endDate=...`
  - `/api/manager/analytics/performance-scorecard?startDate=...&endDate=...`
  - `/api/analytics/team-performance?startDate=...&endDate=...`

### Styling Guidelines
- Background: `bg-neutral-900` (matches manager portal)
- Cards: `bg-white/5` with `border border-white/10`
- Text: `text-white` for headings, `text-white/60` for secondary
- Hover states: `hover:bg-white/10`
- Collapsible sections: Smooth transitions
- Tabs: Match unified navigation style

### Collapsible Section Component
```typescript
interface CollapsibleSectionProps {
  title: string;
  icon?: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}
```

Features:
- Expand/collapse icon (chevron)
- Smooth height transition
- State persisted in component (or localStorage for user preference)

### Responsive Design
- Desktop: Two-column layout as described
- Tablet: Right column becomes bottom section
- Mobile: Single column, stacked sections

---

## Migration Strategy

### Phase 1: Structure Setup
1. Create new layout structure (two-column)
2. Add sticky header with Time Period selector
3. Implement tab navigation
4. Add sticky right sidebar

### Phase 2: Content Reorganization
1. Move Performance Scorecard to right sidebar
2. Move One-on-One Notes to right sidebar
3. Reorganize Overview tab sections
4. Merge metrics and queues section
5. Create Agent Overview with view toggle

### Phase 3: Functionality
1. Ensure Time Period affects all sections
2. Implement collapsible sections
3. Add "Back to Manager Portal" button
4. Remove Quick Actions section

### Phase 4: Polish
1. Styling refinements
2. Smooth transitions
3. Loading states
4. Error handling

---

## Testing Checklist

- [ ] Time Period selector updates all sections
- [ ] Performance Scorecard always visible in sidebar
- [ ] One-on-One Notes always visible in sidebar
- [ ] Collapsible sections work smoothly
- [ ] Agent Overview toggle works (Quick ↔ Detailed)
- [ ] Metrics and Queues display correctly side-by-side
- [ ] All existing functionality preserved
- [ ] "Back to Manager Portal" button works
- [ ] Sticky sidebar scrolls independently
- [ ] Dark theme matches manager portal
- [ ] Responsive design works on different screen sizes

---

## Future Enhancements (Optional)

- Save collapsed/expanded state in localStorage
- Export functionality for reports
- Custom date range picker improvements
- Additional trend visualizations
- Agent comparison features
- Performance alerts/notifications

---

## Notes

- All existing API endpoints should continue to work
- No breaking changes to data structures
- Maintain backward compatibility
- Performance Scorecard and One-on-One Notes are independent (no date filtering needed for notes)

