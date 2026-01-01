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
                    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; " +
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; " +
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
    });

    mainWindow.webContents.on('certificate-error', (event, url, error, certificate, callback) => {
        console.log('[Electron] Certificate error:', error, 'for URL:', url);
        event.preventDefault();
        callback(true);
    });
}

app.whenReady().then(() => {
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
