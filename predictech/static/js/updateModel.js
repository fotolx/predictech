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
let preloaderRAF = null;
let preloaderStartTs = null;
let preloaderDuration = 22000;
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
    if (!buttons.length) return setTimeout(initUpdateButtons, 500);
    buttons.forEach(btn => {
        btn.removeEventListener('click', handleClick);
        btn.addEventListener('click', handleClick);
    });
}

// === Обработчик клика ===
function handleClick(e) {
    if (e && typeof e.preventDefault === 'function') {
        e.preventDefault();
        e.stopPropagation();
    }
    if (preloaderActive) return;

    removeModalConfirmActive();
    createPreloader();

    document.querySelectorAll('.btn-update').forEach(b => {
        b.disabled = true;
        b.dataset.originalText = b.dataset.originalText || b.textContent;
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

    if (!document.getElementById('update-preloader-styles')) {
        const style = document.createElement('style');
        style.id = 'update-preloader-styles';
        style.textContent = `
            .update-preloader { position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:9999999;}
            .update-preloader__inner {display:flex;flex-direction:column;align-items:center;gap:12px;padding:24px;border-radius:12px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,0.25);}
            .spinner {width:64px;height:64px;border-radius:50%;border:6px solid rgba(0,0,0,0.08);border-top-color:rgba(0,0,0,0.55);animation:spin 1s linear infinite;}
            @keyframes spin {to{transform:rotate(360deg)}}
            .percent {font-size:20px;font-weight:700;color:#111;}
            .fade-out {transition:opacity 260ms ease;opacity:0;pointer-events:none;}
        `;
        document.head.appendChild(style);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'update-preloader';
    wrapper.id = 'update-preloader';
    wrapper.innerHTML = `
        <div class="update-preloader__inner">
            <div class="spinner"></div>
            <div class="percent">0%</div>
        </div>
    `;
    document.body.appendChild(wrapper);

    function step(ts) {
        if (!preloaderStartTs) preloaderStartTs = ts;
        const elapsed = ts - preloaderStartTs;
        const progress = Math.min(1, elapsed / preloaderDuration);
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

    preloaderObserver = new MutationObserver(() => {
        if (document.querySelector('.update-model')) removePreloader(true);
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
    const wrapper = document.getElementById('update-preloader');
    if (setTo100) updatePreloaderPercent(100);
    if (wrapper) {
        wrapper.classList.add('fade-out');
        setTimeout(() => wrapper.remove(), 300);
    }
    cleanupPreloaderState();
}

function cleanupPreloaderState() {
    if (preloaderRAF) cancelAnimationFrame(preloaderRAF);
    preloaderRAF = null;
    if (preloaderObserver) preloaderObserver.disconnect();
    preloaderObserver = null;
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
    document.querySelectorAll('.update-model').forEach(m => m.remove());
    const icon = type === 'success' ? '/static/img/icon/check-4.svg' : '/static/img/icon/error.svg';
    const html = `
        <div class="update-model">
            <div class="container-update-model">
                <div class="update-model__content">
                    <div class="close-update-model"><img src="/static/img/icon/close-line.svg" width="16"></div>
                    <div class="circle-update"><img src="${icon}" width="28"></div>
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
    document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.remove(); });
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
        if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
    });
}

// === Удаление modal-confirm--active ===
function removeModalConfirmActive() {
    document.querySelectorAll('.modal-confirm--active').forEach(el => {
        el.classList.remove('modal-confirm--active');
        el.style.display = 'none';
    });
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
