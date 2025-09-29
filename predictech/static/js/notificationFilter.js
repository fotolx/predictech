// Функция для обновления счетчиков на кнопках
function updateFilterCounts() {
    const container = document.getElementById('notifications-container');
    if (!container) return;
    
    const criticalCount = container.querySelectorAll('.notification-event--critical').length;
    const warningCount = container.querySelectorAll('.notification-event--warning').length;
    
    // Обновляем текст кнопок
    const criticalBtn = document.querySelector('.filter-critical');
    const warningBtn = document.querySelector('.filter-warning');
    
    if (criticalBtn) criticalBtn.textContent = criticalCount;
    if (warningBtn) warningBtn.textContent = warningCount + '+';
}

// Функция фильтрации уведомлений
function filterNotifications(filterType) {
    const notifications = document.querySelectorAll('.notification-event');
    
    notifications.forEach(notification => {
        switch(filterType) {
            case 'critical':
                notification.style.display = notification.classList.contains('notification-event--critical') ? 'flex' : 'none';
                break;
            case 'warning':
                notification.style.display = notification.classList.contains('notification-event--warning') ? 'flex' : 'none';
                break;
            case 'all':
            default:
                notification.style.display = 'flex';
                break;
        }
    });
}

// Инициализация скрипта
function initNotificationFilter() {
    const filterContainer = document.querySelector('.notification-filter');
    
    if (!filterContainer) {
        // Если контейнер фильтров еще не загружен, пробуем снова через 100мс
        setTimeout(initNotificationFilter, 100);
        return;
    }
    
    // Обновляем счетчики при инициализации
    updateFilterCounts();
    
    // Добавляем обработчики кликов на кнопки
    filterContainer.addEventListener('click', function(e) {
        if (e.target.classList.contains('filter-btn')) {
            // Убираем активный класс со всех кнопок
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.remove('filter-all-active');
            });
            
            // Добавляем активный класс на нажатую кнопку
            e.target.classList.add('filter-all-active');
            
            // Определяем тип фильтра и применяем его
            if (e.target.classList.contains('filter-critical')) {
                filterNotifications('critical');
            } else if (e.target.classList.contains('filter-warning')) {
                filterNotifications('warning');
            } else if (e.target.classList.contains('filter-all-active')) {
                filterNotifications('all');
            }
        }
    });
    
    // Периодически обновляем счетчики (на случай добавления новых уведомлений)
    setInterval(updateFilterCounts, 2000);
}

// Запускаем скрипт когда DOM загружен
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotificationFilter);
} else {
    initNotificationFilter();
}