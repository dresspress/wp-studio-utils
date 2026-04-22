#!/usr/bin/env node

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
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

/**
 * 执行 studio 命令并获取 JSON
 */
function getStudioStatus(sitePath) {
    try {
        const rawOutput = execSync(`studio site status --path "${sitePath}" --format json`, { 
            stdio: ['pipe', 'pipe', 'ignore'],
            encoding: 'utf8' 
        });
        const jsonStartIndex = rawOutput.indexOf('{');
        if (jsonStartIndex === -1) return null;
        return JSON.parse(rawOutput.substring(jsonStartIndex));
    } catch (e) {
        return null;
    }
}

/**
 * dp-studio link [site-name]
 */
async function handleLink(siteName) {
    const studioRoot = path.join(os.homedir(), 'Studio');

    if (!siteName) {
        if (!fs.existsSync(studioRoot)) {
            console.error(`Error: Studio root directory not found at ${studioRoot}`);
            process.exit(1);
        }

        const sites = fs.readdirSync(studioRoot).filter(file => {
            return fs.statSync(path.join(studioRoot, file)).isDirectory();
        });

        if (sites.length === 0) {
            console.error(`Error: No Studio sites found in ${studioRoot}`);
            process.exit(1);
        }

        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedSite',
                message: 'Which Studio site do you want to link?',
                choices: sites
            }
        ]);
        siteName = answers.selectedSite;
    }

    const currentDir = process.cwd();
    const pluginName = path.basename(currentDir);
    const studioSitePath = path.join(studioRoot, siteName);
    const targetPluginPath = path.join(studioSitePath, 'wp-content', 'plugins', pluginName);

    if (!fs.existsSync(studioSitePath)) {
        console.error(`Error: Studio site not found at ${studioSitePath}`);
        process.exit(1);
    }

    // 创建软链接
    if (fs.existsSync(targetPluginPath)) {
        const stats = fs.lstatSync(targetPluginPath);
        if (stats.isSymbolicLink() || stats.isDirectory()) {
            console.log(`Warning: Target already exists at ${targetPluginPath}. Recreating...`);
            // 简单处理：如果是目录且不是软链接，建议用户手动删除以防万一
            if (!stats.isSymbolicLink() && stats.isDirectory()) {
                 execSync(`rm -rf "${targetPluginPath}"`);
            } else {
                 fs.unlinkSync(targetPluginPath);
            }
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
        siteName: siteName,
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

    const status = getStudioStatus(env.sitePath);
    if (!status) {
        console.error(`Error: Could not fetch status for site '${env.siteName}'. Is it running?`);
        process.exit(1);
    }

    const url = (type === 'site') ? status.siteUrl : status.autoLoginUrl;
    console.log(`Opening ${type} URL in Chrome...`);
    execSync(`open -na "Google Chrome" --args --new-window "${url}"`);
}

/**
 * dp-studio env
 */
function handleEnv() {
    const env = readEnv();
    if (!env) {
        console.log("No linked environment found in this directory.");
        return;
    }
    
    console.log(`Linked to Studio Site: ${env.siteName}`);
    console.log(`Path: ${env.sitePath}`);
    
    const status = getStudioStatus(env.sitePath);
    if (status) {
        env.status = status;
        fs.writeFileSync(ENV_FILE, JSON.stringify(env, null, 2));
        console.log("\nCurrent Status:");
        console.log(`- URL: ${status.siteUrl}`);
        console.log(`- WP Version: ${status.wpVersion}`);
        console.log(`- Admin: ${status.adminUsername}`);
    } else {
        console.log("\nSite appears to be offline.");
    }
}

// 主分发逻辑
async function main() {
    const subCommand = args[0];
    const subArg = args[1];

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
        spawnSync('studio', finalArgs, { stdio: 'inherit' });
    }
}

main();
