// === Конфигурация ===
const UPDATE_CONFIG = {
    jsonUrl: 'https://predictech.5d4.ru/train_model/?house_id=2',
    startDelay: 5500, // Задержка перед запросом (5.5 сек)
    checkInterval: 2000,
    maxAttempts: 30
};

// === Глобальные переменные ===
let checkTimer = null;
let attempts = 0;
let modelShown = false;

// Прелоадер
let preloaderActive = false;
let preloaderInterval = null;
let preloaderObserver = null;
let preloaderPercent = 0;

// === Ключи для localStorage ===
const STORAGE_KEYS = {
    date: 'lastTrainingDate',
    accuracy: 'modelAccuracyValue',
    improvement: 'accuracyImprovementValue'
};

// === Инициализация ===
document.addEventListener('DOMContentLoaded', () => {
    restoreFromLocalStorage();
    setTimeout(() => {
        saveOriginalButtonTexts();
        initUpdateButtons();
    }, 300);
});

// === Инициализация кнопок ===
function initUpdateButtons() {
    const buttons = document.querySelectorAll('.btn-update');
    if (!buttons.length) {
        return setTimeout(initUpdateButtons, 500);
    }

    buttons.forEach(btn => {
        btn.addEventListener('click', handleClick);
    });
}

// === Обработчик клика ===
function handleClick(e) {
    const btn = e.currentTarget;

    // Если уже запущен прелоадер — игнорируем повторные клики
    if (preloaderActive) return;

    // Сразу убрать активную модалку подтверждения (если есть)
    removeModalConfirmActive();

    // Показать прелоадер поверх всего
    createPreloader();

    // Блокируем все кнопки обновления и подменяем текст
    document.querySelectorAll('.btn-update').forEach(b => {
        b.disabled = true;
        b.textContent = 'Ожидание запроса...';
    });

    modelShown = false;
    console.log(`Запрос начнется через ${UPDATE_CONFIG.startDelay / 1000} секунд`);

    // Начать проверку после задержки
    setTimeout(() => {
        document.querySelectorAll('.btn-update').forEach(b => b.textContent = 'Проверка...');
        startCheck();
    }, UPDATE_CONFIG.startDelay);
}

// === Старт проверки ===
function startCheck() {
    attempts = 0;
    clearInterval(checkTimer);
    checkStatus(); // первый запрос сразу
    checkTimer = setInterval(checkStatus, UPDATE_CONFIG.checkInterval);
}

// === Запрос к серверу ===
async function checkStatus() {
    attempts++;

    try {
        const response = await fetch(`${UPDATE_CONFIG.jsonUrl}&t=${Date.now()}`, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const dataText = await response.text();
        const data = fastParseJSON(dataText);

        if (data.status === "Success" && !modelShown) {
            modelShown = true;
            clearInterval(checkTimer);
            updatePageData(data);
            saveToLocalStorage(data);
            showSuccessModal(data); // createModal внутри удалит прелоадер
            resetButtons();
        } else if (data.status === "Error") {
            clearInterval(checkTimer);
            showErrorModal(data);
            resetButtons();
        } else if (attempts >= UPDATE_CONFIG.maxAttempts) {
            clearInterval(checkTimer);
            showTimeoutModal();
            resetButtons();
        }
    } catch (err) {
        console.error('Ошибка загрузки:', err);
        clearInterval(checkTimer);
        showErrorModal({ message: 'Ошибка загрузки данных' });
        resetButtons();
    }
}

// === Ускоренный парсер JSON ===
function fastParseJSON(text) {
    try {
        return JSON.parse(text);
    } catch {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
            return JSON.parse(text.slice(start, end + 1));
        }
        throw new Error('Не удалось распарсить ответ');
    }
}

// === Обновление DOM ===
function updatePageData(data) {
    const dateEls = document.querySelectorAll('.last-training-date');
    const accEls = document.querySelectorAll('.model-accuracy-value');
    const impEls = document.querySelectorAll('.accuracy-improvement-value');

    if (data.retrain_date) {
        const formatted = formatDate(data.retrain_date);
        dateEls.forEach(el => (el.textContent = formatted));
    }
    if (data.test_accuracy !== undefined) {
        const percent = (data.test_accuracy * 100).toFixed(1) + '%';
        accEls.forEach(el => (el.textContent = percent));
    }
    if (data.test_loss !== undefined) {
        const value = formatImprovementValue(data.test_loss);
        impEls.forEach(el => (el.textContent = value));
    }

    console.log('Обновлены данные модели:', data);
}

