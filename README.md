# @dresspress/wp-studio-utils

A lightweight CLI wrapper for [WordPress Studio](https://developer.wordpress.com/studio/) that simplifies plugin development by linking project directories and automating site access.

## Installation

```bash
npm install -g @dresspress/wp-studio-utils
```

## Quick Start

### 1. Link a project
Run this inside your plugin's root directory:
```bash
dp-studio link
```
It creates a symlink to your Studio site's plugin folder and saves environment metadata to `wp-studio-env.json`.

### 2. Auto-detect environment
Any standard `studio` command run from your project root will automatically target the linked site:
```bash
dp-studio site status   # No need to pass --path
dp-studio wp plugin list
```

### 3. Open site
```bash
dp-studio open          # Opens WP Admin in default browser
dp-studio open site     # Opens site frontend
```

### 4. Sync environment
```bash
dp-studio env           # Refreshes local wp-studio-env.json with latest site status
```

## Alias (Recommended)

To use `dp-studio` as a drop-in replacement for `studio`, add this to your `.zshrc`:
```bash
alias studio="dp-studio"
```

## Development

```bash
git clone https://github.com/dresspress/wp-studio-utils.git
cd wp-studio-utils
npm install
npm link
```

## License

MIT © [DressPress](https://github.com/dresspress)
