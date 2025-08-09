const Ajv = require("ajv")
const addFormats = require("ajv-formats")

const ajv = new Ajv()
addFormats(ajv)

const schema = {
    "type": "object",
    "properties": {
        // 新的参数格式
        "type": {
            "type": "string",
            "enum": ["cftoken", "cfcookie", "cf5s"]
        },
        "websiteUrl": {
            "type": "string",
            "format": "uri"
        },
        "websiteKey": {
            "type": "string"
        },
        // 兼容旧的参数格式
        "mode": {
            "type": "string",
            "enum": ["source", "turnstile-min", "turnstile-max", "waf-session", "cfcookie", "cf5s"]
        },
        "url": {
            "type": "string",
            "format": "uri"
        },
        "siteKey": {
            "type": "string"
        },
        "proxy": {
            "type": "object",
            "properties": {
                "host": { "type": "string" },
                "port": { "type": "integer" },
                "username": { "type": "string" },
                "password": { "type": "string" }
            },
            "additionalProperties": false
        },
        "authToken": {
            "type": "string"
        },
        // reCAPTCHA 特有参数
        "language": {
            "type": "string",
            "enum": ["en", "es", "fr", "de", "pt", "ru", "it", "nl", "pl"]
        },
        "method": {
            "type": "string",
            "enum": ["audio", "image"]
        },
        "action": {
            "type": "string"
        }
    },
    "anyOf": [
        {
            // 新格式验证 - cftoken
            "required": ["type", "websiteUrl", "websiteKey"],
            "properties": {
                "type": { "const": "cftoken" }
            }
        },
        {
            // 新格式验证 - cfcookie (兼容旧版)
            "required": ["type", "websiteUrl"],
            "properties": {
                "type": { "const": "cfcookie" }
            }
        },
        {
            // 新格式验证 - cf5s (5秒盾)
            "required": ["type", "websiteUrl"],
            "properties": {
                "type": { "const": "cf5s" }
            }
        },
        {
            // 旧格式验证
            "required": ["mode", "url"]
        }
    ],
    "additionalProperties": false
}

// Example data formats:
// New format:
// const data = {
//     type: "cftoken",
//     websiteUrl: "https://example.com",
//     websiteKey: "0x4AAAAAABA4JXCaw9E2Py-9"
// }
// 
// Old format (still supported):
// const data = {
//     mode: "turnstile-min",
//     url: "https://example.com",
//     siteKey: "0x4AAAAAABA4JXCaw9E2Py-9",
//     proxy: {
//         host: "localhost",
//         port: 8080,
//         username: "test",
//         password: "test"
//     },
//     authToken: "123456"
// }


function validate(data) {
    const valid = ajv.validate(schema, data)
    if (!valid) return ajv.errors
    else return true
}

module.exports = validate