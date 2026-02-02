const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getConfig: () => ipcRenderer.invoke('get-config'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    platform: process.platform,
    
    getSteamPath: () => ipcRenderer.invoke('get-steam-path'),
    getSavedSteamPath: () => ipcRenderer.invoke('get-saved-steam-path'),
    saveSteamPath: (path) => ipcRenderer.invoke('save-steam-path', path),
    validateSteamFolder: (path) => ipcRenderer.invoke('validate-steam-folder', path),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    
    checkSteamBitness: (steamPath) => ipcRenderer.invoke('check-steam-bitness', steamPath),
    downgradeSteam: (steamPath) => ipcRenderer.invoke('downgrade-steam', steamPath),
    upgradeSteam: (steamPath) => ipcRenderer.invoke('upgrade-steam', steamPath),
    
    onDowngradeProgress: (callback) => {
        ipcRenderer.on('downgrade-progress', (event, data) => callback(data));
    },
    removeDowngradeProgressListener: () => {
        ipcRenderer.removeAllListeners('downgrade-progress');
    },
    
    checkSmiStatus: (steamPath) => ipcRenderer.invoke('check-smi-status', steamPath),
    installSmiResources: (steamPath) => ipcRenderer.invoke('install-smi-resources', steamPath),
    uninstallSmiResources: (steamPath) => ipcRenderer.invoke('uninstall-smi-resources', steamPath),
    
    listInstalledGames: (steamPath) => ipcRenderer.invoke('list-installed-games', steamPath),
    uninstallGame: (steamPath, gameId) => ipcRenderer.invoke('uninstall-game', steamPath, gameId),
    
    installManifestFromZip: (steamPath, zipPath) => ipcRenderer.invoke('install-manifest-from-zip', steamPath, zipPath),
    installManifestFromFolder: (steamPath, folderPath) => ipcRenderer.invoke('install-manifest-from-folder', steamPath, folderPath),
    selectZipFile: () => ipcRenderer.invoke('select-zip-file'),
    uploadManifestFiles: (steamPath, files) => ipcRenderer.invoke('upload-manifest-files', steamPath, files),
    
    isSteamRunning: () => ipcRenderer.invoke('is-steam-running'),
    restartSteam: (steamPath) => ipcRenderer.invoke('restart-steam', steamPath),
    
    getSteamCredentials: () => ipcRenderer.invoke('get-steam-credentials'),
    steamLogin: (username, password, saveCredentials) => ipcRenderer.invoke('steam-login', username, password, saveCredentials),
    submitSteamGuard: (code) => ipcRenderer.invoke('submit-steam-guard', code),
    steamIsLoggedIn: () => ipcRenderer.invoke('steam-is-logged-in'),
    steamLogout: (clearCredentials) => ipcRenderer.invoke('steam-logout', clearCredentials),
    getOwnedGames: () => ipcRenderer.invoke('get-owned-games'),
    getAppDepots: (appId) => ipcRenderer.invoke('get-app-depots', appId),
    generateManifest: (appId, depotId, manifestId, steamPath) => ipcRenderer.invoke('generate-manifest', appId, depotId, manifestId, steamPath),
    openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
    
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    closeWindow: () => ipcRenderer.send('close-window')
});
