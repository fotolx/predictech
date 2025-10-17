// === Конфигурация ===
const UPDATE_CONFIG = {
    jsonUrl: 'https://predictech.5d4.ru/train_model/?house_id=2',
    startDelay: 5500, // ms
    checkInterval: 2000, // ms
    maxAttempts: 30
};

// === Состояние ===
let checkTimer = null;
let attempts = 0;
let modelShown = false;

let preloaderActive = false;
let preloaderInterval = null;
let preloaderPercent = 0;
let preloaderObserver = null;

// === Ключи localStorage ===
const STORAGE_KEYS = {
    date: 'lastTrainingDate',
    accuracy: 'modelAccuracyValue',
    improvement: 'accuracyImprovementValue'
};

// === Инициализация ===
(function init() {
    document.addEventListener('DOMContentLoaded', () => {
        restoreFromLocalStorage();
        saveOriginalButtonTexts();
        initUpdateButtons();
        console.log('[UpdateManager] ready');
    });
})();

// === Кнопки обновления ===
function initUpdateButtons() {
    const buttons = document.querySelectorAll('.btn-update');
    if (!buttons.length) {
        // если ещё нет кнопок на странице — попробуем позже (мягкий retry)
        return setTimeout(initUpdateButtons, 500);
    }
    buttons.forEach(btn => {
        // делаем делегирование на click, защищаем от дублирующих слушателей
        btn.removeEventListener('click', handleClick);
        btn.addEventListener('click', handleClick);
    });
}

// === Обработчик клика ===
function handleClick(e) {
    // предотвращаем отправку формы, если кнопка внутри <form>
    if (e && typeof e.preventDefault === 'function') {
        e.preventDefault();
        e.stopPropagation();
    }

    if (preloaderActive) {
        console.warn('[UpdateManager] preloader already active — click ignored');
        return;
    }

    // сразу убираем любые открытые подтверждающие модалки
    removeModalConfirmActive();

    // создаём прелоадер поверх всего — сразу же
    createPreloader();

    // блокируем все кнопки и изменяем текст
    document.querySelectorAll('.btn-update').forEach(b => {
        b.disabled = true;
        b.dataset.originalText = b.dataset.originalText || b.textContent;
        b.textContent = 'Ожидание запроса...';
    });

    modelShown = false;
    attempts = 0;

    console.log(`[UpdateManager] старт через ${UPDATE_CONFIG.startDelay} ms`);

    // через задержку начинаем проверку
    setTimeout(() => {
        document.querySelectorAll('.btn-update').forEach(b => b.textContent = 'Проверка...');
        startCheck();
    }, UPDATE_CONFIG.startDelay);
}

// === Запуск проверки ===
function startCheck() {
    clearInterval(checkTimer);
    attempts = 0;
    // первый вызов сразу (не ждать интервала)
    checkStatus();
    checkTimer = setInterval(checkStatus, UPDATE_CONFIG.checkInterval);
}

// === Запрос к серверу ===
async function checkStatus() {
    attempts++;
    console.log(`[UpdateManager] попытка ${attempts}/${UPDATE_CONFIG.maxAttempts}`);

    try {
        const res = await fetch(`${UPDATE_CONFIG.jsonUrl}&t=${Date.now()}`, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const text = await res.text();
        const data = fastParseJSON(text);

        if (data && data.status === "Success" && !modelShown) {
            modelShown = true;
            clearInterval(checkTimer);
            updatePageData(data);
            saveToLocalStorage(data);
            showSuccessModal(data); // showSuccessModal уберёт прелоадер
            resetButtons();
        } else if (data && data.status === "Error") {
            clearInterval(checkTimer);
            showErrorModal(data);
            resetButtons();
        } else if (attempts >= UPDATE_CONFIG.maxAttempts) {
            clearInterval(checkTimer);
            showTimeoutModal();
            resetButtons();
        } else {
            // ещё ждём — оставляем прелоадер
        }
    } catch (err) {
        console.error('[UpdateManager] Ошибка запроса:', err);
        clearInterval(checkTimer);
        showErrorModal({ message: 'Ошибка загрузки данных' });
        resetButtons();
    }
}

// === Парсер JSON ===
function fastParseJSON(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        // попытка вытащить первый JSON-объект в тексте
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
            try {
                return JSON.parse(text.slice(start, end + 1));
            } catch (e2) { /* fallthrough */ }
        }
        throw new Error('Не удалось распарсить ответ сервера');
    }
}

