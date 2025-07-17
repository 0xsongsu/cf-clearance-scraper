#!/usr/bin/env node

/**
 * Chrome路径检测工具
 * 用于诊断Windows系统Chrome浏览器路径问题
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

console.log('🔍 Chrome浏览器路径检测工具');
console.log('================================\n');

const platform = os.platform();
console.log(`操作系统: ${platform}`);

// 获取Chrome路径列表
function getChromePaths() {
    let chromePaths = [];
    
    // 优先检查环境变量
    const customChromePath = process.env.CHROME_PATH || process.env.CHROME_EXECUTABLE;
    if (customChromePath) {
        console.log(`🎯 检测到自定义Chrome路径: ${customChromePath}`);
        chromePaths.push(customChromePath);
    }
    
    if (platform === 'win32') {
        // Windows Chrome路径
        const userProfile = process.env.USERPROFILE || process.env.HOME;
        const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
        const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
        
        chromePaths.push(
            // 用户安装的Chrome
            path.join(userProfile, 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
            // 系统安装的Chrome (64位)
            path.join(programFiles, 'Google\\Chrome\\Application\\chrome.exe'),
            // 系统安装的Chrome (32位)
            path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
            // Chromium路径
            path.join(userProfile, 'AppData\\Local\\Chromium\\Application\\chrome.exe'),
            path.join(programFiles, 'Chromium\\Application\\chrome.exe'),
            path.join(programFilesX86, 'Chromium\\Application\\chrome.exe'),
            // Edge (基于Chromium)
            path.join(programFiles, 'Microsoft\\Edge\\Application\\msedge.exe'),
            path.join(programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
            // 常见的便携版路径
            'C:\\chrome\\chrome.exe',
            'C:\\chromium\\chrome.exe'
        );
    } else if (platform === 'darwin') {
        // macOS Chrome路径
        chromePaths.push(
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
        );
    } else {
        // Linux Chrome路径
        chromePaths.push(
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/snap/bin/chromium',
            '/usr/bin/microsoft-edge-stable',
            '/usr/bin/microsoft-edge'
        );
    }
    
    return chromePaths;
}

// 检测Chrome路径
function checkChromePaths() {
    const chromePaths = getChromePaths();
    const existingPaths = [];
    
    console.log(`\n📋 检查 ${chromePaths.length} 个可能的Chrome路径:\n`);
    
    chromePaths.forEach((chromePath, index) => {
        const exists = fs.existsSync(chromePath);
        const status = exists ? '✅' : '❌';
        console.log(`${index + 1}. ${status} ${chromePath}`);
        
        if (exists) {
            existingPaths.push(chromePath);
        }
    });
    
    return existingPaths;
}

// 获取Chrome版本
async function getChromeVersion(chromePath) {
    return new Promise((resolve) => {
        const { spawn } = require('child_process');
        const chrome = spawn(chromePath, ['--version'], { stdio: 'pipe' });
        
        let output = '';
        chrome.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        chrome.on('close', (code) => {
            if (code === 0) {
                resolve(output.trim());
            } else {
                resolve('版本检测失败');
            }
        });
        
        chrome.on('error', () => {
            resolve('版本检测失败');
        });
        
        // 5秒超时
        setTimeout(() => {
            chrome.kill();
            resolve('版本检测超时');
        }, 5000);
    });
}

// 主函数
async function main() {
    const existingPaths = checkChromePaths();
    
    console.log(`\n📊 检测结果:`);
    console.log(`找到 ${existingPaths.length} 个可用的Chrome浏览器\n`);
    
    if (existingPaths.length === 0) {
        console.log('❌ 未找到任何Chrome浏览器安装');
        console.log('\n🔧 解决方案:');
        
        if (platform === 'win32') {
            console.log('1. 下载并安装Chrome: https://www.google.com/chrome/');
            console.log('2. 或设置环境变量指向Chrome路径:');
            console.log('   set CHROME_PATH=C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
        } else if (platform === 'darwin') {
            console.log('1. 安装Chrome: brew install --cask google-chrome');
            console.log('2. 或从官网下载: https://www.google.com/chrome/');
        } else {
            console.log('1. 安装Chrome: sudo apt install google-chrome-stable');
            console.log('2. 或安装Chromium: sudo apt install chromium-browser');
        }
        
        process.exit(1);
    }
    
    console.log('✅ 可用的Chrome浏览器:');
    for (let i = 0; i < existingPaths.length; i++) {
        const chromePath = existingPaths[i];
        console.log(`\n${i + 1}. ${chromePath}`);
        
        const version = await getChromeVersion(chromePath);
        console.log(`   版本: ${version}`);
    }
    
    console.log(`\n🎯 推荐使用: ${existingPaths[0]}`);
    
    if (!process.env.CHROME_PATH && !process.env.CHROME_EXECUTABLE) {
        console.log('\n💡 提示: 可以设置环境变量来指定Chrome路径:');
        if (platform === 'win32') {
            console.log(`set CHROME_PATH=${existingPaths[0]}`);
        } else {
            console.log(`export CHROME_PATH="${existingPaths[0]}"`);
        }
    }
    
    console.log('\n✅ Chrome路径检测完成!');
}

// 运行检测
main().catch(console.error);
