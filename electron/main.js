const { app, BrowserWindow, Menu } = require('electron');
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
        },
        autoHideMenuBar: true,
        backgroundColor: '#1a0a0a',
    });

    // Load the game
    mainWindow.loadFile(path.join(resourcePath, 'index.html'));

    // Remove menu bar for cleaner game experience
    Menu.setApplicationMenu(null);

    // Open DevTools in development
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    // Handle fullscreen toggle with F11
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F11') {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
            event.preventDefault();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        // On macOS, re-create window when dock icon is clicked
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
