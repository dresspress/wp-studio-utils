# @dresspress/wp-studio-utils

A specialized developer toolchain to bridge the gap between your WordPress plugin directories and [WordPress Studio](https://developer.wordpress.com/studio/) environments.

## Features

- **`dp-studio link`**: Interactive site binding with automatic symlinking and environment metadata generation.
- **Intelligent Proxy**: Run any `studio` command from your plugin directory without manually passing `--path`.
- **One-Click Open**: Instantly open WP Admin or Frontend in a new Chrome window.
- **Environment Sync**: Keep a local `wp-studio-env.json` updated with the latest site status for AI and developer reference.

## Installation

```bash
# Clone the repository
git clone https://github.com/dresspress/wp-studio-utils.git
cd wp-studio-utils

# Install dependencies and link globally
npm install
npm link
```

## Usage

### 1. Bind Plugin to Studio (`link`)
Run this from your **plugin's root directory**:
```bash
dp-studio link
```
- **Interactive Mode**: If no site name is provided, it scans `~/Studio` and lets you pick from a list.
- **Direct Mode**: `dp-studio link <site-name>`
- **What it does**: Creates a symlink in Studio's plugin folder and generates `wp-studio-env.json` locally.

### 2. Smart Proxy
Once linked, use `dp-studio` instead of `studio` to automatically target the correct site:
```bash
dp-studio site status   # Auto-detects the linked site path
dp-studio wp plugin list
```

### 3. Quick Open (`open`)
```bash
dp-studio open          # Opens WP Admin (Default)
dp-studio open site     # Opens the Site Frontend
```

### 4. Sync/View Environment (`env`)
```bash
dp-studio env
```
Refreshes the local `wp-studio-env.json` with the latest port, credentials, and versions.

## Requirements

- [WordPress Studio](https://developer.wordpress.com/studio/) (CLI enabled).
- Node.js (v16+).
- Google Chrome (for the `open` command).

## License

MIT © [DressPress](https://github.com/dresspress)
