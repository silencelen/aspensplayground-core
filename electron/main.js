const { app, BrowserWindow, Menu, session, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

let mainWindow;

/**
 * Detect if running as portable version vs installed version
 * Portable version should not auto-update (users manage manually)
 */
function isPortableMode() {
    const exePath = app.getPath('exe');
    const exeDir = path.dirname(exePath);

    // Method 1: Check if running from a "Portable" named executable
    if (exePath.toLowerCase().includes('portable')) {
        return true;
    }

    // Method 2: Check for uninstall registry/file (NSIS creates this)
    const uninstallerPath = path.join(exeDir, 'Uninstall Aspens Playground.exe');
    if (fs.existsSync(uninstallerPath)) {
        return false; // Installed version
    }

    // Method 3: Check if app is in Program Files
    const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';

    if (exeDir.startsWith(programFiles) ||
        exeDir.startsWith(programFilesX86) ||
        exeDir.includes('AppData\\Local\\Programs')) {
        return false; // Likely installed
    }

    // Method 4: Check for portable marker file
    const portableMarker = path.join(exeDir, '.portable');
    if (fs.existsSync(portableMarker)) {
        return true;
    }

    // Default: assume portable if none of the above (safer default)
    return true;
}

/**
 * Set up auto-updater for installed versions only
 */
function setupAutoUpdater() {
    // Skip updates in development mode
    if (!app.isPackaged) {
        console.log('[AutoUpdater] Development mode - auto-update disabled');
        return;
    }

    // Skip updates in portable mode
    if (isPortableMode()) {
        console.log('[AutoUpdater] Portable mode detected - auto-update disabled');
        return;
    }

    // Configure auto-updater
    autoUpdater.autoDownload = false; // User must approve
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;

    // Logging
    autoUpdater.logger = {
        info: (msg) => console.log('[AutoUpdater]', msg),
        warn: (msg) => console.warn('[AutoUpdater]', msg),
        error: (msg) => console.error('[AutoUpdater]', msg)
    };

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
        console.log('[AutoUpdater] Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
        console.log('[AutoUpdater] Update available:', info.version);
        if (mainWindow) {
            mainWindow.webContents.send('update-available', {
                version: info.version,
                releaseDate: info.releaseDate,
                releaseNotes: info.releaseNotes
            });
        }
    });

    autoUpdater.on('update-not-available', () => {
        console.log('[AutoUpdater] No updates available');
        if (mainWindow) {
            mainWindow.webContents.send('update-not-available');
        }
    });

    autoUpdater.on('download-progress', (progress) => {
        console.log(`[AutoUpdater] Download: ${progress.percent.toFixed(1)}%`);
        if (mainWindow) {
            mainWindow.webContents.send('download-progress', {
                percent: progress.percent,
                bytesPerSecond: progress.bytesPerSecond,
                transferred: progress.transferred,
                total: progress.total
            });
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('[AutoUpdater] Update downloaded:', info.version);
        if (mainWindow) {
            mainWindow.webContents.send('update-downloaded', {
                version: info.version
            });
        }
    });

    autoUpdater.on('error', (error) => {
        console.error('[AutoUpdater] Error:', error);
        if (mainWindow) {
            mainWindow.webContents.send('update-error', error.message);
        }
    });
}

/**
 * Set up IPC handlers for renderer communication
 */
function setupIpcHandlers() {
    ipcMain.handle('check-for-updates', async () => {
        if (!app.isPackaged) {
            return { devMode: true };
        }
        if (isPortableMode()) {
            return { portable: true };
        }
        try {
            await autoUpdater.checkForUpdates();
            return { checking: true };
        } catch (error) {
            return { error: error.message };
        }
    });

    ipcMain.handle('download-update', async () => {
        try {
            await autoUpdater.downloadUpdate();
            return { downloading: true };
        } catch (error) {
            return { error: error.message };
        }
    });

    ipcMain.handle('install-update', () => {
        autoUpdater.quitAndInstall(false, true);
    });

    ipcMain.handle('get-app-version', () => {
        return app.getVersion();
    });

    ipcMain.handle('is-portable-mode', () => {
        return isPortableMode();
    });
}

function createWindow() {
    // Determine the correct path to resources
    const isDev = !app.isPackaged;
    const resourcePath = isDev
        ? path.join(__dirname, '..')
        : path.join(process.resourcesPath, 'app');

    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 800,
        minHeight: 600,
        title: "Aspen's Playground",
        icon: path.join(__dirname, 'resources', 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webgl: true,
            backgroundThrottling: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
        },
        autoHideMenuBar: true,
        backgroundColor: '#1a0a0a',
    });

    // Set up Content Security Policy to allow external resources
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self' 'unsafe-inline' data: blob:; " +
                    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
                    "connect-src 'self' wss://aspensplayground.com ws://aspensplayground.com https://aspensplayground.com https://fonts.googleapis.com https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
                    "font-src 'self' https://fonts.gstatic.com; " +
                    "img-src 'self' data: blob:; " +
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;"
                ]
            }
        });
    });

    // Load the game
    mainWindow.loadFile(path.join(resourcePath, 'index.html'));

    // Remove menu bar
    Menu.setApplicationMenu(null);

    // DevTools in dev mode
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    // Handle special keys
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F11' && input.type === 'keyDown') {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
            event.preventDefault();
            return;
        }
        if (input.key === 'F12' && input.type === 'keyDown') {
            if (mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.closeDevTools();
            } else {
                mainWindow.webContents.openDevTools();
            }
            event.preventDefault();
            return;
        }
        // F3, F4, F6 pass through to game for debug features
    });

    // Log WebSocket connections
    mainWindow.webContents.session.webRequest.onBeforeRequest(
        { urls: ['wss://*/*', 'ws://*/*'] },
        (details, callback) => {
            console.log('[Electron] WebSocket request:', details.url);
            callback({ cancel: false });
        }
    );

    mainWindow.webContents.on('console-message', (event, level, message) => {
        if (message.includes('WebSocket') || message.includes('[Electron]') || message.includes('Connecting')) {
            console.log('[Renderer]', message);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.webContents.on('did-finish-load', () => {
        console.log('[Electron] Game loaded successfully');

        // Check for updates after window loads (with delay to not block startup)
        setTimeout(() => {
            if (app.isPackaged && !isPortableMode()) {
                autoUpdater.checkForUpdates().catch(err => {
                    console.log('[AutoUpdater] Initial check failed:', err.message);
                });
            }
        }, 5000); // 5 second delay
    });

    // Certificate error handling - ONLY allow bypass in development mode
    // In production, invalid certificates are rejected to prevent MITM attacks
    mainWindow.webContents.on('certificate-error', (event, url, error, certificate, callback) => {
        console.log('[Electron] Certificate error:', error, 'for URL:', url);

        if (!app.isPackaged) {
            // Development mode: allow self-signed certs for localhost testing
            console.log('[Electron] Development mode - allowing certificate bypass');
            event.preventDefault();
            callback(true);
        } else {
            // Production mode: reject invalid certificates for security
            console.error('[Electron] Production mode - rejecting invalid certificate');
            callback(false);
        }
    });

    // Handle new window requests (target="_blank" links)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        console.log('[Electron] Window open request:', url);

        // External URLs - open in default browser
        if (url.startsWith('http://') || url.startsWith('https://')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }

        // Local files (privacy.html, terms.html) - open in popup window
        if (url.includes('privacy.html') || url.includes('terms.html')) {
            const isDev = !app.isPackaged;
            const resourcePath = isDev
                ? path.join(__dirname, '..')
                : path.join(process.resourcesPath, 'app');

            const fileName = url.includes('privacy.html') ? 'privacy.html' : 'terms.html';
            const filePath = path.join(resourcePath, fileName);

            // Create popup window for legal docs
            const popup = new BrowserWindow({
                width: 800,
                height: 600,
                parent: mainWindow,
                modal: false,
                autoHideMenuBar: true,
                backgroundColor: '#1a0a0a',
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });
            popup.loadFile(filePath);
            return { action: 'deny' };
        }

        return { action: 'allow' };
    });
}

app.whenReady().then(() => {
    setupIpcHandlers();
    setupAutoUpdater();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

process.on('uncaughtException', (error) => {
    console.error('[Electron] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
    console.error('[Electron] Unhandled Rejection:', reason);
});
