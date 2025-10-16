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

// === Инициализация ===
document.addEventListener('DOMContentLoaded', () => {
    loadStoredData(); // Загружаем данные из localStorage при старте

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
    btn.disabled = true;
    btn.textContent = 'Ожидание запроса...';
    modelShown = false;

    console.log(`Запрос начнется через ${UPDATE_CONFIG.startDelay / 1000} секунд`);

    setTimeout(() => {
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

        const dataText = await response.text();
        const data = fastParseJSON(dataText);

        if (data.status === "Success" && !modelShown) {
            modelShown = true;
            clearInterval(checkTimer);
            updatePageData(data);
            saveDataToLocal(data); // 💾 Сохраняем данные в localStorage
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

// === Сохранение и загрузка из localStorage ===
function saveDataToLocal(data) {
    const stored = {
        retrain_date: data.retrain_date || null,
        test_accuracy: data.test_accuracy || null,
        test_loss: data.test_loss || null
    };
    localStorage.setItem('modelData', JSON.stringify(stored));
    console.log('✅ Данные сохранены в localStorage');
}

function loadStoredData() {
    const stored = localStorage.getItem('modelData');
    if (!stored) return;

    try {
        const data = JSON.parse(stored);
        updatePageData(data);
        console.log('📦 Загружены данные из localStorage');
    } catch (err) {
        console.error('Ошибка загрузки из localStorage:', err);
    }
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

// === Экспорт ===
window.UpdateManager = {
    checkStatus,
    updatePageData,
    showSuccessModal,
    showErrorModal,
    resetButtons
};
