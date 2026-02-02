
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const Seven = require('node-7z');
const sevenBin = require('7zip-bin');
const { createExtractorFromData } = require('node-unrar-js');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const SteamUser = require('steam-user');

// Steam client for manifest dumping
let steamClient = null;
let steamGuardCallback = null;

// Completely disable stdin to prevent steam-user console prompts
if (process.stdin.isTTY) {
  process.stdin.pause();
  process.stdin.setRawMode(false);
}
// Remove all stdin listeners
process.stdin.removeAllListeners();

// Manifest dumper config file
function getManifestConfigFile() {
  const appData = app.getPath('userData');
  return path.join(appData, 'manifest-config.json');
}

function loadManifestConfig() {
  try {
    const configFile = getManifestConfigFile();
    if (fs.existsSync(configFile)) {
      const data = fs.readFileSync(configFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('[SMI] Failed to load manifest config:', e);
  }
  return {
    dumpPath: path.join(process.env.ProgramData || 'C:\\ProgramData', 'SMI', 'dumps'),
    saveCredentials: false,
    username: '',
    password: ''
  };
}

function saveManifestConfig(config) {
  try {
    const configFile = getManifestConfigFile();
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    return true;
  } catch (e) {
    console.error('[SMI] Failed to save manifest config:', e);
    return false;
  }
}

// Helper function to extract archives (.zip, .7z, or .rar)
async function extractArchive(buffer, fileName) {
  const ext = path.extname(fileName).toLowerCase();
  
  if (ext === '.zip') {
    // Use AdmZip for .zip files
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    
    return {
      entries: entries.map(entry => ({
        isDirectory: entry.isDirectory,
        fileName: path.basename(entry.entryName),
        entryName: entry.entryName,
        getData: () => entry.getData()
      }))
    };
  } else if (ext === '.rar') {
    // Use node-unrar-js for .rar files
    try {
      const extractor = await createExtractorFromData({ data: buffer });
      const list = extractor.getFileList();
      const fileHeaders = [...list.fileHeaders];
      
      const entries = [];
      for (const fileHeader of fileHeaders) {
        const extracted = extractor.extract({ files: [fileHeader.name] });
        const files = [...extracted.files];
        
        if (files.length > 0 && files[0].extraction) {
          entries.push({
            isDirectory: fileHeader.flags.directory,
            fileName: path.basename(fileHeader.name),
            entryName: fileHeader.name,
            getData: () => Buffer.from(files[0].extraction)
          });
        }
      }
      
      return { entries };
    } catch (err) {
      throw new Error(`Failed to extract RAR archive: ${err.message}`);
    }
  } else if (ext === '.7z') {
    // Use 7zip for .7z files
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    const tempDir = path.join(programData, 'SMI', 'temp', Date.now().toString());
    const tempArchivePath = path.join(tempDir, fileName);
    
    try {
      // Create temp directory
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Write buffer to temp file
      fs.writeFileSync(tempArchivePath, buffer);
      
      // Extract using 7zip
      await new Promise((resolve, reject) => {
        const stream = Seven.extractFull(tempArchivePath, tempDir, {
          $bin: sevenBin.path7za
        });
        
        stream.on('end', () => resolve());
        stream.on('error', (err) => reject(err));
      });
      
      // Read extracted files into memory BEFORE cleanup
      const entries = [];
      const scanDir = (dirPath) => {
        const items = fs.readdirSync(dirPath);
        for (const item of items) {
          const fullPath = path.join(dirPath, item);
          const stat = fs.statSync(fullPath);
          const relativePath = path.relative(tempDir, fullPath);
          
          if (stat.isDirectory()) {
            scanDir(fullPath);
          } else {
            // Read file data into memory NOW, before cleanup
            const fileData = fs.readFileSync(fullPath);
            entries.push({
              isDirectory: false,
              fileName: item,
              entryName: relativePath,
              getData: () => fileData
            });
          }
        }
      };
      
      scanDir(tempDir);
      
      // Clean up temp files (safe now that data is in memory)
      fs.rmSync(tempDir, { recursive: true, force: true });
      
      return { entries };
    } catch (err) {
      // Clean up on error
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      throw err;
    }
  } else {
    throw new Error(`Unsupported archive format: ${ext}`);
  }
}

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 1200,
    minHeight: 750,
    maxWidth: 1200,
    maxHeight: 750,
    resizable: false,
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'resources', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, 'renderer', 'build', 'index.html'));
  } else {
    win.loadURL('http://localhost:3000');
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

const getSteamPathFile = () => {
  const userData = app.getPath('userData');
  return path.join(userData, 'steam-path.json');
};

// Auto-detect Steam path from Windows Registry
const autoDetectSteamPath = async () => {
  try {
    // Query Windows Registry for Steam path
    const { stdout } = await execAsync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath');
    
    // Parse the output to extract the path
    const match = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/);
    if (match && match[1]) {
      const steamPath = match[1].trim().replace(/\//g, '\\'); // Convert forward slashes to backslashes
      
      // Verify the path exists and has expected Steam structure
      if (fs.existsSync(steamPath) && fs.existsSync(path.join(steamPath, 'steam.exe'))) {
        return steamPath;
      }
    }
    return null;
  } catch (error) {
    console.error('Failed to auto-detect Steam path:', error);
    return null;
  }
};

ipcMain.handle('select-steam-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const folder = result.filePaths[0];
  const hasSteamExe = fs.existsSync(path.join(folder, 'steam.exe'));
  const hasConfig = fs.existsSync(path.join(folder, 'config')) && fs.lstatSync(path.join(folder, 'config')).isDirectory();
  if (!hasSteamExe || !hasConfig) {
    return { error: 'Not a valid Steam installation path' };
  }
  return { path: folder };
});

// Select manifest archive files
ipcMain.handle('select-manifest-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Archive Files', extensions: ['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    title: 'Select Archive Files'
  });
  
  if (result.canceled || !result.filePaths.length) {
    return { canceled: true };
  }
  
  // Read files and convert to base64
  try {
    const filesData = await Promise.all(result.filePaths.map(async (filePath) => {
      const fileBuffer = fs.readFileSync(filePath);
      const base64Data = fileBuffer.toString('base64');
      return {
        name: path.basename(filePath),
        type: 'application/octet-stream',
        data: base64Data,
        isArchive: true
      };
    }));
    
    return { canceled: false, files: filesData };
  } catch (err) {
    return { canceled: false, error: err.message };
  }
});

ipcMain.handle('save-steam-path', async (event, steamPath) => {
  const file = getSteamPathFile();
  fs.writeFileSync(file, JSON.stringify({ steamPath }), 'utf-8');
  return true;
});

ipcMain.handle('unset-steam-path', async () => {
  const file = getSteamPathFile();
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
  return true;
});

const { execSync } = require('child_process');


