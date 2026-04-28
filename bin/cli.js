#!/usr/bin/env node

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');

const args = process.argv.slice(2);
const ENV_FILE = 'wp-studio-env.json';

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


// 主分发逻辑
async function main() {
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Usage: dp-studio <command> [options]

Commands:
  link [site-name]    Link current directory to a Studio site
  open [admin|site]   Open WP Admin or site frontend (uses cached status)
  env                 Show current link environment and status

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
