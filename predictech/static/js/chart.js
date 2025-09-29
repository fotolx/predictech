// Общие настройки для всех графиков
const commonTimeLabels = ['-18ч', '-12ч', '-6ч', 'Сейчас', '+6ч', '+12ч', '+18ч', '24ч'];

// Функция для создания графика
function createChart(canvasId, datasets) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: commonTimeLabels,
            datasets: datasets.map(dataset => ({
                ...dataset,
                borderWidth: 1, // Устанавливаем толщину линии 2px для всех графиков
                borderDash: dataset.borderDash || [] // Добавляем свойство для пунктирных линий
            }))
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    grid: {
                        color: function (context) {
                            return context.tick.value === 3 ? '#6b7280' : 'rgba(0,0,0,0.1)';
                        },
                        lineWidth: function (context) {
                            return context.tick.value === 3 ? 2 : 1;
                        },
                        borderDash: function (context) {
                            return context.tick.value === 3 ? [5, 5] : []; // Штрих-пунктир для линии "Сейчас"
                        },
                        drawBorder: false // Убираем основную границу оси X
                    },
                    ticks: {
                        callback: function (value, index, values) {
                            if (index === 3) return 'Сейчас';
                            return commonTimeLabels[index];
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0,0,0,0.1)',
                        borderDash: [5, 5] // Делаем все горизонтальные линии штрих-пунктирными
                    },
                    border: {
                        dash: [5, 5] // Делаем саму ось Y тоже штрих-пунктирной
                    }
                }
            },
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false
                },
                legend: {
                    display: datasets.length > 1
                }
            },
            elements: {
                line: {
                    borderWidth: 1 // Дублируем настройку толщины линии
                },
                point: {
                    radius: 0 // Убираем точки на графике для лучшей видимости линий
                }
            }
        }
    });
}

// Данные для графиков
// График 1: Одна линия
const chart1Data = [{
    label: 'Общее потребление ВС, м3',
    data: [12, 15, 18, 22, 25, 28, 30, 32, 35],
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(0, 0, 255, 0.1)',
    tension: 0.4,
    fill: false
}];

// График 2: Одна линия (другие данные)
const chart2Data = [{
    label: 'Общее потребление ГВС, м3',
    data: [7, 9, 10, 11, 12, 13, 12, 10, 8],
    borderColor: '#a855f7',
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    tension: 0.4,
    fill: false
}];

// График 3: Две линии
const chart3Data = [
    {
        label: 'Подача',
        data: [10, 14, 18, 25, 30, 28, 26, 24, 22],
        borderColor: '#1e40af',
        backgroundColor: 'rgba(255, 0, 0, 0.1)',
        tension: 0.4,
        fill: false
    },
    {
        label: 'Обратка',
        data: [5, 8, 12, 15, 18, 20, 22, 24, 26],
        borderColor: '#a855f7',
        backgroundColor: 'rgba(255, 165, 0, 0.1)',
        tension: 0.4,
        fill: false
    }
];

// График 4: Четыре линии
const chart4Data = [
    {
        label: 'T1',
        data: [15, 18, 22, 28, 32, 30, 28, 26, 24],
        borderColor: '#a855f7',
        backgroundColor: 'rgba(128, 0, 128, 0.1)',
        tension: 0.4,
        fill: false
    },
    {
        label: 'T2',
        data: [20, 22, 24, 26, 24, 22, 20, 18, 16],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(255, 192, 203, 0.1)',
        tension: 0.4,
        fill: false
    },
      {
        label: 'Cреднее значение',
        data: [8, 10, 14, 18, 22, 25, 28, 30, 32],
        borderColor: '#1f2937',
        backgroundColor: 'rgba(165, 42, 42, 0.1)',
        tension: 0.4,
        fill: false
    },
];

// Создание графиков
createChart('chart1', chart1Data);
createChart('chart2', chart2Data);
createChart('chart3', chart3Data);
createChart('chart4', chart4Data);