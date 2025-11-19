# Pool Proposal Manager

A professional desktop application designed to streamline the pool design and proposal creation process for pool construction companies. Built with Electron, React, TypeScript, and SQLite.

## Features

### Core Functionality
- **Intuitive Proposal Creation**: Step-by-step wizard interface guides designers through all aspects of pool proposals
- **Comprehensive Data Management**: Built-in database with pre-populated pricing for equipment, materials, and labor
- **Professional Output**: Generate beautifully formatted proposals ready to present to customers
- **Multiple Export Options**: Export proposals as PDF or print directly from the application
- **Proposal Management**: Save drafts, view history, edit existing proposals, and track proposal status

### Proposal Sections
The application organizes proposal creation into 11 logical sections:

1. **Customer Information** - Name, location, contact details
2. **Pool Specifications** - Type, model, dimensions, base pricing
3. **Excavation** - Difficulty level, access concerns, costs
4. **Plumbing** - Pipe types, lengths, labor hours
5. **Tile/Coping/Decking** - Materials, areas, styles
6. **Drainage** - Drain types, quantities, piping
7. **Equipment** - Pumps, filters, heaters, cleaners, automation
8. **Water Features** - Deck jets, bubblers, waterfalls, fountains
9. **Custom Features** - Infinity edges, swim-up bars, unique additions
10. **Masonry** - Walls, fireplaces, outdoor kitchens
11. **Interior Finish** - Plaster, pebble, tile finishes

### Database Features
- Pre-loaded reference pricing for all common pool components
- Equipment catalog with major brands and models
- Quick-select pool models for faster data entry
- Automatic cost calculations
- Local and cloud storage of completed proposals

## Technology Stack

- **Frontend**: React 18 with TypeScript
- **Desktop Framework**: Electron 29
- **Database**: SQLite with better-sqlite3
- **PDF Generation**: jsPDF + html2canvas
- **Build Tool**: Vite
- **Styling**: Custom CSS with modern gradients

## Installation

### Prerequisites
- Node.js 18 or higher
- npm or yarn package manager

### Setup Steps

