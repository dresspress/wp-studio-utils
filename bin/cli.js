#!/usr/bin/env node

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const https = require('https');
const os = require('os');

const args = process.argv.slice(2);
const ENV_FILE = 'wp-studio-env.json';

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    red: "\x1b[31m",
};

/**
 * 读取环境配置（如果存在）
 */
function readEnv() {
    if (fs.existsSync(ENV_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(ENV_FILE, 'utf8'));
        } catch (e) {
            return null;
        }
    }
    return null;
}

function stripAnsi(str) {
    const pattern = [
        '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*)?\\u0007)',
        '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))'
    ].join('|');

    const regex = new RegExp(pattern, 'g');
    return str.replace(regex, '');
}

function parseJsonFromOutput(rawOutput) {
    const cleanOutput = stripAnsi(rawOutput).trim();
    const arrayStartIndex = cleanOutput.indexOf('[');
    const objectStartIndex = cleanOutput.indexOf('{');
    let jsonStartIndex = -1;

    if (arrayStartIndex === -1) {
        jsonStartIndex = objectStartIndex;
    } else if (objectStartIndex === -1) {
        jsonStartIndex = arrayStartIndex;
    } else {
        jsonStartIndex = Math.min(arrayStartIndex, objectStartIndex);
    }

    if (jsonStartIndex === -1) {
        return null;
    }

    return JSON.parse(cleanOutput.substring(jsonStartIndex));
}

function runStudioJson(args) {
    try {
        const rawOutput = execFileSync('studio', args, {
            stdio: ['pipe', 'pipe', 'ignore'],
            encoding: 'utf8'
        });
        return parseJsonFromOutput(rawOutput);
    } catch (e) {
        return null;
    }
}

/**
 * 执行 studio 命令并获取 JSON
 */
function getStudioStatus(sitePath) {
    return runStudioJson(['site', 'status', '--path', sitePath, '--format', 'json']);
}

function getStudioSites() {
    const sites = runStudioJson(['site', 'list', '--format', 'json']);
    return Array.isArray(sites) ? sites : [];
}

function getOpenCommand(url) {
    switch (process.platform) {
        case 'darwin':
            return { command: 'open', args: [url] };
        case 'win32':
            return { command: 'cmd', args: ['/c', 'start', '', url] };
        default:
            return { command: 'xdg-open', args: [url] };
    }
}

function openUrl(url) {
    const { command, args } = getOpenCommand(url);
    const result = spawnSync(command, args, { stdio: 'ignore' });

    if (result.error || result.status !== 0) {
        console.error(`Error: Failed to open ${url} in the default browser.`);
        process.exit(result.status || 1);
    }
}

function resolveSite(sites, siteName) {
    return sites.find(site => site.name === siteName || site.id === siteName || site.path === siteName) || null;
}

/**
 * dp-studio link [site-name]
 */
async function handleLink(siteName) {
    const sites = getStudioSites();

    if (sites.length === 0) {
        console.error('Error: No Studio sites found. Is WordPress Studio installed and configured?');
        process.exit(1);
    }

    let site = siteName ? resolveSite(sites, siteName) : null;

    if (siteName && !site) {
        console.error(`Error: Studio site '${siteName}' not found.`);
        process.exit(1);
    }

    if (!site) {
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedSite',
                message: 'Which Studio site do you want to link?',
                choices: sites.map(candidate => ({
                    name: candidate.name,
                    value: candidate.id
                }))
            }
        ]);
        site = resolveSite(sites, answers.selectedSite);
    }

    const currentDir = process.cwd();
    const pluginName = path.basename(currentDir);
    const studioSitePath = site.path;
    const targetPluginPath = path.join(studioSitePath, 'wp-content', 'plugins', pluginName);

    if (!fs.existsSync(studioSitePath)) {
        console.error(`Error: Studio site not found at ${studioSitePath}`);
        process.exit(1);
    }

    // 创建软链接
    let existingStats;
    try {
        existingStats = fs.lstatSync(targetPluginPath);
    } catch (e) {
        // Entry does not exist
    }

    if (existingStats) {
        const isForce = args.includes('--force') || args.includes('-f');
        if (isForce || existingStats.isSymbolicLink()) {
            console.log(`Warning: Target already exists at ${targetPluginPath}. ${isForce ? 'Forcing overwrite...' : 'Recreating symlink...'}`);
            fs.rmSync(targetPluginPath, { recursive: true, force: true });
        } else {
            console.error(`Error: Refusing to replace existing non-symlink path at ${targetPluginPath}.`);
            console.error('Use --force to overwrite, or remove/rename that directory first.');
            process.exit(1);
        }
    }
    
    // 确保 plugins 目录存在
    const pluginsDir = path.dirname(targetPluginPath);
    if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir, { recursive: true });
    }

    fs.symlinkSync(currentDir, targetPluginPath);
    console.log(`Link created: ${currentDir} -> ${targetPluginPath}`);

    // 保存环境配置文件
    const status = getStudioStatus(studioSitePath);
    const config = {
        siteName: site.name,
        siteId: site.id,
        sitePath: studioSitePath,
        linkedAt: new Date().toISOString(),
        status: status
    };
    fs.writeFileSync(ENV_FILE, JSON.stringify(config, null, 2));
    console.log(`Success: Environment linked. Generated ${ENV_FILE}.`);
}

