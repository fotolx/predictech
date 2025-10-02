const chartCommonTimeLabels = ['-4 нед', '-3 нед', '-2 нед', '-1 нед', 'Сейчас', '+1 нед', '+2 нед', '+3 нед'];

// --- Настройки URL'ов ---
const REAL_DATA_URL = 'https://predictech.5d4.ru/detector_data_log/';
const FORECAST_URL = 'https://predictech.5d4.ru/forecast/?house_id=2';

// --- Прокси (fallback на случай CORS/блокировок) ---
const PROXIES = [
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://proxy.cors.sh/',
  'https://cors-anywhere.herokuapp.com/'
];

// ------------------------------- УТИЛИТЫ -------------------------------

// Форматирование даты в dd.mm.yyyy
function formatDate(d) {
  return String(d.getDate()).padStart(2, '0') + '.' +
         String(d.getMonth() + 1).padStart(2, '0') + '.' +
         d.getFullYear();
}

// Массив дат для подписей графиков по неделям
function calculateWeekDates() {
  const now = new Date();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const arr = [];
  for (let i = 4; i >= 1; i--) arr.push(formatDate(new Date(now.getTime() - i * weekMs)));
  arr.push(formatDate(now));
  for (let i = 1; i <= 3; i++) arr.push(formatDate(new Date(now.getTime() + i * weekMs)));
  return arr;
}

// Универсальный fetch с фоллбэком по прокси
async function fetchWithFallback(url, options = {}) {
  try {
    const r = await fetch(url, options);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch (err) {
    console.warn('Прямая загрузка не удалась:', err.message);
  }
  for (const proxy of PROXIES) {
    try {
      console.log('Пытаемся через прокси:', proxy);
      const r = await fetch(proxy + url, options);
      if (!r.ok) {
        console.warn('Прокси вернул не-OK:', proxy, r.status);
        continue;
      }
      return await r.text();
    } catch (e) {
      console.warn('Прокси не сработал:', proxy, e.message);
    }
  }
  throw new Error('Не удалось загрузить данные (включая все прокси)');
}

// Попытка аккуратно распарсить возможный "обернутый" JSON
function parsePossiblyWrappedJson(text) {
  const cleaned = String(text).trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const arrMatch = cleaned.match(/\[.*\]/s);
    if (arrMatch) {
      try { return JSON.parse(arrMatch[0]); } catch(e){}
    }
    const objMatch = cleaned.match(/\{.*\}/s);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch(e){}
    }
    throw new Error('Не удалось распарсить JSON из ответа');
  }
}

// Безопасное приведение к Number или null
function safeNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ------------------------------- ЗАГРУЗКА ДАННЫХ -------------------------------

// 1) Загружаем реальные детекторные данные (ожидается массив объектов)
async function loadRealDetectorData() {
  const txt = await fetchWithFallback(REAL_DATA_URL, { method: 'GET', mode: 'cors' });
  const parsed = parsePossiblyWrappedJson(txt);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.results)) return parsed.results;
  for (const k of Object.keys(parsed || {})) {
    if (Array.isArray(parsed[k])) return parsed[k];
  }
  return [parsed];
}

// 2) Загружаем прогнозные данные (выбираем самый свежий по timestamp)
async function loadForecastPerDetector() {
  const txt = await fetchWithFallback(FORECAST_URL, { method: 'GET', mode: 'cors' });
  const parsed = parsePossiblyWrappedJson(txt);

  let best = null;
  if (Array.isArray(parsed)) {
    best = parsed.reduce((acc, it) => {
      const ts = (it.timestamp || (it.fields && it.fields.timestamp) || '');
      if (!acc) return it;
      const aTs = (acc.timestamp || (acc.fields && acc.fields.timestamp) || '');
      return new Date(ts) > new Date(aTs) ? it : acc;
    }, null);
  } else if (parsed && typeof parsed === 'object') {
    best = parsed;
  }
  if (!best) throw new Error('Прогноз не найден в ответе');

  const src = best.fields ? best.fields : best;
  const pick = (name) => safeNum(src[name]);

  return {
    1: [ pick('flow_xvs_168'), pick('flow_xvs_336'), pick('flow_xvs_504') ], // ХВС
    2: [ pick('flow_gvs_168'), pick('flow_gvs_336'), pick('flow_gvs_504') ], // ГВС
    3: [ pick('temp_supply_168'), pick('temp_supply_336'), pick('temp_supply_504') ], // Т1
    4: [ pick('temp_return_168'), pick('temp_return_336'), pick('temp_return_504') ]  // Т2
  };
}

// ------------------------------- ОБРАБОТКА ДАННЫХ ПО НЕДЕЛЯМ -------------------------------

