#!/usr/bin/env node
/**
 * CF 5秒盾绕过功能测试脚本
 * 测试绕过 Cloudflare 5秒盾并获取 cf_clearance cookie 功能
 */

const http = require('http');

// 测试配置
const TEST_CONFIG = {
    server: {
        host: 'localhost',
        port: 3000,
        timeout: 360000 // 6分钟超时
    },
    cf5s: {
        websiteUrl: 'https://loyalty.campnetwork.xyz/'
    }
};

/**
 * 发送 Cloudflare 5秒盾绕过请求
 */
function getCfCookie(testData = {}) {
    return new Promise((resolve, reject) => {
        const requestData = {
            type: "cf5s",
            websiteUrl: testData.websiteUrl || TEST_CONFIG.cf5s.websiteUrl,
            ...testData
        };

        const postData = JSON.stringify(requestData);
        
        const options = {
            hostname: TEST_CONFIG.server.host,
            port: TEST_CONFIG.server.port,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        console.log(`📤 发送请求到: http://${options.hostname}:${options.port}${options.path}`);
        console.log(`📤 请求数据:`, JSON.stringify(requestData, null, 2));

        const req = http.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonResponse = JSON.parse(responseData);
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: jsonResponse,
                        requestTime: Date.now()
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: responseData,
                        parseError: e.message,
                        requestTime: Date.now()
                    });
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        // 设置请求超时
        req.setTimeout(TEST_CONFIG.server.timeout);

        req.write(postData);
        req.end();
    });
}

/**
 * 检查服务状态
 */
function checkServerStatus() {
    return new Promise((resolve) => {
        const options = {
            hostname: TEST_CONFIG.server.host,
            port: TEST_CONFIG.server.port,
            path: '/health',
            method: 'GET',
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            resolve({
                status: res.statusCode === 200,
                statusCode: res.statusCode
            });
        });

        req.on('error', () => {
            resolve({ status: false, error: 'Connection failed' });
        });

        req.on('timeout', () => {
            resolve({ status: false, error: 'Timeout' });
        });

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
        validations.push({ check: 'HTTP Status', result: '✅ PASS', detail: `200 OK` });
    } else {
        validations.push({ check: 'HTTP Status', result: '❌ FAIL', detail: `${response.statusCode}` });
    }
    
    // 检查响应体
    if (response.body && typeof response.body === 'object') {
        validations.push({ check: 'Response Format', result: '✅ PASS', detail: 'Valid JSON' });
        
        // 检查必需字段
        const requiredFields = ['code'];
        requiredFields.forEach(field => {
            if (response.body.hasOwnProperty(field)) {
                validations.push({ check: `Field: ${field}`, result: '✅ PASS', detail: `Present` });
            } else {
                validations.push({ check: `Field: ${field}`, result: '❌ FAIL', detail: `Missing` });
            }
        });
        
        // 检查成功响应的 cf_clearance 字段
        if (response.body.code === 200) {
            if (response.body.cf_clearance) {
                validations.push({ 
                    check: 'cf_clearance Field', 
                    result: '✅ PASS', 
                    detail: `Length: ${response.body.cf_clearance.length}` 
                });
            } else {
                validations.push({ 
                    check: 'cf_clearance Field', 
                    result: '❌ FAIL', 
                    detail: 'Missing cf_clearance in success response' 
                });
            }
        }
    } else {
        validations.push({ check: 'Response Format', result: '❌ FAIL', detail: 'Invalid JSON' });
    }
    
    return validations;
}

/**
 * 格式化时间
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}

/**
 * 测试使用获取的 cf_clearance cookie
 */