// === LocalStorage ===
function saveToLocalStorage(data) {
    if (data.retrain_date) {
        localStorage.setItem(STORAGE_KEYS.date, formatDate(data.retrain_date));
    }
    if (data.test_accuracy !== undefined) {
        localStorage.setItem(STORAGE_KEYS.accuracy, (data.test_accuracy * 100).toFixed(1) + '%');
    }
    if (data.test_loss !== undefined) {
        localStorage.setItem(STORAGE_KEYS.improvement, formatImprovementValue(data.test_loss));
    }
}

function restoreFromLocalStorage() {
    const date = localStorage.getItem(STORAGE_KEYS.date);
    const acc = localStorage.getItem(STORAGE_KEYS.accuracy);
    const imp = localStorage.getItem(STORAGE_KEYS.improvement);

    if (date) document.querySelectorAll('.last-training-date').forEach(el => el.textContent = date);
    if (acc) document.querySelectorAll('.model-accuracy-value').forEach(el => el.textContent = acc);
    if (imp) document.querySelectorAll('.accuracy-improvement-value').forEach(el => el.textContent = imp);
}

// === Вспомогательные функции ===
function formatDate(str) {
    try {
        return `${str.substring(6, 8)}.${str.substring(4, 6)}.${str.substring(0, 4)}, ${str.substring(9, 11)}:${str.substring(11, 13)}`;
    } catch {
        return str;
    }
}

function formatImprovementValue(v) {
    const num = Math.abs(v).toFixed(2);
    return `${v >= 0 ? '+' : '-'}${num}%`;
}