1. **Navigate to the project directory**
   ```bash
   cd pool-proposal-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

   This will:
   - Start the Vite dev server on http://localhost:5173
   - Launch the Electron application
   - Enable hot module replacement for rapid development

## Building for Production

### Build for Windows
```bash
npm run build:win
```

### Build for macOS
```bash
npm run build:mac
```

### Build for Linux
```bash
npm run build:linux
```

The built application will be available in the `release` folder.

## Project Structure

```
pool-proposal-app/
├── src/
│   ├── components/          # React components for each proposal section
│   │   ├── CustomerInfoSection.tsx
│   │   ├── PoolSpecsSection.tsx
│   │   ├── ExcavationSection.tsx
│   │   ├── PlumbingSection.tsx
│   │   ├── TileCopingDeckingSection.tsx
│   │   ├── DrainageSection.tsx
│   │   ├── EquipmentSection.tsx
│   │   ├── WaterFeaturesSection.tsx
│   │   ├── CustomFeaturesSection.tsx
│   │   ├── MasonrySection.tsx
│   │   ├── InteriorFinishSection.tsx
│   │   └── SectionStyles.css
│   ├── pages/               # Main application pages
│   │   ├── HomePage.tsx     # Dashboard with proposal list
│   │   ├── ProposalForm.tsx # Multi-step proposal builder
│   │   └── ProposalView.tsx # Proposal display and export
│   ├── services/            # Backend services
│   │   └── database.ts      # SQLite database service
│   ├── database/            # Database schemas and data
│   │   ├── schema.sql       # Database structure
│   │   └── sampleData.sql   # Pre-populated reference data
│   ├── types/               # TypeScript type definitions
│   │   └── proposal.ts
│   ├── App.tsx              # Main React application
│   └── main.tsx             # React entry point
├── electron.ts              # Electron main process
├── preload.ts              # Electron preload script (IPC bridge)
├── vite.config.ts          # Vite configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Project dependencies and scripts
```

## Usage Guide

### Creating a New Proposal

1. **Launch the application** and click "Create New Proposal"

2. **Fill in Customer Information**
   - Enter customer name, city, and contact details
   - Click "Next" to proceed

3. **Configure Pool Specifications**
   - Use the quick-select dropdown to auto-fill from pre-configured models, OR
   - Manually enter pool type, dimensions, and pricing
   - The app automatically calculates pool volume

4. **Complete Each Section**
   - Navigate through sections using the progress bar or section buttons
   - All fields marked with * are required
   - Use reference catalogs to select equipment and features
   - Costs are calculated automatically based on your selections

5. **Review and Submit**
   - Use "Save Draft" to save progress at any time
   - Click "Submit Proposal" when complete
   - The proposal is stored locally and in the company database

### Viewing and Exporting Proposals

1. **From the home page**, click on any proposal card to view it

2. **View the formatted proposal** with all details organized professionally

3. **Export options**:
   - **Print**: Click "Print" to send to your printer
   - **Export PDF**: Click "Export PDF" to save as a PDF file
   - **Edit**: Click "Edit Proposal" to make changes

### Managing the Database

The application comes pre-loaded with sample pricing data. To customize:

1. **Locate the database** at:
   - Windows: `C:\Users\[Username]\AppData\Roaming\pool-proposal-app\pool-proposals.db`
   - macOS: `~/Library/Application Support/pool-proposal-app/pool-proposals.db`
   - Linux: `~/.config/pool-proposal-app/pool-proposals.db`

2. **Use a SQLite editor** (like DB Browser for SQLite) to:
   - Update pricing information
   - Add new equipment models
   - Customize pool models
   - Modify reference rates

3. **Reference tables** to update:
   - `pool_models` - Pre-configured pool specifications
   - `equipment_catalog` - Pumps, filters, heaters, cleaners
   - `water_features_catalog` - Deck jets, waterfalls, fountains
   - `excavation_rates` - Cost per cubic yard by difficulty
   - `plumbing_rates` - Pipe costs per foot
   - `tile_rates`, `coping_rates`, `decking_rates` - Material costs
   - `finish_rates` - Interior finish pricing

## Customization

### Adding New Pool Models

Edit `src/database/sampleData.sql` and add entries to the `pool_models` table:

```sql
INSERT INTO pool_models (type, model, length, width, depth, base_price) VALUES
('fiberglass', 'Your Model Name', 16, 10, 5, 35000);
```

### Updating Equipment Catalog

Add equipment to `equipment_catalog`:

```sql
INSERT INTO equipment_catalog (category, name, model, price) VALUES
('pump', 'New Pump Model', 'Brand X-100', 1500);
```

Categories: `pump`, `filter`, `cleaner`, `heater`, `other`

### Modifying Tax Rate

The default tax rate is 8%. To change it, update the initial value in `ProposalForm.tsx`:

```typescript
taxRate: 0.08,  // Change to your local tax rate
```

## Development

### Adding New Features

1. **New proposal section**: Create component in `src/components/`
2. **New data type**: Update `src/types/proposal.ts`
3. **New database table**: Add to `src/database/schema.sql`
4. **New IPC handler**: Add to `electron.ts` and `preload.ts`

### Debugging

- Development mode includes Chrome DevTools
- Database queries are logged to console
- Use `console.log()` for debugging React components
- Check Electron main process logs in the terminal

## Troubleshooting

### Database Issues
- If data isn't loading, check the console for database path
- Delete the database file to reset (sample data will reload)
- Ensure file permissions allow read/write access

### Build Issues
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear build cache: `rm -rf dist release`
- Ensure Node.js version is 18 or higher

### Display Issues
- Check browser console (F12 in development mode)
- Verify CSS files are loading correctly
- Clear application cache and restart

## Support and Contribution

This application is designed to be easily customizable for your specific business needs. Feel free to modify:
- Pricing structures
- Available options and catalogs
- Branding and styling
- Proposal layout and formatting
- Additional custom fields

## License

ISC License - See package.json for details

## Future Enhancements

Potential features for future development:
- Cloud sync for multi-user access
- Email integration to send proposals directly
- Photo uploads for pool designs
- Customer signature capture
- Payment tracking integration
- Material ordering integration
- Project timeline planning
- Multi-language support
