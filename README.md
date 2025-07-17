# CF Clearance Scraper

🚀 专业的 Cloudflare 保护绕过工具，支持 Turnstile 令牌生成、cf_clearance Cookie 获取，零配置启动，开箱即用。

## 📸 项目展示

![本地打码服务监控](assets/dashboard.png)
> 实时监控面板展示服务状态、性能指标和请求统计，支持 CPU、内存监控和双折线图表

## ⚡ 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/0xsongsu/cf-clearance-scraper.git
cd cf-clearance-scraper

# 2. 安装依赖
npm install

# 3. 启动服务
npm start
```

🎉 **完成！** 访问 http://localhost:3000/monitor 查看监控面板

## 版本信息

**当前版本：v1.1.0** 🚀

### 版本记录

| 版本 | 发布时间 | 主要更新 |
|------|----------|----------|
| **v1.1.0** | 2025-07 | 🎯 优化服务架构，统一启动方式<br/>📊 增强监控面板，支持Token/Cookie类型区分<br/>⚡ 性能优化，添加容量管理器<br/>🧹 代码清理，移除冗余验证码解决器<br/>📚 完善文档结构和使用教程 |
| **v1.0.3** | 2025-06 | ✨ 新增 hCaptcha 本地AI打码功能<br/>🔑 支持多个 Gemini API 密钥轮换使用<br/>⚡ 优化内存管理和系统性能监控<br/>📊 增强实时监控面板 |
| **v1.0.2** | 2025-05 | 🔧 优化 Turnstile 解决算法<br/>📈 改进监控系统稳定性<br/>🐛 修复内存泄漏问题 |

## 🌟 核心特性

| 功能类型 | 支持状态 | 说明 |
|---------|---------|------|
| **Cloudflare Turnstile** | ✅ | 支持轻量级和完整页面模式 |
| **cf_clearance Cookie** | ✅ | 自动获取 Cloudflare 会话 Cookie |
| **实时监控面板** | ✅ | 服务状态和性能指标监控 |
| **智能容量管理** | ✅ | 自动内存管理和性能优化 |
| **零配置启动** | ✅ | 开箱即用，无需复杂配置 |
| **代理支持** | ✅ | HTTP/HTTPS 代理配置 |

## 🎯 使用场景

- **Web 自动化测试**: 绕过 Cloudflare 保护进行自动化测试
- **数据采集**: 获取受 Cloudflare 保护的网站数据
- **API 集成**: 为其他应用提供 Cloudflare 绕过服务
- **开发调试**: 本地开发环境中模拟 Cloudflare 环境

## 致谢开发者

本项目基于以下优秀开源项目构建：

- [QIN2DIM/hcaptcha-challenger](https://github.com/QIN2DIM/hcaptcha-challenger) - hCaptcha AI解决方案
- [ZFC-Digital/cf-clearance-scraper](https://github.com/ZFC-Digital/cf-clearance-scraper) - Cloudflare绕过基础

## 📚 文档指南

| 文档 | 功能说明 | 适用场景 |
|------|---------|----------|
| [📦 安装指南](docs/INSTALLATION.md) | 快速安装和部署步骤 | 初次使用 |
| [🔧 API文档](docs/API.md) | 完整的接口使用说明和示例 | 开发集成 |
| [📚 使用教程](docs/TUTORIAL.md) | 详细的使用教程和最佳实践 | 学习使用 |
| [⚙️ 配置指南](docs/CONFIGURATION.md) | 配置系统、参数调优和监控 | 环境配置 |
| [📊 性能优化](docs/PERFORMANCE_OPTIMIZATION.md) | 性能优化技巧和监控 | 性能调优 |
| [🛠️ 故障排除](docs/TROUBLESHOOTING.md) | 常见问题诊断和解决方案 | 问题解决 |

## 🚀 快速链接

- **监控面板**: http://localhost:3000/monitor
- **健康检查**: http://localhost:3000/health
- **GitHub仓库**: https://github.com/0xsongsu/cf-clearance-scraper
- **问题反馈**: https://github.com/0xsongsu/cf-clearance-scraper/issues

## 免责声明

⚠️ 本工具仅用于测试和学习目的。使用者需对任何可能产生的法律责任承担责任。本库不意图对任何网站或公司造成损害，使用者对可能产生的任何损害承担责任。

## 许可证

ISC License - 详见 [LICENSE](LICENSE.md) 文件