// === Конфигурация ===
const UPDATE_CONFIG = {
    jsonUrl: 'https://predictech.5d4.ru/train_model/?house_id=2',
    startDelay: 5500, // задержка перед первым запросом (ms)
    checkInterval: 2000, // интервал опроса (ms)
    maxAttempts: 30
};

// === Состояние ===
let activeUpdate = {
    attempts: 0,
    checkTimer: null,
    startTimer: null,
    preloaderInterval: null,
    preloaderPercent: 0,
    controller: null
};

let mutationObserver = null;

// === Стили прелоадера (инжектим) ===
(function injectPreloaderStyles() {
    const css = `
    .update-preloader{position:fixed;z-index:99999;left:0;top:0;right:0;bottom:0;
        display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.15);backdrop-filter:blur(2px)}
    .update-preloader__box{width:160px;height:160px;border-radius:14px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,0.12);
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:12px}
    .update-preloader__spinner{width:64px;height:64px;border-radius:50%;border:6px solid rgba(0,0,0,0.08);border-top-color:rgba(0,0,0,0.5);
        animation:upd-spin 1s linear infinite;position:relative;display:flex;align-items:center;justify-content:center}
    @keyframes upd-spin{to{transform:rotate(360deg)}}
    .update-preloader__percent{font-size:18px;font-weight:600;color:#222;min-width:54px;text-align:center}
    .update-preloader__label{font-size:13px;color:#666;text-align:center}
    `;
    const style = document.createElement('style');
    style.setAttribute('data-from', 'update-preloader');
    style.textContent = css;
    document.head.appendChild(style);
})();

// === Инициализация ===
document.addEventListener('DOMContentLoaded', () => {
    restoreFromLocalStorage();
    initGlobalClickHandler();
    initMutationObserverForUpdateModel();
});

// === Делегированный обработчик клика для .btn-update ===
function initGlobalClickHandler() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('.btn-update');
        if (!btn) return;
        e.preventDefault();
        startUpdateFlow(btn);
    });
}

// === Главный поток обновления ===
function startUpdateFlow(btn) {
    // предотвращаем множественные одновременные процессы
    cleanupActiveUpdate();

    // сохраняем оригинальный текст кнопки (если ещё не сохранён)
    if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent.trim();

    btn.disabled = true;
    btn.textContent = 'Ожидание запроса...';

    // сразу убираем модалку подтверждения (убираем класс у всех элементов)
    removeAllModalConfirmActive();

    // показываем прелоадер сразу
    showPreloader();

    console.log(`Запрос начнётся через ${UPDATE_CONFIG.startDelay / 1000} с`);

    // запускаем таймер на старт опроса
    activeUpdate.startTimer = setTimeout(() => {
        if (!btn) return;
        btn.textContent = 'Проверка...';
        activeUpdate.attempts = 0;
        startCheckLoop(btn);
    }, UPDATE_CONFIG.startDelay);
}

// === Запуск цикла опроса ===
function startCheckLoop(btn) {
    // abort controller на каждый цикл (чтобы иметь возможность отменить fetch)
    activeUpdate.controller = new AbortController();
    // Первый запрос сразу:
    checkStatus(btn);
    // Далее — интервал
    activeUpdate.checkTimer = setInterval(() => checkStatus(btn), UPDATE_CONFIG.checkInterval);
}

// === Один запрос к серверу и обработка ответа ===
async function checkStatus(btn) {
    activeUpdate.attempts++;

    // максимальная защита — остановить по попыткам
    if (activeUpdate.attempts > UPDATE_CONFIG.maxAttempts) {
        finalizeWithError(btn, 'Превышено время ожидания ответа');
        return;
    }

    try {
        const url = `${UPDATE_CONFIG.jsonUrl}&t=${Date.now()}`;
        const resp = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
            signal: activeUpdate.controller ? activeUpdate.controller.signal : undefined
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const text = await resp.text();
        const data = fastParseJSON(text);

        // визуальный отклик: немного увеличить прогресс при каждом цикле
        bumpPreloaderProgress(1, 95);

        if (data && data.status === 'Success') {
            // успех — прекращаем опрос, обновляем UI, сохраняем и показываем модал
            clearInterval(activeUpdate.checkTimer);
            activeUpdate.checkTimer = null;
            updatePageData(data);
            saveToLocalStorage(data);
            createModal('success', decodeUnicode(data.message || 'Модель успешно обучена!'));
            resetButtons();
            cleanupActiveUpdate(true);
        } else if (data && data.status === 'Error') {
            clearInterval(activeUpdate.checkTimer);
            activeUpdate.checkTimer = null;
            createModal('error', data.message || 'Ошибка обучения');
            resetButtons();
            cleanupActiveUpdate(true);
        } // иначе продолжаем опрос
    } catch (err) {
        // если произошла отмена fetch — игнорируем; иначе — показываем ошибку
        if (err.name === 'AbortError') {
            console.warn('Fetch aborted');
            return;
        }
        console.error('Ошибка загрузки:', err);
        clearInterval(activeUpdate.checkTimer);
        activeUpdate.checkTimer = null;
        createModal('error', 'Ошибка загрузки данных');
        resetButtons();
        cleanupActiveUpdate(true);
    }
}

