/**
 * AnimatedCounter - Simple animated number counter component
 * Follows the clean dark theme design principles
 */
class AnimatedCounter {
    constructor(element, options = {}) {
        this.element = element;
        this.options = {
            duration: 800,           // Animation duration in ms
            easing: 'easeOutQuart',  // Animation easing function
            format: 'number',        // Format type: 'number', 'currency', 'percentage'
            decimals: 0,             // Number of decimal places
            separator: ',',          // Thousands separator
            prefix: '',              // Prefix (e.g., '$' for currency)
            suffix: '',              // Suffix (e.g., '%' for percentage)
            startValue: 0,           // Starting value for animation
            useGrouping: true,       // Use thousands separator
            animateOnVisible: true,  // Only animate when element is visible
            animationEffect: 'none', // Animation effect: 'none', 'bounce', 'fade', 'glow'
            size: 'medium',          // Size: 'small', 'medium', 'large'
            ...options
        };
        
        this.currentValue = this.options.startValue;
        this.targetValue = this.options.startValue;
        this.isAnimating = false;
        this.animationId = null;
        
        this.init();
    }
    
    init() {
        // Set initial display
        this.element.textContent = this.formatNumber(this.currentValue);
        
        // Add CSS classes for styling
        this.element.classList.add('animated-counter');
        this.element.classList.add(this.options.format);
        this.element.classList.add(this.options.size);
        
        // Set up intersection observer for visibility-based animation
        if (this.options.animateOnVisible) {
            this.setupVisibilityObserver();
        }
    }
    
    setupVisibilityObserver() {
        if ('IntersectionObserver' in window) {
            this.observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting && !this.hasAnimated) {
                        this.hasAnimated = true;
                        this.animateToTarget();
                    }
                });
            }, { threshold: 0.1 });
            
            this.observer.observe(this.element);
        }
    }
    
    // Update the target value and animate to it
    update(newValue, animate = true) {
        this.targetValue = parseFloat(newValue) || 0;
        
        if (animate && !this.isAnimating) {
            this.animateToTarget();
        } else if (!animate) {
            this.currentValue = this.targetValue;
            this.element.textContent = this.formatNumber(this.currentValue);
        }
    }
    
    // Animate from current value to target value
    animateToTarget() {
        if (this.isAnimating) {
            cancelAnimationFrame(this.animationId);
        }
        
        this.isAnimating = true;
        const startValue = this.currentValue;
        const endValue = this.targetValue;
        const startTime = performance.now();
        const duration = this.options.duration;
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Apply easing function
            const easedProgress = this.applyEasing(progress);
            
            // Calculate current value
            this.currentValue = startValue + (endValue - startValue) * easedProgress;
            
            // Update display
            this.element.textContent = this.formatNumber(this.currentValue);
            
            // Add subtle animation class
            if (progress < 1) {
                this.element.classList.add('counting');
                this.animationId = requestAnimationFrame(animate);
            } else {
                this.isAnimating = false;
                this.currentValue = endValue;
                this.element.textContent = this.formatNumber(this.currentValue);
                this.element.classList.remove('counting');
                
                // Apply animation effect when animation completes
                this.applyAnimationEffect();
            }
        };
        
        this.animationId = requestAnimationFrame(animate);
    }
    
    // Apply animation effect after counting completes
    applyAnimationEffect() {
        if (this.options.animationEffect === 'none') return;
        
        // Remove any existing effect classes
        this.element.classList.remove('bounce-effect', 'fade-effect', 'glow-effect');
        
        // Add the specified effect class
        const effectClass = this.options.animationEffect + '-effect';
        this.element.classList.add(effectClass);
        
        // Remove the effect class after animation completes
        setTimeout(() => {
            this.element.classList.remove(effectClass);
        }, 1000);
    }
    
    // Apply easing function to progress
    applyEasing(t) {
        switch (this.options.easing) {
            case 'linear':
                return t;
            case 'easeOutQuart':
                return 1 - Math.pow(1 - t, 4);
            case 'easeInOutQuart':
                return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
            case 'easeOutBounce':
                const n1 = 7.5625;
                const d1 = 2.75;
                if (t < 1 / d1) {
                    return n1 * t * t;
                } else if (t < 2 / d1) {
                    return n1 * (t -= 1.5 / d1) * t + 0.75;
                } else if (t < 2.5 / d1) {
                    return n1 * (t -= 2.25 / d1) * t + 0.9375;
                } else {
                    return n1 * (t -= 2.625 / d1) * t + 0.984375;
                }
            default:
                return t;
        }
    }
    
    // Format number according to options
    formatNumber(value) {
        let formattedValue = value;
        
        // Handle different format types
        switch (this.options.format) {
            case 'currency':
                formattedValue = this.formatCurrency(value);
                break;
            case 'percentage':
                formattedValue = this.formatPercentage(value);
                break;
            case 'number':
            default:
                formattedValue = this.formatRegularNumber(value);
                break;
        }
        
        return this.options.prefix + formattedValue + this.options.suffix;
    }
    
    formatRegularNumber(value) {
        const rounded = Math.round(value * Math.pow(10, this.options.decimals)) / Math.pow(10, this.options.decimals);
        
        if (this.options.useGrouping) {
            return rounded.toLocaleString('en-US', {
                minimumFractionDigits: this.options.decimals,
                maximumFractionDigits: this.options.decimals
            });
        } else {
            return rounded.toFixed(this.options.decimals);
        }
    }
    
    formatCurrency(value) {
        const rounded = Math.round(value * 100) / 100;
        return '$' + rounded.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    
    formatPercentage(value) {
        const rounded = Math.round(value * Math.pow(10, this.options.decimals)) / Math.pow(10, this.options.decimals);
        return rounded.toFixed(this.options.decimals) + '%';
    }
    
    // Set animation effect
    setAnimationEffect(effect) {
        this.options.animationEffect = effect;
        return this;
    }
    
    // Set size
    setSize(size) {
        this.element.classList.remove('small', 'medium', 'large');
        this.options.size = size;
        this.element.classList.add(size);
        return this;
    }
    
    // Set format
    setFormat(format) {
        this.element.classList.remove('number', 'currency', 'percentage');
        this.options.format = format;
        this.element.classList.add(format);
        return this;
    }
    
    // Destroy the counter and clean up
    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.observer) {
            this.observer.disconnect();
        }
        this.element.classList.remove('animated-counter', 'counting', 'bounce-effect', 'fade-effect', 'glow-effect');
        this.element.classList.remove('number', 'currency', 'percentage');
        this.element.classList.remove('small', 'medium', 'large');
    }
}

