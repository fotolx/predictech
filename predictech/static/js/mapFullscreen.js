
class SVGScaler {
    constructor() {
        this.scale = 1; // Текущий масштаб (1 = 100%)
        this.minScale = 0.25; // Минимальный масштаб (25%)
        this.maxScale = 5; // Максимальный масштаб (500%)
        this.step = 0.05; // Шаг изменения (25%)

        this.svgElement = document.getElementById('scalable-svg');
        this.scaleDisplay = document.querySelector('.map-controls__scale');
        this.zoomInBtn = document.querySelector('.map-controls__button--zoom-in');
        this.zoomOutBtn = document.querySelector('.map-controls__button--zoom-out');
        this.fullscreenBtn = document.querySelector('.btn-fullscreen');

        this.init();
    }

    init() {
        // Обработчики для кнопок увеличения/уменьшения
        this.zoomInBtn.addEventListener('click', () => this.zoomIn());
        this.zoomOutBtn.addEventListener('click', () => this.zoomOut());

        // Обработчик для полноэкранного режима (опционально)
        this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());

        // Обработчик колесика мыши для масштабирования
        this.svgElement.addEventListener('wheel', (e) => this.handleWheel(e));

        this.updateDisplay();
    }

    zoomIn() {
        const newScale = this.scale + this.step;
        if (newScale <= this.maxScale) {
            this.scale = newScale;
            this.applyScale();
        }
    }

    zoomOut() {
        const newScale = this.scale - this.step;
        if (newScale >= this.minScale) {
            this.scale = newScale;
            this.applyScale();
        }
    }

    applyScale() {
        // Плавное применение масштаба через CSS transform
        this.svgElement.style.transform = `scale(${this.scale})`;
        this.updateDisplay();
    }

    updateDisplay() {
        // Обновление отображения текущего масштаба
        this.scaleDisplay.textContent = `${Math.round(this.scale * 100)}%`;

        // Блокировка кнопок при достижении пределов
        this.zoomInBtn.disabled = this.scale >= this.maxScale;
        this.zoomOutBtn.disabled = this.scale <= this.minScale;
    }

    handleWheel(e) {
        e.preventDefault();

        if (e.deltaY < 0) {
            // Прокрутка вверх - увеличение
            this.zoomIn();
        } else {
            // Прокрутка вниз - уменьшение
            this.zoomOut();
        }
    }

    toggleFullscreen() {
        // Функция для полноэкранного режима (можно доработать)
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log(`Ошибка при переходе в полноэкранный режим: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    // Дополнительные методы для точного контроля
    setScale(newScale) {
        this.scale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
        this.applyScale();
    }

    resetScale() {
        this.scale = 1;
        this.applyScale();
    }
}

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    new SVGScaler();
});
