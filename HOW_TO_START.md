# How to Start the Pool Proposal App

## Quick Start Options

### Option 1: VS Code Task (Fastest - One Click!)

1. Open `pool-proposal-app` folder in VS Code
2. Press **`Ctrl+Shift+P`**
3. Type "Run Task"
4. Select **"Test App"**

**Or use the keyboard shortcut:** `Ctrl+Shift+T`

---

### Option 2: Double-Click Batch File

Navigate to `pool-proposal-app` folder and double-click:
- **`start-app.bat`**

---

### Option 3: Command Line

```bash
cd pool-proposal-app
npm run dev
```

---

## What Should Happen

When started successfully:
- ✅ Vite dev server starts (port 5173)
- ✅ Electron window opens (1400x900)
- ✅ Developer tools open
- ✅ You see the purple gradient home screen
- ✅ "Create New Proposal" button is visible

## Troubleshooting

**If nothing happens:**
- Check if ports 5173+ are available
- Try killing existing processes first:
  ```bash
  taskkill /F /IM node.exe
  taskkill /F /IM electron.exe
  ```

**If you see errors:**
- Run `npm install` in the pool-proposal-app folder
- Run `npm run postinstall`
- Check [SETUP_HELP.md](SETUP_HELP.md) for detailed troubleshooting

## First Time Setup

If this is your first time running:
1. Make sure you've run `npm install`
2. The database will be created automatically
3. Sample data loads on first run

---

**Need more help?** See [SETUP_HELP.md](SETUP_HELP.md) for detailed instructions.
