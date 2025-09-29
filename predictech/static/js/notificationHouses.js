function updateNotifications() {
    // Находим контейнер для уведомлений
    const notificationContainer = document.getElementById('notification');
    
    // Очищаем предыдущие уведомления
    notificationContainer.innerHTML = '';
    
    // Находим все активные карточки
    const activeCards = document.querySelectorAll('.state-card.state-card--active');
    
    // Если нет активных карточек, выходим
    if (activeCards.length === 0) {
        return;
    }
    
    // Для каждой активной карточки создаем уведомление
    activeCards.forEach(card => {
        // Ищем данные внутри карточки
        const stateWarning = card.querySelector('.state-warning');
        const stateLocation = card.querySelector('.state-location');
        
        // Если данные найдены, создаем уведомление
        if (stateWarning && stateLocation) {
            // Создаем элемент уведомления
            const notification = document.createElement('div');
            notification.className = 'display-notification display-notification--active';
            notification.innerHTML = `
                <img src="/static/img/icon/notification.svg" alt="внимание" class="display-notification__img">
                <div class="display-notification__content">
                    <div class="display-notification__title">${stateLocation.textContent}</div>
                    <div class="display-notification__text">${stateWarning.textContent}</div>
                    <button type="button" class="display-notification__btn">Создать инцидент</button>
                </div>
                <div class="notification-close">
                    <img src="/static/img/icon/close.svg" alt="закрыть" title="закрыть">
                </div>
            `;
            
            // Добавляем уведомление в контейнер
            notificationContainer.appendChild(notification);
            
            // Добавляем обработчик для кнопки закрытия
            const closeBtn = notification.querySelector('.notification-close');
            closeBtn.addEventListener('click', function() {
                notification.remove();
            });
        }
    });
}

// Функция для наблюдения за изменениями DOM
function observeChanges() {
    // Создаем наблюдатель за изменениями
    const observer = new MutationObserver(function(mutations) {
        let shouldUpdate = false;
        
        mutations.forEach(function(mutation) {
            // Проверяем, были ли добавлены/изменены карточки
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && (
                        node.classList?.contains('state-card') || 
                        node.querySelector?.('.state-card')
                    )) {
                        shouldUpdate = true;
                    }
                });
            }
            
            // Проверяем изменения классов
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                if (mutation.target.classList?.contains('state-card')) {
                    shouldUpdate = true;
                }
            }
        });
        
        if (shouldUpdate) {
            updateNotifications();
        }
    });
    
    // Начинаем наблюдение
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Создаем контейнер для уведомлений, если его нет
    if (!document.getElementById('notification')) {
        const container = document.createElement('div');
        container.id = 'notification';
        document.body.appendChild(container);
    }
    
    // Первоначальное обновление
    updateNotifications();
    
    // Запускаем наблюдение за изменениями
    observeChanges();
});

// Функция для принудительного обновления (можно вызывать после загрузки данных с сервера)
function forceUpdateNotifications() {
    updateNotifications();
}

// Экспортируем функцию для внешнего использования
window.updateNotifications = updateNotifications;
window.forceUpdateNotifications = forceUpdateNotifications;