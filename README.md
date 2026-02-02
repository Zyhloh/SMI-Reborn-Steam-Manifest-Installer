<div align="center">

# SMI Reborn

<img src="public/icon.ico" alt="SMI Reborn Logo" width="120" />

### The Next Generation Steam Manifest Installer

[![Version](https://img.shields.io/badge/version-0.0.1--beta-orange.svg)](https://github.com/Zyhloh/smi-reborn/releases)
[![Electron](https://img.shields.io/badge/Electron-40-47848F.svg?logo=electron)](https://electronjs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg?logo=next.js)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Install • Manage • Dump** — All your Steam manifests in one beautiful app

[Download](#download) • [Features](#features) • [Usage](#usage) • [Development](#development)

</div>

---

## ⚠️ Disclaimer

This software is provided for **educational purposes only**. The developers are not responsible for how this software is used. Users are solely responsible for ensuring compliance with all applicable laws and Steam's Terms of Service. **Use at your own risk.**

---

## 📥 Download

Get the latest release from the [Releases](https://github.com/Zyhloh/SMI-Reborn-Steam-Manifest-Installer/releases/) page.

| Platform | Download |
|----------|----------|
| Windows | `SMI Reborn Setup 0.0.1-beta.exe` |

---

## ✨ Features

### 📦 Install Manifests
- **Drag & Drop** — Drop folders, ZIP archives, or individual files
- **Smart Detection** — Automatically finds `.lua` and `.manifest` files
- **Archive Support** — Extract and install from ZIP files instantly
- **Steam Integration** — Auto-detects Steam path and handles restarts

### 📚 Library Management
- **View Installed Games** — See all manifests you've installed
- **One-Click Uninstall** — Remove games and their manifest files
- **Game Images** — Beautiful thumbnails from Steam CDN

### 🔐 Manifest Dumper
- **Steam Login** — Secure login with Steam Guard & mobile confirmation support
- **Export Your Games** — Dump manifests from games you own
- **Share Ready** — Exports `.manifest`, `.lua`, and `.vdf` files
- **Auto-Login** — Saves session for convenience

### ⚙️ Steam Management
- **64-bit Detection** — Warns if Steam needs downgrading
- **One-Click Downgrade** — Automatically downgrade Steam to 32-bit
- **SMI Resources** — Install required files with one click

### 🎨 Modern UI
- **Dark Theme** — Easy on the eyes with amber accents
- **Smooth Animations** — Powered by Framer Motion
- **Custom Title Bar** — Frameless window with native controls
- **Notifications** — Real-time alerts for important actions

---

## 🚀 Usage

### First Launch
1. Run `SMI Reborn Setup.exe` to install
2. App auto-detects your Steam installation
3. If Steam is 64-bit, go to **Settings** to downgrade

### Installing Manifests
1. Go to the **Install** tab
2. Drag & drop your manifest folder/ZIP onto the drop zone
3. SMI handles the rest — files are copied and Steam restarts

### Dumping Your Games
1. Go to the **Dumper** tab
2. Login with your Steam credentials
3. Approve on your phone (Steam Guard)
4. Click **Dump** on any game you own
5. Files are exported to `Documents/SMI Exports/`

### Managing Library
1. Go to the **Library** tab
2. View all installed manifests
3. Click **Uninstall** to remove any game

---

## 🛠️ Development

### Prerequisites
- Node.js 18+
- npm

### Setup
```bash
# Clone the repo
git clone https://github.com/Zyhloh/smi-reborn.git
cd smi-reborn

# Install dependencies
npm install

# Run in development mode
npm run electron:dev
```

### Build
```bash
# Build installer for Windows
npm run electron:build

# Output: dist/SMI Reborn Setup x.x.x.exe
```

### Project Structure
```
smi-reborn/
├── electron/           # Electron main process
│   ├── main.js        # Main process & IPC handlers
│   └── preload.js     # Secure bridge to renderer
├── src/               # Next.js frontend
│   ├── app/           # App router
│   └── components/    # React components
├── public/            # Static assets
└── package.json       # Dependencies & scripts
```

### Tech Stack
- **Framework**: Electron 40 + Next.js 16
- **UI**: React 19, Tailwind CSS 4, Framer Motion
- **Steam**: steam-user, steam-session
- **Build**: electron-builder

---

## 📋 Scripts

| Command | Description |
|---------|-------------|
| `npm run electron:dev` | Start development mode |
| `npm run electron:build` | Build Windows installer |
| `npm run build` | Build Next.js for production |
| `npm run dev` | Start Next.js dev server only |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/awesome`)
3. Commit your changes (`git commit -m 'Add awesome feature'`)
4. Push to branch (`git push origin feature/awesome`)
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Made with ❤️ by [Zyhloh](https://github.com/Zyhloh)**

⭐ Star this repo if you find it useful!

</div>