// Формирует данные по неделям: weeklyData[id] = [8 значений: 0..4 реальные, 5..7 прогноз]
async function processChartMonthlyData() {
  const [realSettled, forecastSettled] = await Promise.allSettled([
    loadRealDetectorData(),
    loadForecastPerDetector()
  ]);

  if (realSettled.status !== 'fulfilled') {
    throw new Error('Ошибка загрузки реальных данных: ' +
      (realSettled.reason && realSettled.reason.message ? realSettled.reason.message : realSettled.reason));
  }
  const realData = realSettled.value;
  const forecastMap = (forecastSettled.status === 'fulfilled')
    ? forecastSettled.value
    : {1:[null,null,null],2:[null,null,null],3:[null,null,null],4:[null,null,null]};

  // Аккумулируем суммы и счетчики по 5 неделям (0..4: -4..Сейчас)
  const sums = {1:Array(5).fill(0), 2:Array(5).fill(0), 3:Array(5).fill(0), 4:Array(5).fill(0)};
  const counts = {1:Array(5).fill(0), 2:Array(5).fill(0), 3:Array(5).fill(0), 4:Array(5).fill(0)};

  realData.forEach(item => {
    const f = item.fields ? item.fields : item;
    const id = Number(f.detector_id || f.detectorId || f.id || f.detector);
    const timestampStr = f.timestamp || f.time || f.date;
    const value = safeNum(f.value !== undefined ? f.value : f.v);
    if (!id || !timestampStr || value === null) return;

    const ts = new Date(timestampStr);
    if (isNaN(ts)) return;

    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const weeksAgo = Math.floor((now - ts.getTime()) / weekMs);
    if (weeksAgo < 0 || weeksAgo > 4) return;
    const idx = 4 - weeksAgo; // 4 - weeksAgo: 0 => индекс 4 (Сейчас), 4 => индекс 0 (-4 нед.)
    if (!sums[id]) return;
    sums[id][idx] += value;
    counts[id][idx] += 1;
  });

  // Формируем итоговый weeklyData
  const weeklyData = {1:Array(8).fill(null),2:Array(8).fill(null),3:Array(8).fill(null),4:Array(8).fill(null)};
  [1,2,3,4].forEach(id => {
    // Реальные данные (0..4): суммируем (или усредняем для температур)
    for (let i = 0; i < 5; i++) {
      if (counts[id][i] === 0) {
        weeklyData[id][i] = null;
      } else {
        if (id === 1 || id === 2) {
          // для потоков — оставляем сумму
          weeklyData[id][i] = Number(sums[id][i].toFixed(3));
        } else {
          // для температур — среднее значение
          weeklyData[id][i] = Number((sums[id][i] / counts[id][i]).toFixed(2));
        }
      }
    }
    // Прогнозные значения (5..7) вставляем напрямую из forecastMap
    if (forecastMap && forecastMap[id]) {
      weeklyData[id][5] = forecastMap[id][0] !== undefined ? forecastMap[id][0] : null;
      weeklyData[id][6] = forecastMap[id][1] !== undefined ? forecastMap[id][1] : null;
      weeklyData[id][7] = forecastMap[id][2] !== undefined ? forecastMap[id][2] : null;
    } else {
      weeklyData[id][5] = weeklyData[id][6] = weeklyData[id][7] = null;
    }
  });

  return weeklyData;
}

// ------------------------------- ВИЗУАЛИЗАЦИЯ (Chart.js) -------------------------------

// Плагин для вертикальной линии "Сейчас"
const nowLinePlugin = {
  id: 'nowLinePlugin',
  afterDraw: (chart) => {
    const xIndex = 4; // метка "Сейчас" (четвертая, нумеруя с 0)
    const xScale = chart.scales.x;
    if (!xScale) return;
    const x = xScale.getPixelForValue(xIndex);
    const ctx = chart.ctx;
    const top = chart.chartArea.top;
    const bottom = chart.chartArea.bottom;

    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6,4]);
    ctx.strokeStyle = '#6b7280';
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();

    // Подпись "Сейчас" под графиком
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';
    ctx.font = '12px Arial';
    ctx.fillText('', x, bottom + 20);
    ctx.restore();
  }
};