async function testCookieUsage(cfClearance, testUrl) {
    console.log('🍪 测试 cf_clearance cookie 使用...');

    try {
        const response = await fetch(testUrl, {
            method: 'GET',
            headers: {
                'Cookie': `cf_clearance=${cfClearance}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        const responseText = await response.text();
        const isSuccess = response.status === 200 && !responseText.includes('Just a moment');

        return {
            success: isSuccess,
            statusCode: response.status,
            contentLength: responseText.length,
            hasCloudflareChallenge: responseText.includes('Just a moment') || responseText.includes('cf-browser-verification')
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 运行测试套件
 */
async function runTests() {
    console.log('🛡️ CF 5秒盾绕过功能测试');
    console.log('='.repeat(60));
    console.log(`🌐 测试网站: ${TEST_CONFIG.cf5s.websiteUrl}`);
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
    console.log('🎯 开始 Cloudflare 5秒盾绕过测试...');
    console.log('⏱️  预计耗时: 30-120 秒');
    console.log();
    
    const startTime = Date.now();
    
    try {
        const response = await getCfCookie();
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        console.log('📥 收到响应:');
        console.log('─'.repeat(40));
        console.log(`⏱️  耗时: ${formatDuration(duration)}`);
        console.log(`📊 状态码: ${response.statusCode}`);
        console.log(`📋 响应体:`, JSON.stringify(response.body, null, 2));
        console.log();
        
        // 3. 验证响应
        console.log('🔍 响应验证:');
        console.log('─'.repeat(40));
        const validations = validateResponse(response);
        
        validations.forEach(validation => {
            console.log(`${validation.result} ${validation.check}: ${validation.detail}`);
        });
        console.log();
        
        // 4. 测试 cookie 使用
        if (response.body && response.body.code === 200 && response.body.cf_clearance) {
            console.log('🧪 测试 cookie 实际使用效果...');
            const cookieTest = await testCookieUsage(response.body.cf_clearance, TEST_CONFIG.cf5s.websiteUrl);
            
            console.log('─'.repeat(40));
            if (cookieTest.success) {
                console.log('✅ Cookie 测试成功 - 可以正常访问目标网站');
                console.log(`📊 响应状态: ${cookieTest.statusCode}`);
                console.log(`📄 内容长度: ${cookieTest.contentLength} bytes`);
            } else {
                console.log('❌ Cookie 测试失败');
                if (cookieTest.hasCloudflareChallenge) {
                    console.log('🔒 仍然遇到 Cloudflare 验证页面');
                } else if (cookieTest.error) {
                    console.log(`❌ 错误: ${cookieTest.error}`);
                } else {
                    console.log(`📊 响应状态: ${cookieTest.statusCode}`);
                }
            }
            console.log();
        }
        
        // 5. 结果总结
        const passedValidations = validations.filter(v => v.result.includes('✅')).length;
        const totalValidations = validations.length;
        
        console.log('📈 测试总结:');
        console.log('─'.repeat(40));
        console.log(`✅ 通过验证: ${passedValidations}/${totalValidations}`);
        console.log(`⏱️  总耗时: ${formatDuration(duration)}`);
        
        if (response.body && response.body.code === 200 && response.body.cf_clearance) {
            console.log('🎉 cf_clearance cookie 获取成功!');
            console.log(`🍪 Cookie: ${response.body.cf_clearance.substring(0, 50)}...`);
        } else if (response.body && response.body.code !== 200) {
            console.log('⚠️  cf_clearance cookie 获取失败');
            console.log(`❌ 错误: ${response.body.message || 'Unknown error'}`);
        } else {
            console.log('❓ 响应格式异常');
        }
        
    } catch (error) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        console.log('💥 测试失败:');
        console.log('─'.repeat(40));
        console.log(`⏱️  耗时: ${formatDuration(duration)}`);
        console.log(`❌ 错误: ${error.message}`);
        
        if (error.message.includes('timeout')) {
            console.log('⏰ 可能原因:');
            console.log('   - Cloudflare 验证过于复杂');
            console.log('   - 网络连接不稳定');
            console.log('   - 目标网站响应缓慢');
        } else if (error.message.includes('ECONNREFUSED')) {
            console.log('🔌 可能原因:');
            console.log('   - 服务未启动');
            console.log('   - 端口号错误');
        }
    }
    
    console.log();
    console.log('🏁 测试完成');
}

// 主程序
async function main() {
    try {
        await runTests();
    } catch (error) {
        console.error('💥 发生错误:', error.message);
        process.exit(1);
    }
}

// 错误处理
process.on('uncaughtException', (error) => {
    console.error('💥 未捕获的异常:', error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 未处理的 Promise 拒绝:', reason);
    process.exit(1);
});

// 运行主程序
main().catch(console.error);