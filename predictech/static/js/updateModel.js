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

// Preloader
let preloaderInterval = null;
let preloaderPercent = 0;
let preloaderObserver = null;

// === Ключи для localStorage ===
const STORAGE_KEYS = {
    date: 'lastTrainingDate',
    accuracy: 'modelAccuracyValue',
    improvement: 'accuracyImprovementValue'
};

// === Вставка CSS для преадера (если нужно — можно убрать/редактировать) ===
(function injectPreloaderStyles() {
    const css = `
    .update-preloader {
        position: fixed;
        z-index: 99999;
        left: 0; top: 0; right: 0; bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(2px);
        background: rgba(0,0,0,0.15);
        -webkit-font-smoothing: antialiased;
    }
    .update-preloader__box {
        width: 160px;
        height: 160px;
        border-radius: 14px;
        background: #fff;
        box-shadow: 0 10px 30px rgba(0,0,0,0.12);
        display:flex;
        align-items:center;
        justify-content:center;
        flex-direction:column;
        gap:12px;
        padding:12px;
    }
    .update-preloader__spinner {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        border: 6px solid rgba(0,0,0,0.08);
        border-top-color: rgba(0,0,0,0.5);
        animation: upd-spin 1s linear infinite;
        display:flex;
        align-items:center;
        justify-content:center;
        position: relative;
    }
    .update-preloader__spinner::after {
        content: '';
        position: absolute;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: transparent;
    }
    @keyframes upd-spin {
        to { transform: rotate(360deg); }
    }
    .update-preloader__percent {
        font-size: 18px;
        font-weight: 600;
        color: #222;
        min-width: 54px;
        text-align: center;
    }
    .update-preloader__label {
        font-size: 13px;
        color: #666;
        text-align:center;
    }
    `;
    const style = document.createElement('style');
    style.setAttribute('data-from', 'update-preloader');
    style.textContent = css;
    document.head.appendChild(style);
})();

// === Инициализация ===
document.addEventListener('DOMContentLoaded', () => {
    restoreFromLocalStorage();
    setTimeout(() => {
        saveOriginalButtonTexts();
        initUpdateButtons();
        initMutationObserverForUpdateModel();
    }, 300);
});

// === Инициализация кнопок ===
function initUpdateButtons() {
    const buttons = document.querySelectorAll('.btn-update');
    if (!buttons.length) {
        // повторяем попытку найти кнопки
        return setTimeout(initUpdateButtons, 500);
    }

    buttons.forEach(btn => {
        btn.addEventListener('click', handleClick);
    });
}