// === Обновление страницы данными ===
function updatePageData(data) {
    if (!data) return;
    if (data.retrain_date) {
        const formatted = formatDate(data.retrain_date);
        document.querySelectorAll('.last-training-date').forEach(el => el.textContent = formatted);
    }
    if (data.test_accuracy !== undefined) {
        const percent = (data.test_accuracy * 100).toFixed(1) + '%';
        document.querySelectorAll('.model-accuracy-value').forEach(el => el.textContent = percent);
    }
    if (data.test_loss !== undefined) {
        const val = formatImprovementValue(data.test_loss);
        document.querySelectorAll('.accuracy-improvement-value').forEach(el => el.textContent = val);
    }
    console.log('[UpdateManager] page data updated', data);
}

// === LocalStorage ===
function saveToLocalStorage(data) {
    if (!data) return;
    if (data.retrain_date) localStorage.setItem(STORAGE_KEYS.date, formatDate(data.retrain_date));
    if (data.test_accuracy !== undefined) localStorage.setItem(STORAGE_KEYS.accuracy, (data.test_accuracy * 100).toFixed(1) + '%');
    if (data.test_loss !== undefined) localStorage.setItem(STORAGE_KEYS.improvement, formatImprovementValue(data.test_loss));
}

function restoreFromLocalStorage() {
    const d = localStorage.getItem(STORAGE_KEYS.date);
    const a = localStorage.getItem(STORAGE_KEYS.accuracy);
    const i = localStorage.getItem(STORAGE_KEYS.improvement);
    if (d) document.querySelectorAll('.last-training-date').forEach(el => el.textContent = d);
    if (a) document.querySelectorAll('.model-accuracy-value').forEach(el => el.textContent = a);
    if (i) document.querySelectorAll('.accuracy-improvement-value').forEach(el => el.textContent = i);
}

// === Утилиты форматирования ===
function formatDate(str) {
    // Попробуем распарсить ISO-like или вернуть как есть
    if (!str) return '';
    // Если формат типа 20250115T0320 или 2025-01-15T03:20:00
    const iso = str.replace(/^(\d{4})(\d{2})(\d{2})T?(\d{2}):?(\d{2}).*$/, '$1-$2-$3T$4:$5:00');
    try {
        const d = new Date(iso);
        if (!isNaN(d)) {
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yyyy = d.getFullYear();
            const hh = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            return `${dd}.${mm}.${yyyy}, ${hh}:${min}`;
        }
    } catch { /* fallthrough */ }
    return str;
}

function formatImprovementValue(v) {
    const num = Math.abs(Number(v)).toFixed(2);
    return `${Number(v) >= 0 ? '+' : '-'}${num}%`;
}

// === Прелоадер ===
function createPreloader() {
    if (preloaderActive) return;
    preloaderActive = true;
    preloaderPercent = 0;

    // стили прелоадера (вставляем однократно)
    if (!document.getElementById('update-preloader-styles')) {
        const style = document.createElement('style');
        style.id = 'update-preloader-styles';
        style.textContent = `
            .update-preloader { position: fixed; inset: 0; display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:9999999;}
            .update-preloader__inner { display:flex;flex-direction:column;align-items:center;gap:12px;padding:18px 24px;border-radius:12px;background:rgba(255,255,255,0.95);box-shadow:0 10px 30px rgba(0,0,0,0.25);min-width:160px;min-height:120px;}
            .update-preloader .spinner { width:64px;height:64px;border-radius:50%;border:6px solid rgba(0,0,0,0.08);border-top-color:rgba(0,0,0,0.55);animation:upreloader-spin 1s linear infinite;box-sizing:border-box;}
            @keyframes upreloader-spin{to{transform:rotate(360deg)}}
            .update-preloader .percent { font-size:20px;font-weight:700;color:#111; }
            .update-preloader.fade-out { transition:opacity 260ms ease; opacity:0; pointer-events:none; }
        `;
        document.head.appendChild(style);
    }

    // Убираем видимые modal-confirm (если они перекрывают)
    document.querySelectorAll('.modal-confirm--active').forEach(m => {
        // если нужно полностью скрыть — ставим display none для более агрессивного эффекта
        m.classList.remove('modal-confirm--active');
        m.style.display = 'none';
    });

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

    // Интервал прогресса
    preloaderInterval = setInterval(() => {
        if (preloaderPercent < 90) {
            preloaderPercent += Math.floor(Math.random() * 4) + 1;
        } else if (preloaderPercent < 98) {
            preloaderPercent += 1;
        } else {
            preloaderPercent = Math.min(preloaderPercent + 0, 99);
        }
        preloaderPercent = Math.min(preloaderPercent, 99);
        updatePreloaderPercent(preloaderPercent);
    }, 120);

    // Наблюдатель: если в DOM появится .update-model (модалка успеха/ошибки), убираем прелоадер
    preloaderObserver = new MutationObserver((mutations) => {
        if (document.querySelector('.update-model')) {
            removePreloader(true);
        }
    });
    preloaderObserver.observe(document.body, { childList: true, subtree: true });
}