function killSteamProcesses() {
  try {
    // Windows: force kill all steam.exe processes and children
    console.log('[SMI] Attempting to kill Steam processes...');
    const out = execSync('taskkill /F /IM steam.exe /T');
    console.log('[SMI] taskkill output:', out.toString());
  } catch (e) {
    console.error('[SMI] taskkill error:', e.message);
  }
}

ipcMain.handle('install-steam-resources', async (event, steamPath) => {
  try {
    killSteamProcesses();
    const dllSrc = path.join(__dirname, 'resources', 'hid.dll');
    const dllDest = path.join(steamPath, 'hid.dll');
    fs.copyFileSync(dllSrc, dllDest);

    const configDir = path.join(steamPath, 'config');
    const depotcacheDir = path.join(configDir, 'depotcache');
    const stpluginDir = path.join(configDir, 'stplug-in');
    if (!fs.existsSync(depotcacheDir)) fs.mkdirSync(depotcacheDir, { recursive: true });
    if (!fs.existsSync(stpluginDir)) fs.mkdirSync(stpluginDir, { recursive: true });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('uninstall-steam-resources', async (event, steamPath) => {
  try {
    killSteamProcesses();
    const dllPath = path.join(steamPath, 'hid.dll');
    const depotcacheDir = path.join(steamPath, 'config', 'depotcache');
    const stpluginDir = path.join(steamPath, 'config', 'stplug-in');
    if (fs.existsSync(dllPath)) fs.unlinkSync(dllPath);
    if (fs.existsSync(depotcacheDir)) fs.rmSync(depotcacheDir, { recursive: true, force: true });
    if (fs.existsSync(stpluginDir)) fs.rmSync(stpluginDir, { recursive: true, force: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('copy-manifest-files', async (event, folderPath, steamPath) => {
  try {
    if (!folderPath || typeof folderPath !== 'string' || !fs.existsSync(folderPath) || !fs.lstatSync(folderPath).isDirectory()) {
      return { success: false, error: 'Dropped item is not a valid folder.' };
    }
    const stpluginDir = path.join(steamPath, 'config', 'stplug-in');
    const depotcacheDir = path.join(steamPath, 'config', 'depotcache');
    if (!fs.existsSync(stpluginDir)) fs.mkdirSync(stpluginDir, { recursive: true });
    if (!fs.existsSync(depotcacheDir)) fs.mkdirSync(depotcacheDir, { recursive: true });
    const files = fs.readdirSync(folderPath);
    const luaFiles = files.filter(f => f.toLowerCase().endsWith('.lua'));
    const manifestFiles = files.filter(f => f.toLowerCase().endsWith('.manifest'));
    if (luaFiles.length === 0 || manifestFiles.length === 0) {
      return { success: false, error: 'Folder must contain at least one .lua and one .manifest file.' };
    }
    for (const file of luaFiles) {
      fs.copyFileSync(path.join(folderPath, file), path.join(stpluginDir, file));
    }
    for (const file of manifestFiles) {
      fs.copyFileSync(path.join(folderPath, file), path.join(depotcacheDir, file));
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

const { spawn } = require('child_process');

function isSteamRunning() {
  try {
    // Windows: check for steam.exe in process list
    const out = execSync('tasklist /FI "IMAGENAME eq steam.exe"').toString();
    return out.toLowerCase().includes('steam.exe');
  } catch (e) {
    return false;
  }
}

// List all installed games (from .lua files in stplug-in)
ipcMain.handle('list-installed-games', async (event, steamPath) => {
  try {
    const stpluginDir = path.join(steamPath, 'config', 'stplug-in');
    const depotcacheDir = path.join(steamPath, 'config', 'depotcache');
    if (!fs.existsSync(stpluginDir)) return [];
    const luaFiles = fs.readdirSync(stpluginDir).filter(f => f.endsWith('.lua'));
    const games = [];
    const gameNameCache = {};
    const https = require('https');
    // Helper to fetch game name async
    function fetchGameName(appid) {
      return new Promise((resolve) => {
        if (gameNameCache[appid]) return resolve(gameNameCache[appid]);
        const url = `https://store.steampowered.com/api/appdetails?appids=${appid}`;
        https.get(url, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed && parsed[appid] && parsed[appid].success && parsed[appid].data && parsed[appid].data.name) {
                gameNameCache[appid] = parsed[appid].data.name;
                resolve(parsed[appid].data.name);
              } else {
                resolve(null);
              }
            } catch (e) { resolve(null); }
          });
        }).on('error', () => resolve(null));
      });
    }
    // First pass: parse all info, collect missing names
    const missingAppids = [];
    const gameObjs = luaFiles.map(luaFile => {
      const luaPath = path.join(stpluginDir, luaFile);
      const content = fs.readFileSync(luaPath, 'utf-8');
      let gameName = null;
      let gameId = null;
      let manifestIds = [];
      let manifestFiles = [];
      const nameMatch = content.match(/^--\s*Name:\s*(.+)$/m);
      if (nameMatch) gameName = nameMatch[1].trim();
      const mainAppMatch = content.match(/^addappid\((\d+)\).*--\s*(.+)$/m);
      if (mainAppMatch) {
        gameId = mainAppMatch[1];
        if (!gameName) gameName = mainAppMatch[2].trim();
      }
      if (!gameName) {
        const firstAppidMatch = content.match(/addappid\((\d+)\)/);
        if (firstAppidMatch) {
          gameId = firstAppidMatch[1];
          missingAppids.push(gameId);
        }
      }
      const manifestIdMatches = [...content.matchAll(/setManifestid\((\d+),\s*\"(\d+)\"/g)];
      manifestIds = manifestIdMatches.map(m => m[2]);
      if (fs.existsSync(depotcacheDir)) {
        const depotFiles = fs.readdirSync(depotcacheDir).filter(f => f.endsWith('.manifest'));
        manifestFiles = depotFiles.filter(f => manifestIds.some(id => f.includes(id)));
      }
      return { gameId, gameName, luaFile, manifestIds, manifestFiles };
    });
    // Fetch all missing names in parallel
    const appidToName = {};
    await Promise.all(missingAppids.map(async appid => {
      const name = await fetchGameName(appid);
      if (name) appidToName[appid] = name;
    }));
    // Build final games list
    for (const g of gameObjs) {
      let gameName = g.gameName;
      if (!gameName && g.gameId && appidToName[g.gameId]) gameName = appidToName[g.gameId];
      if (gameName && g.gameId) {
        games.push({ ...g, gameName });
      }
    }
    return games;
  } catch (err) {
    return [];
  }
});


// Uninstall a game: delete .lua and all associated .manifest files
ipcMain.handle('uninstall-game', async (event, gameId, steamPath) => {
  try {
    const stpluginDir = path.join(steamPath, 'config', 'stplug-in');
    const depotcacheDir = path.join(steamPath, 'config', 'depotcache');
    // Find manifestIds for this game
    let manifestIds = [];
    const luaFiles = fs.readdirSync(stpluginDir).filter(f => f.endsWith('.lua'));
    for (const luaFile of luaFiles) {
      const luaPath = path.join(stpluginDir, luaFile);
      const content = fs.readFileSync(luaPath, 'utf-8');
      if (content.includes(`addappid(${gameId})`)) {
        // Extract manifestIds from this file
        const manifestIdMatches = [...content.matchAll(/setManifestid\((\d+),\s*\"(\d+)\"/g)];
        manifestIds.push(...manifestIdMatches.map(m => m[2]));
        fs.unlinkSync(luaPath);
      }
    }
    // Delete manifest files for those manifestIds
    if (fs.existsSync(depotcacheDir) && manifestIds.length > 0) {
      const depotFiles = fs.readdirSync(depotcacheDir).filter(f => f.endsWith('.manifest'));
      for (const file of depotFiles) {
        if (manifestIds.some(id => file.includes(id))) {
          fs.unlinkSync(path.join(depotcacheDir, file));
        }
      }
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('upload-manifest-files', async (event, files, steamPath) => {
  try {
    if (!Array.isArray(files) || !steamPath) {
      return { success: false, error: 'Invalid files or steamPath.' };
    }
    const wasSteamRunning = isSteamRunning();
    if (wasSteamRunning) {
      killSteamProcesses();
    }
    const stpluginDir = path.join(steamPath, 'config', 'stplug-in');
    const depotcacheDir = path.join(steamPath, 'config', 'depotcache');
    if (!fs.existsSync(stpluginDir)) fs.mkdirSync(stpluginDir, { recursive: true });
    if (!fs.existsSync(depotcacheDir)) fs.mkdirSync(depotcacheDir, { recursive: true });
    
    let luaFiles = [];
    let manifestFiles = [];
    
    // Check if we have archive files
    const archiveFiles = files.filter(f => f.isArchive);
    
    if (archiveFiles.length > 0) {
      console.log('[SMI] Processing archive files...');
      // Handle archive extraction
      for (const archiveFile of archiveFiles) {
        try {
          const archiveBuffer = Buffer.from(archiveFile.data, 'base64');
          const archive = await extractArchive(archiveBuffer, archiveFile.name);
          
          // Check if archive is password protected (for .zip only)
          let isPasswordProtected = false;
          
          // Try to read the first entry to detect password protection
          for (const entry of archive.entries) {
            if (!entry.isDirectory) {
              try {
                entry.getData(); // This will throw if password protected
                break;
              } catch (e) {
                if (e.message.includes('Invalid or unsupported zip format') || 
                    e.message.includes('encrypted') ||
                    e.message.includes('password') ||
                    e.message.includes('Wrong Password')) {
                  isPasswordProtected = true;
                  break;
                }
                throw e; // Re-throw if it's a different error
              }
            }
          }
          
          if (isPasswordProtected) {
            return { 
              success: false, 
              error: 'Password-protected archives are not supported. Please extract the archive manually and drag the folder instead.' 
            };
          }
          
          console.log('[SMI] Archive contents:', archive.entries.map(e => e.entryName));
          
          // Extract .lua and .manifest files from archive
          for (const entry of archive.entries) {
            if (!entry.isDirectory) {
              const fileName = entry.fileName.toLowerCase();
              if (fileName.endsWith('.lua')) {
                luaFiles.push({
                  name: entry.fileName,
                  data: entry.getData().toString('base64')
                });
              } else if (fileName.endsWith('.manifest')) {
                manifestFiles.push({
                  name: entry.fileName,
                  data: entry.getData().toString('base64')
                });
              }
            }
          }
        } catch (archiveError) {
          console.error('[SMI] Archive extraction error:', archiveError);
          if (archiveError.message.includes('encrypted') || archiveError.message.includes('password')) {
            return { 
              success: false, 
              needsPassword: true, 
              archiveFileName: archiveFile.name,
              error: 'Archive is password protected. Please provide the password.' 
            };
          }
          return { success: false, error: `Failed to extract archive: ${archiveError.message}` };
        }
      }
    } else {
      // Handle regular files (existing logic)
      luaFiles = files.filter(f => f.name.toLowerCase().endsWith('.lua'));
      manifestFiles = files.filter(f => f.name.toLowerCase().endsWith('.manifest'));
    }
    
    console.log('[SMI] Found files - Lua:', luaFiles.length, 'Manifest:', manifestFiles.length);
    
    if (luaFiles.length === 0 || manifestFiles.length === 0) {
      return { success: false, error: 'Upload must include at least one .lua and one .manifest file.' };
    }
    
    // Write files
    for (const file of luaFiles) {
      const dest = path.join(stpluginDir, file.name);
      const buffer = Buffer.from(file.data, 'base64');
      fs.writeFileSync(dest, buffer);
      console.log('[SMI] Wrote lua file:', file.name);
    }
    for (const file of manifestFiles) {
      const dest = path.join(depotcacheDir, file.name);
      const buffer = Buffer.from(file.data, 'base64');
      fs.writeFileSync(dest, buffer);
      console.log('[SMI] Wrote manifest file:', file.name);
    }
    
    // Restart Steam if it was running
    if (wasSteamRunning) {
      const steamExe = path.join(steamPath, 'steam.exe');
      console.log('[SMI] Attempting to restart Steam:', steamExe);
      if (fs.existsSync(steamExe)) {
        try {
          spawn(steamExe, [], { detached: true, stdio: 'ignore' }).unref();
          console.log('[SMI] Steam restart command issued.');
        } catch (err) {
          console.error('[SMI] Failed to restart Steam:', err);
        }
      } else {
        console.error('[SMI] steam.exe does not exist at:', steamExe);
      }
    }
    return { success: true, steamRestarted: wasSteamRunning };
  } catch (err) {
    console.error('[SMI] Upload error:', err);
    return { success: false, error: err.message };
  }
});


// Fetch Steam game details (to avoid CORS issues)
ipcMain.handle('fetch-steam-game-details', async (event, appId) => {
  try {
    const https = require('https');
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
    
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          resolve({ success: false, error: `API Error: ${response.statusCode}` });
          return;
        }

        let data = '';
        response.on('data', (chunk) => data += chunk);
        
        response.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed[appId] && parsed[appId].success) {
              resolve({ success: true, data: parsed[appId].data });
            } else {
              resolve({ success: false, error: 'Game not found or request failed' });
            }
          } catch (err) {
            resolve({ success: false, error: `Failed to parse response: ${err.message}` });
          }
        });
      }).on('error', (err) => {
        resolve({ success: false, error: `Request failed: ${err.message}` });
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Scan GitHub repositories for game manifests
ipcMain.handle('scan-github-repos', async (event, appId) => {
  try {
    const https = require('https');
    const REPO_LIST = [
      "SteamAutoCracks/ManifestHub",
      "ikun0014/ManifestHub",
      "Auiowu/ManifestAutoUpdate",
      "tymolu233/ManifestAutoUpdate-fix"
    ];

    console.log('[SMI] Scanning GitHub repositories for App ID:', appId);

    const checkRepo = (repo) => {
      return new Promise((resolve) => {
        const url = `https://api.github.com/repos/${repo}/branches/${appId}`;
        
        https.get(url, { headers: { 'User-Agent': 'SMI-Steam-Manifest-Installer/2.0' } }, (response) => {
          let data = '';

          response.on('data', (chunk) => {
            data += chunk;
          });

          response.on('end', () => {
            try {
              const jsonData = JSON.parse(data);
              if (jsonData && jsonData.commit) {
                const date = jsonData.commit.commit.author.date;
                console.log(`[SMI] Found ${appId} in ${repo}, date: ${date}`);
                resolve({ repo, date, found: true });
              } else {
                resolve({ repo, found: false });
              }
            } catch (err) {
              resolve({ repo, found: false });
            }
          });
        }).on('error', () => {
          resolve({ repo, found: false });
        });
      });
    };

    // Check all repos in parallel
    const results = await Promise.all(REPO_LIST.map(repo => checkRepo(repo)));
    const foundRepos = results.filter(r => r.found);

    if (foundRepos.length === 0) {
      return { success: false, message: 'No repositories found with this game' };
    }

    // Sort by latest date
    foundRepos.sort((a, b) => new Date(b.date) - new Date(a.date));

    console.log('[SMI] GitHub scan results:', foundRepos);
    return { success: true, repos: foundRepos };
  } catch (err) {
    console.error('[SMI] Error scanning GitHub repos:', err);
    return { success: false, message: err.message };
  }
});

// Check GitHub rate limit
ipcMain.handle('check-github-rate-limit', async () => {
  try {
    const https = require('https');
    
    return new Promise((resolve) => {
      https.get('https://api.github.com/rate_limit', {
        headers: { 'User-Agent': 'SMI-Steam-Manifest-Installer/2.0' }
      }, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          try {
            const rateLimit = JSON.parse(data);
            console.log('[SMI] GitHub rate limit:', rateLimit);
            resolve(rateLimit);
          } catch (err) {
            resolve({ error: 'Failed to parse rate limit' });
          }
        });
      }).on('error', (err) => {
        resolve({ error: err.message });
      });
    });
  } catch (err) {
    return { error: err.message };
  }
});

// Check if game exists on Ghost Depots
ipcMain.handle('check-ghost-depots', async (event, appId) => {
  try {
    const https = require('https');
    const GHOST_DEPOTS_API_URL = 'https://ghostdepots.xyz/api';
    const API_KEY = 'gda_dszNYljslqwnXbZArccpXuqPfJYDUht2';

    const url = `${GHOST_DEPOTS_API_URL}/games/${appId}`;
    
    console.log('[SMI] Checking Ghost Depots:', url);
    
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'x-api-key': API_KEY,
          'User-Agent': 'SMI-Steam-Manifest-Installer/2.0'
        }
      };

      https.get(url, options, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            console.log('[SMI] Ghost Depots check result:', jsonData);
            resolve(jsonData);
          } catch (err) {
            resolve({ success: false, error: { message: 'Failed to parse response' } });
          }
        });
      }).on('error', (err) => {
        console.error('[SMI] Ghost Depots check error:', err);
        resolve({ success: false, error: { message: err.message } });
      });
    });
  } catch (err) {
    console.error('[SMI] Error checking Ghost Depots:', err);
    return { success: false, error: { message: err.message } };
  }
});

// Download game from Ghost Depots API
ipcMain.handle('download-game-from-ghost-depots', async (event, appId, steamPath) => {
  try {
    const https = require('https');
    const http = require('http');
    const GHOST_DEPOTS_API_URL = 'https://ghostdepots.xyz/api';
    const API_KEY = 'gda_dszNYljslqwnXbZArccpXuqPfJYDUht2';

    // Create download request
    const url = `${GHOST_DEPOTS_API_URL}/games/${appId}/download`;
    
    console.log('[SMI] Downloading from Ghost Depots:', url);
    
    return new Promise((resolve, reject) => {
      const downloadFromUrl = (downloadUrl, redirectCount = 0) => {
        if (redirectCount > 5) {
          resolve({ success: false, error: 'Too many redirects' });
          return;
        }

        const isHttps = downloadUrl.startsWith('https://');
        const httpModule = isHttps ? https : http;
        
        const options = {
          headers: {
            'x-api-key': API_KEY,
            'User-Agent': 'SMI-Steam-Manifest-Installer/2.0'
          }
        };

        console.log(`[SMI] Request #${redirectCount + 1} to:`, downloadUrl);
        console.log('[SMI] Headers:', options.headers);

        httpModule.get(downloadUrl, options, (response) => {
          console.log('[SMI] Response status:', response.statusCode);
          console.log('[SMI] Response headers:', JSON.stringify(response.headers, null, 2));

          // Handle redirects
          if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303 || response.statusCode === 307 || response.statusCode === 308) {
            const redirectUrl = response.headers.location;
            console.log('[SMI] Redirecting to:', redirectUrl);
            
            if (!redirectUrl) {
              resolve({ success: false, error: `Redirect without location header (${response.statusCode})` });
              return;
            }
            
            // Follow redirect
            downloadFromUrl(redirectUrl, redirectCount + 1);
            return;
          }

          if (response.statusCode !== 200) {
            console.error('[SMI] Download failed with status:', response.statusCode);
            resolve({ success: false, error: `API Error: ${response.statusCode}` });
            return;
          }

          console.log('[SMI] Downloading file...');
          
          // Collect data chunks
          const chunks = [];
          let downloadedBytes = 0;
          
          response.on('data', (chunk) => {
            chunks.push(chunk);
            downloadedBytes += chunk.length;
            if (downloadedBytes % (1024 * 1024) === 0) { // Log every MB
              console.log(`[SMI] Downloaded: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`);
            }
          });
          
          response.on('end', async () => {
            console.log(`[SMI] Download complete: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB total`);
            try {
              const buffer = Buffer.concat(chunks);
              
              // Save to %programdata%\SMI\downloads
              const programData = process.env.ProgramData || 'C:\\ProgramData';
              const downloadDir = path.join(programData, 'SMI', 'downloads');
              if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir, { recursive: true });
              }
              
              // Detect file type from Content-Disposition header or try both formats
              const contentDisposition = response.headers['content-disposition'];
              let fileName = `${appId}_ghostdepots.zip`;
              if (contentDisposition) {
                const match = contentDisposition.match(/filename="?(.+)"?/i);
                if (match) fileName = match[1];
              }
              
              const tempArchivePath = path.join(downloadDir, fileName);
              fs.writeFileSync(tempArchivePath, buffer);
              console.log('[SMI] Saved download to:', tempArchivePath);
              
              const wasSteamRunning = isSteamRunning();
              
              if (wasSteamRunning) {
                killSteamProcesses();
              }

              // Extract the downloaded content
              const archive = await extractArchive(buffer, fileName);
              const zipEntries = archive.entries;
              
              const stpluginDir = path.join(steamPath, 'config', 'stplug-in');
              const depotcacheDir = path.join(steamPath, 'config', 'depotcache');
              
              if (!fs.existsSync(stpluginDir)) fs.mkdirSync(stpluginDir, { recursive: true });
              if (!fs.existsSync(depotcacheDir)) fs.mkdirSync(depotcacheDir, { recursive: true });

              let luaCount = 0;
              let manifestCount = 0;

              console.log('[SMI] Extracting files from archive...');
              
              // Extract .lua and .manifest files
              for (const entry of zipEntries) {
                if (!entry.isDirectory) {
                  const fileName = entry.fileName.toLowerCase();
                  if (fileName.endsWith('.lua')) {
                    const dest = path.join(stpluginDir, entry.fileName);
                    fs.writeFileSync(dest, entry.getData());
                    console.log('[SMI] Extracted lua file:', entry.fileName);
                    luaCount++;
                  } else if (fileName.endsWith('.manifest')) {
                    const dest = path.join(depotcacheDir, entry.fileName);
                    fs.writeFileSync(dest, entry.getData());
                    console.log('[SMI] Extracted manifest file:', entry.fileName);
                    manifestCount++;
                  }
                }
              }

              console.log(`[SMI] Extraction complete - Lua: ${luaCount}, Manifest: ${manifestCount}`);

              if (luaCount === 0 || manifestCount === 0) {
                resolve({ 
                  success: false, 
                  error: `Downloaded file does not contain required files (lua: ${luaCount}, manifest: ${manifestCount})` 
                });
                return;
              }

              // Restart Steam if it was running
              if (wasSteamRunning) {
                const steamExe = path.join(steamPath, 'steam.exe');
                if (fs.existsSync(steamExe)) {
                  console.log('[SMI] Restarting Steam...');
                  spawn(steamExe, [], { detached: true, stdio: 'ignore' }).unref();
                }
              }

              console.log('[SMI] Installation complete!');
              resolve({ success: true, steamRestarted: wasSteamRunning });
            } catch (err) {
              console.error('[SMI] Processing error:', err);
              resolve({ success: false, error: `Failed to process download: ${err.message}` });
            }
          });
        }).on('error', (err) => {
          console.error('[SMI] Request error:', err);
          resolve({ success: false, error: `Download failed: ${err.message}` });
        });
      };

      // Start the download
      downloadFromUrl(url);
    });
  } catch (err) {
    console.error('[SMI] Unexpected error:', err);
    return { success: false, error: err.message };
  }
});

// Download game from GitHub repository
ipcMain.handle('download-from-github-repo', async (event, appId, repo, steamPath) => {
  try {
    const https = require('https');
    const http = require('http');
    
    console.log('[SMI] Fetching files from GitHub repo:', repo, 'branch:', appId);
    
    // First, get the tree contents for the branch
    const treeUrl = `https://api.github.com/repos/${repo}/git/trees/${appId}`;
    
    return new Promise((resolve) => {
      https.get(treeUrl, { headers: { 'User-Agent': 'SMI-Steam-Manifest-Installer/2.0' } }, (treeResponse) => {
        let treeData = '';
        
        treeResponse.on('data', (chunk) => {
          treeData += chunk;
        });
        
        treeResponse.on('end', async () => {
          try {
            const tree = JSON.parse(treeData);
            
            if (!tree.tree || tree.tree.length === 0) {
              resolve({ success: false, error: 'No files found in repository branch' });
              return;
            }
            
            console.log('[SMI] Found', tree.tree.length, 'files in branch');
            
            // Filter for files we need: .manifest, .lua, .vdf, .zip
            const filesToDownload = tree.tree.filter(item => {
              const fileName = item.path.toLowerCase();
              return fileName.endsWith('.manifest') || 
                     fileName.endsWith('.lua') || 
                     fileName.endsWith('.vdf') ||
                     fileName.endsWith('.zip');
            });
            
            console.log('[SMI] Filtered to', filesToDownload.length, 'relevant files:', filesToDownload.map(f => f.path));
            
            if (filesToDownload.length === 0) {
              resolve({ success: false, error: 'No manifest, lua, vdf, or zip files found' });
              return;
            }
            
            // Check if there's a zip file
            const zipFile = filesToDownload.find(f => f.path.toLowerCase().endsWith('.zip'));
            
            if (zipFile) {
              // Download and extract zip
              console.log('[SMI] Found zip file:', zipFile.path);
              const zipUrl = `https://raw.githubusercontent.com/${repo}/${appId}/${zipFile.path}`;
              
              https.get(zipUrl, { headers: { 'User-Agent': 'SMI-Steam-Manifest-Installer/2.0' } }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          const redirectModule = redirectUrl.startsWith('https://') ? https : http;
          
          redirectModule.get(redirectUrl, (redirectResponse) => {
            if (redirectResponse.statusCode !== 200) {
              resolve({ success: false, error: `Download failed: ${redirectResponse.statusCode}` });
              return;
            }
            
            const chunks = [];
            let downloadedBytes = 0;
            
            redirectResponse.on('data', (chunk) => {
              chunks.push(chunk);
              downloadedBytes += chunk.length;
            });
            
            redirectResponse.on('end', async () => {
              console.log(`[SMI] Download complete: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`);
              try {
                const buffer = Buffer.concat(chunks);
                
                // Save to %programdata%\SMI\downloads
                const programData = process.env.ProgramData || 'C:\\ProgramData';
                const downloadDir = path.join(programData, 'SMI', 'downloads');
                if (!fs.existsSync(downloadDir)) {
                  fs.mkdirSync(downloadDir, { recursive: true });
                }
                
                const tempZipPath = path.join(downloadDir, `${appId}_github_${repo.replace('/', '_')}.zip`);
                fs.writeFileSync(tempZipPath, buffer);
                console.log('[SMI] Saved download to:', tempZipPath);
                
                const wasSteamRunning = isSteamRunning();
                if (wasSteamRunning) {
                  killSteamProcesses();
                }

                // Extract and install
                const fileName = `${appId}_github_${repo.replace('/', '_')}.zip`;
                const archive = await extractArchive(buffer, fileName);
                const zipEntries = archive.entries;
                
                const stpluginDir = path.join(steamPath, 'config', 'stplug-in');
                const depotcacheDir = path.join(steamPath, 'config', 'depotcache');
                
                if (!fs.existsSync(stpluginDir)) fs.mkdirSync(stpluginDir, { recursive: true });
                if (!fs.existsSync(depotcacheDir)) fs.mkdirSync(depotcacheDir, { recursive: true });

                let luaCount = 0;
                let manifestCount = 0;
                let vdfCount = 0;

                for (const entry of zipEntries) {
                  if (entry.isDirectory) continue;
                  const fileName = entry.fileName.toLowerCase();
                  
                  if (fileName.endsWith('.lua')) {
                    const luaPath = path.join(stpluginDir, entry.fileName);
                    fs.writeFileSync(luaPath, entry.getData());
                    console.log('[SMI] Extracted lua file:', entry.fileName);
                    luaCount++;
                  } else if (fileName.endsWith('.manifest')) {
                    const manifestPath = path.join(depotcacheDir, entry.fileName);
                    fs.writeFileSync(manifestPath, entry.getData());
                    console.log('[SMI] Extracted manifest file:', entry.fileName);
                    manifestCount++;
                  } else if (fileName.endsWith('.vdf')) {
                    const vdfPath = path.join(stpluginDir, entry.fileName);
                    fs.writeFileSync(vdfPath, entry.getData());
                    console.log('[SMI] Extracted vdf file:', entry.fileName);
                    vdfCount++;
                  }
                }

                console.log(`[SMI] Extraction complete - Lua: ${luaCount}, Manifest: ${manifestCount}, VDF: ${vdfCount}`);
                
                if (manifestCount === 0) {
                  resolve({ success: false, error: 'No .manifest files found in archive' });
                  return;
                }
                
                if (luaCount === 0 && vdfCount === 0) {
                  resolve({ success: false, error: 'Archive requires at least one .lua or .vdf file' });
                  return;
                }

                console.log('[SMI] Installation complete!');
                resolve({ success: true, steamRestarted: wasSteamRunning, source: 'github', repo });
              } catch (err) {
                console.error('[SMI] Processing error:', err);
                resolve({ success: false, error: `Failed to process download: ${err.message}` });
              }
            });
          }).on('error', (err) => {
            resolve({ success: false, error: `Download failed: ${err.message}` });
          });
          return;
        }
        
        if (response.statusCode !== 200) {
          resolve({ success: false, error: `Download failed: ${response.statusCode}` });
          return;
        }

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', async () => {
          try {
            const buffer = Buffer.concat(chunks);
            
            // Save to %programdata%\SMI\downloads
            const programData = process.env.ProgramData || 'C:\\ProgramData';
            const downloadDir = path.join(programData, 'SMI', 'downloads');
            if (!fs.existsSync(downloadDir)) {
              fs.mkdirSync(downloadDir, { recursive: true });
            }
            
            const tempZipPath = path.join(downloadDir, `${appId}_github_${repo.replace('/', '_')}.zip`);
            fs.writeFileSync(tempZipPath, buffer);
            console.log('[SMI] Saved download to:', tempZipPath);
            
            const wasSteamRunning = isSteamRunning();
            if (wasSteamRunning) {
              killSteamProcesses();
            }

            // Extract and install (same logic as above)
            const fileName = `${appId}_github_${repo.replace('/', '_')}.zip`;
            const archive = await extractArchive(buffer, fileName);
            const zipEntries = archive.entries;
            
            const stpluginDir = path.join(steamPath, 'config', 'stplug-in');
            const depotcacheDir = path.join(steamPath, 'config', 'depotcache');
            
            if (!fs.existsSync(stpluginDir)) fs.mkdirSync(stpluginDir, { recursive: true });
            if (!fs.existsSync(depotcacheDir)) fs.mkdirSync(depotcacheDir, { recursive: true });

            let luaCount = 0;
            let manifestCount = 0;
            let vdfCount = 0;

            for (const entry of zipEntries) {
              if (entry.isDirectory) continue;
              const fileName = entry.fileName.toLowerCase();
              
              if (fileName.endsWith('.lua')) {
                const luaPath = path.join(stpluginDir, entry.fileName);
                fs.writeFileSync(luaPath, entry.getData());
                luaCount++;
              } else if (fileName.endsWith('.manifest')) {
                const manifestPath = path.join(depotcacheDir, entry.fileName);
                fs.writeFileSync(manifestPath, entry.getData());
                manifestCount++;
              } else if (fileName.endsWith('.vdf')) {
                const vdfPath = path.join(stpluginDir, entry.fileName);
                fs.writeFileSync(vdfPath, entry.getData());
                vdfCount++;
              }
            }

            if (manifestCount === 0) {
              resolve({ success: false, error: 'No .manifest files found in archive' });
              return;
            }
            
            if (luaCount === 0 && vdfCount === 0) {
              resolve({ success: false, error: 'Archive requires at least one .lua or .vdf file' });
              return;
            }

            resolve({ success: true, steamRestarted: wasSteamRunning, source: 'github', repo });
          } catch (err) {
            resolve({ success: false, error: `Failed to process download: ${err.message}` });
          }
        });
      }).on('error', (err) => {
        resolve({ success: false, error: `Download failed: ${err.message}` });
      });
            } else {
              // No zip file - download raw files directly
              console.log('[SMI] No zip file found, downloading raw files');
              
              const programData = process.env.ProgramData || 'C:\\ProgramData';
              const downloadDir = path.join(programData, 'SMI', 'downloads');
              if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir, { recursive: true });
              }
              
              const wasSteamRunning = isSteamRunning();
              if (wasSteamRunning) {
                killSteamProcesses();
              }
              
              const stpluginDir = path.join(steamPath, 'config', 'stplug-in');
              const depotcacheDir = path.join(steamPath, 'config', 'depotcache');
              
              if (!fs.existsSync(stpluginDir)) fs.mkdirSync(stpluginDir, { recursive: true });
              if (!fs.existsSync(depotcacheDir)) fs.mkdirSync(depotcacheDir, { recursive: true });

              let luaCount = 0;
              let manifestCount = 0;
              let vdfCount = 0;
              let downloadedCount = 0;
              
              const downloadFile = (fileItem) => {
                return new Promise((resolveFile) => {
                  const rawUrl = `https://raw.githubusercontent.com/${repo}/${appId}/${fileItem.path}`;
                  console.log('[SMI] Downloading:', fileItem.path);
                  
                  https.get(rawUrl, { headers: { 'User-Agent': 'SMI-Steam-Manifest-Installer/2.0' } }, (fileResponse) => {
                    if (fileResponse.statusCode !== 200) {
                      console.error('[SMI] Failed to download:', fileItem.path, fileResponse.statusCode);
                      resolveFile(false);
                      return;
                    }
                    
                    const chunks = [];
                    fileResponse.on('data', (chunk) => chunks.push(chunk));
                    fileResponse.on('end', () => {
                      try {
                        const buffer = Buffer.concat(chunks);
                        const fileName = fileItem.path.toLowerCase();
                        
                        // Save to downloads folder
                        const downloadPath = path.join(downloadDir, path.basename(fileItem.path));
                        fs.writeFileSync(downloadPath, buffer);
                        
                        // Install to Steam folder
                        if (fileName.endsWith('.lua')) {
                          const luaPath = path.join(stpluginDir, path.basename(fileItem.path));
                          fs.writeFileSync(luaPath, buffer);
                          console.log('[SMI] Installed lua:', path.basename(fileItem.path));
                          luaCount++;
                        } else if (fileName.endsWith('.manifest')) {
                          const manifestPath = path.join(depotcacheDir, path.basename(fileItem.path));
                          fs.writeFileSync(manifestPath, buffer);
                          console.log('[SMI] Installed manifest:', path.basename(fileItem.path));
                          manifestCount++;
                        } else if (fileName.endsWith('.vdf')) {
                          const vdfPath = path.join(stpluginDir, path.basename(fileItem.path));
                          fs.writeFileSync(vdfPath, buffer);
                          console.log('[SMI] Installed vdf:', path.basename(fileItem.path));
                          vdfCount++;
                        }
                        
                        downloadedCount++;
                        resolveFile(true);
                      } catch (err) {
                        console.error('[SMI] Error processing file:', err);
                        resolveFile(false);
                      }
                    });
                  }).on('error', (err) => {
                    console.error('[SMI] Download error:', err);
                    resolveFile(false);
                  });
                });
              };
              
              // Download all files
              const results = await Promise.all(filesToDownload.map(downloadFile));
              const successCount = results.filter(r => r).length;
              
              console.log(`[SMI] Downloaded ${successCount}/${filesToDownload.length} files`);
              console.log(`[SMI] Installed - Lua: ${luaCount}, Manifest: ${manifestCount}, VDF: ${vdfCount}`);
              
              // Require at least manifest files, and either lua OR vdf files
              if (manifestCount === 0) {
                resolve({ success: false, error: 'No .manifest files found or failed to download' });
                return;
              }
              
              if (luaCount === 0 && vdfCount === 0) {
                resolve({ success: false, error: 'No .lua or .vdf files found (at least one is required)' });
                return;
              }
              
              console.log('[SMI] Installation complete!');
              resolve({ success: true, steamRestarted: wasSteamRunning, source: 'github', repo });
            }
          } catch (err) {
            console.error('[SMI] Error processing tree:', err);
            resolve({ success: false, error: `Failed to process repository: ${err.message}` });
          }
        });
      }).on('error', (err) => {
        console.error('[SMI] Tree fetch error:', err);
        resolve({ success: false, error: `Failed to fetch repository tree: ${err.message}` });
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-steam-path', async () => {
  const file = getSteamPathFile();
  if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return data.steamPath;
  }
  return null;
});

