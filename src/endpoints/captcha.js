/**
 * 统一的验证码处理端点
 * 根据不同的验证码类型调用相应的解决器
 */

const path = require('path');

// 导入各种验证码解决器
const solveTurnstileMin = require('../../captcha-solvers/turnstile/endpoints/solveTurnstile.min');
const solveTurnstileMax = require('../../captcha-solvers/turnstile/endpoints/solveTurnstile.max');

/**
 * 统一的验证码解决接口
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 */
async function solveCaptcha(req, res) {
    try {
        const { type } = req.body;

        if (!type) {
            return res.status(400).json({
                code: 400,
                message: 'Missing required parameter: type',
                token: null
            });
        }

        switch (type.toLowerCase()) {
            case 'turnstile':
            case 'cftoken':
                // 根据需要选择 min 或 max 版本
                const mode = req.body.mode || 'min';
                if (mode === 'max') {
                    return await handleTurnstileMax(req, res);
                } else {
                    return await handleTurnstileMin(req, res);
                }
            
            default:
                return res.status(400).json({
                    code: 400,
                    message: `Unsupported captcha type: ${type}. Supported types: turnstile, cftoken`,
                    token: null
                });
        }
    } catch (error) {
        console.error('Error in solveCaptcha:', error);
        return res.status(500).json({
            code: 500,
            message: `Internal server error: ${error.message}`,
            token: null
        });
    }
}

/**
 * 处理 Turnstile Min 请求
 */
async function handleTurnstileMin(req, res) {
    try {
        const { websiteUrl, websiteKey, authToken } = req.body;
        
        const data = {
            url: websiteUrl,
            siteKey: websiteKey,
            mode: 'turnstile-min',
            authToken: authToken
        };

        const result = await solveTurnstileMin(data);
        return res.json({
            code: 200,
            message: 'Turnstile solved successfully',
            token: result
        });
    } catch (error) {
        return res.status(500).json({
            code: 500,
            message: error.message,
            token: null
        });
    }
}

/**
 * 处理 Turnstile Max 请求
 */
async function handleTurnstileMax(req, res) {
    try {
        const { websiteUrl, websiteKey, authToken } = req.body;
        
        const data = {
            url: websiteUrl,
            siteKey: websiteKey,
            mode: 'turnstile-max',
            authToken: authToken
        };

        const result = await solveTurnstileMax(data);
        return res.json({
            code: 200,
            message: 'Turnstile solved successfully',
            token: result
        });
    } catch (error) {
        return res.status(500).json({
            code: 500,
            message: error.message,
            token: null
        });
    }
}

module.exports = { 
    solveCaptcha,
    handleTurnstileMin,
    handleTurnstileMax
};