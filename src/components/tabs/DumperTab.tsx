"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  HiUser, 
  HiLockClosed, 
  HiShieldCheck, 
  HiArrowRightOnRectangle,
  HiMagnifyingGlass,
  HiArrowDownTray,
  HiCheckCircle,
  HiXCircle,
  HiArrowPath
} from "react-icons/hi2";

interface DumperTabProps {
  steamPath: string | null;
}

interface OwnedGame {
  appId: number;
  name: string;
  playtime: number;
}

interface Depot {
  depotId: number;
  name: string;
  manifestId: string;
  maxSize?: number;
}

type LoginState = "idle" | "logging-in" | "steam-guard" | "logged-in" | "auto-logging-in" | "device-confirmation";

export default function DumperTab({ steamPath }: DumperTabProps) {
  const [loginState, setLoginState] = useState<LoginState>("idle");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [steamGuardCode, setSteamGuardCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  const [games, setGames] = useState<OwnedGame[]>([]);
  const [filteredGames, setFilteredGames] = useState<OwnedGame[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dumpingAppId, setDumpingAppId] = useState<number | null>(null);
  const [dumpResult, setDumpResult] = useState<{ appId: number; success: boolean; message: string } | null>(null);
  
  const initRef = useRef(false);

  const loadOwnedGames = useCallback(async () => {
    if (typeof window === "undefined" || !window.electronAPI) return;
    
    const result = await window.electronAPI.getOwnedGames();
    if (result.success && result.games) {
      const sorted = result.games.sort((a, b) => a.name.localeCompare(b.name));
      setGames(sorted);
      setFilteredGames(sorted);
    }
  }, []);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    
    const init = async () => {
      if (typeof window === "undefined" || !window.electronAPI) return;
      
      const isLoggedIn = await window.electronAPI.steamIsLoggedIn();
      if (isLoggedIn) {
        setLoginState("logged-in");
        loadOwnedGames();
        return;
      }
      
      const creds = await window.electronAPI.getSteamCredentials();
      if (creds.success && creds.username && creds.password) {
        setUsername(creds.username);
        setLoginState("auto-logging-in");
        
        const result = await window.electronAPI.steamLogin(creds.username, creds.password, true);
        
        if (result.success) {
          setLoginState("logged-in");
          loadOwnedGames();
        } else if (result.needsDeviceConfirmation) {
          setLoginState("device-confirmation");
          // Poll for login completion
          pollForLogin();
        } else if (result.needsSteamGuard) {
          setLoginState("steam-guard");
        } else {
          setLoginState("idle");
        }
      }
    };
    init();
  }, [loadOwnedGames]);

  const pollForLogin = async () => {
    const checkLogin = async () => {
      if (typeof window === "undefined" || !window.electronAPI) return;
      const isLoggedIn = await window.electronAPI.steamIsLoggedIn();
      if (isLoggedIn) {
        setLoginState("logged-in");
        loadOwnedGames();
      } else {
        setTimeout(checkLogin, 2000);
      }
    };
    setTimeout(checkLogin, 2000);
  };

  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      setFilteredGames(games.filter(g => g.name.toLowerCase().includes(query)));
    } else {
      setFilteredGames(games);
    }
  }, [searchQuery, games]);

  const handleLogin = async () => {
    if (!username || !password) {
      setError("Please enter username and password");
      return;
    }
    if (typeof window === "undefined" || !window.electronAPI) return;

    setError(null);
    setLoginState("logging-in");

    const result = await window.electronAPI.steamLogin(username, password);
    
    if (result.success) {
      setLoginState("logged-in");
      setPassword("");
      loadOwnedGames();
    } else if (result.needsDeviceConfirmation) {
      setLoginState("device-confirmation");
      pollForLogin();
    } else if (result.needsSteamGuard) {
      setLoginState("steam-guard");
    } else {
      setError(result.error || "Login failed");
      setLoginState("idle");
    }
  };

  const handleSteamGuard = async () => {
    if (!steamGuardCode) {
      setError("Please enter Steam Guard code");
      return;
    }
    if (typeof window === "undefined" || !window.electronAPI) return;

    setError(null);
    const result = await window.electronAPI.submitSteamGuard(steamGuardCode);
    
    if (result.success) {
      setLoginState("logged-in");
      setSteamGuardCode("");
      loadOwnedGames();
    } else {
      setError(result.error || "Invalid code");
      if (!result.codeWrong) {
        setLoginState("idle");
      }
    }
  };

  const handleLogout = async () => {
    if (typeof window === "undefined" || !window.electronAPI) return;
    await window.electronAPI.steamLogout();
    setLoginState("idle");
    setGames([]);
    setFilteredGames([]);
  };

  const handleDump = async (game: OwnedGame) => {
    if (!steamPath || typeof window === "undefined" || !window.electronAPI) return;

    setDumpingAppId(game.appId);
    setDumpResult(null);

    try {
      const depotsResult = await window.electronAPI.getAppDepots(game.appId);
      
      if (!depotsResult.success || !depotsResult.depots || depotsResult.depots.length === 0) {
        setDumpResult({
          appId: game.appId,
          success: false,
          message: depotsResult.error || "No depots found for this game"
        });
        setDumpingAppId(null);
        return;
      }

      const mainDepot = depotsResult.depots[0];
      
      const result = await window.electronAPI.generateManifest(
        game.appId,
        mainDepot.depotId,
        mainDepot.manifestId,
        steamPath
      );

      if (result.success && result.outputDir) {
        setDumpResult({
          appId: game.appId,
          success: true,
          message: `Exported to: ${result.outputDir}`
        });
        // Open the export folder
        await window.electronAPI.openFolder(result.outputDir);
      } else {
        setDumpResult({
          appId: game.appId,
          success: false,
          message: result.error || "Failed to dump manifest"
        });
      }
    } catch (err) {
      setDumpResult({
        appId: game.appId,
        success: false,
        message: String(err)
      });
    }

    setDumpingAppId(null);
  };

  if (!steamPath) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <div className="w-20 h-20 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-6">
          <HiArrowDownTray className="w-10 h-10 text-zinc-600" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-300 mb-2">Steam Path Required</h3>
        <p className="text-sm text-zinc-500 max-w-xs">
          Please select your Steam installation folder in the sidebar to use the manifest dumper.
        </p>
      </div>
    );
  }

  if (loginState === "auto-logging-in") {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2 border-zinc-800" />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent"
          />
        </div>
        <p className="text-sm text-zinc-500 mt-4">Connecting to Steam...</p>
      </div>
    );
  }

  if (loginState === "device-confirmation") {
    return (
      <div className="h-full flex flex-col">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-zinc-100 mb-1">Manifest Dumper</h2>
          <p className="text-sm text-zinc-500">Approve the login on your phone</p>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm"
          >
            <div className="bg-zinc-800/50 rounded-2xl border border-zinc-700/30 p-6">
              <div className="flex items-center justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
                  <HiShieldCheck className="w-8 h-8 text-white" />
                </div>
              </div>

              <h3 className="text-lg font-semibold text-zinc-200 text-center mb-2">Check Your Phone</h3>
              <p className="text-sm text-zinc-500 text-center mb-6">
                Open the Steam app on your phone and approve the login request
              </p>

              <div className="flex items-center justify-center gap-3 mb-6">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full"
                />
                <span className="text-sm text-zinc-400">Waiting for confirmation...</span>
              </div>

              <button
                onClick={() => setLoginState("idle")}
                className="w-full py-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (loginState === "idle" || loginState === "logging-in") {
    return (
      <div className="h-full flex flex-col">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-zinc-100 mb-1">Manifest Dumper</h2>
          <p className="text-sm text-zinc-500">Login to Steam to dump manifests from games you own</p>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm"
          >
            <div className="bg-zinc-800/50 rounded-2xl border border-zinc-700/30 p-6">
              <div className="flex items-center justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <HiUser className="w-8 h-8 text-white" />
                </div>
              </div>

              <h3 className="text-lg font-semibold text-zinc-200 text-center mb-6">Steam Login</h3>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-2">Username</label>
                  <div className="relative">
                    <HiUser className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Steam username"
                      disabled={loginState === "logging-in"}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-700/50 rounded-xl text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 disabled:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-zinc-500 mb-2">Password</label>
                  <div className="relative">
                    <HiLockClosed className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Steam password"
                      disabled={loginState === "logging-in"}
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-700/50 rounded-xl text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 disabled:opacity-50"
                    />
                  </div>
                </div>

                <button
                  onClick={handleLogin}
                  disabled={loginState === "logging-in"}
                  className="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loginState === "logging-in" ? (
                    <>
                      <HiArrowPath className="w-5 h-5 animate-spin" />
                      Logging in...
                    </>
                  ) : (
                    "Login"
                  )}
                </button>
              </div>

              <p className="text-xs text-zinc-600 text-center mt-4">
                Your credentials are only used to authenticate with Steam servers
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (loginState === "steam-guard") {
    return (
      <div className="h-full flex flex-col">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-zinc-100 mb-1">Manifest Dumper</h2>
          <p className="text-sm text-zinc-500">Enter your Steam Guard code</p>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm"
          >
            <div className="bg-zinc-800/50 rounded-2xl border border-zinc-700/30 p-6">
              <div className="flex items-center justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <HiShieldCheck className="w-8 h-8 text-white" />
                </div>
              </div>

              <h3 className="text-lg font-semibold text-zinc-200 text-center mb-2">Steam Guard</h3>
              <p className="text-sm text-zinc-500 text-center mb-6">
                Check your email or authenticator app for the code
              </p>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-2">Steam Guard Code</label>
                  <input
                    type="text"
                    value={steamGuardCode}
                    onChange={(e) => setSteamGuardCode(e.target.value.toUpperCase())}
                    placeholder="XXXXX"
                    maxLength={5}
                    onKeyDown={(e) => e.key === "Enter" && handleSteamGuard()}
                    className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-700/50 rounded-xl text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 text-center text-2xl tracking-widest font-mono"
                  />
                </div>

                <button
                  onClick={handleSteamGuard}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-semibold rounded-xl transition-all"
                >
                  Verify
                </button>

                <button
                  onClick={() => setLoginState("idle")}
                  className="w-full py-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100 mb-1">Manifest Dumper</h2>
          <p className="text-sm text-zinc-500">{games.length} game{games.length !== 1 ? "s" : ""} in your library</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-xl transition-all text-sm"
        >
          <HiArrowRightOnRectangle className="w-4 h-4" />
          Logout
        </button>
      </div>

      <div className="relative mb-4">
        <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search games..."
          className="w-full pl-10 pr-4 py-2.5 bg-zinc-800/50 border border-zinc-700/30 rounded-xl text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
        />
      </div>

      <div className="space-y-3 overflow-y-auto flex-1 pr-2">
        <AnimatePresence>
          {filteredGames.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-sm">
              {games.length === 0 ? "Loading games..." : "No games found"}
            </div>
          ) : (
            filteredGames.map((game, index) => (
              <motion.div
                key={game.appId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                className="group bg-gradient-to-br from-zinc-800/40 to-zinc-900/40 rounded-2xl border border-zinc-700/30 p-4 hover:border-zinc-600/50 transition-all duration-200"
              >
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-zinc-800/80 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={`https://steamcdn-a.akamaihd.net/steam/apps/${game.appId}/header.jpg`}
                      alt={game.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-zinc-200 truncate">{game.name}</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">App ID: {game.appId}</p>
                    {dumpResult && dumpResult.appId === game.appId && (
                      <p className={`text-xs mt-1 ${dumpResult.success ? "text-emerald-400" : "text-red-400"}`}>
                        {dumpResult.message}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDump(game)}
                    disabled={dumpingAppId === game.appId}
                    className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {dumpingAppId === game.appId ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-3.5 h-3.5 border border-emerald-400 border-t-transparent rounded-full"
                        />
                        Dumping...
                      </>
                    ) : (
                      <>
                        <HiArrowDownTray className="w-3.5 h-3.5" />
                        Dump
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
