// Основная функция инициализации
function initializeExportButton() {
    function findExportButtonWithRetry(retries = 10, delay = 500) {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            
            const searchButton = () => {
                attempts++;
                
                const exportButton = document.querySelector('button.actions__item.export-report');
                
                if (exportButton) {
                    resolve(exportButton);
                    return;
                }
                
                if (attempts >= retries) {
                    reject(new Error('Кнопка экспорта не найдена после всех попыток'));
                    return;
                }
                
                setTimeout(searchButton, delay);
            };
            
            searchButton();
        });
    }

    findExportButtonWithRetry()
        .then(exportButton => {

            exportButton.replaceWith(exportButton.cloneNode(true));
            const newExportButton = document.querySelector('button.actions__item.export-report');
            
            newExportButton.addEventListener('click', function(event) {
                console.log('Нажата кнопка экспорта');
                event.preventDefault();
                event.stopPropagation();
                
                handleExportClick();
            });
            
        })
        .catch(error => {
            console.error('Ошибка инициализации:', error.message);
            // Показываем сообщение только в режиме разработки
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                alert('Кнопка экспорта не найдена на странице');
            }
        });
}

// Обработчик клика по кнопке экспорта
function handleExportClick() {
    
    if (!isOnReportPage()) {
        alert('Для того чтобы скачать отчет необходимо перейти на страницу "Журнал работ" или "Прогноз"');
        return;
    }
    
    findTableWithRetry()
        .then(table => {
            console.log('Таблица найдена, начинаем экспорт...');
            exportTableToExcel(table);
        })
        .catch(error => {
            console.error('Таблица не найдена:', error.message);
            alert('Таблица для экспорта не найдена. Пожалуйста, обновите страницу и попробуйте снова.');
        });
}

function findTableWithRetry(retries = 5, delay = 300) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        
        const searchTable = () => {
            attempts++;
            const table = document.querySelector('.events-table');
            
            if (table) {
                resolve(table);
                return;
            }
            
            if (attempts >= retries) {
                reject(new Error('Таблица не найдена'));
                return;
            }
            
            setTimeout(searchTable, delay);
        };
        
        searchTable();
    });
}

// Функция проверки нахождения на странице отчета
function isOnReportPage() {
    const currentPath = window.location.pathname;
    const currentPage = currentPath.split('/').pop();
    
    // Проверяем по URL
    const isReportPage = currentPath.includes('journal') || 
                        currentPath.includes('forecast') ||
                        currentPath.includes('report');
    
    // Проверяем по содержимому страницы
    const pageTitle = document.title.toLowerCase();
    const hasReportContent = pageTitle.includes('журнал') || 
                           pageTitle.includes('прогноз') || 
                           pageTitle.includes('отчет');
    
    // Проверяем наличие таблицы на странице
    const hasTable = document.querySelector('.events-table') !== null;
    
    
    return isReportPage || hasReportContent || hasTable;
}

// Функция экспорта таблицы в Excel
function exportTableToExcel(table) {
    try {
        
        // Проверяем, подключена ли библиотека XLSX
        if (typeof XLSX === 'undefined') {
            console.warn('Библиотека XLSX не найдена, используем CSV');
            alert('Библиотека для экспорта в Excel не подключена. Скачиваем в формате CSV.');
            exportTableToCSV(table);
            return;
        }
        
        // Создаем Workbook и Worksheet
        const wb = XLSX.utils.book_new();
        
        // Клонируем таблицу для очистки от лишних элементов
        const clonedTable = cleanTableForExport(table);
        const ws = XLSX.utils.table_to_sheet(clonedTable);
        
        // Настраиваем ширину колонок
        const colWidths = [
            { wch: 20 }, // Адрес
            { wch: 25 }, // Параметр
            { wch: 15 }, // Вероятность
            { wch: 20 }, // Время прогноза
            { wch: 20 }, // Фактическое время
            { wch: 15 }, // Статус
            { wch: 15 }  // Действие
        ];
        ws['!cols'] = colWidths;
        
        // Добавляем worksheet в workbook
        XLSX.utils.book_append_sheet(wb, ws, 'Отчет');
        
        // Генерируем файл и скачиваем
        const currentDate = new Date().toISOString().split('T')[0];
        const fileName = `отчет_${currentDate}.xlsx`;
        
        console.log('Создаем файл:', fileName);
        XLSX.writeFile(wb, fileName);
        console.log('Экспорт завершен успешно!');
        
    } catch (error) {
        console.error('Ошибка при экспорте в Excel:', error);
        alert('Произошла ошибка при экспорте. Пробуем скачать в формате CSV.');
        exportTableToCSV(table);
    }
}

// Функция для очистки таблицы от лишних элементов перед экспортом
function cleanTableForExport(table) {
    const clone = table.cloneNode(true);
    
    // Удаляем изображения и лишние элементы из колонки "Действие"
    const actionCells = clone.querySelectorAll('.col-action');
    actionCells.forEach(cell => {
        const textContent = cell.textContent.replace(/\s+/g, ' ').trim();
        cell.innerHTML = textContent;
    });
    
    // Очищаем ячейки статусов от HTML-разметки
    const statusCells = clone.querySelectorAll('.col-status');
    statusCells.forEach(cell => {
        const textContent = cell.textContent.replace(/\s+/g, ' ').trim();
        cell.innerHTML = textContent;
    });
    
    // Очищаем ячейки вероятности
    const probabilityCells = clone.querySelectorAll('.col-probability');
    probabilityCells.forEach(cell => {
        const textContent = cell.textContent.replace(/\s+/g, ' ').trim();
        cell.innerHTML = textContent;
    });
    
    return clone;
}

// Функция экспорта в CSV (как fallback)
function exportTableToCSV(table) {
    try {
        console.log('Начинаем экспорт в CSV...');
        
        let csv = [];
        const rows = table.querySelectorAll('tr');
        
        for (let i = 0; i < rows.length; i++) {
            const row = [], cols = rows[i].querySelectorAll('td, th');
            
            for (let j = 0; j < cols.length; j++) {
                // Очищаем текст от лишних пробелов и HTML-разметки
                let text = cols[j].textContent
                    .replace(/(\r\n|\n|\r)/gm, '')
                    .replace(/(\s\s)/gm, ' ')
                    .trim();
                
                // Экранируем кавычки и добавляем в массив
                row.push('"' + text + '"');
            }
            
            csv.push(row.join(';'));
        }
        
        // Создаем и скачиваем файл
        const currentDate = new Date().toISOString().split('T')[0];
        const csvContent = csv.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `отчет_${currentDate}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Освобождаем память
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
    } catch (error) {
        alert('Произошла ошибка при экспорте отчета.');
    }
}

function init() {
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initializeExportButton, 1000);
        });
    } else {
        // Стратегия 2: DOM уже загружен, ждем немного для полной отрисовки
        console.log('DOM уже загружен, ждем отрисовки...');
        setTimeout(initializeExportButton, 2000);
    }
    
    // Стратегия 3: Дополнительная инициализация через 5 секунд на случай динамической загрузки
    setTimeout(() => {
        const existingButton = document.querySelector('button.actions__item.export-report');
        if (!existingButton || !existingButton.hasAttribute('data-export-handler')) {
            initializeExportButton();
        }
    }, 5000);
}
init();

window.initializeExportButton = initializeExportButton;

window.handleExportClick = handleExportClick;