// === Быстрый и устойчивый парсер JSON ===
function fastParseJSON(text) {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
            try {
                return JSON.parse(text.slice(start, end + 1));
            } catch (err) {
                console.warn('fastParseJSON failed after slicing', err);
            }
        }
    }
    return null;
}

// === Обновление DOM данными модели ===
function updatePageData(data) {
    try {
        if (data.retrain_date) {
            const formatted = formatDate(data.retrain_date);
            document.querySelectorAll('.last-training-date').forEach(el => el.textContent = formatted);
        }
        if (typeof data.test_accuracy !== 'undefined') {
            const percent = (data.test_accuracy * 100).toFixed(1) + '%';
            document.querySelectorAll('.model-accuracy-value').forEach(el => el.textContent = percent);
        }
        if (typeof data.test_loss !== 'undefined') {
            document.querySelectorAll('.accuracy-improvement-value').forEach(el => el.textContent = formatImprovementValue(data.test_loss));
        }
        console.log('Данные модели обновлены', data);
    } catch (err) {
        console.error('Ошибка при updatePageData', err);
    }
}

// === LocalStorage ===
const STORAGE_KEYS = {
    date: 'lastTrainingDate',
    accuracy: 'modelAccuracyValue',
    improvement: 'accuracyImprovementValue'
};

function saveToLocalStorage(data) {
    try {
        if (data.retrain_date) localStorage.setItem(STORAGE_KEYS.date, formatDate(data.retrain_date));
        if (typeof data.test_accuracy !== 'undefined') localStorage.setItem(STORAGE_KEYS.accuracy, (data.test_accuracy * 100).toFixed(1) + '%');
        if (typeof data.test_loss !== 'undefined') localStorage.setItem(STORAGE_KEYS.improvement, formatImprovementValue(data.test_loss));
    } catch (err) {
        console.warn('Не удалось записать в localStorage', err);
    }
}

function restoreFromLocalStorage() {
    try {
        const d = localStorage.getItem(STORAGE_KEYS.date);
        const a = localStorage.getItem(STORAGE_KEYS.accuracy);
        const i = localStorage.getItem(STORAGE_KEYS.improvement);
        if (d) document.querySelectorAll('.last-training-date').forEach(el => el.textContent = d);
        if (a) document.querySelectorAll('.model-accuracy-value').forEach(el => el.textContent = a);
        if (i) document.querySelectorAll('.accuracy-improvement-value').forEach(el => el.textContent = i);
    } catch (err) {
        console.warn('restoreFromLocalStorage error', err);
    }
}

// === Форматирование даты (попытка гибкого парсинга) ===
function formatDate(str) {
    if (!str) return '';
    // Если уже в подходящем виде — возвращаем
    if (/\d{2}\.\d{2}\.\d{4}/.test(str)) return str;
    // Попытка распарсить ISO-подобные строки
    const iso = str.replace(/\s+/g, 'T').replace(/Z$/, '');
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${dd}.${mm}.${yyyy}, ${hh}:${min}`;
    }
    // fallback — старая форма YYYYmmddTHHMM...
    try {
        if (str.length >= 13) {
            const y = str.substring(0, 4);
            const m = str.substring(4, 6);
            const day = str.substring(6, 8);
            const hh = str.substring(9, 11) || '00';
            const mm2 = str.substring(11, 13) || '00';
            return `${day}.${m}.${y}, ${hh}:${mm2}`;
        }
    } catch {}
    return str;
}

function formatImprovementValue(v) {
    const num = Math.abs(Number(v)).toFixed(2);
    return `${Number(v) >= 0 ? '+' : '-'}${num}%`;
}

// === Модалки ===
function createModal(type, message) {
    // удаляем предыдущие
    document.querySelectorAll('.update-model').forEach(n => n.remove());

    const isSuccess = type === 'success';
    const icon = isSuccess ? '/static/img/icon/check-4.svg' : '/static/img/icon/error.svg';
    const safe = escapeHtml(message || '');
    const html = `
        <div class="update-model" role="dialog" aria-modal="true">
            <div class="container-update-model">
                <div class="update-model__content">
                    <div class="close-update-model" title="Закрыть"><img src="/static/img/icon/close-line.svg" alt="Закрыть"></div>
                    <div class="circle-update ${isSuccess ? '' : 'error'}"><img src="${icon}" alt=""></div>
                    <div class="update-model__title">${safe}</div>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    hidePreloader(); // прелоадер скрываем при создании модалки
    const modal = document.querySelector('.update-model:last-child');
    initModalEvents(modal);
    removeAllModalConfirmActive();
}

