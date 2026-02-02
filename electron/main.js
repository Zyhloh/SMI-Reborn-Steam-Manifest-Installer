const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const https = require('https');
const SteamUser = require('steam-user');
const { LoginSession, EAuthTokenPlatformType, EAuthSessionGuardType } = require('steam-session');

let steamClient = null;
let steamGuardCallback = null;
let loginSession = null;

const configPath = path.join(__dirname, '..', 'config.json');
const userDataPath = path.join(app.getPath('userData'), 'smi-config.json');
let config = {};
let userData = {};

if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

if (fs.existsSync(userDataPath)) {
    userData = JSON.parse(fs.readFileSync(userDataPath, 'utf-8'));
}

function saveUserData() {
    fs.writeFileSync(userDataPath, JSON.stringify(userData, null, 2));
}

const isDev = !app.isPackaged;

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: config.window?.width || 1200,
        height: config.window?.height || 800,
        minWidth: config.window?.minWidth || 800,
        minHeight: config.window?.minHeight || 600,
        title: config.app?.name || 'SMI Reborn',
        icon: path.join(__dirname, '..', 'public', 'icon.ico'),
        frame: false,
        transparent: false,
        backgroundColor: '#0a0a0c',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    const url = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '..', 'out', 'index.html')}`;

    mainWindow.loadURL(url);

    if (isDev && config.dev?.openDevTools) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

ipcMain.handle('get-config', () => config);
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.on('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('close-window', () => {
    if (mainWindow) mainWindow.close();
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-zip-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'ZIP Archives', extensions: ['zip'] }]
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('get-steam-path', async () => {
    const possiblePaths = [
        'C:\\Program Files (x86)\\Steam',
        'C:\\Program Files\\Steam',
        'D:\\Steam',
        'D:\\Program Files (x86)\\Steam',
        'E:\\Steam'
    ];
    
    for (const p of possiblePaths) {
        if (fs.existsSync(path.join(p, 'steam.exe'))) {
            return p;
        }
    }
    throw new Error('Steam not found');
});

ipcMain.handle('get-saved-steam-path', () => {
    return userData.steamPath || null;
});

ipcMain.handle('save-steam-path', (event, steamPath) => {
    userData.steamPath = steamPath;
    saveUserData();
});

ipcMain.handle('validate-steam-folder', (event, folderPath) => {
    const steamExe = path.join(folderPath, 'steam.exe');
    const steamApps = path.join(folderPath, 'steamapps');
    
    if (!fs.existsSync(steamExe)) {
        throw new Error('steam.exe not found in selected folder');
    }
    if (!fs.existsSync(steamApps)) {
        throw new Error('steamapps folder not found');
    }
    return folderPath;
});

ipcMain.handle('check-steam-bitness', async (event, steamPath) => {
    const steamExe = path.join(steamPath, 'steam.exe');
    if (!fs.existsSync(steamExe)) {
        throw new Error('steam.exe not found');
    }
    
    const fd = fs.openSync(steamExe, 'r');
    const header = Buffer.alloc(64);
    fs.readSync(fd, header, 0, 64, 0);
    
    if (header[0] !== 0x4D || header[1] !== 0x5A) {
        fs.closeSync(fd);
        throw new Error('Not a valid executable');
    }
    
    const peOffset = header.readUInt32LE(60);
    const machineBytes = Buffer.alloc(2);
    fs.readSync(fd, machineBytes, 0, 2, peOffset + 4);
    fs.closeSync(fd);
    
    const machine = machineBytes.readUInt16LE(0);
    
    if (machine === 0x014c) return '32';
    if (machine === 0x8664) return '64';
    throw new Error(`Unknown machine type: ${machine.toString(16)}`);
});

ipcMain.handle('check-smi-status', (event, steamPath) => {
    const hidDll = path.join(steamPath, 'hid.dll');
    const depotcache = path.join(steamPath, 'config', 'depotcache');
    const stplugin = path.join(steamPath, 'config', 'stplug-in');
    
    const hidDllInstalled = fs.existsSync(hidDll);
    const depotcacheExists = fs.existsSync(depotcache);
    const stpluginExists = fs.existsSync(stplugin);
    
    return {
        hidDllInstalled,
        depotcacheExists,
        stpluginExists,
        isSetup: hidDllInstalled && depotcacheExists && stpluginExists
    };
});

ipcMain.handle('install-smi-resources', async (event, steamPath) => {
    const hidDllSrc = path.join(__dirname, '..', 'public', 'hid.dll');
    const hidDllDest = path.join(steamPath, 'hid.dll');
    const depotcache = path.join(steamPath, 'config', 'depotcache');
    const stplugin = path.join(steamPath, 'config', 'stplug-in');
    
    if (fs.existsSync(hidDllSrc)) {
        fs.copyFileSync(hidDllSrc, hidDllDest);
    }
    
    if (!fs.existsSync(depotcache)) {
        fs.mkdirSync(depotcache, { recursive: true });
    }
    
    if (!fs.existsSync(stplugin)) {
        fs.mkdirSync(stplugin, { recursive: true });
    }
});

ipcMain.handle('uninstall-smi-resources', async (event, steamPath) => {
    const hidDll = path.join(steamPath, 'hid.dll');
    const depotcache = path.join(steamPath, 'config', 'depotcache');
    const stplugin = path.join(steamPath, 'config', 'stplug-in');
    
    if (fs.existsSync(hidDll)) {
        fs.unlinkSync(hidDll);
    }
    
    if (fs.existsSync(depotcache)) {
        fs.rmSync(depotcache, { recursive: true, force: true });
    }
    
    if (fs.existsSync(stplugin)) {
        fs.rmSync(stplugin, { recursive: true, force: true });
    }
});

ipcMain.handle('list-installed-games', (event, steamPath) => {
    const stplugin = path.join(steamPath, 'config', 'stplug-in');
    const games = [];
    
    if (!fs.existsSync(stplugin)) return games;
    
    const files = fs.readdirSync(stplugin);
    const luaFiles = files.filter(f => f.endsWith('.lua'));
    
    for (const lua of luaFiles) {
        const content = fs.readFileSync(path.join(stplugin, lua), 'utf-8');
        const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
        const idMatch = lua.match(/(\d+)/);
        
        if (idMatch) {
            games.push({
                gameId: idMatch[1],
                gameName: nameMatch ? nameMatch[1] : `Game ${idMatch[1]}`,
                luaFile: lua,
                manifestCount: 1
            });
        }
    }
    
    return games;
});

ipcMain.handle('uninstall-game', async (event, steamPath, gameId) => {
    const stplugin = path.join(steamPath, 'config', 'stplug-in');
    const depotcache = path.join(steamPath, 'config', 'depotcache');
    
    if (fs.existsSync(stplugin)) {
        const files = fs.readdirSync(stplugin);
        for (const file of files) {
            if (file.includes(gameId)) {
                fs.unlinkSync(path.join(stplugin, file));
            }
        }
    }
    
    if (fs.existsSync(depotcache)) {
        const files = fs.readdirSync(depotcache);
        for (const file of files) {
            if (file.includes(gameId)) {
                fs.unlinkSync(path.join(depotcache, file));
            }
        }
    }
});

ipcMain.handle('install-manifest-from-zip', async (event, steamPath, zipPath) => {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    
    const stplugin = path.join(steamPath, 'config', 'stplug-in');
    const depotcache = path.join(steamPath, 'config', 'depotcache');
    
    if (!fs.existsSync(stplugin)) fs.mkdirSync(stplugin, { recursive: true });
    if (!fs.existsSync(depotcache)) fs.mkdirSync(depotcache, { recursive: true });
    
    let luaCount = 0;
    let manifestCount = 0;
    
    for (const entry of entries) {
        if (entry.entryName.endsWith('.lua')) {
            zip.extractEntryTo(entry, stplugin, false, true);
        } else if (entry.entryName.endsWith('.manifest')) {
            zip.extractEntryTo(entry, depotcache, false, true);
        }
    }
});

ipcMain.handle('install-manifest-from-folder', async (event, steamPath, folderPath) => {
    const stplugin = path.join(steamPath, 'config', 'stplug-in');
    const depotcache = path.join(steamPath, 'config', 'depotcache');
    
    if (!fs.existsSync(stplugin)) fs.mkdirSync(stplugin, { recursive: true });
    if (!fs.existsSync(depotcache)) fs.mkdirSync(depotcache, { recursive: true });
    
    const files = fs.readdirSync(folderPath);
    let luaCount = 0;
    let manifestCount = 0;
    
    for (const file of files) {
        const src = path.join(folderPath, file);
        if (file.endsWith('.lua')) {
            fs.copyFileSync(src, path.join(stplugin, file));
            luaCount++;
        } else if (file.endsWith('.manifest')) {
            fs.copyFileSync(src, path.join(depotcache, file));
            manifestCount++;
        }
    }
    
    if (luaCount === 0 || manifestCount === 0) {
        throw new Error(`Folder must contain at least one .lua and one .manifest file. Found ${luaCount} .lua and ${manifestCount} .manifest files.`);
    }
});

ipcMain.handle('downgrade-steam', async (event, steamPath) => {
    return new Promise((resolve, reject) => {
        const script = 'iwr -useb "https://luatools.vercel.app/SteamDowngrader.ps1" | iex';
        
        const ps = exec(`powershell -ExecutionPolicy Bypass -Command "${script}"`, {
            windowsHide: false
        }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Downgrade failed: ${stderr || error.message}`));
                return;
            }
            resolve();
        });
        
        ps.stdout?.on('data', (data) => {
            if (mainWindow) {
                mainWindow.webContents.send('downgrade-progress', data.toString());
            }
        });
        
        ps.stderr?.on('data', (data) => {
            if (mainWindow) {
                mainWindow.webContents.send('downgrade-progress', data.toString());
            }
        });
    });
});

