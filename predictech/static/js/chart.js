const chartCommonTimeLabels = ['-4 нед', '-3 нед', '-2 нед', '-1 нед', 'Сейчас', '+1 нед', '+2 нед', '+3 нед'];


async function loadChartData() {
    const dataUrl = 'https://predictech.5d4.ru/detector_data_log/';
    
    try {
        console.log('Загрузка данных графиков с:', dataUrl);
        const response = await fetch(dataUrl, {
            method: 'GET',
            mode: 'cors'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        console.log('Получены сырые данные графиков:', text.substring(0, 200) + '...');
        
        return processChartServerData(text);
        
    } catch (error) {
        console.log('Прямая загрузка графиков не сработала:', error.message);
        return await tryChartAlternativeMethods(dataUrl);
    }
}

// Функция для обработки данных с сервера (графики)
function processChartServerData(text) {
    let cleanedText = text.trim();
    
    try {
        return JSON.parse(cleanedText);
    } catch (error1) {
        console.log('Прямой JSON парсинг графиков не сработал:', error1.message);
        
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
            
            throw new Error('Не удалось распарсить данные графиков');
            
        } catch (error2) {
            console.log('Альтернативные методы парсинга графиков не сработали:', error2.message);
            throw new Error(`Не удалось обработать данные графиков: ${error2.message}`);
        }
    }
}

// Альтернативные методы загрузки (графики)
async function tryChartAlternativeMethods(targetUrl) {
    const proxies = [
        'https://cors-anywhere.herokuapp.com/',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://corsproxy.io/?',
        'https://proxy.cors.sh/'
    ];
    
    for (const proxy of proxies) {
        try {
            console.log(`Пробуем proxy для графиков: ${proxy}`);
            const response = await fetch(proxy + targetUrl, {
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const text = await response.text();
            return processChartServerData(text);
            
        } catch (error) {
            console.log(`Proxy ${proxy} для графиков не сработал:`, error.message);
            continue;
        }
    }
    
    throw new Error('Все методы загрузки графиков не сработали');
}

// Функция для загрузки прогнозируемых данных (заготовка на будущее)
async function loadChartForecastData() {
    // ЗАГОТОВКА ДЛЯ БУДУЩЕГО ФАЙЛА С ПРОГНОЗИРУЕМЫМИ ДАННЫМИ
    // Сейчас возвращаем null для всех прогнозируемых значений
    console.log('Загрузка прогнозируемых данных графиков...');
    
    // TODO: В будущем заменить на реальный URL для прогнозируемых данных
    // const forecastUrl = 'https://predictech.5d4.ru/forecast_data/';
    
    // Пока возвращаем структуру с null значениями для прогноза
    return {
        1: [null, null, null], // Прогноз для ХВС (+1 нед, +2 нед, +3 нед)
        2: [null, null, null], // Прогноз для ГВС
        3: [null, null, null], // Прогноз для температуры подача
        4: [null, null, null]  // Прогноз для температуры обратка
    };
}

// Функция для расчета дат для каждой недели
function calculateWeekDates() {
    const now = new Date();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const weekDates = [];
    
    // Прошлые недели (-4 до -1)
    for (let i = 4; i >= 1; i--) {
        const date = new Date(now.getTime() - i * weekMs);
        weekDates.push(formatDate(date));
    }
    
    // Текущая неделя
    weekDates.push(formatDate(now));
    
    // Будущие недели (+1 до +3)
    for (let i = 1; i <= 3; i++) {
        const date = new Date(now.getTime() + i * weekMs);
        weekDates.push(formatDate(date));
    }
    
    return weekDates;
}

// Функция для форматирования даты в формате DD.MM.YYYY
function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

// Функция для обработки данных и группировки по неделям
async function processChartMonthlyData() {
    try {
        // Загружаем реальные данные
        const realData = await loadChartData();
        console.log('Загружено реальных записей для графиков:', realData.length);
        
        // Загружаем прогнозируемые данные (пока пустые)
        const forecastData = await loadChartForecastData();
        
        // Группируем реальные данные по detector_id
        const dataByDetector = {};
        
        realData.forEach(item => {
            const detectorId = item.fields.detector_id;
            if (!dataByDetector[detectorId]) {
                dataByDetector[detectorId] = [];
            }
            dataByDetector[detectorId].push({
                timestamp: new Date(item.fields.timestamp),
                value: item.fields.value
            });
        });

        // Сортируем данные по времени для каждого детектора
        Object.keys(dataByDetector).forEach(detectorId => {
            dataByDetector[detectorId].sort((a, b) => a.timestamp - b.timestamp);
        });

        // Определяем текущую дату и диапазон 4 недели назад
        const now = new Date();
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        const fourWeeksAgo = new Date(now.getTime() - 4 * weekMs);

        // Инициализируем структуры для хранения данных
        const weeklyData = {
            1: new Array(8).fill(null), // ХВС
            2: new Array(8).fill(null), // ГВС  
            3: new Array(8).fill(null), // Температура подача
            4: new Array(8).fill(null)  // Температура обратка
        };

        const weekCounts = {
            1: new Array(8).fill(0),
            2: new Array(8).fill(0),
            3: new Array(8).fill(0),
            4: new Array(8).fill(0)
        };

        // Обрабатываем реальные данные для каждого детектора
        Object.keys(dataByDetector).forEach(detectorId => {
            const detectorNum = parseInt(detectorId);
            dataByDetector[detectorId].forEach(dataPoint => {
                // Пропускаем данные старше 4 недель
                if (dataPoint.timestamp < fourWeeksAgo) return;

                // Определяем индекс недели (0-4 для реальных данных)
                const timeDiff = now - dataPoint.timestamp;
                let weekIndex;
                
                if (timeDiff <= 0) {
                    // Будущие данные или текущий момент
                    weekIndex = 4; // "Сейчас"
                } else if (timeDiff <= weekMs) {
                    weekIndex = 3; // "-1 нед"
                } else if (timeDiff <= 2 * weekMs) {
                    weekIndex = 2; // "-2 нед"
                } else if (timeDiff <= 3 * weekMs) {
                    weekIndex = 1; // "-3 нед"
                } else if (timeDiff <= 4 * weekMs) {
                    weekIndex = 0; // "-4 нед"
                } else {
                    return; // Данные старше 4 недель
                }

                // Для расхода воды (detector_id 1 и 2) - суммируем значения
                if (detectorNum === 1 || detectorNum === 2) {
                    if (weeklyData[detectorNum][weekIndex] === null) {
                        weeklyData[detectorNum][weekIndex] = dataPoint.value;
                    } else {
                        weeklyData[detectorNum][weekIndex] += dataPoint.value;
                    }
                    weekCounts[detectorNum][weekIndex]++;
                } else {
                    // Для температуры (detector_id 3 и 4) - вычисляем среднее
                    if (weeklyData[detectorNum][weekIndex] === null) {
                        weeklyData[detectorNum][weekIndex] = dataPoint.value;
                    } else {
                        weeklyData[detectorNum][weekIndex] += dataPoint.value;
                    }
                    weekCounts[detectorNum][weekIndex]++;
                }
            });
        });

        // Вычисляем средние значения для температур и нормализуем данные
        [1, 2, 3, 4].forEach(detectorId => {
            for (let i = 0; i < 5; i++) { // Только для реальных данных (0-4)
                if (weekCounts[detectorId][i] > 0) {
                    // Для расхода - оставляем сумму, для температуры - среднее
                    if (detectorId === 1 || detectorId === 2) {
                        weeklyData[detectorId][i] = weeklyData[detectorId][i]; // Сумма расхода
                    } else {
                        weeklyData[detectorId][i] = weeklyData[detectorId][i] / weekCounts[detectorId][i]; // Средняя температура
                    }
                } else {
                    // Для прошлых недель, если данных нет, устанавливаем 0
                    weeklyData[detectorId][i] = 0;
                }
            }
            
            // Добавляем прогнозируемые данные (позиции 5-7)
            if (forecastData[detectorId]) {
                for (let i = 5; i < 8; i++) {
                    weeklyData[detectorId][i] = forecastData[detectorId][i - 5];
                }
            }
        });

        return weeklyData;
        
    } catch (error) {
        console.error('Ошибка обработки данных графиков:', error);
        throw error;
    }
}

// Функция для создания графика
function createChart(canvasId, datasets, chartType = 'line') {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const weekDates = calculateWeekDates();

    return new Chart(ctx, {
        type: chartType,
        data: {
            labels: chartCommonTimeLabels,
            datasets: datasets.map(dataset => ({
                ...dataset,
                borderWidth: 1,
                borderDash: dataset.borderDash || [],
                pointRadius: 0, // Убираем точки на графике
                spanGaps: true // Позволяет пропускать точки данных
            }))
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    grid: {
                        color: function (context) {
                            return context.tick.value === 4 ? '#6b7280' : 'rgba(0,0,0,0.1)';
                        },
                        lineWidth: function (context) {
                            return context.tick.value === 4 ? 2 : 1;
                        },
                        borderDash: function (context) {
                            return context.tick.value === 4 ? [5, 5] : [];
                        },
                        drawBorder: false
                    },
                    ticks: {
                        callback: function (value, index, values) {
                            if (index === 4) return 'Сейчас';
                            return chartCommonTimeLabels[index];
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0,0,0,0.1)',
                        borderDash: [5, 5]
                    },
                    border: {
                        dash: [5, 5]
                    }
                }
            },
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: function(tooltipItems) {
                            // Получаем индекс данных из tooltip
                            const dataIndex = tooltipItems[0].dataIndex;
                            // Возвращаем комбинированную строку с неделей и датой
                            return `${chartCommonTimeLabels[dataIndex]} (${weekDates[dataIndex]})`;
                        },
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                // Форматируем значения в зависимости от типа данных
                                if (label.includes('потребление') || label.includes('Расход')) {
                                    label += context.parsed.y.toFixed(2) + ' м³';
                                } else if (label.includes('температура') || label.includes('Температура') || label.includes('Средняя') || label.includes('Подача') || label.includes('Обратка')) {
                                    label += context.parsed.y.toFixed(1) + ' °C';
                                } else {
                                    label += context.parsed.y.toFixed(2);
                                }
                            } else {
                                label += 'нет данных';
                            }
                            return label;
                        }
                    }
                },
                legend: {
                    display: datasets.length > 1
                }
            },
            elements: {
                line: {
                    borderWidth: 2,
                    tension: 0.4 // Плавность линий
                },
                point: {
                    radius: 0
                }
            }
        }
    });
}