// === Прелоадер (overlay) ===
function createPreloader() {
    if (preloaderActive) return;
    preloaderActive = true;
    preloaderPercent = 0;

    // Добавляем стили для прелоадера (однократно)
    if (!document.getElementById('update-preloader-styles')) {
        const style = document.createElement('style');
        style.id = 'update-preloader-styles';
        style.textContent = `
            .update-preloader {
                position: fixed;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(0,0,0,0.45);
                z-index: 9999999;
                -webkit-backdrop-filter: blur(2px);
                        backdrop-filter: blur(2px);
            }
            .update-preloader__inner {
                display:flex;
                flex-direction: column;
                align-items: center;
                gap: 12px;
                padding: 18px 24px;
                border-radius: 12px;
                background: rgba(255,255,255,0.95);
                box-shadow: 0 10px 30px rgba(0,0,0,0.25);
                min-width: 160px;
                min-height: 160px;
            }
            .update-preloader .spinner {
                width: 72px;
                height: 72px;
                border-radius: 50%;
                border: 6px solid rgba(0,0,0,0.08);
                border-top-color: rgba(0,0,0,0.5);
                animation: upreloader-spin 1s linear infinite;
                box-sizing: border-box;
            }
            @keyframes upreloader-spin { to { transform: rotate(360deg); } }
            .update-preloader .percent {
                font-size: 22px;
                font-weight: 700;
                color: #111;
            }
            .update-preloader.fade-out {
                transition: opacity 300ms ease;
                opacity: 0;
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
    }

    // Создаём DOM
    const wrapper = document.createElement('div');
    wrapper.className = 'update-preloader';
    wrapper.id = 'update-preloader';
    wrapper.innerHTML = `
        <div class="update-preloader__inner" role="status" aria-live="polite" aria-label="Идет обновление">
            <div class="spinner" aria-hidden="true"></div>
            <div class="percent">0%</div>
        </div>
    `;
    document.body.appendChild(wrapper);

    // Запустить увеличение процентов (до 99%), финал 100% делаем при удалении
    preloaderInterval = setInterval(() => {
        // Увеличиваем прогресс реалистично: чем ближе к 90, тем медленнее
        if (preloaderPercent < 90) {
            preloaderPercent += Math.floor(Math.random() * 4) + 1; // 1..4
        } else if (preloaderPercent < 98) {
            preloaderPercent += 1;
        } else {
            preloaderPercent = Math.min(preloaderPercent + 0, 99); // держим на 99%
        }
        preloaderPercent = Math.min(preloaderPercent, 99);
        updatePreloaderPercent(preloaderPercent);
    }, 120);

    // Наблюдатель: если где-то появится .update-model - сразу убираем прелоадер
    preloaderObserver = new MutationObserver(mutations => {
        if (document.querySelector('.update-model')) {
            removePreloader(true);
        }
    });
    preloaderObserver.observe(document.body, { childList: true, subtree: true });
}

function updatePreloaderPercent(n) {
    const el = document.querySelector('#update-preloader .percent');
    if (el) el.textContent = `${Math.max(0, Math.min(100, Math.floor(n)))}%`;
}

function removePreloader(setTo100 = false) {
    if (!preloaderActive) return;
    preloaderActive = false;

    // установка 100% и плавное исчезновение
    const wrapper = document.getElementById('update-preloader');
    if (!wrapper) {
        cleanupPreloaderState();
        return;
    }

    if (setTo100) updatePreloaderPercent(100);

    // плавно скрываем
    wrapper.classList.add('fade-out');

    // очистка интервала и наблюдателя
    cleanupPreloaderState();

    // Удаляем элемент через 350ms (позволяет показать 100%)
    setTimeout(() => {
        if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    }, 350);
}

function cleanupPreloaderState() {
    if (preloaderInterval) {
        clearInterval(preloaderInterval);
        preloaderInterval = null;
    }
    if (preloaderObserver) {
        try { preloaderObserver.disconnect(); } catch (e) { /* ignore */ }
        preloaderObserver = null;
    }
    preloaderPercent = 0;
}

// === Модалки ===
function showSuccessModal(data) {
    createModal('success', decodeUnicode(data.message || 'Модель успешно обучена!'));
}
function showErrorModal(data) {
    createModal('error', data.message || 'Ошибка обучения');
}
function showTimeoutModal() {
    createModal('error', 'Превышено время ожидания ответа');
}

function createModal(type, message) {
    // Удаляем старые update-model если есть
    document.querySelectorAll('.update-model').forEach(m => m.remove());

    const isSuccess = type === 'success';
    const icon = isSuccess ? '/static/img/icon/check-4.svg' : '/static/img/icon/error.svg';
    const html = `
        <div class="update-model">
            <div class="container-update-model">
                <div class="update-model__content">
                    <div class="close-update-model" title="Закрыть"><img src="/static/img/icon/close-line.svg" alt="Закрыть"></div>
                    <div class="circle-update ${isSuccess ? '' : 'error'}"><img src="${icon}" alt=""></div>
                    <div class="update-model__title">${message}</div>
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    const modal = document.querySelector('.update-model:last-child');
    initModalEvents(modal);

    // Убрать прелоадер сразу, поскольку модалка появилась
    removePreloader(true);

    // И убрать modal-confirm--active, если вдруг ещё где-то осталось
    removeModalConfirmActive();
}

function decodeUnicode(str) {
    return str.replace(/\\u[\dA-F]{4}/gi, m => String.fromCharCode(parseInt(m.replace(/\\u/g, ''), 16)));
}

function resetButtons() {
    document.querySelectorAll('.btn-update').forEach(btn => {
        btn.disabled = false;
        btn.textContent = btn.dataset.originalText || 'Обновить';
    });
    // на всякий случай убираем прелоадер, если остался
    removePreloader(false);
}

function saveOriginalButtonTexts() {
    document.querySelectorAll('.btn-update').forEach(btn => {
        if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
    });
}

function removeModalConfirmActive() {
    // Убираем класс у элемента с такими тремя классами (если есть)
    const m = document.querySelector('.modal-confirm.modal-confirm-open.modal-confirm--active');
    if (m) m.classList.remove('modal-confirm--active');
}

// Ивенты модалки
function initModalEvents(modal) {
    const close = modal.querySelector('.close-update-model');
    if (close) close.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Закрытие по Esc
    function escClose(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escClose);
        }
    }
    document.addEventListener('keydown', escClose);
}

// === Экспорт ===
window.UpdateManager = {
    checkStatus,
    updatePageData,
    showSuccessModal,
    showErrorModal,
    resetButtons,
    createPreloader,
    removePreloader
};
