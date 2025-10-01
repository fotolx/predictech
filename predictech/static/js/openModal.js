function initSidePanel() {
    const risksAnomaliesBtn = document.querySelector('.risks-anomalies');
    const sidePanel = document.querySelector('.side-panel');
    const sidePanelCloseBtn = document.querySelector('.side-panel__close');
    
    // Элементы для модального окна подтверждения
    const updateDataBtn = document.querySelector('.update-data');
    const modalConfirm = document.querySelector('.modal-confirm-open');
    const modalConfirmCloseBtn = document.querySelector('.modal-confirm-header__close');

    // Новый элемент для открытия модального окна рисков
    const settingsBtn = document.querySelector('.settings');
    const modalRisk = document.querySelector('.modal-risk');
    const modalRiskCloseBtn = document.querySelector('.modal-risk .modal-confirm-header__close'); // Закрытие для modal-risk

    // Обработчики для side panel
    if (risksAnomaliesBtn && sidePanel && sidePanelCloseBtn) {
        risksAnomaliesBtn.addEventListener('click', () => {
            sidePanel.classList.add('side-panel--active');
        });

        sidePanelCloseBtn.addEventListener('click', () => {
            sidePanel.classList.remove('side-panel--active');
        });
    } else {
        console.warn('Не все элементы для side panel найдены, повторная попытка...');
        setTimeout(initSidePanel, 100);
    }

    // Обработчики для модального окна подтверждения
    if (updateDataBtn && modalConfirm && modalConfirmCloseBtn) {
        updateDataBtn.addEventListener('click', () => {
            modalConfirm.classList.add('modal-confirm--active');
        });

        modalConfirmCloseBtn.addEventListener('click', () => {
            modalConfirm.classList.remove('modal-confirm--active');
        });
    } else {
        console.warn('Не все элементы для modal confirm найдены, повторная попытка...');
        // Можно добавить повторную попытку и для модального окна
        setTimeout(() => {
            const retryUpdateBtn = document.querySelector('.update-data');
            const retryModal = document.querySelector('.modal-confirm-open');
            const retryCloseBtn = document.querySelector('.modal-confirm-header__close');
            
            if (retryUpdateBtn && retryModal && retryCloseBtn) {
                retryUpdateBtn.addEventListener('click', () => {
                    retryModal.classList.add('modal-confirm--active');
                });

                retryCloseBtn.addEventListener('click', () => {
                    retryModal.classList.remove('modal-confirm--active');
                });
                console.log('Modal confirm инициализирован после повторной попытки');
            }
        }, 100);
    }

    // Обработчик для кнопки settings (открытие modal-risk)
    if (settingsBtn && modalRisk) {
        settingsBtn.addEventListener('click', () => {
            modalRisk.classList.add('modal-confirm--active');
        });
    } else {
        console.warn('Элементы settings или modal-risk не найдены, повторная попытка...');
        setTimeout(() => {
            const retrySettingsBtn = document.querySelector('.settings');
            const retryModalRisk = document.querySelector('.modal-risk');
            
            if (retrySettingsBtn && retryModalRisk) {
                retrySettingsBtn.addEventListener('click', () => {
                    retryModalRisk.classList.add('modal-confirm--active');
                });
                console.log('Modal risk инициализирован после повторной попытки');
            }
        }, 100);
    }

    // Обработчик для закрытия modal-risk
    if (modalRisk && modalRiskCloseBtn) {
        modalRiskCloseBtn.addEventListener('click', () => {
            modalRisk.classList.remove('modal-confirm--active');
        });
    } else {
        console.warn('Элементы modal-risk или его кнопка закрытия не найдены, повторная попытка...');
        setTimeout(() => {
            const retryModalRisk = document.querySelector('.modal-risk');
            const retryModalRiskCloseBtn = document.querySelector('.modal-risk .modal-confirm-header__close');
            
            if (retryModalRisk && retryModalRiskCloseBtn) {
                retryModalRiskCloseBtn.addEventListener('click', () => {
                    retryModalRisk.classList.remove('modal-confirm--active');
                });
                console.log('Закрытие modal risk инициализировано после повторной попытки');
            }
        }, 100);
    }

    // ---------------------------
    // НОВАЯ ЛОГИКА: Кнопки создания инцидента -> modal-new-incident
    // ---------------------------
    document.addEventListener('click', function (e) {
        // Открыть modal-new-incident при клике на кнопки создания инцидента
        const createIncidentBtn = e.target.closest('.actions__item.create-incident, .display-notification__btn');
        if (createIncidentBtn) {
            const modalNewIncident = document.querySelector('.modal-new-incident');
            if (modalNewIncident) {
                modalNewIncident.classList.add('modal-confirm--active');
            } else {
                console.warn('Клик по кнопке создания инцидента, но .modal-new-incident не найден.');
            }
            return;
        }

        // Закрытие: если клик произошёл по кнопке .modal-confirm-header__close внутри .modal-new-incident
        const closeBtn = e.target.closest('.modal-confirm-header__close');
        if (closeBtn) {
            // Убедимся, что кнопка находится внутри .modal-new-incident
            const insideModalNewIncident = closeBtn.closest('.modal-new-incident');
            if (insideModalNewIncident) {
                const modalNewIncident = document.querySelector('.modal-new-incident');
                if (modalNewIncident) {
                    modalNewIncident.classList.remove('modal-confirm--active');
                }
            }
        }
    });

    // ---------------------------
    // Новая логика: key-notification <-> modal-card-event
    // ---------------------------
    // Используем делегирование: надёжно работает для динамически добавляемых элементов.
    document.addEventListener('click', function (e) {
        // Открыть modal-card-event при клике на любой элемент с классом key-notification
        const clickedKey = e.target.closest('.key-notification');
        if (clickedKey) {
            // Переполучаем модальное каждый раз (в случае, если его загрузка отложена)
            const modalCardEvent = document.querySelector('.modal-card-event');
            if (modalCardEvent) {
                modalCardEvent.classList.add('modal-confirm--active');
            } else {
                console.warn('Клик по .key-notification, но .modal-card-event не найден. Возможно, он ещё не загружен.');
            }
            return; // если клик был по key-notification — дальше обработка не нужна
        }

        // Закрытие: если клик произошёл по кнопке .modal-confirm-header__close внутри .modal-card-event
        const closeBtn = e.target.closest('.modal-confirm-header__close');
        if (closeBtn) {
            // Убедимся, что кнопка находится внутри .modal-card-event
            const insideModalCard = closeBtn.closest('.modal-card-event');
            if (insideModalCard) {
                // удаляем активный класс у того единственного .modal-card-event (на всякий случай найдем ещё раз)
                const modalCardEvent = document.querySelector('.modal-card-event');
                if (modalCardEvent) {
                    modalCardEvent.classList.remove('modal-confirm--active');
                }
            }
        }
    });

    // ---------------------------
    // НОВАЯ ЛОГИКА: events-table__row -> modal-card-event-2
    // ---------------------------
    document.addEventListener('click', function (e) {
        // Открыть modal-card-event-2 при клике на любой элемент с классом events-table__row
        const clickedEventRow = e.target.closest('.events-table__row');
        if (clickedEventRow) {
            const modalCardEvent2 = document.querySelector('.modal-card-event-2');
            if (modalCardEvent2) {
                modalCardEvent2.classList.add('modal-confirm--active');
            } else {
                console.warn('Клик по .events-table__row, но .modal-card-event-2 не найден.');
            }
            return;
        }

        // Закрытие: если клик произошёл по кнопке .modal-confirm-header__close внутри .modal-card-event-2
        const closeBtn = e.target.closest('.modal-confirm-header__close');
        if (closeBtn) {
            // Убедимся, что кнопка находится внутри .modal-card-event-2
            const insideModalCard2 = closeBtn.closest('.modal-card-event-2');
            if (insideModalCard2) {
                const modalCardEvent2 = document.querySelector('.modal-card-event-2');
                if (modalCardEvent2) {
                    modalCardEvent2.classList.remove('modal-confirm--active');
                }
            }
        }
    });
}

// Запускаем после загрузки DOM и компонентов
document.addEventListener("DOMContentLoaded", function () {
    // Даем время на загрузку динамических компонентов
    setTimeout(initSidePanel, 100);
});