/**
 * dp-studio open [admin|site]
 */
function handleOpen(type = 'admin') {
    const env = readEnv();
    if (!env || !env.sitePath) {
        console.error(`Error: No linked environment found. Run 'dp-studio link' first.`);
        process.exit(1);
    }

    const forceRefresh = args.includes('--refresh') || args.includes('-r');
    let status = env.status;

    if (!status || forceRefresh) {
        if (forceRefresh) {
            console.log("Refreshing site status...");
        } else {
            console.log("Fetching site status for the first time...");
        }
        status = getStudioStatus(env.sitePath);
        if (status) {
            // Update cache
            env.status = status;
            fs.writeFileSync(ENV_FILE, JSON.stringify(env, null, 2));
        }
    }

    if (!status) {
        console.error(`Error: Could not fetch status for site '${env.siteName}'. Is it running?`);
        process.exit(1);
    }

    const url = (type === 'site') ? status.siteUrl : status.autoLoginUrl;
    console.log(`Opening ${type} URL in the default browser...`);
    openUrl(url);
}
/**
 * dp-studio env
 */
function handleEnv() {
    const env = readEnv();
    if (!env) {
        console.log("No linked environment found in this directory.");
        console.log("Run 'dp-studio link' to connect to a Studio site.");
        return;
    }

    console.log(`Linked to Studio Site: ${env.siteName}`);
    console.log(`Path: ${env.sitePath}`);

    const forceRefresh = args.includes('--refresh') || args.includes('-r');
    let status = env.status;

    if (!status || forceRefresh) {
        if (forceRefresh) console.log("\nRefreshing site status...");
        const freshStatus = getStudioStatus(env.sitePath);
        if (freshStatus) {
            status = freshStatus;
            env.status = status;
            fs.writeFileSync(ENV_FILE, JSON.stringify(env, null, 2));
        }
    }

    if (status) {
        console.log("\nCurrent Status:");
        console.log(`- URL: ${status.siteUrl}`);
        console.log(`- WP Version: ${status.wpVersion}`);
        console.log(`- Admin: ${status.adminUsername}`);
    } else {
        console.log("\nSite appears to be offline or status could not be fetched.");
    }
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const curl = spawn('curl', ['-L', '--fail', '-o', dest, url], {
            stdio: 'inherit' // Show curl's native progress bar
        });

        curl.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`curl failed with exit code ${code}`));
            }
        });

        curl.on('error', (err) => {
            reject(err);
        });
    });
}

