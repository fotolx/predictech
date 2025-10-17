// === Конфигурация ===
const UPDATE_CONFIG = {
    jsonUrl: 'https://predictech.5d4.ru/train_model/?house_id=2',
    startDelay: 5500,
    checkInterval: 2000,
    maxAttempts: 30
};

// === Глобальные переменные ===
let checkTimer = null;
let attempts = 0;
let modelShown = false;

// === LocalStorage ключи ===
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
    if (!buttons.length) return setTimeout(initUpdateButtons, 500);

    buttons.forEach(btn => btn.addEventListener('click', handleClick));
}

// === Обработчик клика ===
function handleClick(e) {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Ожидание запроса...';
    modelShown = false;

    removeModalConfirmActive();
    showPreloader();

    console.log(`Запрос начнется через ${UPDATE_CONFIG.startDelay / 1000} секунд`);

    setTimeout(() => {
        btn.textContent = 'Проверка...';
        startCheck();
    }, UPDATE_CONFIG.startDelay);
}

// === Прелоадер ===
function showPreloader() {
    if (document.querySelector('.update-preloader')) return;

    const preloaderHTML = `
        <div class="update-preloader">
            <div class="preloader-spinner"></div>
            <div class="preloader-percent">0%</div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', preloaderHTML);

    const preloader = document.querySelector('.update-preloader');
    const percentEl = preloader.querySelector('.preloader-percent');

    let percent = 0;
    const timer = setInterval(() => {
        percent = Math.min(100, percent + Math.random() * 3);
        percentEl.textContent = `${Math.floor(percent)}%`;
        if (percent >= 100 || document.querySelector('.update-model')) {
            hidePreloader();
            clearInterval(timer);
        }
    }, 80);

    // Если вдруг update-model появился раньше 100%
    const observer = new MutationObserver(() => {
        if (document.querySelector('.update-model')) {
            hidePreloader();
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

function hidePreloader() {
    const preloader = document.querySelector('.update-preloader');
    if (preloader) {
        preloader.classList.add('fade-out');
        setTimeout(() => preloader.remove(), 400);
    }
}

// === Прелоадер стили ===
const style = document.createElement('style');
style.textContent = `
.update-preloader {
    position: fixed;
    inset: 0;
    background: rgba(255,255,255,0.9);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    transition: opacity 0.3s ease;
}
.update-preloader.fade-out {
    opacity: 0;
}
.preloader-spinner {
    width: 60px;
    height: 60px;
    border: 5px solid #dcdcdc;
    border-top-color: #3498db;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 10px;
}
.preloader-percent {
    font-size: 18px;
    color: #333;
    font-weight: 600;
}
@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}`;
document.head.appendChild(style);

// === Старт проверки ===
function startCheck() {
    attempts = 0;
    clearInterval(checkTimer);
    checkStatus();
    checkTimer = setInterval(checkStatus, UPDATE_CONFIG.checkInterval);
}

// === Проверка статуса ===
async function checkStatus() {
    attempts++;

    try {
        const response = await fetch(`${UPDATE_CONFIG.jsonUrl}&t=${Date.now()}`, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const text = await response.text();
        const data = fastParseJSON(text);

        if (data.status === "Success" && !modelShown) {
            modelShown = true;
            clearInterval(checkTimer);
            updatePageData(data);
            saveToLocalStorage(data);
            showSuccessModal(data);
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

// === Быстрый JSON-парсер ===
function fastParseJSON(text) {
    try {
        return JSON.parse(text);
    } catch {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
            return JSON.parse(text.slice(start, end + 1));
        }
        throw new Error('Ошибка парсинга JSON');
    }
}

// === Обновление данных в DOM ===
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
}

// === LocalStorage ===
function saveToLocalStorage(data) {
    if (data.retrain_date) localStorage.setItem(STORAGE_KEYS.date, formatDate(data.retrain_date));
    if (data.test_accuracy !== undefined)
        localStorage.setItem(STORAGE_KEYS.accuracy, (data.test_accuracy * 100).toFixed(1) + '%');
    if (data.test_loss !== undefined)
        localStorage.setItem(STORAGE_KEYS.improvement, formatImprovementValue(data.test_loss));
}

function restoreFromLocalStorage() {
    const date = localStorage.getItem(STORAGE_KEYS.date);
    const acc = localStorage.getItem(STORAGE_KEYS.accuracy);
    const imp = localStorage.getItem(STORAGE_KEYS.improvement);

    if (date) document.querySelectorAll('.last-training-date').forEach(el => (el.textContent = date));
    if (acc) document.querySelectorAll('.model-accuracy-value').forEach(el => (el.textContent = acc));
    if (imp) document.querySelectorAll('.accuracy-improvement-value').forEach(el => (el.textContent = imp));
}

// === Вспомогательные ===
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
    document.querySelectorAll('.update-model').forEach(m => m.remove());

    const isSuccess = type === 'success';
    const icon = isSuccess ? '/static/img/icon/check-4.svg' : '/static/img/icon/error.svg';
    const html = `
        <div class="update-model">
            <div class="container-update-model">
                <div class="update-model__content">
                    <div class="close-update-model"><img src="/static/img/icon/close-line.svg" alt="Закрыть"></div>
                    <div class="circle-update ${isSuccess ? '' : 'error'}"><img src="${icon}" alt=""></div>
                    <div class="update-model__title">${message}</div>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    const modal = document.querySelector('.update-model:last-child');
    initModalEvents(modal);
    hidePreloader(); // прелоадер исчезает при появлении модалки
}

function decodeUnicode(str) {
    return str.replace(/\\u[\dA-F]{4}/gi, m => String.fromCharCode(parseInt(m.replace(/\\u/g, ''), 16)));
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
    const modal = document.querySelector('.modal-confirm.modal-confirm-open.modal-confirm--active');
    if (modal) modal.classList.remove('modal-confirm--active');
}

function initModalEvents(modal) {
    modal.querySelector('.close-update-model').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.addEventListener('keydown', function escClose(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escClose);
        }
    });
}
