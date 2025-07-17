#!/usr/bin/env node
/**
 * CF 5秒盾绕过功能测试脚本
 * 测试新的 cf5s API 类型
 */

// 测试配置
const TEST_CONFIG = {
    server: {
        host: 'localhost',
        port: 3000,
        timeout: 120000 // 2分钟超时
    },
    cf5s: {
        websiteUrl: 'https://loyalty.campnetwork.xyz/home'
    }
};

/**
 * 发送 cf5s 请求
 */
async function testCf5s(testData = {}) {
    const requestData = {
        type: "cf5s",
        websiteUrl: testData.websiteUrl || TEST_CONFIG.cf5s.websiteUrl,
        ...testData
    };

    console.log(`📤 发送请求到: http://${TEST_CONFIG.server.host}:${TEST_CONFIG.server.port}/`);
    console.log(`📤 请求数据:`, JSON.stringify(requestData, null, 2));

    try {
        const response = await fetch(`http://${TEST_CONFIG.server.host}:${TEST_CONFIG.server.port}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();
        
        return {
            statusCode: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: result,
            requestTime: Date.now()
        };
    } catch (error) {
        throw new Error(`Request failed: ${error.message}`);
    }
}

/**
 * 检查服务状态
 */
async function checkServerStatus() {
    try {
        const response = await fetch(`http://${TEST_CONFIG.server.host}:${TEST_CONFIG.server.port}/health`, {
            method: 'GET',
            timeout: 5000
        });
        
        return {
            status: response.status === 200,
            statusCode: response.status
        };
    } catch (error) {
        return { 
            status: false, 
            error: error.message 
        };
    }
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
            
            // 检查其他字段
            const optionalFields = ['headers', 'cookies', 'url'];
            optionalFields.forEach(field => {
                if (response.body.hasOwnProperty(field)) {
                    validations.push({ 
                        check: `Field: ${field}`, 
                        result: '✅ PASS', 
                        detail: `Present` 
                    });
                }
            });
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
 * 运行测试套件
 */
async function runTests() {
    console.log('🛡️ CF 5秒盾绕过功能测试 (cf5s)');
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
    console.log('🎯 开始 cf5s 功能测试...');
    console.log('⏱️  预计耗时: 30-120 秒');
    console.log();
    
    const startTime = Date.now();
    
    try {
        const response = await testCf5s();
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
        
        // 4. 结果总结
        const passedValidations = validations.filter(v => v.result.includes('✅')).length;
        const totalValidations = validations.length;
        
        console.log('📈 测试总结:');
        console.log('─'.repeat(40));
        console.log(`✅ 通过验证: ${passedValidations}/${totalValidations}`);
        console.log(`⏱️  总耗时: ${formatDuration(duration)}`);
        
        if (response.body && response.body.code === 200 && response.body.cf_clearance) {
            console.log('🎉 cf5s 功能测试成功!');
            console.log(`🍪 cf_clearance: ${response.body.cf_clearance.substring(0, 50)}...`);
        } else if (response.body && response.body.code !== 200) {
            console.log('⚠️  cf5s 功能测试失败');
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

// 运行主程序
main().catch(console.error);