ipcMain.handle('upgrade-steam', async (event, steamPath) => {
    return new Promise((resolve, reject) => {
        exec('taskkill /F /IM steam.exe', () => {});
        exec('taskkill /F /IM steamwebhelper.exe', () => {});
        exec('net stop "Steam Client Service"', () => {});
        
        setTimeout(() => {
            const steamCfg = path.join(steamPath, 'steam.cfg');
            
            try {
                if (fs.existsSync(steamCfg)) {
                    fs.unlinkSync(steamCfg);
                }
                
                const steamExe = path.join(steamPath, 'steam.exe');
                exec(`"${steamExe}"`, () => {});
                
                resolve();
            } catch (e) {
                reject(new Error(`Failed to upgrade Steam: ${e.message}`));
            }
        }, 2000);
    });
});

ipcMain.handle('is-steam-running', async () => {
    try {
        const { execSync } = require('child_process');
        const out = execSync('tasklist /FI "IMAGENAME eq steam.exe"').toString();
        return out.toLowerCase().includes('steam.exe');
    } catch {
        return false;
    }
});

ipcMain.handle('restart-steam', async (event, steamPath) => {
    exec('taskkill /F /IM steam.exe', () => {});
    exec('taskkill /F /IM steamwebhelper.exe', () => {});
    
    await new Promise(r => setTimeout(r, 2000));
    
    const steamExe = path.join(steamPath, 'steam.exe');
    if (fs.existsSync(steamExe)) {
        exec(`"${steamExe}"`, () => {});
    }
});

