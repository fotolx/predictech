// === Конфигурация ===
const UPDATE_CONFIG = {
    jsonUrl: 'https://predictech.5d4.ru/train_model/?house_id=2',
    startDelay: 5500, // ms перед первым запросом
    checkInterval: 2000, // ms между проверками
    maxAttempts: 30,
    preloaderDuration: 23500 // длительность "анимации" прелоадера (ms)
};

// === Состояние ===
let checkTimer = null;
let attempts = 0;
let modelShown = false;

let preloaderActive = false;
let preloaderRAF = null;
let preloaderStartTs = null;
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
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
    } else {
        onReady();
    }
})();

function onReady() {
    restoreFromLocalStorage();
    saveOriginalButtonTexts();
    initUpdateButtons(); // назначает делегированный слушатель кликов
    console.log('[UpdateManager] ready');
}

// === Назначение обработчиков кнопок (делегация) ===
function initUpdateButtons() {
    // Используем делегацию — удобно, если кнопки динамические
    document.removeEventListener('click', delegatedClickHandler);
    document.addEventListener('click', delegatedClickHandler);
}

function delegatedClickHandler(e) {
    const btn = e.target.closest && e.target.closest('.btn-update');
    if (!btn) return;
    handleClick(e, btn);
}

// === Обработчик клика ===
function handleClick(event, btnElement) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
        event.stopPropagation();
    }

    if (preloaderActive) {
        console.log('[UpdateManager] preloader уже активен — игнорируем клик');
        return;
    }

    // Закрываем модальное подтверждение (если есть) и показываем прелоадер
    removeModalConfirmActive();
    createPreloader();

    // Блокируем кнопки и сохраняем оригинальный текст
    document.querySelectorAll('.btn-update').forEach(b => {
        b.disabled = true;
        if (!b.dataset.originalText) b.dataset.originalText = b.textContent.trim();
        b.textContent = 'Ожидание запроса...';
    });

    modelShown = false;
    attempts = 0;

    console.log(`[UpdateManager] старт через ${UPDATE_CONFIG.startDelay} ms`);

    setTimeout(() => {
        document.querySelectorAll('.btn-update').forEach(b => b.textContent = 'Проверка...');
        startCheck();
    }, UPDATE_CONFIG.startDelay);
}

// === Запуск проверки ===
function startCheck() {
    clearInterval(checkTimer);
    attempts = 0;
    checkStatus(); // первый запуск сразу
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
            showSuccessModal(data);
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
            // пока ждем — ничего
            console.log('[UpdateManager] ответ: ожидание, модель ещё не готова');
        }
    } catch (err) {
        console.error('[UpdateManager] Ошибка запроса:', err);
        clearInterval(checkTimer);
        showErrorModal({ message: 'Ошибка загрузки данных' });
        resetButtons();
    }
}

// === Парсер JSON с защитой от "грязного" ответа ===
function fastParseJSON(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
            try {
                return JSON.parse(text.slice(start, end + 1));
            } catch { }
        }
        throw new Error('Не удалось распарсить ответ сервера');
    }
}

// === Обновление данных на странице ===
function updatePageData(data) {
    if (!data) return;
    if (data.retrain_date) {
        const formatted = formatDateReadable(data.retrain_date); // 15.01.2025, 03:20
        const attrVal = formatDateAttr(data.retrain_date);       // 20250115_0320

        document.querySelectorAll('.last-training-date').forEach(el => {
            el.textContent = formatted;
            el.setAttribute('datetime', attrVal);
        });
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
    if (data.retrain_date) {
        const formatted = formatDateReadable(data.retrain_date);
        localStorage.setItem(STORAGE_KEYS.date, formatted);
    }
    if (data.test_accuracy !== undefined)
        localStorage.setItem(STORAGE_KEYS.accuracy, (data.test_accuracy * 100).toFixed(1) + '%');
    if (data.test_loss !== undefined)
        localStorage.setItem(STORAGE_KEYS.improvement, formatImprovementValue(data.test_loss));
}

function restoreFromLocalStorage() {
    const d = localStorage.getItem(STORAGE_KEYS.date);
    const a = localStorage.getItem(STORAGE_KEYS.accuracy);
    const i = localStorage.getItem(STORAGE_KEYS.improvement);
    if (d) document.querySelectorAll('.last-training-date').forEach(el => el.textContent = d);
    if (a) document.querySelectorAll('.model-accuracy-value').forEach(el => el.textContent = a);
    if (i) document.querySelectorAll('.accuracy-improvement-value').forEach(el => el.textContent = i);
}

// === Форматирование даты ===
function formatDateReadable(str) {
    const d = parseDate(str);
    if (!d) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}.${mm}.${yyyy}, ${hh}:${min}`;
}

function formatDateAttr(str) {
    const d = parseDate(str);
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}${mm}${dd}_${hh}${min}`;
}

