#!/usr/bin/env node
/**
 * CF Token 功能测试脚本
 * 测试 Cloudflare Turnstile token 生成功能
 */

const http = require('http');

// 测试配置
const TEST_CONFIG = {
    server: {
        host: 'localhost',
        port: 3000,
        timeout: 180000 // 3分钟超时
    },
    cftoken: {
        // 使用一个已知有 Turnstile 验证的网站
        websiteUrl: 'https://irys.xyz/faucet',
        websiteKey: '0x4AAAAAAA6vnrvBCtS4FAl-' // Irys faucet 站点的 sitekey
    }
};

/**
 * 格式化时间
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
        return `${minutes}分${remainingSeconds}秒`;
    }
    return `${remainingSeconds}秒`;
}

/**
 * 检查服务状态
 */
async function checkServerStatus() {
    return new Promise((resolve) => {
        const options = {
            hostname: TEST_CONFIG.server.host,
            port: TEST_CONFIG.server.port,
            path: '/health',  // 修改为 /health 端点
            method: 'GET',
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode === 200,
                    statusCode: res.statusCode,
                    data: data
                });
            });
        });

        req.on('error', (err) => {
            resolve({
                status: false,
                error: err.message
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                status: false,
                error: 'Connection timeout'
            });
        });

        req.end();
    });
}

/**
 * 发送 cftoken 请求
 */
async function requestCfToken(websiteUrl, websiteKey) {
    return new Promise((resolve) => {
        const postData = JSON.stringify({
            type: "cftoken",
            websiteUrl: websiteUrl,
            websiteKey: websiteKey
        });

        const options = {
            hostname: TEST_CONFIG.server.host,
            port: TEST_CONFIG.server.port,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: TEST_CONFIG.server.timeout
        };

        const req = http.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    const body = JSON.parse(responseData);
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: body
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: responseData,
                        parseError: e.message
                    });
                }
            });
        });

        req.on('error', (err) => {
            resolve({
                statusCode: 0,
                error: err.message
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                statusCode: 0,
                error: 'Request timeout'
            });
        });

        req.write(postData);
        req.end();
    });
}

/**
 * 验证响应格式
 */
function validateResponse(response) {
    const validations = [];
    
    // 检查状态码
    if (response.statusCode === 200) {
        validations.push({ check: 'HTTP Status', result: '✅ PASS', detail: `200` });
    } else {
        validations.push({ check: 'HTTP Status', result: '❌ FAIL', detail: `${response.statusCode}` });
    }
    
    // 检查响应体
    if (response.body && typeof response.body === 'object') {
        validations.push({ check: 'Response Format', result: '✅ PASS', detail: 'Valid JSON' });
        
        // 检查必需字段
        if (response.body.hasOwnProperty('code')) {
            validations.push({ check: 'Field: code', result: '✅ PASS', detail: 'Present' });
        } else {
            validations.push({ check: 'Field: code', result: '❌ FAIL', detail: 'Missing' });
        }
        
        if (response.body.hasOwnProperty('message')) {
            validations.push({ check: 'Field: message', result: '✅ PASS', detail: 'Present' });
        } else {
            validations.push({ check: 'Field: message', result: '❌ FAIL', detail: 'Missing' });
        }
        
        // 检查成功响应的字段
        if (response.body.code === 200) {
            if (response.body.token) {
                validations.push({ check: 'Token', result: '✅ PASS', detail: 'Valid' });
            } else {
                validations.push({ check: 'Token', result: '❌ FAIL', detail: 'Missing' });
            }
        }
    } else {
        validations.push({ check: 'Response Format', result: '❌ FAIL', detail: 'Invalid JSON' });
    }
    
    return validations;
}

/**
 * 运行测试套件
 */
