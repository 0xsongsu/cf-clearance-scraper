/**
 * SimpleCharts - 简洁的图表组件库
 * 遵循简洁暗黑主题设计原则
 */

class SimpleChart {
    constructor(canvas, options = {}) {
        this.canvas = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
        if (!this.canvas) {
            console.error('SimpleChart: Canvas element not found');
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.options = {
            type: 'line', // 'line', 'bar', 'area', 'gauge', 'progress'
            backgroundColor: 'transparent',
            padding: { top: 20, right: 20, bottom: 20, left: 20 },
            lineColor: '#4a9eff',
            lineWidth: 2,
            fillColor: 'rgba(74, 158, 255, 0.1)',
            barColor: '#4a9eff',
            showGrid: false,
            showLabels: false,
            animated: true,
            animationDuration: 500,
            responsive: true,
            ...options
        };
        
        this.data = [];
        this.labels = [];
        this.animationFrame = null;
        
        this.init();
    }
    
    init() {
        if (this.options.responsive) {
            this.setupResponsive();
        }
        this.resize();
    }
    
    setupResponsive() {
        window.addEventListener('resize', () => this.resize());
    }
    
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        this.ctx.scale(dpr, dpr);
        
        this.width = rect.width;
        this.height = rect.height;
        
        // 重新绘制
        if (this.data.length > 0) {
            this.draw();
        }
    }
    
    setData(data, labels = []) {
        this.data = data;
        this.labels = labels;
        this.draw();
    }
    
    updateData(data, labels = []) {
        this.data = data;
        this.labels = labels;
        
        if (this.options.animated) {
            this.animateDraw();
        } else {
            this.draw();
        }
    }
    
