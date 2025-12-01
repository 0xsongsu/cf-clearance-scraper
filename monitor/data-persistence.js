/**
 * DataPersistence - 数据持久化管理
 * 使用 localStorage 保存监控数据
 */

class DataPersistence {
    constructor(options = {}) {
        this.options = {
            prefix: 'monitor_',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
            autoSave: true,
            saveInterval: 60000, // 1分钟自动保存一次
            ...options
        };
        
        this.saveTimer = null;
        this.data = {};
        
        this.init();
    }
    
    init() {
        // 加载已保存的数据
        this.loadAll();
        
        // 设置自动保存
        if (this.options.autoSave) {
            this.startAutoSave();
        }
        
        // 清理过期数据
        this.cleanExpiredData();
    }
    
    // 保存数据到 localStorage
    save(key, value) {
        try {
            const storageKey = this.options.prefix + key;
            const dataWrapper = {
                value: value,
                timestamp: Date.now(),
                version: '1.0'
            };
            
            localStorage.setItem(storageKey, JSON.stringify(dataWrapper));
            this.data[key] = value;
            
            return true;
        } catch (error) {
            console.error('Failed to save data:', error);
            
            // 如果是存储配额超出错误，尝试清理旧数据
            if (error.name === 'QuotaExceededError') {
                this.cleanOldestData();
                // 重试一次
                try {
                    localStorage.setItem(storageKey, JSON.stringify(dataWrapper));
                    return true;
                } catch (retryError) {
                    console.error('Failed to save after cleanup:', retryError);
                }
            }
            
            return false;
        }
    }
    
    // 从 localStorage 加载数据
    load(key) {
        try {
            const storageKey = this.options.prefix + key;
            const item = localStorage.getItem(storageKey);
            
            if (!item) return null;
            
            const dataWrapper = JSON.parse(item);
            
            // 检查数据是否过期
            if (this.isExpired(dataWrapper.timestamp)) {
                localStorage.removeItem(storageKey);
                return null;
            }
            
            this.data[key] = dataWrapper.value;
            return dataWrapper.value;
            
        } catch (error) {
            console.error('Failed to load data:', error);
            return null;
        }
    }
    
    // 加载所有保存的数据
    loadAll() {
        const keys = this.getAllKeys();
        const loadedData = {};
        
        keys.forEach(key => {
            const cleanKey = key.replace(this.options.prefix, '');
            const value = this.load(cleanKey);
            if (value !== null) {
                loadedData[cleanKey] = value;
            }
        });
        
        this.data = loadedData;
        return loadedData;
    }
    
    // 保存所有数据
    saveAll(data) {
        Object.keys(data).forEach(key => {
            this.save(key, data[key]);
        });
    }
    
    // 删除数据
    remove(key) {
        try {
            const storageKey = this.options.prefix + key;
            localStorage.removeItem(storageKey);
            delete this.data[key];
            return true;
        } catch (error) {
            console.error('Failed to remove data:', error);
            return false;
        }
    }
    
    // 清空所有数据
    clear() {
        const keys = this.getAllKeys();
        keys.forEach(key => {
            localStorage.removeItem(key);
        });
        this.data = {};
    }
    
    // 获取所有相关的键
    getAllKeys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.options.prefix)) {
                keys.push(key);
            }
        }
        return keys;
    }
    
    // 检查数据是否过期
    isExpired(timestamp) {
        return Date.now() - timestamp > this.options.maxAge;
    }
    
    // 清理过期数据
    cleanExpiredData() {
        const keys = this.getAllKeys();
        let cleanedCount = 0;
        
        keys.forEach(key => {
            try {
                const item = localStorage.getItem(key);
                if (item) {
                    const dataWrapper = JSON.parse(item);
                    if (this.isExpired(dataWrapper.timestamp)) {
                        localStorage.removeItem(key);
                        cleanedCount++;
                    }
                }
            } catch (error) {
                // 如果解析失败，删除该项
                localStorage.removeItem(key);
                cleanedCount++;
            }
        });
        
        if (cleanedCount > 0) {
            console.log(`Cleaned ${cleanedCount} expired items from localStorage`);
        }
    }
    
    // 清理最旧的数据（当存储空间不足时）
    cleanOldestData() {
        const keys = this.getAllKeys();
        const items = [];
        
        keys.forEach(key => {
            try {
                const item = localStorage.getItem(key);
                if (item) {
                    const dataWrapper = JSON.parse(item);
                    items.push({
                        key: key,
                        timestamp: dataWrapper.timestamp
                    });
                }
            } catch (error) {
                // 忽略解析错误的项
            }
        });
        
        // 按时间戳排序（最旧的在前）
        items.sort((a, b) => a.timestamp - b.timestamp);
        
        // 删除最旧的 20% 数据
        const deleteCount = Math.max(1, Math.floor(items.length * 0.2));
        for (let i = 0; i < deleteCount && i < items.length; i++) {
            localStorage.removeItem(items[i].key);
        }
        
        console.log(`Cleaned ${deleteCount} oldest items to free up space`);
    }
    
    // 导出数据为 JSON
    exportData() {
        const exportData = {
            version: '1.0',
            exportTime: new Date().toISOString(),
            data: this.data
        };
        
        return JSON.stringify(exportData, null, 2);
    }
    
    // 导入 JSON 数据
    importData(jsonString) {
        try {
            const importData = JSON.parse(jsonString);
            
            if (!importData.data) {
                throw new Error('Invalid import data format');
            }
            
            this.saveAll(importData.data);
            return true;
            
        } catch (error) {
            console.error('Failed to import data:', error);
            return false;
        }
    }
    
    // 下载数据为文件
    downloadAsFile(filename = 'monitor_data.json') {
        const dataStr = this.exportData();
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
    }
    
    // 从文件导入数据
    importFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const success = this.importData(event.target.result);
                    if (success) {
                        resolve(true);
                    } else {
                        reject(new Error('Failed to import data'));
                    }
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };
            
            reader.readAsText(file);
        });
    }
    
    // 开始自动保存
    startAutoSave() {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
        }
        
        this.saveTimer = setInterval(() => {
            this.saveAll(this.data);
        }, this.options.saveInterval);
    }
    
    // 停止自动保存
    stopAutoSave() {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
            this.saveTimer = null;
        }
    }
    
    // 获取存储使用情况
    getStorageInfo() {
        let totalSize = 0;
        const keys = this.getAllKeys();
        
        keys.forEach(key => {
            const item = localStorage.getItem(key);
            if (item) {
                totalSize += item.length;
            }
        });
        
        // 估算最大存储空间（通常是 5-10MB）
        const estimatedMax = 5 * 1024 * 1024; // 5MB
        
        return {
            used: totalSize,
            usedMB: (totalSize / (1024 * 1024)).toFixed(2),
            estimatedMax: estimatedMax,
            estimatedMaxMB: (estimatedMax / (1024 * 1024)).toFixed(2),
            percentage: ((totalSize / estimatedMax) * 100).toFixed(2),
            itemCount: keys.length
        };
    }
    
    // 销毁
    destroy() {
        this.stopAutoSave();
    }
}

// 创建全局实例
const monitorDataPersistence = new DataPersistence({
    prefix: 'cf_monitor_',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30天
    autoSave: true,
    saveInterval: 30000 // 30秒
});

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DataPersistence, monitorDataPersistence };
} else {
    window.DataPersistence = DataPersistence;
    window.monitorDataPersistence = monitorDataPersistence;
}