function compareVersions(v1, v2) {
    const parse = (v) => v.split('-')[0].split('.').map(Number);
    const p1 = parse(v1);
    const p2 = parse(v2);
    for(let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    const suffix1 = v1.includes('-') ? v1.split('-').slice(1).join('-') : '';
    const suffix2 = v2.includes('-') ? v2.split('-').slice(1).join('-') : '';
    
    if (!suffix1 && suffix2) return 1;
    if (suffix1 && !suffix2) return -1;
    if (suffix1 && suffix2) {
        const match1 = suffix1.match(/([a-zA-Z]+)(?:-|\.)?(\d+)?/);
        const match2 = suffix2.match(/([a-zA-Z]+)(?:-|\.)?(\d+)?/);
        if (match1 && match2) {
            const type1 = match1[1];
            const type2 = match2[1];
            if (type1 !== type2) return type1.localeCompare(type2);
            const num1 = parseInt(match1[2] || 0, 10);
            const num2 = parseInt(match2[2] || 0, 10);
            if (num1 > num2) return 1;
            if (num1 < num2) return -1;
        }
        return suffix1.localeCompare(suffix2);
    }
    return 0;
}

function getZipWpVersion(zipPath) {
    try {
        const output = execFileSync('unzip', ['-p', zipPath, 'wordpress/wp-includes/version.php'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const match = output.match(/\$wp_version\s*=\s*'([^']+)';/);
        return match ? match[1] : null;
    } catch(e) {
        return null;
    }
}

function getSiteWpVersion(sitePath) {
    const versionFilePath = path.join(sitePath, 'wp-includes', 'version.php');
    try {
        const versionFileContents = fs.readFileSync(versionFilePath, 'utf8');
        const match = versionFileContents.match(/\$wp_version\s*=\s*'([^']+)';/);
        return match ? match[1] : null;
    } catch (e) {
        return null;
    }
}

function extractWordPressZip(zipPath, extractDir) {
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.mkdirSync(extractDir, { recursive: true });
    execFileSync('unzip', ['-q', zipPath, '-d', extractDir], { stdio: 'inherit' });
}

function syncDirectory(sourceDir, destDir) {
    execFileSync('rsync', ['-a', '--delete', `${sourceDir}/`, `${destDir}/`], { stdio: 'inherit' });
}

function syncWordPressCoreFiles(sourceRoot, sitePath) {
    syncDirectory(path.join(sourceRoot, 'wp-admin'), path.join(sitePath, 'wp-admin'));
    syncDirectory(path.join(sourceRoot, 'wp-includes'), path.join(sitePath, 'wp-includes'));

    const rootEntries = fs.readdirSync(sourceRoot, { withFileTypes: true });

    for (const entry of rootEntries) {
        if (!entry.isFile()) {
            continue;
        }

        if (entry.name === 'wp-config.php') {
            continue;
        }

        const sourcePath = path.join(sourceRoot, entry.name);
        const destPath = path.join(sitePath, entry.name);
        fs.copyFileSync(sourcePath, destPath);
    }

    const sampleConfigPath = path.join(sourceRoot, 'wp-config-sample.php');
    if (fs.existsSync(sampleConfigPath)) {
        fs.copyFileSync(sampleConfigPath, path.join(sitePath, 'wp-config-sample.php'));
    }
}

function getSiteFastUpdateArgs() {
    return args.slice(2);
}

async function handleSiteFastUpdate() {
    const commandArgs = getSiteFastUpdateArgs();
    let wpVersion = null;
    const wpArgIndex = commandArgs.indexOf('--wp');
    if (wpArgIndex !== -1 && commandArgs.length > wpArgIndex + 1) {
        wpVersion = commandArgs[wpArgIndex + 1];
    } else {
        console.error("Error: Please specify a version with --wp <version> (e.g., site fast-update-all --wp nightly)");
        process.exit(1);
    }

    let url = '';
    if (wpVersion === 'nightly') {
        url = 'https://wordpress.org/nightly-builds/wordpress-latest.zip';
    } else if (wpVersion === 'latest') {
        url = 'https://wordpress.org/latest.zip';
    } else {
        url = `https://wordpress.org/wordpress-${wpVersion}.zip`;
    }

    const dest = path.join(os.tmpdir(), `wordpress-${wpVersion || 'latest'}.zip`);

    console.log(`${colors.cyan}⬇️  Downloading WordPress ${colors.bright}${wpVersion}${colors.reset}${colors.cyan} from ${url} ...${colors.reset}`);
    try {
        await downloadFile(url, dest);
        console.log(`${colors.green}✅ Download complete.${colors.reset}`);
    } catch(e) {
        console.error(`${colors.red}❌ Error downloading WordPress: ${e.message}${colors.reset}`);
        process.exit(1);
    }

    const targetZipVersion = getZipWpVersion(dest);
    const displayTargetVersion = targetZipVersion || wpVersion;
    const extractDir = path.join(os.tmpdir(), `dp-studio-wordpress-${Date.now()}`);
    if (targetZipVersion) {
        console.log(`${colors.blue}ℹ️  Target version identified from zip as: ${colors.bright}${targetZipVersion}${colors.reset}`);
    }

    try {
        extractWordPressZip(dest, extractDir);
    } catch (e) {
        console.error(`${colors.red}❌ Error extracting WordPress zip: ${e.message}${colors.reset}`);
        try { fs.unlinkSync(dest); } catch(err) {}
        process.exit(1);
    }

    const extractedWordPressRoot = path.join(extractDir, 'wordpress');

    const sites = getStudioSites();
    if (!sites || sites.length === 0) {
        console.log(`${colors.yellow}⚠️  No Studio sites found.${colors.reset}`);
        try { fs.unlinkSync(dest); } catch(e) {}
        process.exit(0);
    }

    console.log(`\n${colors.bright}🚀 Starting batch update for ${sites.length} sites...${colors.reset}\n`);

    for (const site of sites) {
        console.log(`${colors.blue}🔍 Checking site:${colors.reset} ${colors.bright}${site.name}${colors.reset} ${colors.dim}(${site.path})${colors.reset}`);

        try {
            const currentVersion = getSiteWpVersion(site.path);

            if (!currentVersion) {
                throw new Error('Could not determine current WordPress version from wp-includes/version.php');
            }

            console.log(`   ${colors.dim}Current version:${colors.reset} ${currentVersion}`);

            if (compareVersions(currentVersion, displayTargetVersion) >= 0 && !commandArgs.includes('--force')) {
                console.log(`   ${colors.yellow}⏭️  Site version ${currentVersion} is >= target ${displayTargetVersion}. Skipping.${colors.reset}\n`);
                continue;
            }

            console.log(`   ${colors.cyan}🔄 Updating site ${site.name} to ${displayTargetVersion}...${colors.reset}`);
            syncWordPressCoreFiles(extractedWordPressRoot, site.path);
            const updatedVersion = getSiteWpVersion(site.path);

            if (!updatedVersion) {
                throw new Error('Core files were copied, but the updated version could not be read');
            }

            console.log(`   ${colors.green}✨ Successfully updated ${site.name} to ${updatedVersion}.${colors.reset}\n`);
        } catch(e) {
            console.error(`   ${colors.red}❌ Failed to update site ${site.name}: ${e.message}${colors.reset}\n`);
        }
    }
    
    try { fs.unlinkSync(dest); } catch(e) {}
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch(e) {}
    console.log(`${colors.green}${colors.bright}🎉 Fast update complete!${colors.reset}`);
}

function hasPathArgument(commandArgs) {
    return commandArgs.includes('--path') || commandArgs.some((arg) => arg.startsWith('--path='));
}

function getSiteSetAllArgs() {
    return args.slice(2);
}

function isNoChangesToApplyOutput(output) {
    return output.includes('No changes to apply. The site already has the specified settings.');
}

function runSiteCommandForAll(actionLabel, studioArgs) {
    if (hasPathArgument(studioArgs)) {
        console.error(`Error: Do not pass --path to site ${actionLabel}. The command automatically applies options to each Studio site.`);
        process.exit(1);
    }

    const sites = getStudioSites();
    if (!sites || sites.length === 0) {
        console.log(`${colors.yellow}⚠️  No Studio sites found.${colors.reset}`);
        process.exit(0);
    }

    console.log(`\n${colors.bright}🚀 Starting site ${actionLabel} for ${sites.length} sites...${colors.reset}\n`);

    for (const site of sites) {
        console.log(`${colors.blue}🔧 Site ${actionLabel}:${colors.reset} ${colors.bright}${site.name}${colors.reset} ${colors.dim}(${site.path})${colors.reset}`);

        try {
            const result = spawnSync('studio', [...studioArgs, '--path', site.path], {
                encoding: 'utf8'
            });

            if (result.error) {
                throw result.error;
            }

            const combinedOutput = [result.stdout, result.stderr]
                .filter(Boolean)
                .join('\n');

            if (result.status !== 0) {
                if (isNoChangesToApplyOutput(combinedOutput)) {
                    console.log(`   ${colors.yellow}⏭️  No changes needed for ${site.name}.${colors.reset}\n`);
                    continue;
                }

                throw new Error(stripAnsi(combinedOutput).trim() || `studio ${studioArgs.join(' ')} exited with code ${result.status}`);
            }

            if (combinedOutput.trim()) {
                process.stdout.write(combinedOutput);
                if (!combinedOutput.endsWith('\n')) {
                    process.stdout.write('\n');
                }
            }

            console.log(`   ${colors.green}✨ Successfully completed ${actionLabel} for ${site.name}.${colors.reset}\n`);
        } catch (e) {
            console.error(`   ${colors.red}❌ Failed to run ${actionLabel} for ${site.name}: ${e.message}${colors.reset}\n`);
        }
    }

    console.log(`${colors.green}${colors.bright}🎉 Site ${actionLabel} complete!${colors.reset}`);
}

function handleSiteSetAll() {
    const setArgs = getSiteSetAllArgs();

    if (setArgs.length === 0) {
        console.error("Error: Please provide at least one 'studio site set' option (e.g. site set-all --php 8.4).");
        process.exit(1);
    }

    runSiteCommandForAll('set-all', ['site', 'set', ...setArgs]);
}

function handleSiteStartAll() {
    const startArgs = args.slice(2);
    if (startArgs.length > 0 && hasPathArgument(startArgs)) {
        console.error("Error: Do not pass --path to site start-all. The command automatically applies options to each Studio site.");
        process.exit(1);
    }
    runSiteCommandForAll('start-all', ['site', 'start', ...startArgs]);
}

function handleSiteStopAll() {
    const stopArgs = args.slice(2);
    if (stopArgs.length > 0 && hasPathArgument(stopArgs)) {
        console.error("Error: Do not pass --path to site stop-all. The command automatically applies options to each Studio site.");
        process.exit(1);
    }
    runSiteCommandForAll('stop-all', ['site', 'stop', ...stopArgs]);
}


// 主分发逻辑
async function main() {
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Usage: dp-studio <command> [options]

Commands:
  link [site-name]    Link current directory to a Studio site
  open [admin|site]   Open WP Admin or site frontend (uses cached status)
  env                 Show current link environment and status
  site set-all        Apply 'studio site set' options to all sites
  site start-all      Start all sites
  site stop-all       Stop all sites
  site fast-update-all  Fast update WordPress core for all sites (e.g. --wp nightly)

Options:
  --force, -f         Force overwrite existing symlink or directory (for 'link')
  --refresh, -r       Force refresh site status from Studio (slow)
  --help, -h          Show this help message

Any other command will be passed directly to the 'studio' CLI with the linked --path.
        `);
        return;
    }

    const subCommand = args[0];
    
    // Find the first non-flag argument after the subcommand
    let subArg = null;
    for (let i = 1; i < args.length; i++) {
        if (!args[i].startsWith('-')) {
            subArg = args[i];
            break;
        }
    }

    if (subCommand === 'link') {
        await handleLink(subArg);
    } 
    else if (subCommand === 'open') {
        handleOpen(subArg || 'admin');
    } 
    else if (subCommand === 'env') {
        handleEnv();
    }
    else if (subCommand === 'site' && args[1] === 'set-all') {
        handleSiteSetAll();
    }
    else if (subCommand === 'site' && args[1] === 'start-all') {
        handleSiteStartAll();
    }
    else if (subCommand === 'site' && args[1] === 'stop-all') {
        handleSiteStopAll();
    }
    else if (subCommand === 'site' && args[1] === 'fast-update-all') {
        await handleSiteFastUpdate();
    }
    else {
        const env = readEnv();
        const finalArgs = [...args];
        if (env && env.sitePath && !args.includes('--path')) {
            finalArgs.push('--path', env.sitePath);
        }
        const result = spawnSync('studio', finalArgs, { stdio: 'inherit' });

        if (result.error) {
            console.error(`Error: Failed to run studio: ${result.error.message}`);
            process.exit(1);
        }

        process.exit(result.status || 0);
    }
}

main();
