
class SVGMapHighlighter {
    constructor(options = {}) {
        this.options = {
            houseItemSelector: '.wrapper-houses__item',
            houseDataAttribute: 'data-house',
            svgElementTag: 'path',
            highlightOpacity: 1,
            transitionDuration: '0.3s',
            ...options
        };

        // Цвета для подсветки разных элементов
        this.colors = [
            '#22c55e4b', '#22c55e4b', '#f974165e', '#ef444462', '#f974165e'
        ];

        this.houseElements = [];
        this.svgElements = new Map();
        this.isReady = false;
        this.currentColorIndex = 0;

        this.init();
    }

    init() {
        // Ждем полной загрузки DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        this.findHouseElements();
        this.waitForSVG().then(() => {
            this.findSVGElements();
            this.bindEvents();
            this.isReady = true;
            console.log('SVGMapHighlighter: Инициализация завершена');
        }).catch(error => {
            console.error('SVGMapHighlighter: Ошибка загрузки SVG', error);
        });
    }

    findHouseElements() {
        this.houseElements = Array.from(
            document.querySelectorAll(this.options.houseItemSelector)
        );
        
        console.log(`SVGMapHighlighter: Найдено ${this.houseElements.length} элементов домов`);
    }

    waitForSVG() {
        return new Promise((resolve, reject) => {
            const maxWaitTime = 10000; // 10 секунд максимум
            const checkInterval = 100; // Проверяем каждые 100мс
            let elapsedTime = 0;

            const checkSVG = () => {
                // Ищем любой SVG элемент с нашими ID
                const testElement = document.querySelector(
                    `${this.options.svgElementTag}[id^="svg-house-"]`
                );

                if (testElement) {
                    resolve();
                } else if (elapsedTime >= maxWaitTime) {
                    reject(new Error('SVG элементы не найдены в течение отведенного времени'));
                } else {
                    elapsedTime += checkInterval;
                    setTimeout(checkSVG, checkInterval);
                }
            };

            checkSVG();
        });
    }

    findSVGElements() {
        this.houseElements.forEach(houseElement => {
            const houseId = houseElement.getAttribute(this.options.houseDataAttribute);
            if (houseId) {
                const svgElement = document.getElementById(houseId);
                if (svgElement) {
                    this.svgElements.set(houseElement, {
                        svg: svgElement,
                        originalOpacity: svgElement.style.opacity || svgElement.getAttribute('opacity') || '0.25',
                        color: this.getNextColor()
                    });

                    // Добавляем CSS transition для плавности
                    svgElement.style.transition = `all ${this.options.transitionDuration} ease-in-out`;
                } else {
                    console.warn(`SVGMapHighlighter: Элемент SVG с ID "${houseId}" не найден`);
                }
            }
        });

        console.log(`SVGMapHighlighter: Связано ${this.svgElements.size} SVG элементов`);
    }

    getNextColor() {
        const color = this.colors[this.currentColorIndex];
        this.currentColorIndex = (this.currentColorIndex + 1) % this.colors.length;
        return color;
    }

    bindEvents() {
        this.houseElements.forEach(houseElement => {
            if (this.svgElements.has(houseElement)) {
                const { svg, color } = this.svgElements.get(houseElement);

                // События для HTML элемента
                houseElement.addEventListener('mouseenter', () => this.highlightElement(houseElement));
                houseElement.addEventListener('mouseleave', () => this.resetElement(houseElement));
                houseElement.addEventListener('focus', () => this.highlightElement(houseElement));
                houseElement.addEventListener('blur', () => this.resetElement(houseElement));

                // События для SVG элемента
                svg.addEventListener('mouseenter', () => this.highlightElement(houseElement));
                svg.addEventListener('mouseleave', () => this.resetElement(houseElement));
                svg.addEventListener('click', () => this.handleSVGClick(houseElement));

                // Добавляем курсор pointer для интерактивности
                svg.style.cursor = 'pointer';
                
                // Делаем SVG элементы доступными для фокуса
                svg.setAttribute('tabindex', '0');
                svg.setAttribute('role', 'button');
                svg.setAttribute('aria-label', `Дом ${houseElement.querySelector('.wrapper-houses__text')?.textContent || ''}`);
            }
        });
    }

    highlightElement(houseElement) {
        if (!this.svgElements.has(houseElement)) return;

        const { svg, color } = this.svgElements.get(houseElement);
        
        // Подсвечиваем SVG
        svg.style.opacity = this.options.highlightOpacity;
        svg.style.fill = color;
        svg.style.stroke = color;
        svg.style.filter = 'drop-shadow(0 0 8px rgba(0,0,0,0.3))';

        // Добавляем класс для HTML элемента
        houseElement.classList.add('house-highlighted');
    }

    resetElement(houseElement) {
        if (!this.svgElements.has(houseElement)) return;

        const { svg, originalOpacity } = this.svgElements.get(houseElement);
        
        // Возвращаем исходный вид SVG
        svg.style.opacity = originalOpacity;
        svg.style.fill = '';
        svg.style.stroke = '';
        svg.style.filter = '';

        // Убираем класс с HTML элемента
        houseElement.classList.remove('house-highlighted');
    }

    handleSVGClick(houseElement) {
        // Эмулируем клик по HTML элементу
        houseElement.click();
        
        // Добавляем временную подсветку для обратной связи
        this.highlightElement(houseElement);
        setTimeout(() => this.resetElement(houseElement), 1000);
    }

    // Публичные методы для управления извне
    highlightById(houseId) {
        const houseElement = this.houseElements.find(el => 
            el.getAttribute(this.options.houseDataAttribute) === houseId
        );
        if (houseElement) {
            this.highlightElement(houseElement);
        }
    }

    resetAll() {
        this.houseElements.forEach(houseElement => {
            this.resetElement(houseElement);
        });
    }

    // Проверка статуса
    getStatus() {
        return {
            isReady: this.isReady,
            houseElementsCount: this.houseElements.length,
            svgElementsCount: this.svgElements.size
        };
    }
}

// Автоматическая инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    window.svgMapHighlighter = new SVGMapHighlighter();
    
    // Дополнительный CSS для улучшения внешнего вида
    const style = document.createElement('style');
    style.textContent = `
        .wrapper-houses__item {
            transition: all 0.3s ease-in-out;
            cursor: pointer;
        }
        
        .wrapper-houses__item:hover {
            transform: translateY(-2px);
        }
        
        .house-highlighted {
            background-color: rgba(0,0,0,0.05);
            border-radius: 4px;
        }
        
        /* Улучшение доступности */
        .wrapper-houses__item:focus {
            outline: 2px solid #007bff;
            outline-offset: 2px;
        }
    `;
    document.head.appendChild(style);
});

// Экспорт для использования в качестве модуля
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SVGMapHighlighter;
}