async function loadAlerts() {
    const houseAlertsUrl = 'https://predictech.5d4.ru/house_alerts/';
    const alertsUrl = 'https://predictech.5d4.ru/alerts/';
    
    try {
        // Загружаем оба источника данных
        const [houseAlertsData, alertsData] = await Promise.all([
            loadData(houseAlertsUrl),
            loadData(alertsUrl)
        ]);
        
        // Обрабатываем и отображаем данные
        const processedHouseAlerts = processServerData(houseAlertsData);
        const processedAlerts = processServerData(alertsData);
        
        renderHouseAlerts(processedHouseAlerts);
        renderAlerts(processedAlerts);
        
    } catch (error) {
        console.log('Основной метод не сработал, пробуем альтернативные...');
        await tryAlternativeMethods();
    }
}

// Универсальная функция загрузки данных
async function loadData(url) {
    try {
        // Сначала пробуем простой fetch
        let response = await fetch(url, {
            method: 'GET',
            mode: 'no-cors'
        });
        
        const text = await response.text();
        return text;
        
    } catch (error) {
        console.log(`Прямая загрузка с ${url} не сработала:`, error.message);
        throw error;
    }
}

// Функция для обработки данных с сервера (без изменений)
function processServerData(text) {
    let cleanedText = text.trim();
    
    try {
        return JSON.parse(cleanedText);
    } catch (error1) {
        console.log('Прямой JSON парсинг не сработал:', error1.message);
        
        try {
            if (cleanedText.startsWith('[') && cleanedText.endsWith(']')) {
                try {
                    return eval(`(${cleanedText})`);
                } catch (evalError) {
                    cleanedText = cleanedText.replace(/'/g, '"');
                    cleanedText = cleanedText.replace(/(\w+):/g, '"$1":');
                    return JSON.parse(cleanedText);
                }
            }
            
            const jsonMatch = cleanedText.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            
            throw new Error('Не удалось распарсить данные');
            
        } catch (error2) {
            console.log('Альтернативные методы парсинга не сработали:', error2.message);
            throw new Error(`Не удалось обработать данные: ${error2.message}`);
        }
    }
}

// Альтернативные методы загрузки для обоих источников
async function tryAlternativeMethods() {
    const urls = [
        'https://predictech.5d4.ru/house_alerts/',
        'https://predictech.5d4.ru/alerts/'
    ];
    
    for (const url of urls) {
        try {
            const data = await loadViaProxy(url);
            if (url.includes('house_alerts')) {
                renderHouseAlerts(data);
            } else {
                renderAlerts(data);
            }
        } catch (error) {
            console.log(`Не удалось загрузить данные с ${url}:`, error.message);
        }
    }
}

// Модифицированная функция для работы с прокси
async function loadViaProxy(targetUrl) {
    const proxies = [
        'https://cors-anywhere.herokuapp.com/',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://corsproxy.io/?',
        'https://proxy.cors.sh/'
    ];
    
    for (const proxy of proxies) {
        try {
            const response = await fetch(proxy + targetUrl, {
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const text = await response.text();
            return processServerData(text);
            
        } catch (error) {
            console.log(`Proxy ${proxy} не сработал:`, error.message);
            continue;
        }
    }
    
    throw new Error('Все proxy не сработали');
}

// Функция для отображения house_alerts (старая логика)
function renderHouseAlerts(data) {
    const container = document.getElementById('alerts-container');
    if (!container) {
        console.error('Контейнер для house alerts не найден');
        return;
    }
    
    try {
        if (!Array.isArray(data)) {
            if (data && typeof data === 'object') {
                data = data.data || data.results || data.items || [data];
            } else {
                data = [data];
            }
        }
        
        if (!Array.isArray(data)) {
            throw new Error('Данные не являются массивом');
        }

        container.innerHTML = '';

        const validItems = data.filter(item => {
            const isValid = item && item.fields && item.fields.house_id;
            if (!isValid) {
                console.warn('Пропущен элемент с некорректной структурой:', item);
            }
            return isValid;
        });

        const cardsHTML = validItems.map(item => createStateCard(item)).join('');
        container.innerHTML = cardsHTML;
        
        checkForAccidentAlerts();
        
    } catch (error) {
        showError(`Ошибка отображения house alerts: ${error.message}`);
    }
}

// НОВАЯ функция для отображения alerts в разметку уведомлений
function renderAlerts(data) {
    const container = document.getElementById('notifications-container');
    if (!container) {
        console.error('Контейнер для notifications не найден');
        return;
    }
    
    try {
        // Нормализуем данные к массиву
        if (!Array.isArray(data)) {
            if (data && typeof data === 'object') {
                data = data.data || data.results || data.items || [data];
            } else {
                data = [data];
            }
        }
        
        if (!Array.isArray(data)) {
            throw new Error('Данные не являются массивом');
        }

        container.innerHTML = '';

        const validItems = data.filter(item => {
            const isValid = item && item.fields && item.fields.header;
            if (!isValid) {
                console.warn('Пропущен элемент alerts с некорректной структурой:', item);
            }
            return isValid;
        });

        const notificationsHTML = validItems.map(item => createNotificationCard(item)).join('');
        container.innerHTML = notificationsHTML;
        
    } catch (error) {
        showError(`Ошибка отображения notifications: ${error.message}`);
    }
}

// НОВАЯ функция для создания карточек уведомлений
function createNotificationCard(item) {
    const fields = item.fields;
    const statusClass = fields.status === 'critical' ? 'notification-event--critical' : 'notification-event--warning';
    const priorityText = getPriorityText(fields.priority);
    const iconSrc = fields.status === 'critical' ? 'img/icon/type-1.svg' : 'img/icon/type-3.svg';
    const eyeIconSrc = fields.status === 'critical' ? 'img/icon/eye.svg' : 'img/icon/eye-2.svg';
    
    return `
        <article class="notification-event ${statusClass}">
            <div class="notification-event-type">
                <img src="${iconSrc}" alt="тип риска" class="notification-event-type__img">
            </div>
            <div class="notification-event__content">
                <div class="notification-event__header">
                    <time class="notification-event__time">${formatDateTime(fields.date_time)}</time>
                    <div class="notification-event__inner">
                        <a href="../../situation.html" class="group-notification notification-event-eye">
                            <img src="${eyeIconSrc}" alt="проверить" class="notification-event-eye__img">
                        </a>
                        ${fields.status === 'critical' ? `
                        <div class="group-notification notification-event-key key-notification">
                            <img src="img/icon/key.svg" alt="Настройки" class="notification-event-key__img">
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="notification-event__title">${fields.header}</div>
                <div class="notification-event__address">${fields.description}</div>
                <div class="notification-event__desc">${fields.adress}</div>
                <div class="notification-event__priority">${priorityText}</div>
            </div>
        </article>
    `;
}

// Вспомогательная функция для получения текста приоритета
function getPriorityText(priority) {
    switch (priority) {
        case 'high': return 'Авария';
        case 'medium': return 'Отклонение';
        case 'low': return 'Низкий приоритет';
        default: return 'Приоритет не указан';
    }
}

// Остальные функции без изменений
function formatDateTime(dateTimeStr) {
    const date = new Date(dateTimeStr);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${hours}:${minutes} ${day}.${month}.${year}`;
}

function getStatusText(status) {
    switch (status) {
        case 'danger': return 'Авария';
        case 'warning': return 'Отклонение';
        case 'normal': return 'Норма';
        default: return 'Неизвестно';
    }
}

function getStatusClass(status) {
    switch (status) {
        case 'danger': return 'status-alert';
        case 'warning': return 'status-alert status-warning';
        case 'normal': return 'status-alert status-normal';
        default: return 'status-alert';
    }
}

function formatDelta(delta) {
    if (delta > 0) return `+${delta}%`;
    if (delta < 0) return `${delta}%`;
    return '0%';
}

function getDeltaClass(delta) {
    if (delta < 0) return 'data-delta--negative';
    if (delta > 0) return 'data-delta--positive';
    return '';
}

function createStateCard(item) {
    const fields = item.fields;
    const statusClass = getStatusClass(fields.status);
    const statusText = getStatusText(fields.status);
    
    const showAdditionalElements = fields.status !== 'warning' && fields.status !== 'normal';
    
    return `
        <div class="state-card" id="house-${fields.house_id}">
            <div class="state-header">
                <div class="state-time">${formatDateTime(fields.date_time)}</div>
                <div class="state-header__inner">
                    ${showAdditionalElements ? `
                    <a href="../../situation.html" class="notification-state">
                        <img src="img/icon/eye.svg" alt="Показать уведомления" class="notification-state__img">
                    </a>
                    <div class="settings-houses key-notification">
                        <img src="img/icon/key.svg" alt="Настройки" class="settings-houses__img">
                    </div>
                    ` : ''}
                    <div class="${statusClass}">
                        ${statusText}
                    </div>
                </div>
            </div>
            <div class="state-location">${fields.adress}</div>
            <div class="state-warning">${fields.forecast}</div>
            <div class="data-block">
                <div class="data-row">
                    <span class="data-label">Подача:</span>
                    <span class="data-value">${fields.cold_water_supply} м³</span>
                    <span class="data-delta ${getDeltaClass(fields.cold_water_diff)}">${formatDelta(fields.cold_water_diff)}</span>
                </div>
                <div class="data-row">
                    <span class="data-label">Обратка:</span>
                    <span class="data-value">${fields.reverse_water} м³</span>
                    <span class="data-delta ${getDeltaClass(fields.reverse_water_diff)}">${formatDelta(fields.reverse_water_diff)}</span>
                </div>
                <div class="data-row">
                    <span class="data-label">T1:</span>
                    <span class="data-value">${fields.t1}°C</span>
                </div>
                <div class="data-row ${fields.t2 > 55 ? 'data-row--warning' : ''}">
                    <span class="data-label">T2:</span>
                    <span class="data-value">${fields.t2}°C</span>
                    ${fields.t2 > 55 ? '<span class="data-warning">⚠</span>' : ''}
                </div>
            </div>
        </div>
    `;
}

function checkForAccidentAlerts() {
    const stateCards = document.querySelectorAll('.state-card');
    
    stateCards.forEach(card => {
        const statusAlert = card.querySelector('.status-alert');
        
        if (statusAlert) {
            const statusText = statusAlert.textContent.trim();
            
            if (statusText === 'Авария') {
                card.classList.add('state-card--active');
            } else {
                card.classList.remove('state-card--active');
            }
        }
    });
}

function showError(message) {
    console.error(message);
    // Показываем ошибки в обоих контейнерах
    const containers = ['alerts-container', 'notifications-container'];
    
    containers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `<div class="error-message">${message}</div>`;
        }
    });
}

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    loadAlerts();
});

// Обновление каждые 5 минут
setInterval(loadAlerts, 5 * 60 * 1000);