function parseDate(str) {
    if (!str) return null;
    let s = String(str).trim();
    const m = s.match(/^(\d{4})(\d{2})(\d{2})[_T]?(\d{2}):?(\d{2})?$/);
    if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5] || '00'}:00`);
    const d = new Date(s);
    return isNaN(d) ? null : d;
}

// === Прочие утилиты ===
function formatImprovementValue(v) {
    const num = Math.abs(Number(v)).toFixed(2);
    return `${Number(v) >= 0 ? '+' : '-'}${num}%`;
}

// === Прелоадер ===
function createPreloader() {
    if (preloaderActive) return;
    preloaderActive = true;
    preloaderPercent = 0;
    preloaderStartTs = null;

    // удаляем старый (если остался)
    const old = document.getElementById('update-preloader');
    if (old) old.remove();

    const wrapper = document.createElement('div');
    wrapper.className = 'update-preloader';
    wrapper.id = 'update-preloader';
    wrapper.innerHTML = `
        <div class="update-preloader__inner" role="status" aria-live="polite">
            <div class="spinner" aria-hidden="true"></div>
            <div class="percent">0%</div>
        </div>
    `;
    document.body.appendChild(wrapper);

    // Небольшой fallback: если внешние CSS не применились (display: none и т.п.), 
    // ставим минимальные inline-стили, чтобы элемент был видим — это не заменяет ваш CSS.
    requestAnimationFrame(() => {
        const cs = getComputedStyle(wrapper);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') {
            // минимальный, безопасный набор inline-стилей для видимости
            wrapper.style.position = 'fixed';
            wrapper.style.inset = '0';
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.justifyContent = 'center';
            wrapper.style.background = 'rgba(0,0,0,0.45)';
            wrapper.style.zIndex = '9999999';
        }
    });

    // Анимация процентов на requestAnimationFrame
    function step(ts) {
        if (!preloaderStartTs) preloaderStartTs = ts;
        const elapsed = ts - preloaderStartTs;
        const progress = Math.min(1, elapsed / UPDATE_CONFIG.preloaderDuration);
        preloaderPercent = Math.floor(progress * 100);
        updatePreloaderPercent(preloaderPercent);
        if (progress < 1 && preloaderActive) {
            preloaderRAF = requestAnimationFrame(step);
        } else {
            updatePreloaderPercent(100);
            console.log('[Preloader] 100%');
        }
    }
    preloaderRAF = requestAnimationFrame(step);

    // Наблюдатель: если появится модалка .update-model — автоматически закрываем прелоадер
    preloaderObserver = new MutationObserver(mutations => {
        if (document.querySelector('.update-model')) {
            removePreloader(true);
        }
    });
    preloaderObserver.observe(document.body, { childList: true, subtree: true });
}

function updatePreloaderPercent(v) {
    const el = document.querySelector('#update-preloader .percent');
    if (el) el.textContent = `${Math.max(0, Math.min(100, v))}%`;
}

function removePreloader(setTo100 = false) {
    if (!preloaderActive) return;
    preloaderActive = false;

    if (setTo100) updatePreloaderPercent(100);

    const wrapper = document.getElementById('update-preloader');
    if (wrapper) {
        wrapper.classList.add('fade-out'); // предполагается, что у вас в CSS есть .fade-out
        // Убираем через короткую паузу, даём время анимации
        setTimeout(() => {
            if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
        }, 300);
    }
    cleanupPreloaderState();
}

function cleanupPreloaderState() {
    if (preloaderRAF) cancelAnimationFrame(preloaderRAF);
    preloaderRAF = null;
    if (preloaderObserver) {
        preloaderObserver.disconnect();
        preloaderObserver = null;
    }
    preloaderPercent = 0;
    preloaderStartTs = null;
}

// === Модалки ===
function showSuccessModal(data) {
    createModal('success', decodeUnicode(data?.message || 'Модель успешно обучена!'));
}
function showErrorModal(data) {
    createModal('error', data?.message || 'Ошибка обучения');
}
function showTimeoutModal() {
    createModal('error', 'Превышено время ожидания ответа');
}

function createModal(type, message) {
    // Удаляем старые
    document.querySelectorAll('.update-model').forEach(m => m.remove());

    const icon = type === 'success' ? '/static/img/icon/check-4.svg' : '/static/img/icon/error.svg';
    const html = `
        <div class="update-model">
            <div class="container-update-model">
                <div class="update-model__content">
                    <div class="close-update-model" role="button" title="Закрыть"><img src="/static/img/icon/close-line.svg" width="16" alt="Закрыть"></div>
                    <div class="circle-update"><img src="${icon}" width="28" alt=""></div>
                    <div class="update-model__title">${message}</div>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const modal = document.querySelector('.update-model:last-child');
    initModalEvents(modal);
    removePreloader(true);
    removeModalConfirmActive();
}

function decodeUnicode(str) {
    return str ? str.replace(/\\u[\dA-F]{4}/gi, m => String.fromCharCode(parseInt(m.replace(/\\u/g, ''), 16))) : '';
}

function initModalEvents(modal) {
    if (!modal) return;
    const close = modal.querySelector('.close-update-model');
    if (close) close.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
            document.removeEventListener('keydown', escHandler);
        }
    });
}

// === Кнопки — сброс ===
function resetButtons() {
    document.querySelectorAll('.btn-update').forEach(btn => {
        btn.disabled = false;
        btn.textContent = btn.dataset.originalText || 'Обновить';
    });
    removePreloader(false);
}

function saveOriginalButtonTexts() {
    document.querySelectorAll('.btn-update').forEach(btn => {
        if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent.trim();
    });
}

// === Удаление modal-confirm--active ===
function removeModalConfirmActive() {
    document.querySelectorAll('.modal-confirm--active').forEach(el => {
        el.classList.remove('modal-confirm--active');
    });
}

// === Экспорт для дебага / тестов ===
window.UpdateManager = {
    checkStatus,
    updatePageData,
    showSuccessModal,
    showErrorModal,
    resetButtons,
    createPreloader,
    removePreloader
};