// Создание графика с учетом прогнозных данных
function createChart(canvasId, datasets, unitType) {
  const weekDates = calculateWeekDates();
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.error('Canvas element not found:', canvasId);
    return null;
  }
  const ctx = canvas.getContext('2d');

  // Функция для полупрозрачного фона
  const makeBg = (hex) => {
    if (typeof hex === 'string' && hex.startsWith('#') && hex.length === 7) return hex + '22';
    return hex;
  };

  const cfg = {
    type: 'line',
    data: {
      labels: chartCommonTimeLabels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          grid: { display: true },
          ticks: {
            callback: (val, idx) => chartCommonTimeLabels[idx] || ''
          }
        },
        y: {
          beginAtZero: false,
          grid: { display: true }
        }
      },
      plugins: {
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: items => {
              const i = items[0].dataIndex;
              const label = chartCommonTimeLabels[i] || '';
              const date = weekDates[i] || '';
              let titleText = `${label} (${date})`;
              if (i >= 5) titleText += ' [ПРОГНОЗ]';
              return titleText;
            },
            label: ctx => {
              const y = ctx.parsed && ctx.parsed.y;
              let label = ctx.dataset.label ? ctx.dataset.label + ': ' : '';
              if (y === null || y === undefined || isNaN(y)) {
                label += 'нет данных';
              } else {
                if (unitType === 'flow') {
                  label += Number(y).toFixed(3) + ' м³';
                } else {
                  label += Number(y).toFixed(1) + ' °C';
                }
                if (ctx.dataIndex >= 5) label += ' (прогноз)';
              }
              return label;
            }
          }
        },
        legend: { display: true, position: 'top' }
      },
      elements: {
        line: { borderWidth: 1, tension: 0.35 },
        point: { radius: 3 }
      }
    },
    plugins: [nowLinePlugin]
  };

  // Добавляем полупрозрачный фон в datasets
  cfg.data.datasets = cfg.data.datasets.map(ds => ({
    ...ds,
    backgroundColor: makeBg(ds.borderColor || ds.backgroundColor),
    spanGaps: false
  }));

  try {
    return new Chart(ctx, cfg);
  } catch (e) {
    console.error('Ошибка создания Chart:', e);
    return null;
  }
}

// Подготовка датасетов — длина 8, сегментированный пунктир для прогноза
function prepareChartDatasets(monthlyData, ids, colors, labels) {
  return ids.map((id, i) => {
    const arr = monthlyData[id] || Array(8).fill(null);
    const data = Array.from({ length: 8 }, (_, idx) => (idx < arr.length ? arr[idx] : null));
    return {
      label: labels[i] || `Детектор ${id}`,
      data: data,
      borderColor: colors[i] || '#000',
      fill: false,
      tension: 0.35,
      pointRadius: 3,
      segment: {
        borderDash: ctx => ctx.p1DataIndex >= 5 ? [5,5] : []
      }
    };
  });
}

// ------------------------------- ИНИЦИАЛИЗАЦИЯ ГРАФИКОВ -------------------------------

async function initializeCharts() {
  try {
    const monthly = await processChartMonthlyData();

    // График 1: ХВС — поток (м³)
    const ds1 = prepareChartDatasets(monthly, [1], ['#3b82f6'], ['Общее потребление ХВС, м³']);
    createChart('chart1', ds1, 'flow');

    // График 2: ГВС — поток (м³)
    const ds2 = prepareChartDatasets(monthly, [2], ['#a855f7'], ['Общее потребление ГВС, м³']);
    createChart('chart2', ds2, 'flow');

    // График 3: Температуры подачи (3) и обратки (4), °C
    const ds3 = prepareChartDatasets(monthly, [3, 4], ['#1e40af', '#a855f7'], ['Подача', 'Обратка']);
    createChart('chart3', ds3, 'temp');

    // График 4: T1 (3), T2 (4) и средняя температура
    const dsT1 = prepareChartDatasets(monthly, [3], ['#a855f7'], ['T1 (подача)']);
    const dsT2 = prepareChartDatasets(monthly, [4], ['#3b82f6'], ['T2 (обратка)']);

    const avg = Array(8).fill(null).map((_, idx) => {
      const v1 = monthly[3] ? monthly[3][idx] : null;
      const v2 = monthly[4] ? monthly[4][idx] : null;
      if (v1 !== null && v1 !== undefined && v2 !== null && v2 !== undefined) {
        return Number(((v1 + v2) / 2).toFixed(2));
      }
      return null;
    });
    const avgDataset = {
      label: 'Средняя температура',
      data: avg,
      borderColor: '#10b981',
      borderDash: [6,4],
      fill: false,
      tension: 0.35,
      pointRadius: 0,
      segment: {
        borderDash: ctx => ctx.p1DataIndex >= 5 ? [5,5] : []
      }
    };
    createChart('chart4', [...dsT1, ...dsT2, avgDataset], 'temp');

    // Информационное сообщение о прогнозных данных
    const infoDiv = document.createElement('div');
    infoDiv.style = 'color: #6b7280; text-align: center; padding: 10px; font-size: 12px; font-style: italic;';
    infoDiv.textContent = 'Данные справа от вертикальной линии являются прогнозными и обновляются регулярно';
    document.body.prepend(infoDiv);

    console.log('Графики инициализированы успешно');
  } catch (e) {
    console.error('Ошибка инициализации графиков:', e);
    const el = document.createElement('div');
    el.style = 'color:#7f1d1d;background:#fff1f2;border:1px solid #fecaca;padding:12px;margin:10px;text-align:center;';
    el.textContent = 'Ошибка загрузки данных графиков: ' + (e && e.message ? e.message : e);
    document.body.prepend(el);
  }
}

// Запуск после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
  initializeCharts();
});