// === Обработчик клика ===
function handleClick(e) {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Ожидание запроса...';
    modelShown = false;

    // сразу убираем активный модал подтверждения (если есть)
    removeModalConfirmActive();

    // показываем преадер (он появляется сразу)
    showPreloader();

    console.log(`Запрос начнется через ${UPDATE_CONFIG.startDelay / 1000} секунд`);

    // Запуск с задержкой (startDelay)
    setTimeout(() => {
        // обновляем текст кнопки и стартуем опрос
        btn.textContent = 'Проверка...';
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

        // читаем текст и парсим
        const dataText = await response.text();
        const data = fastParseJSON(dataText);

        if (data.status === "Success" && !modelShown) {
            modelShown = true;
            clearInterval(checkTimer);
            updatePageData(data);
            saveToLocalStorage(data);
            createModal('success', decodeUnicode(data.message || 'Модель успешно обучена!'));
            resetButtons();
            // По требованию — когда появляется .update-model, преадер скрывается (createModal это сделает)
        } else if (data.status === "Error") {
            clearInterval(checkTimer);
            createModal('error', data.message || 'Ошибка обучения');
            resetButtons();
        } else if (attempts >= UPDATE_CONFIG.maxAttempts) {
            clearInterval(checkTimer);
            createModal('error', 'Превышено время ожидания ответа');
            resetButtons();
        } else {
            // продолжаем опрос; при каждом цикле можно слегка увеличить прогресс для визуального отклика
            bumpPreloaderProgress(1, 95);
        }
    } catch (err) {
        console.error('Ошибка загрузки:', err);
        clearInterval(checkTimer);
        createModal('error', 'Ошибка загрузки данных');
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
        // ожидается формат YYYYmmddTHHMM... или похожий — оставляем прежнюю логику
        return `${str.substring(6, 8)}.${str.substring(4, 6)}.${str.substring(0, 4)}, ${str.substring(9, 11)}:${str.substring(11, 13)}`;
    } catch {
        return str;
    }
}

function formatImprovementValue(v) {
    const num = Math.abs(v).toFixed(2);
    return `${v >= 0 ? '+' : '-'}${num}%`;
}

// === Модалки ===
function createModal(type, message) {
    // удаляем предыдущую если есть
    document.querySelectorAll('.update-model').forEach(m => m.remove());

    const isSuccess = type === 'success';
    const icon = isSuccess ? '/static/img/icon/check-4.svg' : '/static/img/icon/error.svg';
    const html = `
        <div class="update-model">
            <div class="container-update-model">
                <div class="update-model__content">
                    <div class="close-update-model"><img src="/static/img/icon/close-line.svg" alt="Закрыть"></div>
                    <div class="circle-update ${isSuccess ? '' : 'error'}"><img src="${icon}" alt=""></div>
                    <div class="update-model__title">${escapeHtml(message)}</div>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    // Т.к. появление .update-model означает что процесс завершён — прячем преадер
    hidePreloader();

    const modal = document.querySelector('.update-model:last-child');
    initModalEvents(modal);
    removeModalConfirmActive();
}

function showSuccessModal(data) {
    createModal('success', decodeUnicode(data.message || 'Модель успешно обучена!'));
}
function showErrorModal(data) {
    createModal('error', data.message || 'Ошибка обучения');
}
function showTimeoutModal() {
    createModal('error', 'Превышено время ожидания ответа');
}

function decodeUnicode(str) {
    return str.replace(/\\u[\dA-F]{4}/gi, m => String.fromCharCode(parseInt(m.replace(/\\u/g, ''), 16)));
}

function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/[&<>"']/g, function (c) {
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
}

function resetButtons() {
    document.querySelectorAll('.btn-update').forEach(btn => {
        btn.disabled = false;
        btn.textContent = btn.dataset.originalText || 'Обновить';
    });
}

function saveOriginalButtonTexts() {
    document.querySelectorAll('.btn-update').forEach(btn => {
        if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
    });
}

function removeModalConfirmActive() {
    const m = document.querySelector('.modal-confirm.modal-confirm-open.modal-confirm--active');
    if (m) m.classList.remove('modal-confirm--active');
}

// === Ивенты для модалки ===
function initModalEvents(modal) {
    const closeBtn = modal.querySelector('.close-update-model');
    if (closeBtn) closeBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.addEventListener('keydown', function escClose(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escClose);
        }
    });
}

// === Преадер: показать/скрыть/управление процентом ===
function showPreloader() {
    // если уже есть — сбрасываем прогресс
    hidePreloader();

    const html = `
    <div class="update-preloader" role="status" aria-live="polite">
        <div class="update-preloader__box" aria-hidden="false">
            <div class="update-preloader__spinner" aria-hidden="true"></div>
            <div class="update-preloader__percent">0%</div>
            <div class="update-preloader__label">Идёт обновление модели...</div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    preloaderPercent = 0;
    const percentEl = document.querySelector('.update-preloader__percent');

    // start progression: плавно до 90-95% пока идёт ожидание/опрос
    clearInterval(preloaderInterval);
    preloaderInterval = setInterval(() => {
        // рандомный небольшй шаг, чтобы не казалось "фонит"
        const step = Math.random() * 2 + 0.5; // 0.5 - 2.5
        preloaderPercent = Math.min(preloaderPercent + step, 95);
        if (percentEl) percentEl.textContent = `${Math.floor(preloaderPercent)}%`;
    }, 200);
}

function hidePreloader() {
    // Устанавливаем 100% и плавно удаляем
    const pre = document.querySelector('.update-preloader');
    if (!pre) {
        clearInterval(preloaderInterval);
        preloaderInterval = null;
        return;
    }
    const percentEl = pre.querySelector('.update-preloader__percent');
    if (percentEl) percentEl.textContent = `100%`;
    preloaderPercent = 100;
    clearInterval(preloaderInterval);
    preloaderInterval = null;

    // небольшая задержка для плавности (можно убрать если нужен моментальный скрытие)
    setTimeout(() => {
        document.querySelectorAll('.update-preloader').forEach(n => n.remove());
    }, 180);
}

// Небольшое увеличение прогресса по требованию
function bumpPreloaderProgress(minAdd = 1, cap = 95) {
    preloaderPercent = Math.min(cap, Math.max(preloaderPercent + (Math.random() * 3 + minAdd), preloaderPercent));
    const el = document.querySelector('.update-preloader__percent');
    if (el) el.textContent = `${Math.floor(preloaderPercent)}%`;
}

// === Наблюдатель: если кто-то добавит .update-model — прячем преадер автоматически ===
function initMutationObserverForUpdateModel() {
    if (preloaderObserver) return;

    preloaderObserver = new MutationObserver(mutations => {
        for (const m of mutations) {
            if (m.addedNodes && m.addedNodes.length) {
                for (const node of m.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;
                    if (node.classList && node.classList.contains('update-model')) {
                        // появилось — скрываем преадер
                        hidePreloader();
                        return;
                    }
                    // если внутри добавленного узла содержится .update-model
                    if (node.querySelector && node.querySelector('.update-model')) {
                        hidePreloader();
                        return;
                    }
                }
            }
        }
    });

    preloaderObserver.observe(document.body, { childList: true, subtree: true });
}

// === Экспорт ===
window.UpdateManager = {
    checkStatus,
    updatePageData,
    showSuccessModal,
    showErrorModal,
    resetButtons,
    // для отладки:
    _internal: {
        showPreloader,
        hidePreloader,
        bumpPreloaderProgress
    }
};