// Функция для разделения данных на реальные и прогнозируемые
function prepareChartDatasets(monthlyData, detectorIds, colors, labels) {
    const datasets = [];
    
    detectorIds.forEach((detectorId, index) => {
        // Реальные данные (первые 5 точек: -4 нед до Сейчас)
        const realData = [...monthlyData[detectorId].slice(0, 5)];
        
        // Прогнозируемые данные (последние 3 точки: +1 нед до +3 нед)
        const forecastData = monthlyData[detectorId].slice(5, 8);
        
        // Создаем полный массив данных с разрывом между реальными и прогнозируемыми
        const fullData = [
            ...realData,
            null, // Разрыв между реальными и прогнозируемыми данными
            ...forecastData
        ];

        datasets.push({
            label: labels[index],
            data: fullData,
            borderColor: colors[index],
            backgroundColor: colors[index] + '20', // Добавляем прозрачность
            tension: 0.4,
            fill: false
        });
    });

    return datasets;
}

// Основная функция инициализации графиков
async function initializeCharts() {
    try {
        const monthlyData = await processChartMonthlyData();
        
        console.log('Обработанные данные графиков:', monthlyData);

        // График 1: Общее потребление ХВС, м3 (detector_id: 1)
        const chart1Data = prepareChartDatasets(
            monthlyData, 
            [1], 
            ['#3b82f6'], 
            ['Общее потребление ХВС, м3']
        );

        // График 2: Общее потребление ГВС, м3 (detector_id: 2)
        const chart2Data = prepareChartDatasets(
            monthlyData, 
            [2], 
            ['#a855f7'], 
            ['Общее потребление ГВС, м3']
        );

        // График 3: Подача и обратка (detector_id: 3 и 4)
        const chart3Data = prepareChartDatasets(
            monthlyData, 
            [3, 4], 
            ['#1e40af', '#a855f7'], 
            ['Подача', 'Обратка']
        );

        // График 4: Температуры T1 и T2 (среднее значение)
        const averageTemp = monthlyData[3].map((value, index) => {
            const t2 = monthlyData[4][index];
            if (value !== null && t2 !== null) {
                return (value + t2) / 2;
            }
            return null;
        });

        // Создаем отдельный набор данных для средней температуры
        const realAverageData = [...averageTemp.slice(0, 5)];
        const forecastAverageData = averageTemp.slice(5, 8);
        const fullAverageData = [
            ...realAverageData,
            null,
            ...forecastAverageData
        ];

        const chart4Data = [
            {
                label: 'T1',
                data: prepareChartDatasets(monthlyData, [3], ['#a855f7'], [''])[0].data,
                borderColor: '#a855f7',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                tension: 0.4,
                fill: false
            },
            {
                label: 'T2',
                data: prepareChartDatasets(monthlyData, [4], ['#3b82f6'], [''])[0].data,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: false
            },
            {
                label: 'Средняя температура',
                data: fullAverageData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                fill: false,
                borderDash: [5, 5] // Пунктир для средней линии
            }
        ];

        // Создание графиков
        createChart('chart1', chart1Data);
        createChart('chart2', chart2Data);
        createChart('chart3', chart3Data);
        createChart('chart4', chart4Data);
        
    } catch (error) {
        console.error('Ошибка инициализации графиков:', error);
        // Показываем сообщение об ошибке
        const errorDiv = document.createElement('div');
        errorDiv.style.color = 'red';
        errorDiv.style.padding = '20px';
        errorDiv.style.textAlign = 'center';
        errorDiv.textContent = 'Ошибка загрузки данных графиков: ' + error.message;
        document.body.prepend(errorDiv);
    }
}

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initializeCharts();
});
