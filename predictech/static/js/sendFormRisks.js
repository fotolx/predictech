// Функция для выполнения GET запроса и получения данных
async function fetchRiskData() {
    try {
        const response = await fetch('https://predictech.5d4.ru/risks');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Ошибка при загрузке данных:', error);
        return null;
    }
}

// Функция для заполнения формы данными
function fillFormWithData(form, data) {
    // Заполняем числовые поля
    const numberFields = ['xvs', 'gvs', 'cold_water_supply', 'reverse_flow', 't1', 't2'];
    
    numberFields.forEach(fieldName => {
        const input = form.querySelector(`input[name="${fieldName}"]`);
        if (input && data[fieldName] !== undefined) {
            input.value = data[fieldName];
        }
    });
    
    // Заполняем слайдер чувствительности
    const sensitivityInput = form.querySelector('input[name="sensivity"]');
    const sensitivityValue = form.querySelector('#sensitivity-value');
    
    if (sensitivityInput && data.sensivity !== undefined) {
        sensitivityInput.value = data.sensivity;
        sensitivityInput.setAttribute('aria-valuenow', data.sensivity);
        
        // Обновляем отображаемое значение
        if (sensitivityValue) {
            sensitivityValue.textContent = data.sensivity;
        }
    }
}

// Функция для наблюдения за появлением формы в DOM
function observeFormCreation() {
    const observer = new MutationObserver(async (mutations) => {
        for (let mutation of mutations) {
            for (let node of mutation.addedNodes) {
                // Проверяем, является ли добавленный узел формой или содержит форму
                if (node.nodeType === 1) { // Element node
                    let form = null;
                    
                    if (node.matches && node.matches('form.risk-settings.form-update')) {
                        form = node;
                    } else if (node.querySelector) {
                        form = node.querySelector('form.risk-settings.form-update');
                    }
                    
                    if (form) {
                        console.log('Форма найдена, загружаем данные...');
                        
                        // Получаем данные с API
                        const riskData = await fetchRiskData();
                        
                        if (riskData) {
                            // Заполняем форму данными
                            fillFormWithData(form, riskData);
                            console.log('Форма успешно заполнена данными с API');
                        }
                        
                        // Можно отключить observer после нахождения формы
                        // observer.disconnect();
                    }
                }
            }
        }
    });
    
    // Начинаем наблюдение за изменениями в DOM
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Альтернативный подход - проверка формы через интервал (на случай проблем с MutationObserver)
function waitForForm() {
    const checkInterval = setInterval(async () => {
        const form = document.querySelector('form.risk-settings.form-update');
        if (form) {
            clearInterval(checkInterval);
            console.log('Форма найдена (через интервал), загружаем данные...');
            
            const riskData = await fetchRiskData();
            if (riskData) {
                fillFormWithData(form, riskData);
                console.log('Форма успешно заполнена данными с API');
            }
        }
    }, 500); // Проверяем каждые 500ms
}

// Запускаем оба метода для надежности
document.addEventListener('DOMContentLoaded', function() {
    observeFormCreation();
    waitForForm();
});

// Также запускаем при полной загрузке страницы (на всякий случай)
window.addEventListener('load', function() {
    // Проверяем, не появилась ли форма уже
    const existingForm = document.querySelector('form.risk-settings.form-update');
    if (existingForm) {
        console.log('Форма уже присутствует при загрузке, заполняем данные...');
        fetchRiskData().then(riskData => {
            if (riskData) {
                fillFormWithData(existingForm, riskData);
            }
        });
    }
});
