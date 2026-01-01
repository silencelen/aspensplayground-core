const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('path');

let mainWindow;

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
            webgl: true,
            backgroundThrottling: false, // Keep game running when minimized
            webSecurity: true,
            allowRunningInsecureContent: false,
        },
        autoHideMenuBar: true,
        backgroundColor: '#1a0a0a',
    });

    // Set up Content Security Policy to allow WebSocket connections
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; " +
                    "connect-src 'self' wss://aspensplayground.com ws://aspensplayground.com https://aspensplayground.com https://fonts.googleapis.com https://fonts.gstatic.com; " +
                    "font-src 'self' https://fonts.gstatic.com; " +
                    "img-src 'self' data: blob:; " +
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;"
                ]
            }
        });
    });

    // Load the game
    mainWindow.loadFile(path.join(resourcePath, 'index.html'));

    // Remove menu bar for cleaner game experience
    Menu.setApplicationMenu(null);

    // Open DevTools in development mode
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    // Handle special keys
    mainWindow.webContents.on('before-input-event', (event, input) => {
        // F11: Toggle fullscreen
        if (input.key === 'F11' && input.type === 'keyDown') {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
            event.preventDefault();
            return;
        }

        // F12: Toggle DevTools
        if (input.key === 'F12' && input.type === 'keyDown') {
            if (mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.closeDevTools();
            } else {
                mainWindow.webContents.openDevTools();
            }
            event.preventDefault();
            return;
        }

        // IMPORTANT: Do NOT preventDefault for F3, F4, F6 - let them pass to the game
        // F3 = Debug Log, F4 = God Mode, F6 = Infinite Ammo
    });

    // Log WebSocket connections for debugging
    mainWindow.webContents.session.webRequest.onBeforeRequest(
        { urls: ['wss://*/*', 'ws://*/*'] },
        (details, callback) => {
            console.log('[Electron] WebSocket request:', details.url);
            callback({ cancel: false });
        }
    );

    // Forward console messages for debugging
    mainWindow.webContents.on('console-message', (event, level, message) => {
        if (message.includes('WebSocket') || message.includes('[Electron]') || message.includes('Connecting')) {
            console.log('[Renderer]', message);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Log when the window is ready
    mainWindow.webContents.on('did-finish-load', () => {
        console.log('[Electron] Game loaded successfully');
        console.log('[Electron] Resource path:', resourcePath);
    });

    // Handle certificate errors gracefully
    mainWindow.webContents.on('certificate-error', (event, url, error, certificate, callback) => {
        console.log('[Electron] Certificate error:', error, 'for URL:', url);
        event.preventDefault();
        callback(true);
    });
}

// App ready
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Error handlers
process.on('uncaughtException', (error) => {
    console.error('[Electron] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
    console.error('[Electron] Unhandled Rejection:', reason);
});
