# @dresspress/wp-studio-utils

A lightweight CLI wrapper for [WordPress Studio](https://developer.wordpress.com/studio/) that simplifies plugin development by linking project directories and automating site access.

## Installation

```bash
npm install -g @dresspress/wp-studio-utils
```

Requirements:
- `studio` CLI must already be installed and available on `PATH`
- `dp-studio` discovers sites through `studio site list --format json`

## Quick Start

### 1. Link a project
Run this inside your plugin's root directory:
```bash
dp-studio link
```
You can also pass a site name, site id, or full site path:
```bash
dp-studio link "My Studio Site"
```
It creates a symlink to your Studio site's plugin folder and saves environment metadata to `wp-studio-env.json`.
If the target plugin path already contains a real directory, `dp-studio` will stop instead of deleting it.

### 2. Auto-detect environment
Any standard `studio` command run from your project root will automatically target the linked site:
```bash
dp-studio site status   # No need to pass --path
dp-studio wp plugin list
```

### 3. Open site
```bash
dp-studio open          # Opens WP Admin in the default browser
dp-studio open site     # Opens site frontend
```

### 4. Sync environment
```bash
dp-studio env           # Refreshes local wp-studio-env.json with latest site status
```

### 5. Batch update WordPress
You can batch update all your local Studio sites to a specific WordPress version simultaneously:
```bash
dp-studio batch-update --wp nightly  # Updates all sites to the latest nightly build
dp-studio batch-update --wp 6.5      # Updates all sites to version 6.5
```
This command downloads the WordPress zip once and applies it to all sites. It also smartly compares versions to skip sites that are already up-to-date.

### 6. Batch set Studio site options
You can also apply any `studio site set` options to all local Studio sites:
```bash
dp-studio batch-set --php 8.4
dp-studio batch-set --debug-log --debug-display
dp-studio batch-set --wp nightly
```
This command forwards the provided options to `studio site set` for each site. Do not pass `--path`; `dp-studio` sets the target site path automatically.

## Alias (Recommended)

To use `dp-studio` as a drop-in replacement for `studio`, add this to your `.zshrc`:
```bash
alias studio="dp-studio"
```
This only affects shell commands you type yourself. Internal subprocess calls still use the real `studio` CLI.

## Development

```bash
git clone https://github.com/dresspress/wp-studio-utils.git
cd wp-studio-utils
npm install
npm link
```

## Release

This package is published to npm through GitHub Actions using npm Trusted Publishing (OIDC). No `NPM_TOKEN` is required for the standard release flow.

Use the Make targets to cut a release:

```bash
make patch  # 1.1.x -> 1.1.x+1
make minor  # 1.1.x -> 1.2.0
make major  # 1.x.x -> 2.0.0
```

Each target runs `npm version`, creates the matching git tag, and pushes `main` plus tags to GitHub, which triggers the publish workflow.

## License

MIT © [DressPress](https://github.com/dresspress)