// Factory function for easy creation
function createAnimatedCounter(selector, options = {}) {
    const element = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!element) {
        console.warn('AnimatedCounter: Element not found');
        return null;
    }
    return new AnimatedCounter(element, options);
}

// Utility function to create multiple counters
function createCounters(selectors, options = {}) {
    const counters = [];
    selectors.forEach(selector => {
        const counter = createAnimatedCounter(selector, options);
        if (counter) {
            counters.push(counter);
        }
    });
    return counters;
}

// Utility functions for specific counter types
function createCurrencyCounter(selector, options = {}) {
    return createAnimatedCounter(selector, {
        format: 'currency',
        animationEffect: 'glow',
        size: 'medium',
        ...options
    });
}

function createPercentageCounter(selector, options = {}) {
    return createAnimatedCounter(selector, {
        format: 'percentage',
        decimals: 1,
        animationEffect: 'bounce',
        size: 'medium',
        ...options
    });
}

function createNumberCounter(selector, options = {}) {
    return createAnimatedCounter(selector, {
        format: 'number',
        useGrouping: true,
        animationEffect: 'fade',
        size: 'medium',
        ...options
    });
}

// Batch update utility
function updateCounters(counters, values) {
    if (Array.isArray(counters) && Array.isArray(values)) {
        counters.forEach((counter, index) => {
            if (counter && values[index] !== undefined) {
                counter.update(values[index]);
            }
        });
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        AnimatedCounter, 
        createAnimatedCounter, 
        createCounters,
        createCurrencyCounter,
        createPercentageCounter,
        createNumberCounter,
        updateCounters
    };
} else {
    window.AnimatedCounter = AnimatedCounter;
    window.createAnimatedCounter = createAnimatedCounter;
    window.createCounters = createCounters;
    window.createCurrencyCounter = createCurrencyCounter;
    window.createPercentageCounter = createPercentageCounter;
    window.createNumberCounter = createNumberCounter;
    window.updateCounters = updateCounters;
}