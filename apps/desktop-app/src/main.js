import { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import Store from 'electron-store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store();
let mainWindow;
let tray;
let discordProcess;
let harvesterProcess;

// Service management
const services = {
  discord: {
    process: null,
    status: 'stopped',
    path: 'C:\\Users\\lucas\\league\\apps\\discord-bot',
    command: 'npm',
    args: ['run', 'dev']
  },
  harvester: {
    process: null,
    status: 'stopped',
    path: 'C:\\Users\\lucas\\league\\apps\\harvester',
    command: 'npm',
    args: ['run', 'dev']
  }
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false, // Custom title bar
    backgroundColor: '#0a0e1a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false
  });

  // Load the control panel
  mainWindow.loadURL('http://localhost:4000');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window controls
  ipcMain.on('window-minimize', () => mainWindow.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.on('window-close', () => mainWindow.hide());

  // Prevent actual close, hide to tray instead
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show League Coach',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Discord Bot',
      submenu: [
        {
          label: 'Start',
          click: () => startService('discord'),
          enabled: () => services.discord.status === 'stopped'
        },
        {
          label: 'Stop',
          click: () => stopService('discord'),
          enabled: () => services.discord.status === 'running'
        }
      ]
    },
    {
      label: 'Harvester',
      submenu: [
        {
          label: 'Start',
          click: () => startService('harvester'),
          enabled: () => services.harvester.status === 'stopped'
        },
        {
          label: 'Stop',
          click: () => stopService('harvester'),
          enabled: () => services.harvester.status === 'running'
        }
      ]
    },
    {
      type: 'separator'
    },
    {
      label: 'Start All Services',
      click: startAllServices
    },
    {
      label: 'Stop All Services',
      click: stopAllServices
    },
    {
      type: 'separator'
    },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: store.get('startWithWindows', false),
      click: (menuItem) => {
        store.set('startWithWindows', menuItem.checked);
        app.setLoginItemSettings({
          openAtLogin: menuItem.checked,
          path: app.getPath('exe')
        });
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        stopAllServices();
        app.quit();
      }
    }
  ]);

  tray.setToolTip('League Coach');
  tray.setContextMenu(contextMenu);

  // Double click to show
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  updateTrayIcon();
}

function updateTrayIcon() {
  // Update tray icon based on service status
  const discordRunning = services.discord.status === 'running';
  const harvesterRunning = services.harvester.status === 'running';
  
  let tooltip = 'League Coach';
  if (discordRunning && harvesterRunning) {
    tooltip += ' - All services running';
    tray.setImage(path.join(__dirname, '../assets/tray-icon-active.png'));
  } else if (discordRunning || harvesterRunning) {
    tooltip += ' - Some services running';
    tray.setImage(path.join(__dirname, '../assets/tray-icon-partial.png'));
  } else {
    tooltip += ' - Services stopped';
    tray.setImage(path.join(__dirname, '../assets/tray-icon.png'));
  }
  
  tray.setToolTip(tooltip);
}

function startService(serviceName) {
  const service = services[serviceName];
  if (service.status === 'running') return;

  console.log(`Starting ${serviceName}...`);
  
  service.process = spawn(service.command, service.args, {
    cwd: service.path,
    shell: true,
    detached: false
  });

  service.status = 'running';
  
  service.process.on('exit', () => {
    console.log(`${serviceName} stopped`);
    service.status = 'stopped';
    service.process = null;
    updateTrayIcon();
  });

  updateTrayIcon();
  
  // Notify renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('service-status-changed', { serviceName, status: 'running' });
  }
}

function stopService(serviceName) {
  const service = services[serviceName];
  if (service.status === 'stopped' || !service.process) return;

  console.log(`Stopping ${serviceName}...`);
  
  // Kill the process tree
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', service.process.pid, '/f', '/t'], { shell: true });
  } else {
    service.process.kill('SIGTERM');
  }
  
  service.status = 'stopped';
  service.process = null;
  updateTrayIcon();
  
  // Notify renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('service-status-changed', { serviceName, status: 'stopped' });
  }
}

function startAllServices() {
  startService('discord');
  setTimeout(() => startService('harvester'), 2000); // Delay to ensure Discord bot is ready
}

function stopAllServices() {
  stopService('discord');
  stopService('harvester');
}

// IPC handlers for renderer
ipcMain.handle('get-service-status', () => {
  return {
    discord: services.discord.status,
    harvester: services.harvester.status
  };
});

ipcMain.on('start-service', (event, serviceName) => startService(serviceName));
ipcMain.on('stop-service', (event, serviceName) => stopService(serviceName));
ipcMain.on('restart-services', () => {
  stopAllServices();
  setTimeout(startAllServices, 2000);
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  
  // Auto-start services
  if (store.get('autoStartServices', true)) {
    setTimeout(startAllServices, 1000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopAllServices();
});

// Handle protocol for deep linking (league-coach://)
app.setAsDefaultProtocolClient('league-coach');