ipcMain.handle('upload-manifest-files', async (event, steamPath, files) => {
    const AdmZip = require('adm-zip');
    
    const stplugin = path.join(steamPath, 'config', 'stplug-in');
    const depotcache = path.join(steamPath, 'config', 'depotcache');
    
    if (!fs.existsSync(stplugin)) fs.mkdirSync(stplugin, { recursive: true });
    if (!fs.existsSync(depotcache)) fs.mkdirSync(depotcache, { recursive: true });
    
    let luaCount = 0;
    let manifestCount = 0;
    
    for (const file of files) {
        if (file.isArchive) {
            const archiveBuffer = Buffer.from(file.data, 'base64');
            const zip = new AdmZip(archiveBuffer);
            const entries = zip.getEntries();
            
            for (const entry of entries) {
                if (entry.isDirectory) continue;
                const fileName = path.basename(entry.entryName).toLowerCase();
                
                if (fileName.endsWith('.lua')) {
                    const dest = path.join(stplugin, path.basename(entry.entryName));
                    fs.writeFileSync(dest, entry.getData());
                    luaCount++;
                } else if (fileName.endsWith('.manifest')) {
                    const dest = path.join(depotcache, path.basename(entry.entryName));
                    fs.writeFileSync(dest, entry.getData());
                    manifestCount++;
                }
            }
        } else {
            const buffer = Buffer.from(file.data, 'base64');
            const fileName = file.name.toLowerCase();
            
            if (fileName.endsWith('.lua')) {
                fs.writeFileSync(path.join(stplugin, file.name), buffer);
                luaCount++;
            } else if (fileName.endsWith('.manifest')) {
                fs.writeFileSync(path.join(depotcache, file.name), buffer);
                manifestCount++;
            }
        }
    }
    
    if (luaCount === 0 || manifestCount === 0) {
        throw new Error(`Must include at least one .lua and one .manifest file. Found ${luaCount} .lua and ${manifestCount} .manifest files.`);
    }
});

