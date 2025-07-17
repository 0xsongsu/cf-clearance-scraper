# CF Clearance Scraper 安装指南

专业的 Cloudflare 保护绕过工具，支持 Turnstile 令牌生成和 cf_clearance Cookie 获取。

## ✨ 核心特性
- ✅ 智能内存和容量管理，零配置启动
- ✅ 自动配置网络访问权限
- ✅ 支持局域网多设备访问
- ✅ 实时监控面板
- ✅ 高性能并发处理
- ✅ 自动故障恢复

## 🛠️ 快速安装

### 环境要求

- **Node.js 18+** (推荐 LTS 版本)
- **操作系统**: macOS/Windows/Linux
- **内存**: 至少 1GB 可用内存
- **Chrome/Chromium**: 自动安装或使用系统版本

### 三步快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/0xsongsu/cf-clearance-scraper.git
cd cf-clearance-scraper

# 2. 安装依赖
npm install

# 3. 启动服务（零配置）
npm start
```

🎉 **完成！** 服务已启动，访问 http://localhost:3000/monitor 查看监控面板

### 验证安装

```bash
# 健康检查
curl http://localhost:3000/health

# 测试 Turnstile 功能
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "type": "cftoken",
    "websiteUrl": "https://turnstile.zeroclover.io/",
    "websiteKey": "0x4AAAAAAAEwzhD6pyKkgXC0"
  }'

# 测试 cf_clearance 功能
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "type": "cfcookie",
    "websiteUrl": "https://loyalty.campnetwork.xyz/home"
  }'
```

### 🎯 快速访问

- **监控面板**: http://localhost:3000/monitor
- **健康检查**: http://localhost:3000/health
- **API文档**: 查看 [docs/API.md](API.md)



## 🚨 故障排除

### 常见问题

#### 1. **端口被占用**
```bash
# 查看端口占用
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# 更改端口
echo "PORT=8080" > .env
npm start
```

#### 2. **Chrome 浏览器问题**
```bash
# 手动安装 Chrome
# Mac: 从官网下载安装
# Ubuntu/Debian:
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list'
sudo apt update
sudo apt install google-chrome-stable

# CentOS/RHEL:
sudo yum install -y google-chrome-stable
```

#### 3. **内存不足**
```bash
# 检查系统内存
free -h  # Linux
vm_stat  # Mac

# 系统会自动调节，或手动设置较小的限制
echo "MAX_MEMORY_USAGE=1024" >> .env
```

#### 4. **权限问题**
```bash
# 给予执行权限（如果需要）
chmod +x start.js

# 或使用 sudo 运行
sudo npm start
```

### 服务验证

#### 1. **服务无法访问**
```bash
# 检查服务状态
curl http://localhost:3000/health

# 检查端口占用
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# 重启服务
npm start
```

#### 2. **Node.js版本过低**
```bash
# 使用nvm管理Node.js版本
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
nvm use --lts
```

#### 3. **依赖安装失败**
```bash
# 清理缓存重新安装
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# 或使用 yarn
npm install -g yarn
yarn install
```

## ✅ 验证安装

### 快速验证

```bash
# 1. 健康检查
curl http://localhost:3000/health

# 2. 测试 Turnstile 功能
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "type": "cftoken",
    "websiteUrl": "https://turnstile.zeroclover.io/",
    "websiteKey": "0x4AAAAAAAEwzhD6pyKkgXC0"
  }'

# 3. 查看监控面板
open http://localhost:3000/monitor
```

### 验证成功标志

✅ **服务启动正常**: 健康检查返回 `healthy`
✅ **API 功能正常**: 能够生成 Turnstile 令牌
✅ **监控面板可访问**: 能够查看实时状态

## 🔗 下一步

- 📖 [配置指南](CONFIGURATION.md) - 了解智能配置和优化
- 🔧 [API文档](API.md) - 学习完整的接口使用
- 📊 [性能优化](PERFORMANCE_OPTIMIZATION.md) - 深入了解性能特性
- 🛠️ [故障排除](TROUBLESHOOTING.md) - 解决常见问题
- 📚 [使用教程](TUTORIAL.md) - 详细使用指南

## 💡 小贴士

- 首次启动可能需要下载 Chrome 浏览器，请耐心等待
- 建议在生产环境中使用 PM2 管理进程
- 定期查看监控面板了解服务状态
- 遇到问题请先查看故障排除文档