ipcMain.handle('auto-detect-steam-path', async () => {
  try {
    const detectedPath = await autoDetectSteamPath();
    return detectedPath;
  } catch (error) {
    console.error('Error in auto-detect-steam-path handler:', error);
    return null;
  }
});

// Proxy SteamDB search to bypass CORS
ipcMain.handle('search-steamdb', async (event, query) => {
  try {
    const https = require('https');
    
    const postData = JSON.stringify({
      hitsPerPage: 10,
      attributesToSnippet: null,
      attributesToHighlight: ['name'],
      attributesToRetrieve: ['type', 'id', 'name', 'small_capsule'],
      query: query
    });

    const options = {
      hostname: '94he6yatei-dsn.algolia.net',
      path: '/1/indexes/all_names/query?x-algolia-agent=Algolia%20for%20JavaScript%20(SteamDB)',
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.5',
        'x-algolia-application-id': '94HE6YATEI',
        'x-algolia-api-key': 'MTgyMGEwMDJmYThmMTQ5ZDQ1OWVjZTNjY2YyNWZkMmE5MjE5Y2JhNjdjNTYxNDU2NjI0MzI3NTViNzBiZDI5NXZhbGlkVW50aWw9MTc2NDE5ODU2MCZ1c2VyVG9rZW49MjVjNWQyM2ZkOWViZjZkNDYzMDc4YTNkNDk2NjdhNDE=',
        'Content-Type': 'text/plain;charset=UTF-8',
        'Content-Length': Buffer.byteLength(postData),
        'Referer': 'https://steamdb.info/',
        'Origin': 'https://steamdb.info'
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const parsed = JSON.parse(data);
              resolve({ success: true, data: parsed });
            } else {
              resolve({ success: false, error: `HTTP ${res.statusCode}` });
            }
          } catch (err) {
            resolve({ success: false, error: err.message });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      req.write(postData);
      req.end();
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Get Steam app icon from local cache
ipcMain.handle('get-steam-app-icon', async (event, appId, steamPath) => {
  try {
    // Steam stores app icons in appcache/librarycache/{appId}/
    const appCacheDir = path.join(steamPath, 'appcache', 'librarycache', appId.toString());
    
    if (!fs.existsSync(appCacheDir)) {
      return { success: false, error: 'App cache directory not found' };
    }

    // Function to find image files recursively
    const findImageFile = (dir, depth = 0) => {
      if (depth > 2) return null; // Limit recursion depth
      
      try {
        const items = fs.readdirSync(dir);
        
        // First pass: look for image files
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stat = fs.lstatSync(itemPath);
          
          if (stat.isFile()) {
            const ext = path.extname(item).toLowerCase();
            if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
              return itemPath;
            }
          }
        }
        
        // Second pass: check subdirectories
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stat = fs.lstatSync(itemPath);
          
          if (stat.isDirectory()) {
            const found = findImageFile(itemPath, depth + 1);
            if (found) return found;
          }
        }
      } catch (err) {
        console.error('Error scanning directory:', err);
      }
      
      return null;
    };

    const iconPath = findImageFile(appCacheDir);
    
    if (iconPath) {
      // Read the file and convert to base64 data URL
      const imageBuffer = fs.readFileSync(iconPath);
      const base64Image = imageBuffer.toString('base64');
      const ext = path.extname(iconPath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return { success: true, dataUrl: `data:${mimeType};base64,${base64Image}` };
    } else {
      return { success: false, error: 'No icon found in cache directory' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Steam login for manifest dumping
ipcMain.handle('steam-login', async (event, username, password, saveCredentials = false) => {
  try {
    // If password is empty but we have saved credentials, use saved password
    const config = loadManifestConfig();
    if (!password && config.saveCredentials && config.password) {
      password = config.password;
    }

    // Save credentials if requested
    if (saveCredentials) {
      config.username = username;
      config.password = password;
      config.saveCredentials = true;
      saveManifestConfig(config);
    }

    // Create new Steam client instance
    const appData = app.getPath('userData');
    const steamDataDir = path.join(appData, 'steam-data');
    if (!fs.existsSync(steamDataDir)) {
      fs.mkdirSync(steamDataDir, { recursive: true });
    }
    
    steamClient = new SteamUser({ 
      enablePicsCache: true,
      dataDirectory: steamDataDir,
      promptSteamGuardCode: false // Prevent console prompts
    });
    steamGuardCallback = null;

    return new Promise((resolve) => {
      steamClient.logOn({
        accountName: username,
        password: password
      });

      steamClient.once('loggedOn', () => {
        console.log('[SMI] Steam login successful');
        resolve({ success: true });
      });

      steamClient.once('error', (err) => {
        console.error('[SMI] Steam login error:', err);
        resolve({ success: false, error: err.message });
      });

      steamClient.once('steamGuard', (domain, callback, lastCodeWrong) => {
        console.log('[SMI] Steam Guard required');
        steamGuardCallback = callback;
        // Immediately respond to prevent readline prompt
        resolve({ success: false, needsSteamGuard: true, domain: domain });
      });
    });
  } catch (err) {
    console.error('[SMI] Steam login exception:', err);
    return { success: false, error: err.message };
  }
});

// Submit Steam Guard code
ipcMain.handle('submit-steam-guard', async (event, code) => {
  try {
    if (!steamGuardCallback) {
      return { success: false, error: 'No Steam Guard request pending' };
    }

    return new Promise((resolve) => {
      let resolved = false;

      const loginHandler = () => {
        if (resolved) return;
        resolved = true;
        console.log('[SMI] Steam Guard login successful');
        steamClient.removeListener('error', errorHandler);
        steamClient.removeListener('steamGuard', steamGuardHandler);
        steamGuardCallback = null;
        resolve({ success: true });
      };

      const errorHandler = (err) => {
        if (resolved) return;
        resolved = true;
        console.error('[SMI] Steam Guard error:', err);
        steamClient.removeListener('loggedOn', loginHandler);
        steamClient.removeListener('steamGuard', steamGuardHandler);
        resolve({ success: false, error: err.message });
      };

      const steamGuardHandler = (domain, callback, lastCodeWrong) => {
        if (resolved) return;
        resolved = true;
        console.log('[SMI] Steam Guard code was incorrect');
        steamClient.removeListener('loggedOn', loginHandler);
        steamClient.removeListener('error', errorHandler);
        steamGuardCallback = callback;
        resolve({ success: false, error: 'Invalid Steam Guard code. Please try again.', codeWrong: true });
      };

      steamClient.once('loggedOn', loginHandler);
      steamClient.once('error', errorHandler);
      steamClient.once('steamGuard', steamGuardHandler);

      // Submit the code
      steamGuardCallback(code);
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Generate manifest
ipcMain.handle('generate-manifest', async (event, appId, depotId, manifestId) => {
  try {
    if (!steamClient) {
      return { success: false, error: 'Not logged in to Steam' };
    }

    console.log('[SMI] Generating manifest for App:', appId, 'Depot:', depotId, 'Manifest:', manifestId);

    // Try to request free license
    try {
      await new Promise((resolve) => {
        steamClient.requestFreeLicense([appId], () => {
          resolve();
        });
      });
    } catch (e) {
      // Ignore errors
    }

    // Get depot decryption key
    const depotKey = await new Promise((resolve, reject) => {
      steamClient.getDepotDecryptionKey(appId, depotId, (err, key) => {
        if (err) {
          console.error('[SMI] Failed to get depot key:', err);
          reject(err);
        } else {
          console.log('[SMI] Got depot key');
          resolve(key);
        }
      });
    });

    // Download manifest
    const rawManifest = await new Promise((resolve, reject) => {
      steamClient.getRawManifest(appId, depotId, manifestId, (err, data) => {
        if (err) {
          console.error('[SMI] Failed to download manifest:', err);
          reject(err);
        } else {
          console.log('[SMI] Manifest downloaded');
          resolve(data);
        }
      });
    });

    // Save files to configured dump path
    const config = loadManifestConfig();
    const dumpDir = path.join(config.dumpPath, `${appId}`);
    if (!fs.existsSync(dumpDir)) {
      fs.mkdirSync(dumpDir, { recursive: true });
    }

    const fileBase = `${depotId}_${manifestId}`;
    
    // Save manifest file
    const manifestPath = path.join(dumpDir, `${fileBase}.manifest`);
    fs.writeFileSync(manifestPath, rawManifest);
    console.log('[SMI] Saved manifest:', manifestPath);

    // Save VDF file
    const keyHex = Buffer.isBuffer(depotKey) ? depotKey.toString('hex').toUpperCase() : depotKey;
    const vdfContent = `"depots"
{
\t"${depotId}"
\t{
\t\t"DecryptionKey"\t\t"${keyHex}"
\t}
}`;
    const vdfPath = path.join(dumpDir, `${fileBase}.vdf`);
    fs.writeFileSync(vdfPath, vdfContent);
    console.log('[SMI] Saved VDF:', vdfPath);

    // Save Lua file
    const luaContent = `addappid(${appId})
addappid(${depotId},1,"${keyHex}")
setManifestid(${depotId},"${manifestId}",0)`;
    const luaPath = path.join(dumpDir, `${fileBase}.lua`);
    fs.writeFileSync(luaPath, luaContent);
    console.log('[SMI] Saved Lua:', luaPath);

    // Logout
    steamClient.logOff();
    steamClient = null;

    return {
      success: true,
      appId,
      depotId,
      manifestId,
      manifestFile: path.basename(manifestPath),
      vdfFile: path.basename(vdfPath),
      luaFile: path.basename(luaPath),
      outputDir: dumpDir
    };
  } catch (err) {
    console.error('[SMI] Generate manifest error:', err);
    if (steamClient) {
      steamClient.logOff();
      steamClient = null;
    }
    return { success: false, error: err.message };
  }
});

// Open manifest dump folder in file explorer
ipcMain.handle('open-manifest-folder', async (event, appId) => {
  try {
    const config = loadManifestConfig();
    const dumpDir = appId 
      ? path.join(config.dumpPath, `${appId}`)
      : config.dumpPath;
    
    if (!fs.existsSync(dumpDir)) {
      fs.mkdirSync(dumpDir, { recursive: true });
    }
    
    shell.openPath(dumpDir);
    return { success: true };
  } catch (err) {
    console.error('[SMI] Failed to open folder:', err);
    return { success: false, error: err.message };
  }
});

// Load manifest dumper config
ipcMain.handle('load-manifest-config', async () => {
  try {
    const config = loadManifestConfig();
    // Don't send password to frontend for security
    return {
      dumpPath: config.dumpPath,
      saveCredentials: config.saveCredentials,
      username: config.username
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Save manifest dumper config
ipcMain.handle('save-manifest-config', async (event, config) => {
  try {
    const success = saveManifestConfig(config);
    return { success };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Choose dump path folder
ipcMain.handle('choose-dump-path', async () => {
  try {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Manifest Dump Folder'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return { success: true, path: result.filePaths[0] };
    }
    return { success: false, canceled: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Open external URL in default browser
ipcMain.handle('open-external-url', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    console.error('[SMI] Failed to open URL:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.on('window-action', (event, action) => {
  if (!win) return;
  switch (action) {
    case 'minimize':
      win.minimize();
      break;
    case 'maximize':
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
      break;
    case 'close':
      win.close();
      break;
    default:
      break;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