async function runTests() {
    console.log('🎯 CF Token 功能测试');
    console.log('='.repeat(60));
    console.log(`🌐 测试网站: ${TEST_CONFIG.cftoken.websiteUrl}`);
    console.log(`🔑 Website Key: ${TEST_CONFIG.cftoken.websiteKey}`);
    console.log(`🖥️  服务地址: http://${TEST_CONFIG.server.host}:${TEST_CONFIG.server.port}`);
    console.log('='.repeat(60));
    console.log();

    // 1. 检查服务状态
    console.log('📡 检查服务状态...');
    const serverStatus = await checkServerStatus();
    
    if (!serverStatus.status) {
        console.log('❌ 服务未运行或无法连接');
        console.log(`   错误: ${serverStatus.error || 'Unknown'}`);
        console.log('   请确保服务已启动: npm start');
        process.exit(1);
    }
    
    console.log('✅ 服务运行正常');
    console.log();

    // 2. 基本功能测试
    console.log('🎯 开始 Turnstile token 生成测试...');
    console.log('⏱️  预计耗时: 30-120 秒');
    console.log();
    
    const startTime = Date.now();
    
    console.log('📤 发送请求到: http://localhost:3000/');
    console.log(`   类型: cftoken`);
    console.log(`   网站: ${TEST_CONFIG.cftoken.websiteUrl}`);
    console.log(`   密钥: ${TEST_CONFIG.cftoken.websiteKey}`);
    console.log();
    
    // 3. 发送请求
    const response = await requestCfToken(
        TEST_CONFIG.cftoken.websiteUrl,
        TEST_CONFIG.cftoken.websiteKey
    );
    
    const duration = Date.now() - startTime;
    
    console.log('📥 收到响应:');
    console.log('─'.repeat(40));
    console.log(`⏱️  耗时: ${formatDuration(duration)}`);
    console.log(`📊 状态码: ${response.statusCode}`);
    
    if (response.error) {
        console.log(`❌ 错误: ${response.error}`);
    } else if (response.parseError) {
        console.log(`❌ 解析错误: ${response.parseError}`);
        console.log(`📄 原始响应: ${response.body}`);
    } else {
        console.log(`📋 响应体: ${JSON.stringify(response.body, null, 2)}`);
    }
    
    console.log();
    
    // 4. 验证响应
    console.log('🔍 响应验证:');
    console.log('─'.repeat(40));
    const validations = validateResponse(response);
    
    validations.forEach(validation => {
        console.log(`${validation.result} ${validation.check}${validation.detail ? ': ' + validation.detail : ''}`);
    });
    
    console.log();
    
    // 5. 结果总结
    const passedValidations = validations.filter(v => v.result.includes('✅')).length;
    const totalValidations = validations.length;
    
    console.log('📈 测试总结:');
    console.log('─'.repeat(40));
    console.log(`✅ 通过验证: ${passedValidations}/${totalValidations}`);
    console.log(`⏱️  总耗时: ${formatDuration(duration)}`);
    
    if (response.body && response.body.code === 200 && response.body.token) {
        console.log('🎉 CF Token 生成成功');
        console.log();
        console.log(`🎯 Token: ${response.body.token.substring(0, 100)}...`);
        console.log(`📏 长度: ${response.body.token.length} 字符`);
        console.log(`🔑 完整Token: ${response.body.token}`);
    } else if (response.body && response.body.code !== 200) {
        console.log('⚠️  CF Token 生成失败');
        console.log(`❌ 错误: ${response.body.message || 'Unknown error'}`);
    } else {
        console.log('❓ 响应格式异常');
    }
    
    console.log();
    
    if (passedValidations === totalValidations && response.body && response.body.code === 200) {
        console.log('🎉 所有测试通过！CF Token 解决器工作正常！');
    } else {
        console.log('⚠️  部分测试失败，请检查配置和服务状态');
    }
}

// 处理命令行参数
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log('CF Token 测试脚本');
    console.log('');
    console.log('用法: node test_cftoken.js [选项]');
    console.log('');
    console.log('选项:');
    console.log('  --host <host>     指定服务器主机 (默认: localhost)');
    console.log('  --port <port>     指定服务器端口 (默认: 3000)');
    console.log('  --help, -h        显示此帮助信息');
    console.log('');
    console.log('示例:');
    console.log('  node test_cftoken.js');
    console.log('  node test_cftoken.js --host 192.168.1.100 --port 3001');
    process.exit(0);
}

// 解析命令行参数
for (let i = 0; i < args.length; i += 2) {
    const arg = args[i];
    const value = args[i + 1];
    
    switch (arg) {
        case '--host':
            TEST_CONFIG.server.host = value;
            break;
        case '--port':
            TEST_CONFIG.server.port = parseInt(value);
            break;
    }
}

// 运行测试
runTests().catch(err => {
    console.error('💥 测试过程中发生错误:', err);
    process.exit(1);
});
