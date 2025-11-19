# Pool Proposal App - Architecture Overview

## Application Flow

```
User Opens App → Home Page → Create/View/Edit Proposals → Export/Print
                    ↓
              SQLite Database (Local Storage)
```

## Technology Architecture

### Frontend Layer (React + TypeScript)
- **React 18**: UI framework for building interactive interfaces
- **React Router**: Navigation between pages
- **TypeScript**: Type-safe JavaScript for fewer bugs

### Desktop Layer (Electron)
- **Main Process** (`electron.ts`): Manages windows, database, file system
- **Preload Script** (`preload.ts`): Secure bridge between frontend and backend
- **Renderer Process**: Runs the React application

### Data Layer (SQLite)
- **Database Service** (`src/services/database.ts`): All database operations
- **Schema** (`src/database/schema.sql`): Table structure
- **Sample Data** (`src/database/sampleData.sql`): Pre-populated catalogs

## Key Components

### Pages
1. **HomePage** - Dashboard showing all proposals
2. **ProposalForm** - Multi-step wizard for creating proposals
3. **ProposalView** - Display and export finished proposals

### Form Sections (11 Components)
Each section is a standalone React component:
- CustomerInfoSection
- PoolSpecsSection
- ExcavationSection
- PlumbingSection
- TileCopingDeckingSection
- DrainageSection
- EquipmentSection
- WaterFeaturesSection
- CustomFeaturesSection
- MasonrySection
- InteriorFinishSection

## Data Flow

### Creating a Proposal
```
User Input → React State → Calculate Totals → Save to Database
```

### Viewing a Proposal
```
Load from Database → Parse JSON → Display in React → Export Options
```

### PDF Export
```
HTML Content → html2canvas → Image → jsPDF → Download
```

## Database Schema

### Main Tables
- **proposals** - Stores complete proposal data as JSON
- **pool_models** - Pre-configured pool options
- **equipment_catalog** - Available equipment with pricing
- **water_features_catalog** - Water feature options
- **excavation_rates** - Excavation pricing by difficulty
- **plumbing_rates** - Pipe costs per foot
- **tile_rates** - Tile pricing per sq ft
- **coping_rates** - Coping pricing per linear ft
- **decking_rates** - Decking pricing per sq ft
- **finish_rates** - Interior finish pricing
- **drainage_rates** - Drain installation costs

## Security Model

### Electron Security
- **Context Isolation**: Enabled - separates renderer from Node.js
- **Node Integration**: Disabled - prevents direct Node.js access
- **Preload Script**: Only exposes specific, safe APIs

### Data Storage
- Local SQLite database (not accessible from web)
- No external network calls (fully offline)
- User data stored in OS-appropriate location

## File Structure Logic

```
src/
├── components/      # Reusable UI components (form sections)
├── pages/          # Full page components (routes)
├── services/       # Business logic (database operations)
├── database/       # SQL schemas and seed data
├── types/          # TypeScript type definitions
└── App.tsx         # Main application router
```

## State Management

### Local Component State
Each form section manages its own state using React hooks:
```typescript
const [data, setData] = useState<SectionData>(initialData);
```

### Parent State
ProposalForm maintains the complete proposal in state:
```typescript
const [proposal, setProposal] = useState<Partial<Proposal>>({...});
```

### Database State
Proposals persisted to SQLite on save/submit

## Styling Approach

### CSS Architecture
- **Global Styles**: `index.css` - Base styles, resets
- **App Styles**: `App.css` - Application-wide gradient
- **Page Styles**: Each page has companion CSS file
- **Component Styles**: `SectionStyles.css` - Shared form styles

### Design System
- **Primary Color**: Purple gradient (#667eea to #764ba2)
- **Success**: Green (#10b981)
- **Danger**: Red (#ef4444)
- **Neutral**: Gray scale

## Build Process

### Development
```
Vite Dev Server (Port 5173) ← Electron Window
```

### Production
```
TypeScript → JavaScript
React → Bundled JS/CSS
Electron → Native Executable (.exe, .app, .deb)
```

## Extension Points

### Adding New Reference Data
1. Add table to `schema.sql`
2. Add sample data to `sampleData.sql`
3. Add method to `database.ts`
4. Add IPC handler to `electron.ts` and `preload.ts`
5. Use in component via `window.electron.yourMethod()`

### Adding New Proposal Section
1. Define TypeScript interface in `types/proposal.ts`
2. Create component in `components/YourSection.tsx`
3. Add to ProposalForm sections array
4. Add to proposal initial state
5. Add to ProposalView display

### Customizing Calculations
Edit the `calculateTotals()` function in `ProposalForm.tsx`:
```typescript
const calculateTotals = (): Proposal => {
  const subtotal = /* your calculation */;
  const taxRate = proposal.taxRate || 0.08;
  const taxAmount = subtotal * taxRate;
  const totalCost = subtotal + taxAmount;
  return { ...proposal, subtotal, taxRate, taxAmount, totalCost };
};
```

## Performance Considerations

### Database
- Indexed queries for fast lookups
- WAL mode for better concurrency
- JSON storage for flexible proposal structure

### React
- Component-level code splitting possible
- Minimal re-renders (isolated state)
- Virtual DOM optimization

### Electron
- Single window application
- Moderate memory usage
- Fast startup time

## Future Scalability

### Cloud Sync (Future Enhancement)
Current architecture supports adding:
- Remote database sync
- User authentication
- Multi-device access

### Multi-User (Future Enhancement)
Can extend to support:
- Role-based access control
- Proposal sharing/collaboration
- Centralized company database

### Reporting (Future Enhancement)
Database structure allows:
- Sales analytics
- Cost trending
- Popular equipment tracking

## Debugging Guide

### React DevTools
Available in development mode (F12)

### Database Inspection
Use DB Browser for SQLite to view `pool-proposals.db`

### IPC Communication
All IPC calls logged to console in development

### Common Issues
- **Database not found**: Check `userData` path in logs
- **Components not updating**: Check state management
- **Build fails**: Verify TypeScript types are correct

---

This architecture provides a solid foundation that can grow with your business needs while remaining maintainable and extensible.
