// Упрощенная версия
async function autoFillRiskForm() {
    // Ждем появления формы
    const form = await new Promise(resolve => {
        const checkForm = () => {
            const form = document.querySelector('form.risk-settings.form-update');
            if (form) {
                resolve(form);
            } else {
                setTimeout(checkForm, 250);
            }
        };
        checkForm();
    });
    
    // Загружаем данные
    try {
        const response = await fetch('https://predictech.5d4.ru/risks');
        const data = await response.json();
        
        // Заполняем поля
        const fields = ['xvs', 'gvs', 'cold_water_supply', 'reverse_flow', 't1', 't2', 'sensivity'];
        fields.forEach(field => {
            const input = form.querySelector(`[name="${field}"]`);
            if (input && data[field] !== undefined) {
                input.value = data[field];
                
                // Для слайдера обновляем также отображаемое значение
                if (field === 'sensivity') {
                    const valueDisplay = document.getElementById('sensitivity-value');
                    if (valueDisplay) {
                        valueDisplay.textContent = data[field];
                    }
                }
            }
        });
        
        console.log('Форма автоматически заполнена данными с API');
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

// Запускаем при загрузке страницы
document.addEventListener('DOMContentLoaded', autoFillRiskForm);
