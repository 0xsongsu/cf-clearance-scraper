FROM node:20-slim

# 安装 Chromium、Xvfb 和 xauth 依赖
RUN apt-get update && apt-get install -y \
    chromium \
    xvfb \
    xauth \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 设置环境变量
ENV PORT=3030
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 创建启动脚本
RUN echo '#!/bin/bash\nxvfb-run --server-args="-screen 0 1280x800x24" npm run start:prod -- --PORT=3030' > start.sh && \
    chmod +x start.sh

# 暴露端口
EXPOSE 3030

# 启动命令
CMD ["./start.sh"] 