function updatePreloaderPercent(v) {
    const el = document.querySelector('#update-preloader .percent');
    if (el) el.textContent = `${Math.max(0, Math.min(100, Math.floor(v)))}%`;
}

function removePreloader(setTo100 = false) {
    if (!preloaderActive) return;
    preloaderActive = false;

    // если нет элемента — просто почистим интервалы
    const wrapper = document.getElementById('update-preloader');
    if (!wrapper) {
        cleanupPreloaderState();
        return;
    }

    if (setTo100) updatePreloaderPercent(100);

    wrapper.classList.add('fade-out');
    cleanupPreloaderState();

    setTimeout(() => {
        if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    }, 300);
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

// === Модалки уведомлений (создаём простую .update-model) ===
function showSuccessModal(data) {
    createModal('success', decodeUnicode((data && data.message) ? data.message : 'Модель успешно обучена!'));
}
function showErrorModal(data) {
    createModal('error', (data && data.message) ? data.message : 'Ошибка обучения');
}
function showTimeoutModal() {
    createModal('error', 'Превышено время ожидания ответа');
}

function createModal(type, message) {
    // удалим старые
    document.querySelectorAll('.update-model').forEach(m => m.remove());

    const isSuccess = type === 'success';
    const icon = isSuccess ? '/static/img/icon/check-4.svg' : '/static/img/icon/error.svg';
    const html = `
        <div class="update-model" role="dialog" aria-modal="true">
            <div class="container-update-model">
                <div class="update-model__content" style="padding:18px;background:#fff;border-radius:10px;min-width:260px;box-shadow:0 10px 30px rgba(0,0,0,0.15);display:flex;flex-direction:column;gap:12px;align-items:center;">
                    <div class="close-update-model" title="Закрыть" style="align-self:flex-end;cursor:pointer;"><img src="/static/img/icon/close-line.svg" alt="Закрыть" width="16"></div>
                    <div class="circle-update" style="width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;"><img src="${icon}" alt="" width="28"></div>
                    <div class="update-model__title" style="text-align:center;font-weight:700;">${message}</div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const modal = document.querySelector('.update-model:last-child');
    initModalEvents(modal);

    // прелоадер убираем, если он есть
    removePreloader(true);

    // дополнительно убираем modal-confirm--active если осталось
    removeModalConfirmActive();
}

function decodeUnicode(str) {
    if (!str) return '';
    return str.replace(/\\u[\dA-F]{4}/gi, m => String.fromCharCode(parseInt(m.replace(/\\u/g, ''), 16)));
}

function initModalEvents(modal) {
    if (!modal) return;
    const close = modal.querySelector('.close-update-model');
    if (close) close.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    function escClose(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escClose);
        }
    }
    document.addEventListener('keydown', escClose);
}

// === Кнопки — сброс состояния ===
function resetButtons() {
    document.querySelectorAll('.btn-update').forEach(btn => {
        btn.disabled = false;
        btn.textContent = btn.dataset.originalText || 'Обновить';
    });
    // на всякий случай убираем прелоадер
    removePreloader(false);
}

function saveOriginalButtonTexts() {
    document.querySelectorAll('.btn-update').forEach(btn => {
        if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
    });
}

// === Корректное удаление modal-confirm--active ===
function removeModalConfirmActive() {
    // Найдём все элементы с этим классом (на странице может быть 1 или несколько)
    const activeEls = document.querySelectorAll('.modal-confirm--active');
    activeEls.forEach(el => {
        el.classList.remove('modal-confirm--active');
        // на всякий случай скроем визуально
        el.style.display = 'none';
    });
}

// === Экспорт (если нужно внешне вызывать) ===
window.UpdateManager = {
    checkStatus,
    updatePageData,
    showSuccessModal,
    showErrorModal,
    resetButtons,
    createPreloader,
    removePreloader
};
