#!/usr/bin/env node
/**
 * CF Clearance Scraper 启动脚本
 * 智能启动，自动根据系统性能配置最优参数
 */

const path = require('path');

// 加载统一配置文件
require('dotenv').config({ path: path.join(__dirname, '.env') })

// 简化的配置 - 只保留必要的用户可配置项
const defaultConfig = {
    PORT: Number(process.env.PORT) || 3000,
    AUTH_TOKEN: process.env.AUTH_TOKEN || null,
    NODE_ENV: process.env.NODE_ENV || 'production'
};

// 解析命令行参数
function parseArgs() {
    const args = process.argv.slice(2);
    const config = { ...defaultConfig };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const [key, value] = arg.substring(2).split('=');
            if (value) {
                // 只允许配置基本参数
                if (['PORT', 'AUTH_TOKEN', 'NODE_ENV'].includes(key)) {
                    config[key] = isNaN(value) ? value : Number(value);
                }
            }
        }
    }

    return config;
}

// 显示帮助信息
function showHelp() {
    console.log(`
🚀 CF Clearance Scraper - 智能启动脚本

用法:
  npm start                     # 推荐：使用npm启动
  node start.js [选项]          # 直接启动

基本选项:
  --PORT=3000                   设置服务端口 (默认: 3000)
  --AUTH_TOKEN=your_token       API认证令牌 (可选)
  --NODE_ENV=production         运行环境 (默认: production)
  --help                        显示此帮助信息

示例:
  npm start                                    # 标准启动方式
  node start.js --PORT=8080                   # 自定义端口
  node start.js --AUTH_TOKEN=secret123        # 启用API认证

🧠 智能特性:
  ✅ 自动检测系统性能并优化配置
  ✅ 智能内存管理 (根据系统内存自动调节)
  ✅ 动态并发控制 (根据CPU负载自动调节)
  ✅ 智能上下文池管理 (自动复用和回收)
  ✅ 自动重启机制 (6小时无请求后自动重启)

📊 监控地址:
  http://localhost:3000/monitor   # 实时监控页面
  http://localhost:3000/health    # 健康检查
`);
}

// 启动服务
function startService(config) {
    // 检查帮助选项
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        showHelp();
        return;
    }

    console.log('🚀 CF Clearance Scraper 智能启动中...\n');

    // 显示基本配置
    console.log('📋 基本配置:');
    console.log(`   端口: ${config.PORT}`);
    console.log(`   认证: ${config.AUTH_TOKEN ? '已启用' : '未启用'}`);
    console.log(`   环境: ${config.NODE_ENV}`);
    console.log('');

    console.log('🧠 智能特性:');
    console.log('   ✅ 自动性能检测和优化');
    console.log('   ✅ 智能内存管理');
    console.log('   ✅ 动态并发控制');
    console.log('   ✅ 智能上下文池管理');
    console.log('   ✅ 自动重启机制');
    console.log('');

    // 设置环境变量
    Object.entries(config).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
            process.env[key] = value;
        }
    });

    // 直接启动主服务，让系统自动检测和配置
    console.log('🎯 启动主服务...');
    console.log('');

    // 直接require主服务文件
    try {
        require('./src/index.js');
        console.log('✅ 服务启动成功！');
    } catch (error) {
        console.error('❌ 启动失败:', error.message);
        console.error('详细错误:', error.stack);
        process.exit(1);
    }
}

// 主函数
if (require.main === module) {
    const config = parseArgs();
    startService(config);
}

module.exports = { startService, parseArgs };