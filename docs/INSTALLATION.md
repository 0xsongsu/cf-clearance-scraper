# CF Clearance Scraper 安装指南

专业的 Cloudflare 保护绕过工具，支持 Turnstile 令牌生成和 cf_clearance Cookie 获取。

## 🚀 一键部署（推荐）

### Mac 系统
双击运行 `一键部署-MAC.command`

**如果遇到"未打开"错误**:
1. 右键点击 `一键部署-MAC.command` → 选择"打开"
2. 在弹出的安全提示中点击"打开"
3. 或者在终端中运行: `chmod +x 一键部署-MAC.command && xattr -d com.apple.quarantine 一键部署-MAC.command`

### Windows 系统
双击运行 `一键部署-WIN.bat`

### ✨ 特性
- ✅ 全自动安装 Node.js、Chrome、项目依赖
- ✅ 智能内存和容量管理，零配置启动
- ✅ 自动配置网络访问权限
- ✅ 支持局域网多设备访问
- ✅ 实时监控面板

### 🎯 快速启动（已部署用户）
- **Mac**: 双击 `start-mac.command`
- **Windows**: 双击 `start-windows.bat`

## 🛠️ 手动安装

### 环境要求

- **Node.js 18+** (推荐 LTS 版本)
- **操作系统**: macOS/Windows/Linux
- **内存**: 至少 1GB 可用内存
- **Chrome/Chromium**: 自动安装或使用系统版本

### 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/0xsongsu/cf-clearance-scraper.git
cd cf-clearance-scraper

# 2. 安装依赖
npm install

# 3. 启动服务（零配置）
npm start

# 4. 访问监控面板
# 浏览器打开: http://localhost:3000/monitor
```

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

## 🐳 Docker 部署

### 使用 Docker Compose（推荐）

```bash
# 1. 克隆仓库
git clone https://github.com/0xsongsu/cf-clearance-scraper.git
cd cf-clearance-scraper

# 2. 启动服务
docker-compose up -d

# 3. 查看日志
docker-compose logs -f

# 4. 停止服务
docker-compose down
```

### 使用 Docker

```bash
# 构建镜像
docker build -t cf-clearance-scraper .

# 运行容器
docker run -d \
  --name cf-clearance-scraper \
  -p 3000:3000 \
  --restart unless-stopped \
  cf-clearance-scraper

# 查看日志
docker logs -f cf-clearance-scraper
```

## 🔧 高级安装

### 从源码构建

```bash
# 1. 克隆仓库
git clone https://github.com/0xsongsu/cf-clearance-scraper.git
cd cf-clearance-scraper

# 2. 安装依赖
npm ci --production

# 3. 启用性能优化
node --expose-gc start.js

# 4. 或使用 PM2 管理进程
npm install -g pm2
pm2 start ecosystem.config.js
```

### 生产环境部署

```bash
# 1. 创建专用用户
sudo useradd -m -s /bin/bash cfclearance

# 2. 切换到专用用户
sudo su - cfclearance

# 3. 安装 Node.js (使用 nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install --lts
nvm use --lts

# 4. 克隆和安装
git clone https://github.com/0xsongsu/cf-clearance-scraper.git
cd cf-clearance-scraper
npm install --production

# 5. 配置环境变量
cp .env.example .env
# 编辑 .env 文件设置生产配置

# 6. 使用 PM2 启动
npm install -g pm2
pm2 start start.js --name cf-clearance-scraper
pm2 startup
pm2 save
```

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
# 给予执行权限
chmod +x start-mac.command  # Mac
chmod +x 一键部署-MAC.command

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

#### 3. **权限问题**
```bash
# Linux/Mac 给执行权限
chmod +x 一键部署-MAC.command
chmod +x start-mac.command

# Mac 移除隔离标记
xattr -d com.apple.quarantine 一键部署-MAC.command
xattr -d com.apple.quarantine start-mac.command
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
- � [故障排除](TROUBLESHOOTING.md) - 解决常见问题