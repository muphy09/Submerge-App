const { spawn, exec, execSync } = require('child_process');
const waitOn = require('wait-on');
const path = require('path');
const fs = require('fs');

console.log('Starting Vite dev server...');

let vite = null;
let electron = null;
let isShuttingDown = false;

// Kill all processes on port 5173
function killPort5173() {
  if (process.platform === 'win32') {
    try {
      const stdout = execSync('netstat -ano | findstr :5173', { encoding: 'utf-8' });
      const lines = stdout.split('\n');
      const pids = new Set();
      lines.forEach(line => {
        const match = line.match(/LISTENING\s+(\d+)/);
        if (match) pids.add(match[1]);
      });
      pids.forEach(pid => {
        console.log(`Killing process ${pid} on port 5173...`);
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        } catch (err) {
          // Process might already be dead
        }
      });
      if (pids.size > 0) {
        console.log('Waiting for port to be released...');
        // Wait a bit for the port to be released
        const start = Date.now();
        while (Date.now() - start < 2000) {
          try {
            execSync('netstat -ano | findstr :5173', { stdio: 'ignore' });
          } catch (err) {
            // Port is now free
            break;
          }
        }
      }
    } catch (err) {
      // No process on port 5173, which is fine
    }
  }
}

// Kill all node.exe processes running vite
function killViteProcesses() {
  if (process.platform === 'win32') {
    try {
      console.log('Killing all Vite processes...');
      // Use PowerShell to find and kill node processes running vite
      const psCommand = `Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*vite*' } | Stop-Process -Force`;
      execSync(`powershell -Command "${psCommand}"`, { stdio: 'ignore' });
    } catch (err) {
      // No matching processes or PowerShell command failed
    }

    // Fallback: try wmic if PowerShell didn't work
    try {
      execSync('wmic process where "commandline like \'%vite%\' and name=\'node.exe\'" delete', { stdio: 'ignore' });
    } catch (err) {
      // No matching processes
    }
  }
}

// Clean up any leftover processes from previous runs
function cleanupLeftoverProcesses() {
  console.log('Cleaning up leftover processes...');
  killPort5173();
  killViteProcesses();
}

// Function to kill all child processes
function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('Cleaning up all processes...');

  // Kill Vite processes
  killViteProcesses();
  killPort5173();

  // Kill Electron if it's still running
  if (electron && electron.pid) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /T /PID ${electron.pid}`, { stdio: 'ignore' });
      } else {
        electron.kill('SIGKILL');
      }
    } catch (err) {
      // Process might already be dead
    }
  }

  // Kill Vite spawn if it's still tracked
  if (vite && vite.pid) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /T /PID ${vite.pid}`, { stdio: 'ignore' });
      } else {
        vite.kill('SIGKILL');
      }
    } catch (err) {
      // Process might already be dead
    }
  }

  console.log('All processes cleaned up');
  setTimeout(() => {
    process.exit(0);
  }, 500);
}

// Cleanup leftover processes first
cleanupLeftoverProcesses();

// Wait a bit for cleanup to complete
setTimeout(() => {
  vite = spawn('npm', ['run', 'dev:react'], {
    shell: true,
    stdio: 'inherit',
    detached: false
  });

  vite.on('error', (err) => {
    console.error('Vite process error:', err);
    cleanup();
  });

  vite.on('exit', () => {
    console.log('Vite process exited');
  });

  const opts = {
    resources: ['tcp:5173'],
    delay: 1000,
    interval: 100,
    timeout: 30000,
    window: 1000
  };

  console.log('Waiting for Vite to start on port 5173...');

  waitOn(opts)
    .then(() => {
      console.log('Vite is ready! Starting Electron...');
      electron = spawn('run-electron.bat', [], {
        shell: true,
        stdio: 'inherit',
        cwd: __dirname,
        detached: false
      });

      electron.on('error', (err) => {
        console.error('Electron process error:', err);
        cleanup();
      });

      electron.on('close', (code) => {
        console.log(`Electron closed with code ${code}`);
        cleanup();
      });

      electron.on('exit', (code) => {
        console.log(`Electron exited with code ${code}`);
        cleanup();
      });
    })
    .catch((err) => {
      console.error('Error waiting for Vite:', err);
      cleanup();
    });
}, 1000);

// Handle various termination signals
process.on('SIGINT', () => cleanup());
process.on('SIGTERM', () => cleanup());
process.on('SIGHUP', () => cleanup());

// This catches the process being killed
process.on('exit', () => {
  if (!isShuttingDown) {
    console.log('Process exiting, force killing all processes...');
    killViteProcesses();
    killPort5173();
  }
});

// Handle Windows-specific termination
if (process.platform === 'win32') {
  require('readline')
    .createInterface({
      input: process.stdin,
      output: process.stdout
    })
    .on('SIGINT', () => cleanup());
}

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  cleanup();
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  cleanup();
});
