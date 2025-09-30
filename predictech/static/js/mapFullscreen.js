const SCALE_CONFIG = {
    minScale: 0.25,
    maxScale: 5,
    step: 0.05,
    initialScale: 1
};

// Глобальные переменные
let currentScale = SCALE_CONFIG.initialScale;
let svgElement, scaleDisplay, zoomInBtn, zoomOutBtn, fullscreenBtn;

function initSVGScaler() {
    
    setTimeout(() => {
        svgElement = document.getElementById('scalable-svg');
        scaleDisplay = document.querySelector('.map-controls__scale');
        zoomInBtn = document.querySelector('.map-controls__button--zoom-in');
        zoomOutBtn = document.querySelector('.map-controls__button--zoom-out');
        fullscreenBtn = document.querySelector('.btn-fullscreen');

        // Проверяем, все ли элементы найдены
        if (!svgElement || !scaleDisplay || !zoomInBtn || !zoomOutBtn) {
            console.warn('Не все необходимые элементы найдены. Повторная попытка...');
            // Повторяем попытку через 500ms если элементы не найдены
            setTimeout(initSVGScaler, 500);
            return;
        }

        initEventListeners();
        updateDisplay();
        
    }, 100); // Начальная задержка
}

function initEventListeners() {
    zoomInBtn.addEventListener('click', zoomIn);
    zoomOutBtn.addEventListener('click', zoomOut);
    
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', toggleFullscreen);
    }
    
    svgElement.addEventListener('wheel', handleWheel);
}

// Функции масштабирования
function zoomIn() {
    const newScale = currentScale + SCALE_CONFIG.step;
    if (newScale <= SCALE_CONFIG.maxScale) {
        currentScale = newScale;
        applyScale();
    }
}

function zoomOut() {
    const newScale = currentScale - SCALE_CONFIG.step;
    if (newScale >= SCALE_CONFIG.minScale) {
        currentScale = newScale;
        applyScale();
    }
}

function applyScale() {
    if (svgElement) {
        svgElement.style.transform = `scale(${currentScale})`;
        updateDisplay();
    }
}

function updateDisplay() {
    if (scaleDisplay) {
        scaleDisplay.textContent = `${Math.round(currentScale * 100)}%`;
    }
    
    if (zoomInBtn && zoomOutBtn) {
        zoomInBtn.disabled = currentScale >= SCALE_CONFIG.maxScale;
        zoomOutBtn.disabled = currentScale <= SCALE_CONFIG.minScale;
    }
}

function handleWheel(e) {
    e.preventDefault();

    if (e.deltaY < 0) {
        zoomIn();
    } else {
        zoomOut();
    }
}

function toggleFullscreen() {
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

// Дополнительные функции для внешнего использования
function setScale(newScale) {
    currentScale = Math.max(SCALE_CONFIG.minScale, Math.min(SCALE_CONFIG.maxScale, newScale));
    applyScale();
}

function resetScale() {
    currentScale = SCALE_CONFIG.initialScale;
    applyScale();
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initSVGScaler, 300);
});

window.SVGScaler = {
    zoomIn,
    zoomOut,
    setScale,
    resetScale,
    toggleFullscreen
};

