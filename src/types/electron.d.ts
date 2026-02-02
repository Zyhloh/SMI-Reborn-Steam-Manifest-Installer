export interface AppConfig {
  app: {
    name: string;
    version: string;
    author: string;
  };
  window: {
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
    frame: boolean;
  };
  dev: {
    openDevTools: boolean;
  };
}

export interface SmiStatus {
  hidDllInstalled: boolean;
  depotcacheExists: boolean;
  stpluginExists: boolean;
  isSetup: boolean;
}

export interface InstalledGame {
  gameId: string;
  gameName: string;
  luaFile: string;
  manifestCount: number;
}

export interface ElectronAPI {
  getConfig: () => Promise<AppConfig>;
  getAppVersion: () => Promise<string>;
  platform: string;
  
  getSteamPath: () => Promise<string>;
  getSavedSteamPath: () => Promise<string | null>;
  saveSteamPath: (path: string) => Promise<void>;
  validateSteamFolder: (path: string) => Promise<string>;
  selectFolder: () => Promise<string | null>;
  
  checkSteamBitness: (steamPath: string) => Promise<"32" | "64">;
  downgradeSteam: (steamPath: string) => Promise<void>;
  upgradeSteam: (steamPath: string) => Promise<void>;
  onDowngradeProgress: (callback: (data: string) => void) => void;
  removeDowngradeProgressListener: () => void;
  
  checkSmiStatus: (steamPath: string) => Promise<SmiStatus>;
  installSmiResources: (steamPath: string) => Promise<void>;
  uninstallSmiResources: (steamPath: string) => Promise<void>;
  
  listInstalledGames: (steamPath: string) => Promise<InstalledGame[]>;
  uninstallGame: (steamPath: string, gameId: string) => Promise<void>;
  
  installManifestFromZip: (steamPath: string, zipPath: string) => Promise<void>;
  installManifestFromFolder: (steamPath: string, folderPath: string) => Promise<void>;
  selectZipFile: () => Promise<string | null>;
  uploadManifestFiles: (steamPath: string, files: Array<{ name: string; data: string; isArchive?: boolean }>) => Promise<void>;
  
  isSteamRunning: () => Promise<boolean>;
  restartSteam: (steamPath: string) => Promise<void>;
  
  getSteamCredentials: () => Promise<{ success: boolean; username?: string; password?: string }>;
  steamLogin: (username: string, password: string, saveCredentials?: boolean) => Promise<{ success: boolean; error?: string; needsSteamGuard?: boolean; needsDeviceConfirmation?: boolean; domain?: string; isEmailCode?: boolean; isRateLimited?: boolean }>;
  submitSteamGuard: (code: string) => Promise<{ success: boolean; error?: string; codeWrong?: boolean }>;
  steamIsLoggedIn: () => Promise<boolean>;
  steamLogout: (clearCredentials?: boolean) => Promise<{ success: boolean }>;
  getOwnedGames: () => Promise<{ success: boolean; error?: string; games?: Array<{ appId: number; name: string; playtime: number }> }>;
  getAppDepots: (appId: number) => Promise<{ success: boolean; error?: string; depots?: Array<{ depotId: number; name: string; manifestId: string; maxSize?: number }>; appName?: string }>;
  generateManifest: (appId: number, depotId: number, manifestId: string, steamPath: string) => Promise<{ success: boolean; error?: string; appId?: number; depotId?: number; manifestId?: string; outputDir?: string; files?: string[] }>;
  openFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
  
  minimizeWindow: () => void;
  closeWindow: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