    draw() {
        this.clear();
        
        switch (this.options.type) {
            case 'line':
                this.drawLineChart();
                break;
            case 'bar':
                this.drawBarChart();
                break;
            case 'area':
                this.drawAreaChart();
                break;
            case 'gauge':
                this.drawGaugeChart();
                break;
            case 'progress':
                this.drawProgressChart();
                break;
            default:
                this.drawLineChart();
        }
    }
    
    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        if (this.options.backgroundColor && this.options.backgroundColor !== 'transparent') {
            this.ctx.fillStyle = this.options.backgroundColor;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }
    }
    
    drawLineChart() {
        if (this.data.length < 2) return;
        
        const padding = this.options.padding;
        const chartWidth = this.width - padding.left - padding.right;
        const chartHeight = this.height - padding.top - padding.bottom;
        
        const maxValue = Math.max(...this.data);
        const minValue = Math.min(...this.data);
        const range = maxValue - minValue || 1;
        
        // 绘制网格（如果启用）
        if (this.options.showGrid) {
            this.drawGrid(padding, chartWidth, chartHeight);
        }
        
        // 绘制线条
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.options.lineColor;
        this.ctx.lineWidth = this.options.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        for (let i = 0; i < this.data.length; i++) {
            const x = padding.left + (i / (this.data.length - 1)) * chartWidth;
            const y = padding.top + (1 - (this.data[i] - minValue) / range) * chartHeight;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                // 平滑曲线
                const prevX = padding.left + ((i - 1) / (this.data.length - 1)) * chartWidth;
                const prevY = padding.top + (1 - (this.data[i - 1] - minValue) / range) * chartHeight;
                
                const cpx = prevX + (x - prevX) * 0.5;
                this.ctx.quadraticCurveTo(cpx, prevY, x, y);
            }
        }
        
        this.ctx.stroke();
        
        // 绘制数据点
        if (this.options.showPoints) {
            for (let i = 0; i < this.data.length; i++) {
                const x = padding.left + (i / (this.data.length - 1)) * chartWidth;
                const y = padding.top + (1 - (this.data[i] - minValue) / range) * chartHeight;
                
                this.ctx.beginPath();
                this.ctx.arc(x, y, 3, 0, Math.PI * 2);
                this.ctx.fillStyle = this.options.lineColor;
                this.ctx.fill();
            }
        }
    }
    
    drawAreaChart() {
        if (this.data.length < 2) return;
        
        const padding = this.options.padding;
        const chartWidth = this.width - padding.left - padding.right;
        const chartHeight = this.height - padding.top - padding.bottom;
        
        const maxValue = Math.max(...this.data);
        const minValue = Math.min(...this.data);
        const range = maxValue - minValue || 1;
        
        // 创建渐变
        const gradient = this.ctx.createLinearGradient(0, padding.top, 0, this.height - padding.bottom);
        gradient.addColorStop(0, this.options.fillColor.replace('0.1', '0.3'));
        gradient.addColorStop(1, this.options.fillColor.replace('0.1', '0.05'));
        
        // 绘制填充区域
        this.ctx.beginPath();
        this.ctx.moveTo(padding.left, this.height - padding.bottom);
        
        for (let i = 0; i < this.data.length; i++) {
            const x = padding.left + (i / (this.data.length - 1)) * chartWidth;
            const y = padding.top + (1 - (this.data[i] - minValue) / range) * chartHeight;
            
            if (i === 0) {
                this.ctx.lineTo(x, y);
            } else {
                const prevX = padding.left + ((i - 1) / (this.data.length - 1)) * chartWidth;
                const prevY = padding.top + (1 - (this.data[i - 1] - minValue) / range) * chartHeight;
                
                const cpx = prevX + (x - prevX) * 0.5;
                this.ctx.quadraticCurveTo(cpx, prevY, x, y);
            }
        }
        
        this.ctx.lineTo(this.width - padding.right, this.height - padding.bottom);
        this.ctx.closePath();
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
        
        // 绘制线条
        this.drawLineChart();
    }
    
    drawBarChart() {
        if (this.data.length === 0) return;
        
        const padding = this.options.padding;
        const chartWidth = this.width - padding.left - padding.right;
        const chartHeight = this.height - padding.top - padding.bottom;
        
        const maxValue = Math.max(...this.data);
        const barWidth = chartWidth / this.data.length * 0.6;
        const barSpacing = chartWidth / this.data.length * 0.4;
        
        // 绘制柱状图
        for (let i = 0; i < this.data.length; i++) {
            const barHeight = (this.data[i] / maxValue) * chartHeight;
            const x = padding.left + i * (barWidth + barSpacing) + barSpacing / 2;
            const y = this.height - padding.bottom - barHeight;
            
            // 渐变填充
            const gradient = this.ctx.createLinearGradient(0, y, 0, this.height - padding.bottom);
            gradient.addColorStop(0, this.options.barColor);
            gradient.addColorStop(1, this.options.barColor + '80');
            
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, y, barWidth, barHeight);
            
            // 标签
            if (this.options.showLabels && this.labels[i]) {
                this.ctx.fillStyle = '#9ca3af';
                this.ctx.font = '10px sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(this.labels[i], x + barWidth / 2, this.height - padding.bottom + 12);
            }
        }
    }
    
    drawGaugeChart() {
        const value = this.data[0] || 0;
        const maxValue = this.options.maxValue || 100;
        const percentage = Math.min(value / maxValue, 1);
        
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const radius = Math.min(this.width, this.height) / 2 - 20;
        
        // 背景圆弧
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, Math.PI * 0.75, Math.PI * 2.25);
        this.ctx.strokeStyle = '#404040';
        this.ctx.lineWidth = 15;
        this.ctx.lineCap = 'round';
        this.ctx.stroke();
        
        // 进度圆弧
        const endAngle = Math.PI * 0.75 + (Math.PI * 1.5 * percentage);
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, Math.PI * 0.75, endAngle);
        this.ctx.strokeStyle = this.getGaugeColor(percentage);
        this.ctx.lineWidth = 15;
        this.ctx.lineCap = 'round';
        this.ctx.stroke();
        
        // 中心文字
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 24px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`${Math.round(percentage * 100)}%`, centerX, centerY);
    }
    
    drawProgressChart() {
        const value = this.data[0] || 0;
        const maxValue = this.options.maxValue || 100;
        const percentage = Math.min(value / maxValue, 1);
        
        const padding = 20;
        const barHeight = 20;
        const y = (this.height - barHeight) / 2;
        
        // 背景条
        this.ctx.fillStyle = '#404040';
        this.ctx.fillRect(padding, y, this.width - padding * 2, barHeight);
        
        // 进度条
        const gradient = this.ctx.createLinearGradient(padding, 0, this.width - padding, 0);
        gradient.addColorStop(0, this.options.lineColor);
        gradient.addColorStop(1, this.options.lineColor + 'cc');
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(padding, y, (this.width - padding * 2) * percentage, barHeight);
        
        // 百分比文字
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`${Math.round(percentage * 100)}%`, this.width / 2, this.height / 2);
    }
    
    drawGrid(padding, width, height) {
        this.ctx.strokeStyle = '#404040';
        this.ctx.lineWidth = 0.5;
        
        // 水平线
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (height / 4) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(padding.left, y);
            this.ctx.lineTo(padding.left + width, y);
            this.ctx.stroke();
        }
        
        // 垂直线
        for (let i = 0; i <= 4; i++) {
            const x = padding.left + (width / 4) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(x, padding.top);
            this.ctx.lineTo(x, padding.top + height);
            this.ctx.stroke();
        }
    }
    
    getGaugeColor(percentage) {
        if (percentage < 0.3) return '#10b981';
        if (percentage < 0.7) return '#f59e0b';
        return '#ef4444';
    }
    
    animateDraw() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        
        const startTime = performance.now();
        const duration = this.options.animationDuration;
        const originalData = [...this.data];
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // 应用缓动函数
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            
            // 更新数据
            this.data = originalData.map(value => value * easedProgress);
            
            // 绘制
            this.draw();
            
            if (progress < 1) {
                this.animationFrame = requestAnimationFrame(animate);
            } else {
                this.data = originalData;
                this.draw();
            }
        };
        
        this.animationFrame = requestAnimationFrame(animate);
    }
    
    destroy() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        window.removeEventListener('resize', () => this.resize());
    }
}

// 工厂函数
function createSimpleChart(canvas, options = {}) {
    return new SimpleChart(canvas, options);
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SimpleChart, createSimpleChart };
} else {
    window.SimpleChart = SimpleChart;
    window.createSimpleChart = createSimpleChart;
}