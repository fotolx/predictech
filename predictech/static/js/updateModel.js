// === Конфигурация ===
const UPDATE_CONFIG = {
    jsonUrl: 'https://predictech.5d4.ru/train_model/?house_id=2',
    checkInterval: 2000, // Проверять каждые 2 секунды
    maxAttempts: 30 // Максимум 1 минута
};

// === Прокси для обхода CORS ===
const PROXIES = [
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://proxy.cors.sh/',
    'https://cors-anywhere.herokuapp.com/'
];

// === Глобальные переменные ===
let checkInterval = null;
let checkAttempts = 0;
let modelTrainedShown = false; // <-- защита от повторных показов модалки

// === Инициализация ===
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        saveOriginalButtonTexts();
        initUpdateButtons();
    }, 300);
});

// === Инициализация кнопок ===
function initUpdateButtons() {
    const buttons = document.querySelectorAll('.btn-update');
    if (!buttons.length) {
        console.warn('Кнопки .btn-update не найдены, повтор через 500 мс');
        return setTimeout(initUpdateButtons, 500);
    }

    buttons.forEach(button => {
        button.addEventListener('click', handleUpdateClick);
    });
    console.log('Update buttons инициализированы');
}

// === Обработчик клика ===
function handleUpdateClick(e) {
    const button = e.currentTarget;
    button.disabled = true;
    button.textContent = 'Проверка...';
    modelTrainedShown = false; // сброс перед новой проверкой

    startStatusCheck();
}

// === Проверка статуса модели ===
function startStatusCheck() {
    checkAttempts = 0;
    clearInterval(checkInterval);

    checkInterval = setInterval(() => {
        checkAIStatus();
    }, UPDATE_CONFIG.checkInterval);
}

// === Запрос статуса ===
async function checkAIStatus() {
    try {
        checkAttempts++;
        const data = await loadDataViaProxy(`${UPDATE_CONFIG.jsonUrl}&t=${Date.now()}`);

        if (data.status === "Success" && !modelTrainedShown) {
            modelTrainedShown = true; // защита от повторов
            clearInterval(checkInterval);
            updatePageData(data);
            showSuccessModal(data);
            resetUpdateButtons();
        } else if (data.status === "Error") {
            clearInterval(checkInterval);
            showErrorModal(data);
            resetUpdateButtons();
        } else if (checkAttempts >= UPDATE_CONFIG.maxAttempts) {
            clearInterval(checkInterval);
            showTimeoutModal();
            resetUpdateButtons();
        }
        // если статус Pending — просто ждем
    } catch (err) {
        console.error('Ошибка при загрузке данных:', err);
        clearInterval(checkInterval);
        showErrorModal({ message: 'Ошибка загрузки данных' });
        resetUpdateButtons();
    }
}

// === Загрузка данных через прокси ===
async function loadDataViaProxy(targetUrl) {
    for (const proxy of PROXIES) {
        try {
            const response = await fetch(proxy + encodeURIComponent(targetUrl), { headers: { 'Accept': 'application/json' } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            return processServerData(text);
        } catch (err) {
            console.warn(`Прокси ${proxy} не сработал: ${err.message}`);
        }
    }
    throw new Error('Все прокси не сработали');
}

// === Парсинг ответа сервера ===
function processServerData(text) {
    const cleaned = text.trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (match) return JSON.parse(match[0]);
        throw new Error('Не удалось распарсить ответ');
    }
}

// === Обновление данных на странице ===
function updatePageData(data) {
    if (data.retrain_date) {
        const formatted = formatDate(data.retrain_date);
        document.querySelectorAll('.last-training-date').forEach(el => el.textContent = formatted);
    }

    if (data.test_accuracy !== undefined) {
        const percent = (data.test_accuracy * 100).toFixed(1) + '%';
        document.querySelectorAll('.model-accuracy-value').forEach(el => el.textContent = percent);
    }

    if (data.test_loss !== undefined) {
        const value = formatImprovementValue(data.test_loss);
        document.querySelectorAll('.accuracy-improvement-value').forEach(el => el.textContent = value);
    }

    console.log('Обновлены данные модели:', data);
}

// === Форматирование значений ===
function formatDate(str) {
    try {
        const year = str.substring(0, 4);
        const month = str.substring(4, 6);
        const day = str.substring(6, 8);
        const hour = str.substring(9, 11);
        const minute = str.substring(11, 13);
        return `${day}.${month}.${year}, ${hour}:${minute}`;
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
    createAndShowModal('success', decodeUnicode(data.message || 'Модель успешно обучена!'));
}

function showErrorModal(data) {
    createAndShowModal('error', data.message || 'Ошибка обучения');
}

function showTimeoutModal() {
    createAndShowModal('error', 'Превышено время ожидания ответа');
}

function createAndShowModal(type, message) {
    // удалить предыдущие модалки, если остались
    document.querySelectorAll('.update-model').forEach(m => m.remove());

    const isSuccess = type === 'success';
    const iconSrc = isSuccess ? '/img/icon/check-4.svg' : '/img/icon/error.svg';
    const modalHTML = `
        <div class="update-model">
            <div class="container-update-model">
                <div class="update-model__content">
                    <div class="close-update-model">
                        <img src="/img/icon/close-line.svg" alt="Закрыть">
                    </div>
                    <div class="circle-update ${isSuccess ? '' : 'error'}">
                        <img src="${iconSrc}" alt="">
                    </div>
                    <div class="update-model__title">${message}</div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.querySelector('.update-model:last-child');
    initModalEvents(modal);
    removeModalConfirmActive();
}

// === Утилиты ===
function decodeUnicode(str) {
    return str.replace(/\\u[\dA-F]{4}/gi, match =>
        String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16))
    );
}

function resetUpdateButtons() {
    document.querySelectorAll('.btn-update').forEach(button => {
        button.disabled = false;
        button.textContent = button.getAttribute('data-original-text') || 'Обновить';
    });
}

function removeModalConfirmActive() {
    const modalConfirm = document.querySelector('.modal-confirm.modal-confirm-open.modal-confirm--active');
    if (modalConfirm) modalConfirm.classList.remove('modal-confirm--active');
}

function saveOriginalButtonTexts() {
    document.querySelectorAll('.btn-update').forEach(button => {
        if (!button.getAttribute('data-original-text')) {
            button.setAttribute('data-original-text', button.textContent);
        }
    });
}

function initModalEvents(modal) {
    const closeBtn = modal.querySelector('.close-update-model');
    closeBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.addEventListener('keydown', function escClose(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escClose);
        }
    });
}

// === Экспорт для внешнего вызова ===
window.UpdateManager = {
    checkAIStatus,
    updatePageData,
    showSuccessModal,
    showErrorModal,
    resetUpdateButtons,
    removeModalConfirmActive
};