// === Ивенты модалки ===
function initModalEvents(modal) {
    if (!modal) return;
    const closeBtn = modal.querySelector('.close-update-model');
    const removeModal = () => modal.remove();
    if (closeBtn) closeBtn.addEventListener('click', removeModal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal(); });
    function escClose(e) {
        if (e.key === 'Escape') {
            removeModal();
            document.removeEventListener('keydown', escClose);
        }
    }
    document.addEventListener('keydown', escClose);
}

// === Прелоадер ===
function showPreloader() {
    hidePreloader(); // сброс
    const html = `
    <div class="update-preloader" role="status" aria-live="polite">
        <div class="update-preloader__box" aria-hidden="false">
            <div class="update-preloader__spinner" aria-hidden="true"></div>
            <div class="update-preloader__percent">0%</div>
            <div class="update-preloader__label">Идёт обновление модели...</div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    activeUpdate.preloaderPercent = 0;
    const percentEl = document.querySelector('.update-preloader__percent');

    clearInterval(activeUpdate.preloaderInterval);
    activeUpdate.preloaderInterval = setInterval(() => {
        const step = Math.random() * 2 + 0.5;
        activeUpdate.preloaderPercent = Math.min(activeUpdate.preloaderPercent + step, 95);
        if (percentEl) percentEl.textContent = `${Math.floor(activeUpdate.preloaderPercent)}%`;
    }, 200);
}

function hidePreloader() {
    const pre = document.querySelector('.update-preloader');
    clearInterval(activeUpdate.preloaderInterval);
    activeUpdate.preloaderInterval = null;
    activeUpdate.preloaderPercent = 100;
    if (pre) {
        const percentEl = pre.querySelector('.update-preloader__percent');
        if (percentEl) percentEl.textContent = '100%';
        setTimeout(() => {
            document.querySelectorAll('.update-preloader').forEach(n => n.remove());
        }, 180);
    }
}

function bumpPreloaderProgress(minAdd = 1, cap = 95) {
    activeUpdate.preloaderPercent = Math.min(cap, activeUpdate.preloaderPercent + (Math.random() * 3 + minAdd));
    const el = document.querySelector('.update-preloader__percent');
    if (el) el.textContent = `${Math.floor(activeUpdate.preloaderPercent)}%`;
}

// === Убираем класс modal-confirm--active у всех ===
function removeAllModalConfirmActive() {
    document.querySelectorAll('.modal-confirm--active').forEach(el => el.classList.remove('modal-confirm--active'));
}

// === Сброс текста/включение кнопок ===
function resetButtons() {
    document.querySelectorAll('.btn-update').forEach(btn => {
        btn.disabled = false;
        btn.textContent = btn.dataset.originalText || 'Обновить';
    });
}

// === Очистка активного процесса (таймеры/fetch) ===
function cleanupActiveUpdate(forceAbort = false) {
    if (activeUpdate.startTimer) {
        clearTimeout(activeUpdate.startTimer);
        activeUpdate.startTimer = null;
    }
    if (activeUpdate.checkTimer) {
        clearInterval(activeUpdate.checkTimer);
        activeUpdate.checkTimer = null;
    }
    if (activeUpdate.preloaderInterval) {
        clearInterval(activeUpdate.preloaderInterval);
        activeUpdate.preloaderInterval = null;
    }
    if (activeUpdate.controller && forceAbort) {
        try { activeUpdate.controller.abort(); } catch {}
        activeUpdate.controller = null;
    }
    activeUpdate.attempts = 0;
}

// === Наблюдатель за появлением .update-model (если DOM другой скрипт вставит модалку) ===
function initMutationObserverForUpdateModel() {
    if (mutationObserver) return;
    mutationObserver = new MutationObserver(mutations => {
        for (const m of mutations) {
            if (m.addedNodes && m.addedNodes.length) {
                for (const node of m.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;
                    if (node.classList.contains && node.classList.contains('update-model')) {
                        hidePreloader();
                        cleanupActiveUpdate(true);
                        return;
                    }
                    if (node.querySelector && node.querySelector('.update-model')) {
                        hidePreloader();
                        cleanupActiveUpdate(true);
                        return;
                    }
                }
            }
        }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
}

// === Утилиты ===
function decodeUnicode(str = '') {
    return str.replace(/\\u[\dA-F]{4}/gi, m => String.fromCharCode(parseInt(m.replace(/\\u/g, ''), 16)));
}
function escapeHtml(s = '') {
    return s.replace(/[&<>"']/g, function (c) {
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
}

// Экспорт (для дебага)
window.UpdateManager = {
    startUpdateFlow,
    checkStatus,
    updatePageData,
    resetButtons,
    _internal: {
        showPreloader, hidePreloader, bumpPreloaderProgress, cleanupActiveUpdate
    }
};
