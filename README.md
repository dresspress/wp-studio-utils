# @dresspress/wp-studio-utils

A smart developer toolchain to bridge the gap between your standalone plugin directories and [WordPress Studio](https://developer.wordpress.com/studio/) environments.

## Quick Start

### Installation

Install globally via NPM:
```bash
npm install -g @dresspress/wp-studio-utils
```

### 1. Bind Plugin to Studio
Run this from your **plugin's root directory**:
```bash
dp-studio link
```
- **Interactive Mode**: If no site name is provided, it scans `~/Studio` and lets you pick from a list.
- **What it does**: Creates a symlink in Studio's plugin folder and generates `wp-studio-env.json` locally.

### 2. Smart Proxy (Environment Aware)
Once linked, use `dp-studio` instead of `studio` to automatically target the correct site without passing `--path`:
```bash
dp-studio site status   # Auto-detects the linked site path
dp-studio wp plugin list
```

### 3. Fast Admin Access
Open your site in **Google Chrome** (new window) without leaving your plugin folder:
```bash
dp-studio open          # Opens WP Admin (Default)
dp-studio open site     # Opens the Site Frontend
```

---

## Why use `dp-studio`?

When developing multiple plugins, you often keep them in a dedicated `Projects` folder, not directly inside the Studio site's `wp-content/plugins` directory. `dp-studio` solves this by:
- **Automatic Symlinking**: No more manual `ln -s` commands.
- **Zero Context Switching**: Run Studio/WP-CLI commands directly from your project root.
- **AI-Ready**: The `wp-studio-env.json` file serves as a "source of truth" for AI coding assistants to discover the linked environment.

## Advanced Usage

### Sync Environment
Refresh the local `wp-studio-env.json` with the latest site status (URL, credentials, versions):
```bash
dp-studio env
```

---

## Development & Contribution

If you want to contribute to this tool:

```bash
git clone https://github.com/dresspress/wp-studio-utils.git
cd wp-studio-utils
npm install
npm link
```

## Requirements

- [WordPress Studio](https://developer.wordpress.com/studio/) (CLI enabled).
- Node.js (v16+).
- Google Chrome (required for `open` command).

## License

MIT © [DressPress](https://github.com/dresspress)