// Steam credentials storage
function getSteamCredentialsPath() {
    return path.join(app.getPath('userData'), 'steam-credentials.json');
}

function loadSteamCredentials() {
    try {
        const credPath = getSteamCredentialsPath();
        if (fs.existsSync(credPath)) {
            return JSON.parse(fs.readFileSync(credPath, 'utf-8'));
        }
    } catch (e) {}
    return null;
}

function saveSteamCredentials(username, password) {
    try {
        const credPath = getSteamCredentialsPath();
        fs.writeFileSync(credPath, JSON.stringify({ username, password }));
    } catch (e) {
        console.error('[SMI] Failed to save credentials:', e);
    }
}

function clearSteamCredentials() {
    try {
        const credPath = getSteamCredentialsPath();
        if (fs.existsSync(credPath)) {
            fs.unlinkSync(credPath);
        }
    } catch (e) {}
}

// Get saved Steam credentials
ipcMain.handle('get-steam-credentials', async () => {
    const creds = loadSteamCredentials();
    if (creds && creds.username && creds.password) {
        return { success: true, username: creds.username, password: creds.password };
    }
    return { success: false };
});

// Steam login for manifest dumping using steam-session for device confirmation
ipcMain.handle('steam-login', async (event, username, password, saveCredentials = true) => {
    try {
        const appData = app.getPath('userData');
        const steamDataDir = path.join(appData, 'steam-data');
        if (!fs.existsSync(steamDataDir)) {
            fs.mkdirSync(steamDataDir, { recursive: true });
        }

        // Check for saved refresh token first
        const tokenPath = path.join(steamDataDir, 'refresh_token.json');
        let refreshToken = null;
        if (fs.existsSync(tokenPath)) {
            try {
                const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
                if (tokenData.refreshToken) {
                    refreshToken = tokenData.refreshToken;
                }
            } catch (e) {}
        }

        // If we have a refresh token, try to use it directly with SteamUser
        if (refreshToken) {
            steamClient = new SteamUser({ 
                enablePicsCache: true,
                dataDirectory: steamDataDir,
                promptSteamGuardCode: false
            });

            return new Promise((resolve) => {
                steamClient.logOn({ refreshToken });

                steamClient.once('loggedOn', () => {
                    console.log('[SMI] Steam login successful with refresh token');
                    resolve({ success: true });
                });

                steamClient.once('error', (err) => {
                    console.error('[SMI] Refresh token login failed:', err);
                    // Clear invalid token
                    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
                    resolve({ success: false, error: 'Session expired, please login again' });
                });
            });
        }

        // No refresh token, use steam-session for new login with device confirmation
        loginSession = new LoginSession(EAuthTokenPlatformType.SteamClient);
        
        return new Promise(async (resolve) => {
            loginSession.on('authenticated', async () => {
                console.log('[SMI] Steam session authenticated');
                const token = loginSession.refreshToken;
                
                // Save refresh token
                fs.writeFileSync(tokenPath, JSON.stringify({ refreshToken: token }));
                if (saveCredentials) {
                    saveSteamCredentials(username, password);
                }

                // Now login to SteamUser with the refresh token
                steamClient = new SteamUser({ 
                    enablePicsCache: true,
                    dataDirectory: steamDataDir,
                    promptSteamGuardCode: false
                });

                steamClient.logOn({ refreshToken: token });

                steamClient.once('loggedOn', () => {
                    console.log('[SMI] Steam login successful');
                    resolve({ success: true });
                });

                steamClient.once('error', (err) => {
                    console.error('[SMI] Steam login error:', err);
                    resolve({ success: false, error: err.message });
                });
            });

            loginSession.on('timeout', () => {
                console.log('[SMI] Login session timed out');
                resolve({ success: false, error: 'Login timed out' });
            });

            loginSession.on('error', (err) => {
                console.error('[SMI] Login session error:', err);
                resolve({ success: false, error: err.message });
            });

            try {
                const startResult = await loginSession.startWithCredentials({
                    accountName: username,
                    password: password
                });

                if (startResult.actionRequired) {
                    const guardType = startResult.validActions.find(a => 
                        a.type === EAuthSessionGuardType.DeviceConfirmation
                    );
                    
                    if (guardType) {
                        console.log('[SMI] Device confirmation required - approve on your phone');
                        // Send event to frontend to show "approve on phone" message
                        if (mainWindow) {
                            mainWindow.webContents.send('steam-guard-type', 'device');
                        }
                        resolve({ success: false, needsDeviceConfirmation: true });
                        
                        // Poll for confirmation
                        loginSession.startPolling();
                    } else {
                        // Fall back to code entry
                        const codeType = startResult.validActions.find(a => 
                            a.type === EAuthSessionGuardType.DeviceCode || 
                            a.type === EAuthSessionGuardType.EmailCode
                        );
                        
                        if (codeType) {
                            steamGuardCallback = async (code) => {
                                await loginSession.submitSteamGuardCode(code);
                            };
                            resolve({ 
                                success: false, 
                                needsSteamGuard: true, 
                                isEmailCode: codeType.type === EAuthSessionGuardType.EmailCode 
                            });
                        } else {
                            resolve({ success: false, error: 'Unknown auth method required' });
                        }
                    }
                }
            } catch (err) {
                console.error('[SMI] Start credentials error:', err);
                let errorMessage = err.message;
                let isRateLimited = false;
                
                // Handle specific error codes
                if (err.eresult === 84 || err.message.includes('RateLimitExceeded')) {
                    errorMessage = 'Too many login attempts. Please wait a few minutes and try again.';
                    isRateLimited = true;
                } else if (err.eresult === 87 || err.message.includes('AccountLoginDeniedThrottle')) {
                    errorMessage = 'Login temporarily blocked due to too many attempts. Please wait 15-30 minutes before trying again.';
                    isRateLimited = true;
                } else if (err.eresult === 5 || err.message.includes('InvalidPassword')) {
                    errorMessage = 'Invalid username or password.';
                } else if (err.eresult === 18 || err.message.includes('AccountNotFound')) {
                    errorMessage = 'Account not found. Check your username.';
                }
                
                resolve({ success: false, error: errorMessage, isRateLimited });
            }
        });
    } catch (err) {
        console.error('[SMI] Steam login exception:', err);
        let errorMessage = err.message;
        let isRateLimited = false;
        
        if (err.eresult === 84 || err.message.includes('RateLimitExceeded') || 
            err.eresult === 87 || err.message.includes('AccountLoginDeniedThrottle')) {
            errorMessage = 'Login temporarily blocked. Please wait 15-30 minutes before trying again.';
            isRateLimited = true;
        }
        
        return { success: false, error: errorMessage, isRateLimited };
    }
});

