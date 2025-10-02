const chartCommonTimeLabels = ['-4 нед', '-3 нед', '-2 нед', '-1 нед', 'Сейчас', '+1 нед', '+2 нед', '+3 нед'];

// -----------------------------
// Загрузка реальных данных с сервера
// -----------------------------
async function loadChartData() {
    const dataUrl = 'https://predictech.5d4.ru/detector_data_log/';
    try {
        console.log('Загрузка реальных данных с:', dataUrl);
        const response = await fetch(dataUrl, { method: 'GET', mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        console.log('Сырые реальные данные:', text.substring(0, 200) + '...');
        return processChartServerData(text);
    } catch (err) {
        console.warn('Прямая загрузка реальных данных не удалась:', err.message);
        return tryChartAlternativeMethods(dataUrl);
    }
}

// -----------------------------
// Загрузка прогнозных данных
// -----------------------------
async function loadChartForecastData() {
    const forecastUrl = 'https://predictech.5d4.ru/forecast/?house_id=2';
    try {
        console.log('Загрузка прогнозных данных с:', forecastUrl);
        const response = await fetch(forecastUrl, { method: 'GET', mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const forecastJson = await response.json();
        console.log('Прогнозные данные:', forecastJson);
        
        // Анализ временной метки прогноза
        // timestamp - это момент времени, от которого делается прогноз
        // Например: "2025-09-15 02:00:00" - прогноз сделан на основе данных на эту дату/время
        const forecastTimestamp = new Date(forecastJson.timestamp);
        console.log('Прогноз сделан на основе данных от:', forecastTimestamp);
        
        // Формируем массивы для 4 графиков
        // Структура прогноза:
        // flow_xvs_168 - расход ХВС через 168 часов (1 неделя)
        // flow_xvs_336 - расход ХВС через 336 часов (2 недели)  
        // flow_xvs_504 - расход ХВС через 504 часа (3 недели)
        // Аналогично для ГВС и температур
        return {
            1: [forecastJson.flow_xvs_168, forecastJson.flow_xvs_336, forecastJson.flow_xvs_504], // ХВС
            2: [forecastJson.flow_gvs_168, forecastJson.flow_gvs_336, forecastJson.flow_gvs_504], // ГВС
            3: [forecastJson.temp_supply_168, forecastJson.temp_supply_336, forecastJson.temp_supply_504], // Подача
            4: [forecastJson.temp_return_168, forecastJson.temp_return_336, forecastJson.temp_return_504], // Обратка
            timestamp: forecastTimestamp // Сохраняем метку времени прогноза для отладки
        };
    } catch (err) {
        console.warn('Ошибка загрузки прогнозных данных:', err.message);
        // Возвращаем null для всех прогнозных значений в случае ошибки
        return {
            1: [null, null, null], 
            2: [null, null, null], 
            3: [null, null, null], 
            4: [null, null, null],
            timestamp: null
        };
    }
}

// -----------------------------
// Обработка данных сервера (реальные)
// -----------------------------
function processChartServerData(text) {
    const cleaned = text.trim();
    try {
        return JSON.parse(cleaned);
    } catch (err) {
        console.warn('JSON.parse не удался:', err.message);
        const jsonMatch = cleaned.match(/\[.*\]/s);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
        throw new Error('Не удалось распарсить данные');
    }
}

// -----------------------------
// Альтернативные методы загрузки через прокси
// -----------------------------
async function tryChartAlternativeMethods(url) {
    const proxies = [
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://proxy.cors.sh/',
        'https://cors-anywhere.herokuapp.com/'
    ];
    for (const proxy of proxies) {
        try {
            console.log('Пробуем прокси:', proxy);
            const response = await fetch(proxy + url);
            if (!response.ok) continue;
            const text = await response.text();
            return processChartServerData(text);
        } catch (e) {
            console.warn('Proxy не сработал:', proxy, e.message);
        }
    }
    throw new Error('Все методы загрузки не сработали');
}

// -----------------------------
// Даты для подписей графиков
// -----------------------------
function calculateWeekDates() {
    const now = new Date();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const arr = [];
    // Прошлые недели (реальные данные)
    for (let i = 4; i >= 1; i--) arr.push(formatDate(new Date(now - i * weekMs)));
    // Текущая неделя
    arr.push(formatDate(now));
    // Будущие недели (прогноз)
    for (let i = 1; i <= 3; i++) arr.push(formatDate(new Date(now.getTime() + i * weekMs)));
    return arr;
}

function formatDate(d) {
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
}

// -----------------------------
// Группировка данных по неделям
// -----------------------------
async function processChartMonthlyData() {
    const realData = await loadChartData();        // реальные данные
    const forecastData = await loadChartForecastData(); // прогнозные данные

    console.log('Метка времени прогноза:', forecastData.timestamp);

    const dataByDetector = { 1: [], 2: [], 3: [], 4: [] };
    realData.forEach(item => {
        const id = item.fields.detector_id;
        if (dataByDetector[id]) dataByDetector[id].push({
            timestamp: new Date(item.fields.timestamp),
            value: item.fields.value
        });
    });

    Object.keys(dataByDetector).forEach(id => dataByDetector[id].sort((a, b) => a.timestamp - b.timestamp));

    const now = new Date(), weekMs = 7 * 24 * 60 * 60 * 1000, fourWeeksAgo = new Date(now - weekMs * 4);
    const weeklyData = { 1: Array(8).fill(null), 2: Array(8).fill(null), 3: Array(8).fill(null), 4: Array(8).fill(null) };
    const weekCounts = { 1: Array(8).fill(0), 2: Array(8).fill(0), 3: Array(8).fill(0), 4: Array(8).fill(0) };

    // -----------------------------
    // Заполняем реальные данные (слева - позиции 0-4)
    // -----------------------------
    Object.keys(dataByDetector).forEach(id => {
        dataByDetector[id].forEach(dp => {
            if (dp.timestamp < fourWeeksAgo) return;
            const diff = now - dp.timestamp;
            let idx = 4;
            if (diff > 0 && diff <= weekMs) idx = 3;
            else if (diff <= 2 * weekMs) idx = 2;
            else if (diff <= 3 * weekMs) idx = 1;
            else if (diff <= 4 * weekMs) idx = 0;

            weeklyData[id][idx] = (weeklyData[id][idx] || 0) + dp.value;
            weekCounts[id][idx]++;
        });
    });

    [1, 2, 3, 4].forEach(id => {
        for (let i = 0; i < 5; i++) {
            if (weekCounts[id][i] > 0) {
                if (id > 2) weeklyData[id][i] /= weekCounts[id][i]; // средняя температура
            } else weeklyData[id][i] = 0;
        }
        
        // -----------------------------
        // Заполняем прогнозные данные (справа - позиции 5-7)
        // Позиции в массиве forecastData[id]:
        // [0] - прогноз на +1 неделю (168 часов)
        // [1] - прогноз на +2 недели (336 часов)  
        // [2] - прогноз на +3 недели (504 часа)
        // -----------------------------
        for (let i = 5; i < 8; i++) {
            weeklyData[id][i] = forecastData[id][i - 5];
        }
    });

    console.log('Итоговые данные для графиков:', weeklyData);
    return weeklyData;
}

// -----------------------------
// Создание графика
// -----------------------------
function createChart(canvasId, datasets) {
    const weekDates = calculateWeekDates();
    return new Chart(document.getElementById(canvasId).getContext('2d'), {
        type: 'line',
        data: { labels: chartCommonTimeLabels, datasets },
        options: {
            responsive: true,
            scales: {
                x: {
                    grid: {
                        color: ctx => ctx.tick.value === 4 ? '#6b7280' : 'rgba(0,0,0,0.1)',
                        lineWidth: ctx => ctx.tick.value === 4 ? 2 : 1,
                        borderDash: ctx => ctx.tick.value === 4 ? [5, 5] : [],
                        drawBorder: false
                    },
                    ticks: {
                        callback: (value, index) => index === 4 ? 'Сейчас' : chartCommonTimeLabels[index]
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.1)', borderDash: [5, 5] },
                    border: { dash: [5, 5] }
                }
            },
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: items => {
                            const index = items[0].dataIndex;
                            let label = `${chartCommonTimeLabels[index]} (${weekDates[index]})`;
                            // Добавляем пометку для прогнозных данных
                            if (index >= 5) {
                                label += ' [ПРОГНОЗ]';
                            }
                            return label;
                        },
                        label: ctx => {
                            let label = ctx.dataset.label ? ctx.dataset.label + ': ' : '';
                            if (ctx.parsed.y != null) {
                                if (label.includes('ХВС') || label.includes('ГВС')) label += ctx.parsed.y.toFixed(2) + ' м³';
                                else label += ctx.parsed.y.toFixed(1) + ' °C';
                                
                                // Пометка для прогнозных значений
                                if (ctx.dataIndex >= 5) {
                                    label += ' (прогноз)';
                                }
                            } else label += 'нет данных';
                            return label;
                        }
                    }
                },
                legend: {
                    labels: {
                        // Показываем в легенде, какие данные являются прогнозом
                        generateLabels: function(chart) {
                            const original = Chart.defaults.plugins.legend.labels.generateLabels;
                            const labels = original.call(this, chart);
                            
                            // Добавляем пометку для прогнозных линий
                            labels.forEach(label => {
                                if (label.text.includes('ХВС') || label.text.includes('ГВС') || 
                                    label.text.includes('Подача') || label.text.includes('Обратка') ||
                                    label.text.includes('T1') || label.text.includes('T2')) {
                                    label.text += ' (прогноз справа)';
                                }
                            });
                            return labels;
                        }
                    }
                }
            },
            elements: {
                line: { 
                    borderWidth: 1, 
                    tension: 0.4,
                    // Разный стиль линии для реальных и прогнозных данных
                    borderDash: function(ctx) {
                        // Для прогнозной части данных (позиции 5-7) используем пунктир
                        return ctx.dataIndex >= 5 ? [5, 5] : [];
                    }
                },
                point: { radius: 0 }
            }
        }
    });
}

// -----------------------------
// Подготовка датасетов для графиков
// -----------------------------
function prepareChartDatasets(monthlyData, ids, colors, labels) {
    return ids.map((id, i) => {
        const real = monthlyData[id].slice(0, 5);         // реальные данные (позиции 0-4)
        const forecast = monthlyData[id].slice(5, 8);     // прогнозные данные (позиции 5-7)
        
        return {
            label: labels[i],
            data: [...real, null, ...forecast],           // Слева реальные, справа прогноз
            borderColor: colors[i],
            backgroundColor: colors[i] + '20',
            fill: false,
            tension: 0.4,
            // Разный стиль для реальных и прогнозных данных
            segment: {
                borderDash: ctx => ctx.p1DataIndex >= 5 ? [5, 5] : [] // Пунктир для прогноза
            }
        };
    });
}

// -----------------------------
// Инициализация всех 4 графиков
// -----------------------------
async function initializeCharts() {
    try {
        const data = await processChartMonthlyData();

        // График 1: Потребление ХВС
        createChart('chart1', prepareChartDatasets(data, [1], ['#3b82f6'], ['Общее потребление ХВС, м³']));
        
        // График 2: Потребление ГВС  
        createChart('chart2', prepareChartDatasets(data, [2], ['#a855f7'], ['Общее потребление ГВС, м³']));
        
        // График 3: Температуры подачи и обратки
        createChart('chart3', prepareChartDatasets(data, [3, 4], ['#1e40af', '#a855f7'], ['Подача', 'Обратка']));
        
        // График 4: Средняя температура
        const avg = data[3].map((v, i) => (v != null && data[4][i] != null) ? (v + data[4][i]) / 2 : null);
        createChart('chart4', [
            ...prepareChartDatasets(data, [3], ['#a855f7'], ['T1']),
            ...prepareChartDatasets(data, [4], ['#3b82f6'], ['T2']),
            {
                label: 'Средняя температура', 
                data: [...avg.slice(0, 5), null, ...avg.slice(5, 8)],
                borderColor: '#10b981', 
                tension: 0.4, 
                borderDash: [5, 5], 
                fill: false,
                segment: {
                    borderDash: ctx => ctx.p1DataIndex >= 5 ? [5, 5] : [] // Пунктир для прогноза
                }
            }
        ]);
        
        // Добавляем информационное сообщение о прогнозе
        const infoDiv = Object.assign(document.createElement('div'), {
            style: 'color: #6b7280; text-align: center; padding: 10px; font-size: 12px; font-style: italic;',
            textContent: 'Данные справа от вертикальной линии являются прогнозными и обновляются регулярно'
        });
        document.body.prepend(infoDiv);
        
    } catch (e) {
        console.error('Ошибка инициализации:', e.message);
        document.body.prepend(Object.assign(document.createElement('div'), {
            style: 'color: red; text-align: center; padding: 20px',
            textContent: 'Ошибка загрузки данных графиков: ' + e.message
        }));
    }
}

document.addEventListener('DOMContentLoaded', initializeCharts);
