/**
 * UI Components - 简洁的UI组件库
 * 包含进度条、指示器等常用组件
 */

// 进度条组件
class ProgressBar {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this.container) {
            console.error('ProgressBar: Container not found');
            return;
        }
        
        this.options = {
            value: 0,
            max: 100,
            height: 6,
            backgroundColor: '#404040',
            progressColor: '#4a9eff',
            animated: true,
            showLabel: false,
            labelPosition: 'right', // 'left', 'right', 'center', 'above'
            borderRadius: 4,
            striped: false,
            ...options
        };
        
        this.init();
    }
    
    init() {
        this.render();
    }
    
    render() {
        const percentage = (this.options.value / this.options.max) * 100;
        
        const html = `
            <div class="progress-bar-wrapper" style="position: relative; width: 100%;">
                ${this.options.showLabel && this.options.labelPosition === 'above' ? 
                    `<div class="progress-label" style="margin-bottom: 5px; color: var(--text-secondary); font-size: 0.85rem;">
                        ${Math.round(percentage)}%
                    </div>` : ''}
                <div class="progress-bar-container" style="
                    width: 100%;
                    height: ${this.options.height}px;
                    background: ${this.options.backgroundColor};
                    border-radius: ${this.options.borderRadius}px;
                    overflow: hidden;
                    position: relative;
                ">
                    <div class="progress-bar-fill" style="
                        width: ${percentage}%;
                        height: 100%;
                        background: ${this.getProgressColor(percentage)};
                        border-radius: ${this.options.borderRadius}px;
                        transition: ${this.options.animated ? 'width 0.5s ease' : 'none'};
                        ${this.options.striped ? `
                            background-image: linear-gradient(
                                45deg,
                                rgba(255, 255, 255, 0.15) 25%,
                                transparent 25%,
                                transparent 50%,
                                rgba(255, 255, 255, 0.15) 50%,
                                rgba(255, 255, 255, 0.15) 75%,
                                transparent 75%,
                                transparent
                            );
                            background-size: 20px 20px;
                            animation: progress-bar-stripes 1s linear infinite;
                        ` : ''}
                    "></div>
                    ${this.options.showLabel && this.options.labelPosition === 'center' ? 
                        `<div class="progress-label" style="
                            position: absolute;
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%);
                            color: white;
                            font-size: 0.75rem;
                            font-weight: 600;
                        ">${Math.round(percentage)}%</div>` : ''}
                </div>
                ${this.options.showLabel && this.options.labelPosition === 'right' ? 
                    `<span class="progress-label" style="
                        margin-left: 10px;
                        color: var(--text-secondary);
                        font-size: 0.85rem;
                    ">${Math.round(percentage)}%</span>` : ''}
            </div>
        `;
        
        this.container.innerHTML = html;
        
        // 添加动画样式
        if (this.options.striped && !document.getElementById('progress-bar-animation')) {
            const style = document.createElement('style');
            style.id = 'progress-bar-animation';
            style.textContent = `
                @keyframes progress-bar-stripes {
                    from { background-position: 20px 0; }
                    to { background-position: 0 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    getProgressColor(percentage) {
        if (this.options.progressColor) {
            return this.options.progressColor;
        }
        
        // 自动颜色
        if (percentage < 30) return '#ef4444';
        if (percentage < 70) return '#f59e0b';
        return '#10b981';
    }
    
    setValue(value) {
        this.options.value = value;
        this.update();
    }
    
    update() {
        const percentage = (this.options.value / this.options.max) * 100;
        const fillElement = this.container.querySelector('.progress-bar-fill');
        const labelElements = this.container.querySelectorAll('.progress-label');
        
        if (fillElement) {
            fillElement.style.width = `${percentage}%`;
            fillElement.style.background = this.getProgressColor(percentage);
        }
        
        labelElements.forEach(label => {
            label.textContent = `${Math.round(percentage)}%`;
        });
    }
}

// 状态指示器组件
class StatusIndicator {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this.container) {
            console.error('StatusIndicator: Container not found');
            return;
        }
        
        this.options = {
            status: 'idle', // 'idle', 'running', 'success', 'warning', 'error'
            size: 'medium', // 'small', 'medium', 'large'
            animated: true,
            showLabel: true,
            label: '',
            ...options
        };
        
        this.init();
    }
    
    init() {
        this.render();
    }
    
    render() {
        const sizeMap = {
            small: 8,
            medium: 12,
            large: 16
        };
        
        const statusConfig = {
            idle: { color: '#9ca3af', label: '空闲', pulse: false },
            running: { color: '#10b981', label: '运行中', pulse: true },
            success: { color: '#10b981', label: '成功', pulse: false },
            warning: { color: '#f59e0b', label: '警告', pulse: true },
            error: { color: '#ef4444', label: '错误', pulse: true }
        };
        
        const config = statusConfig[this.options.status] || statusConfig.idle;
        const size = sizeMap[this.options.size] || sizeMap.medium;
        
        const html = `
            <div class="status-indicator-wrapper" style="
                display: inline-flex;
                align-items: center;
                gap: 8px;
            ">
                <span class="status-indicator-dot" style="
                    display: inline-block;
                    width: ${size}px;
                    height: ${size}px;
                    border-radius: 50%;
                    background: ${config.color};
                    ${this.options.animated && config.pulse ? `
                        animation: status-pulse 2s infinite;
                        box-shadow: 0 0 0 2px ${config.color}40;
                    ` : ''}
                "></span>
                ${this.options.showLabel ? `
                    <span class="status-indicator-label" style="
                        color: var(--text-secondary);
                        font-size: ${this.options.size === 'small' ? '0.75rem' : '0.85rem'};
                    ">${this.options.label || config.label}</span>
                ` : ''}
            </div>
        `;
        
        this.container.innerHTML = html;
        
        // 添加脉冲动画
        if (this.options.animated && !document.getElementById('status-indicator-animation')) {
            const style = document.createElement('style');
            style.id = 'status-indicator-animation';
            style.textContent = `
                @keyframes status-pulse {
                    0% {
                        box-shadow: 0 0 0 0 currentColor;
                    }
                    70% {
                        box-shadow: 0 0 0 10px transparent;
                    }
                    100% {
                        box-shadow: 0 0 0 0 transparent;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    setStatus(status) {
        this.options.status = status;
        this.render();
    }
}

// 环形进度条组件
class CircularProgress {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this.container) {
            console.error('CircularProgress: Container not found');
            return;
        }
        
        this.options = {
            value: 0,
            max: 100,
            size: 100,
            strokeWidth: 8,
            backgroundColor: '#404040',
            progressColor: '#4a9eff',
            animated: true,
            showLabel: true,
            labelFormat: 'percentage', // 'percentage', 'value', 'custom'
            customLabel: '',
            ...options
        };
        
        this.init();
    }
    
    init() {
        this.render();
    }
    
    render() {
        const percentage = (this.options.value / this.options.max) * 100;
        const radius = (this.options.size - this.options.strokeWidth) / 2;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percentage / 100) * circumference;
        
        let label = '';
        switch (this.options.labelFormat) {
            case 'percentage':
                label = `${Math.round(percentage)}%`;
                break;
            case 'value':
                label = `${this.options.value}/${this.options.max}`;
                break;
            case 'custom':
                label = this.options.customLabel;
                break;
        }
        
        const html = `
            <div class="circular-progress-wrapper" style="
                position: relative;
                width: ${this.options.size}px;
                height: ${this.options.size}px;
            ">
                <svg width="${this.options.size}" height="${this.options.size}" style="transform: rotate(-90deg);">
                    <circle
                        cx="${this.options.size / 2}"
                        cy="${this.options.size / 2}"
                        r="${radius}"
                        stroke="${this.options.backgroundColor}"
                        stroke-width="${this.options.strokeWidth}"
                        fill="none"
                    />
                    <circle
                        cx="${this.options.size / 2}"
                        cy="${this.options.size / 2}"
                        r="${radius}"
                        stroke="${this.getProgressColor(percentage)}"
                        stroke-width="${this.options.strokeWidth}"
                        fill="none"
                        stroke-dasharray="${circumference}"
                        stroke-dashoffset="${offset}"
                        stroke-linecap="round"
                        style="transition: ${this.options.animated ? 'stroke-dashoffset 0.5s ease' : 'none'};"
                    />
                </svg>
                ${this.options.showLabel ? `
                    <div class="circular-progress-label" style="
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        color: var(--text-primary);
                        font-size: ${this.options.size / 5}px;
                        font-weight: 700;
                    ">${label}</div>
                ` : ''}
            </div>
        `;
        
        this.container.innerHTML = html;
    }
    
    getProgressColor(percentage) {
        if (this.options.progressColor) {
            return this.options.progressColor;
        }
        
        // 自动颜色
        if (percentage < 30) return '#ef4444';
        if (percentage < 70) return '#f59e0b';
        return '#10b981';
    }
    
    setValue(value) {
        this.options.value = value;
        this.update();
    }
    
    update() {
        const percentage = (this.options.value / this.options.max) * 100;
        const radius = (this.options.size - this.options.strokeWidth) / 2;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percentage / 100) * circumference;
        
        const progressCircle = this.container.querySelector('circle:last-child');
        const label = this.container.querySelector('.circular-progress-label');
        
        if (progressCircle) {
            progressCircle.style.strokeDashoffset = offset;
            progressCircle.setAttribute('stroke', this.getProgressColor(percentage));
        }
        
        if (label) {
            let newLabel = '';
            switch (this.options.labelFormat) {
                case 'percentage':
                    newLabel = `${Math.round(percentage)}%`;
                    break;
                case 'value':
                    newLabel = `${this.options.value}/${this.options.max}`;
                    break;
                case 'custom':
                    newLabel = this.options.customLabel;
                    break;
            }
            label.textContent = newLabel;
        }
    }
}

// 骨架屏加载组件
class SkeletonLoader {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this.container) {
            console.error('SkeletonLoader: Container not found');
            return;
        }
        
        this.options = {
            type: 'card', // 'card', 'list', 'table', 'custom'
            rows: 3,
            animated: true,
            ...options
        };
        
        this.init();
    }
    
    init() {
        this.render();
    }
    
    render() {
        let html = '';
        
        switch (this.options.type) {
            case 'card':
                html = this.renderCard();
                break;
            case 'list':
                html = this.renderList();
                break;
            case 'table':
                html = this.renderTable();
                break;
            case 'custom':
                html = this.options.customTemplate || '';
                break;
        }
        
        this.container.innerHTML = html;
        
        // 添加动画样式
        if (this.options.animated && !document.getElementById('skeleton-animation')) {
            const style = document.createElement('style');
            style.id = 'skeleton-animation';
            style.textContent = `
                @keyframes skeleton-shimmer {
                    0% {
                        background-position: -200% 0;
                    }
                    100% {
                        background-position: 200% 0;
                    }
                }
                
                .skeleton-item {
                    background: linear-gradient(
                        90deg,
                        #404040 25%,
                        #525252 50%,
                        #404040 75%
                    );
                    background-size: 200% 100%;
                    animation: skeleton-shimmer 1.5s infinite;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    renderCard() {
        return `
            <div class="skeleton-card" style="padding: 20px;">
                <div class="skeleton-item" style="height: 20px; width: 60%; margin-bottom: 15px; border-radius: 4px;"></div>
                <div class="skeleton-item" style="height: 40px; width: 100%; margin-bottom: 15px; border-radius: 4px;"></div>
                <div class="skeleton-item" style="height: 15px; width: 80%; border-radius: 4px;"></div>
            </div>
        `;
    }
    
    renderList() {
        const items = [];
        for (let i = 0; i < this.options.rows; i++) {
            items.push(`
                <div class="skeleton-list-item" style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #404040;">
                    <div class="skeleton-item" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 15px;"></div>
                    <div style="flex: 1;">
                        <div class="skeleton-item" style="height: 15px; width: 70%; margin-bottom: 8px; border-radius: 4px;"></div>
                        <div class="skeleton-item" style="height: 12px; width: 40%; border-radius: 4px;"></div>
                    </div>
                </div>
            `);
        }
        return items.join('');
    }
    
    renderTable() {
        const rows = [];
        for (let i = 0; i < this.options.rows; i++) {
            rows.push(`
                <tr>
                    <td style="padding: 12px;">
                        <div class="skeleton-item" style="height: 15px; width: 80%; border-radius: 4px;"></div>
                    </td>
                    <td style="padding: 12px;">
                        <div class="skeleton-item" style="height: 15px; width: 60%; border-radius: 4px;"></div>
                    </td>
                    <td style="padding: 12px;">
                        <div class="skeleton-item" style="height: 15px; width: 40%; border-radius: 4px;"></div>
                    </td>
                </tr>
            `);
        }
        
        return `
            <table style="width: 100%;">
                <tbody>
                    ${rows.join('')}
                </tbody>
            </table>
        `;
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ProgressBar,
        StatusIndicator,
        CircularProgress,
        SkeletonLoader
    };
} else {
    window.ProgressBar = ProgressBar;
    window.StatusIndicator = StatusIndicator;
    window.CircularProgress = CircularProgress;
    window.SkeletonLoader = SkeletonLoader;
}