// Submit Steam Guard code
ipcMain.handle('submit-steam-guard', async (event, code) => {
    try {
        if (!loginSession) {
            return { success: false, error: 'No login session active' };
        }

        await loginSession.submitSteamGuardCode(code);
        
        // The 'authenticated' event on loginSession will handle the rest
        // Return a pending state - the frontend should wait for the login to complete
        return { success: true, pending: true };
    } catch (err) {
        console.error('[SMI] Steam Guard code error:', err);
        return { success: false, error: err.message, codeWrong: true };
    }
});

// Check if logged in to Steam
ipcMain.handle('steam-is-logged-in', async () => {
    return steamClient !== null && steamClient.steamID !== null;
});

// Steam logout
ipcMain.handle('steam-logout', async (event, clearCredentials = true) => {
    if (steamClient) {
        steamClient.logOff();
        steamClient = null;
    }
    if (clearCredentials) {
        clearSteamCredentials();
    }
    return { success: true };
});

// Get owned games from Steam
ipcMain.handle('get-owned-games', async () => {
    try {
        if (!steamClient) {
            return { success: false, error: 'Not logged in to Steam' };
        }

        return new Promise((resolve) => {
            steamClient.getUserOwnedApps(steamClient.steamID, {
                includePlayedFreeGames: true,
                includeFreeSub: true
            }, (err, response) => {
                if (err) {
                    resolve({ success: false, error: err.message });
                } else {
                    const games = response.apps.map(app => ({
                        appId: app.appid,
                        name: app.name || `App ${app.appid}`,
                        playtime: app.playtime_forever || 0
                    }));
                    resolve({ success: true, games });
                }
            });
        });
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Get app details (depots) from Steam
ipcMain.handle('get-app-depots', async (event, appId) => {
    try {
        if (!steamClient) {
            return { success: false, error: 'Not logged in to Steam' };
        }

        return new Promise((resolve) => {
            steamClient.getProductInfo([appId], [], (err, apps) => {
                if (err) {
                    resolve({ success: false, error: err.message });
                    return;
                }

                const appInfo = apps[appId];
                if (!appInfo || !appInfo.appinfo) {
                    resolve({ success: false, error: 'App info not found' });
                    return;
                }

                const depots = appInfo.appinfo.depots || {};
                const depotList = [];

                for (const [depotId, depotInfo] of Object.entries(depots)) {
                    if (depotId === 'branches' || !depotInfo.manifests) continue;
                    if (depotInfo.config && depotInfo.config.oslist && !depotInfo.config.oslist.includes('windows')) continue;
                    
                    const publicManifest = depotInfo.manifests?.public;
                    if (publicManifest) {
                        let manifestId;
                        if (typeof publicManifest === 'string') {
                            manifestId = publicManifest;
                        } else if (typeof publicManifest === 'object') {
                            if (publicManifest.gid) {
                                manifestId = String(publicManifest.gid);
                            } else if (publicManifest.toString && publicManifest.toString() !== '[object Object]') {
                                manifestId = publicManifest.toString();
                            } else {
                                const keys = Object.keys(publicManifest);
                                if (keys.length > 0) {
                                    manifestId = String(publicManifest[keys[0]]);
                                } else {
                                    manifestId = JSON.stringify(publicManifest);
                                }
                            }
                        } else {
                            manifestId = String(publicManifest);
                        }
                        
                        depotList.push({
                            depotId: parseInt(depotId),
                            name: depotInfo.name || `Depot ${depotId}`,
                            manifestId: manifestId,
                            maxSize: depotInfo.maxsize ? parseInt(depotInfo.maxsize) : 0
                        });
                    }
                }

                // Sort by size descending to show main content depot first
                depotList.sort((a, b) => b.maxSize - a.maxSize);

                resolve({ success: true, depots: depotList, appName: appInfo.appinfo.common?.name || `App ${appId}` });
            });
        });
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Generate manifest - dumps to export folder for sharing
ipcMain.handle('generate-manifest', async (event, appId, depotId, manifestId, steamPath) => {
    try {
        if (!steamClient) {
            return { success: false, error: 'Not logged in to Steam' };
        }

        console.log('[SMI] Generating manifest for App:', appId, 'Depot:', depotId, 'Manifest:', manifestId);

        // Try to request free license
        try {
            await new Promise((resolve) => {
                steamClient.requestFreeLicense([appId], () => resolve());
            });
        } catch (e) {}

        // Get depot decryption key
        const depotKey = await new Promise((resolve, reject) => {
            steamClient.getDepotDecryptionKey(appId, depotId, (err, key) => {
                if (err) reject(err);
                else resolve(key);
            });
        });

        // Download manifest
        const rawManifest = await new Promise((resolve, reject) => {
            steamClient.getRawManifest(appId, depotId, manifestId, (err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });

        // Save to export folder in user's Documents
        const documentsPath = app.getPath('documents');
        const exportDir = path.join(documentsPath, 'SMI Exports', `${appId}`);
        
        if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

        const fileBase = `${depotId}_${manifestId}`;
        const keyHex = Buffer.isBuffer(depotKey) ? depotKey.toString('hex').toUpperCase() : depotKey;
        
        // Save manifest file
        const manifestPath = path.join(exportDir, `${fileBase}.manifest`);
        fs.writeFileSync(manifestPath, rawManifest);

        // Generate and save Lua file
        const luaContent = `-- Name: App ${appId}
addappid(${appId})
addappid(${depotId},1,"${keyHex}")
setManifestid(${depotId},"${manifestId}",0)`;
        const luaPath = path.join(exportDir, `${appId}.lua`);
        fs.writeFileSync(luaPath, luaContent);

        // Generate and save VDF file
        const vdfContent = `"depots"
{
	"${depotId}"
	{
		"DecryptionKey"		"${keyHex}"
	}
}`;
        const vdfPath = path.join(exportDir, `${fileBase}.vdf`);
        fs.writeFileSync(vdfPath, vdfContent);

        return {
            success: true,
            appId,
            depotId,
            manifestId,
            outputDir: exportDir,
            files: [`${fileBase}.manifest`, `${appId}.lua`, `${fileBase}.vdf`]
        };
    } catch (err) {
        console.error('[SMI] Generate manifest error:', err);
        return { success: false, error: err.message };
    }
});

// Open folder in explorer
ipcMain.handle('open-folder', async (event, folderPath) => {
    try {
        shell.openPath(folderPath);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
