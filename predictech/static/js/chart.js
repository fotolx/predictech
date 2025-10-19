(() => {
  // ================== CONFIG ==================
  const REAL_DATA_URL = 'https://predictech.5d4.ru/detector_data_log/';
  const FORECAST_URL = 'https://predictech.5d4.ru/forecast/?house_id=2';

  // Группы детекторов (как у вас). Если нужно - поправьте id.
  const chart1Ids = [1, 5, 9, 13, 17]; // XVS
  const chart2Ids = [2, 6, 10, 14, 18]; // GVS
  // Температурные детекторы (в примере 3 и 4)
  const tempSupplyId = 3;
  const tempReturnId = 4;

  // подписки/метки для small графиков (4 прошлые, Сейчас, +3 прогноза)
  const smallLabels = ['-4 нед', '-3 нед', '-2 нед', '-1 нед', 'Сейчас', '+1 нед', '+2 нед', '+3 нед'];

  // какие week window по-умолчанию используем
  const DEFAULT_PAST_WEEKS = 10;
  const DEFAULT_FUTURE_WEEKS = 10;

  // Прокси-фолбэк (опционально)
  const PROXIES = [
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://proxy.cors.sh/',
    'https://cors-anywhere.herokuapp.com/'
  ];

  // ================== УТИЛИТЫ ==================
  const wkMs = 7 * 24 * 60 * 60 * 1000;

  function formatDate(d) {
    return String(d.getDate()).padStart(2, '0') + '.' +
           String(d.getMonth() + 1).padStart(2, '0') + '.' +
           d.getFullYear();
  }

  function safeNum(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // Пытаемся fetch, если не проходит — пробуем через прокси
  async function fetchWithFallback(url, opts = {}) {
    try {
      const r = await fetch(url, opts);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      console.warn('Direct fetch failed:', e.message);
    }
    for (const p of PROXIES) {
      try {
        const r = await fetch(p + url, opts);
        if (!r.ok) continue;
        return await r.text();
      } catch (e) {
        console.warn('Proxy failed:', p, e.message);
      }
    }
    throw new Error('Не удалось загрузить: ' + url);
  }

  // Парсинг JSON, устойчивый к "обёрткам" (текст с массивом/объектом)
  function parsePossiblyWrappedJson(txt) {
    const s = String(txt || '').trim();
    try {
      return JSON.parse(s);
    } catch (_) {
      const arr = s.match(/\[.*\]/s);
      if (arr) try { return JSON.parse(arr[0]); } catch (_) {}
      const obj = s.match(/\{.*\}/s);
      if (obj) try { return JSON.parse(obj[0]); } catch (_) {}
    }
    throw new Error('JSON parse error');
  }

  // Создаём массив дат: для small (4 прошлые + сейчас + 3 будущие)
  function calculateWeekDates(pastWeeks = 4, futureWeeks = 3) {
    const now = new Date();
    const arr = [];
    for (let i = pastWeeks; i >= 1; i--) arr.push(formatDate(new Date(now.getTime() - i * wkMs)));
    arr.push(formatDate(now));
    for (let i = 1; i <= futureWeeks; i++) arr.push(formatDate(new Date(now.getTime() + i * wkMs)));
    return arr;
  }

  function calculateWeekDatesExtended(pastWeeks = DEFAULT_PAST_WEEKS, futureWeeks = DEFAULT_FUTURE_WEEKS) {
    const now = new Date();
    const arr = [];
    for (let i = pastWeeks; i >= 1; i--) arr.push(formatDate(new Date(now.getTime() - i * wkMs)));
    arr.push(formatDate(now));
    for (let i = 1; i <= futureWeeks; i++) arr.push(formatDate(new Date(now.getTime() + i * wkMs)));
    return arr;
  }

  // ================== ЗАГРУЗКА ДАННЫХ ==================

  // --- real data ---
  async function loadRealData() {
    const txt = await fetchWithFallback(REAL_DATA_URL, { mode: 'cors' });
    const parsed = parsePossiblyWrappedJson(txt);
    // Стараемся вернуть массив записей
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.results)) return parsed.results;
    for (const k of Object.keys(parsed || {})) if (Array.isArray(parsed[k])) return parsed[k];
    return [parsed];
  }

  // --- forecast ---
  async function loadForecast() {
    const txt = await fetchWithFallback(FORECAST_URL, { mode: 'cors' });
    const parsed = parsePossiblyWrappedJson(txt);

    // Выбираем самую свежую запись, если пришёл массив
    let src = null;
    if (Array.isArray(parsed)) {
      src = parsed.reduce((acc, it) => {
        const ts = it.timestamp || (it.fields && it.fields.timestamp) || '';
        if (!acc) return it;
        const ats = acc.timestamp || (acc.fields && acc.fields.timestamp) || '';
        return new Date(ts) > new Date(ats) ? it : acc;
      }, null);
    } else src = parsed;

    if (!src) return {1:[null,null,null],2:[null,null,null],3:[null,null,null],4:[null,null,null]};

    const fields = src.fields ? src.fields : src;
    const p = name => safeNum(fields[name]);

    // НЕ домножаем по умолчанию на 1000 — оставляем в том же масштабе, в котором приходит.
    return {
      1: [p('flow_xvs_168'), p('flow_xvs_336'), p('flow_xvs_504')], // XVS (как есть)
      2: [p('flow_gvs_168'), p('flow_gvs_336'), p('flow_gvs_504')], // GVS
      3: [p('temp_supply_168'), p('temp_supply_336'), p('temp_supply_504')],
      4: [p('temp_return_168'), p('temp_return_336'), p('temp_return_504')]
    };
  }

  // ================== ИСТОРИЧЕСКАЯ ОБРАБОТКА ==================
  // Подход:
  //  - сначала группируем данные по detector -> по неделе (sum, count),
  //  - затем для группы детекторов (XVS/GVS) берём для каждой недели среднее по одному детектору (sum/count),
  //    и суммируем эти средние между детекторами (чтобы избежать двойного занижения/завышения).
  //  - Температуры считаем как общую средневзвешенную по всем записям.
  function aggregateByWeeksPerDetector(realData, pastWeeks = DEFAULT_PAST_WEEKS) {
    const now = Date.now();
    // структура: detectorId -> Array[pastWeeks+1] { sum, count }
    const perDetector = new Map();

    for (const it of realData) {
      const f = it.fields ? it.fields : it;
      const id = Number(f.detector_id || f.detectorId || f.id || f.detector);
      const val = safeNum(f.value !== undefined ? f.value : (f.v !== undefined ? f.v : null));
      const ts = f.timestamp || f.time || f.date;
      if (!id || val === null || !ts) continue;
      // учитываем только нужные id (потоки и темп)
      if (![...chart1Ids, ...chart2Ids, tempSupplyId, tempReturnId].includes(id)) continue;

      const dt = new Date(ts);
      if (isNaN(dt)) continue;
      const weeksAgo = Math.floor((now - dt.getTime()) / wkMs);
      if (weeksAgo < 0 || weeksAgo > pastWeeks) continue;
      const idx = pastWeeks - weeksAgo; // 0..pastWeeks (0 — самая старая, pastWeeks — сейчас)

      if (!perDetector.has(id)) perDetector.set(id, Array.from({length: pastWeeks + 1}, () => ({sum:0, count:0})));
      const slot = perDetector.get(id)[idx];
      slot.sum += val;
      slot.count += 1;
    }

    // теперь собираем итоговые массивы по группам 1..4
    const out = {1: Array(pastWeeks + 1).fill(null), 2: Array(pastWeeks + 1).fill(null), 3: Array(pastWeeks + 1).fill(null), 4: Array(pastWeeks + 1).fill(null)};

    // Функция: для набора детекторов возвращаем массив weekValues
    function computeGroup(ids, asFlow = true) {
      const res = Array(pastWeeks + 1).fill(null);
      for (let w = 0; w <= pastWeeks; w++) {
        // по каждому детектору берём среднее в этой неделе (если есть), затем суммируем эти средние
        let sumOfDetectorMeans = 0;
        let detectorsWithData = 0;
        for (const did of ids) {
          const arr = perDetector.get(did);
          if (!arr) continue;
          const slot = arr[w];
          if (!slot || slot.count === 0) continue;
          const mean = slot.sum / slot.count; // среднее по детектору за неделю
          sumOfDetectorMeans += mean;
          detectorsWithData++;
        }
        if (detectorsWithData === 0) {
          res[w] = null;
        } else {
          // Для потоков — суммируем средние по детекторам (даёт суммарную величину по группе детекторов).
          // Если нужно — можно разделить на detectorsWithData для среднего по детектору, но в нашем понимании
          // "Потребление ХВС" — это суммарный вклад всех детекторов, поэтому суммируем.
          res[w] = asFlow ? Number(sumOfDetectorMeans.toFixed(3)) : Number((sumOfDetectorMeans / detectorsWithData).toFixed(2));
          // для температур asFlow=false — возьмём среднее между детекторами (если нужно)
        }
      }
      return res;
    }

    // XVS и GVS
    out[1] = computeGroup(chart1Ids, true);
    out[2] = computeGroup(chart2Ids, true);

    // Температуры: для температуры более корректно считать усреднение по всем записям,
    // но тут применим схему детектор->среднее->усреднить между детекторами
    out[3] = computeGroup([tempSupplyId], false);
    out[4] = computeGroup([tempReturnId], false);

    return out;
  }

  // ================== ПРОГНОЗНАЯ ОБРАБОТКА ==================
  // Задачи:
  //  - Подготовить прогнозные значения из API
  //  - Сделать небольшое выравнивание масштаба прогноза по недавней истории (чтобы модель не "улетала")
  //  - Расширить прогноз на большее число недель (экстраполяция/линейное продолжение)
  //
  // Принцип выравнивания:
  //  - вычисляем recentAvg (среднее из последних N исторических недель, если есть),
  //  - вычисляем forecastAvg (среднее пришедших прогнозных значений),
  //  - коэффициент scale = recentAvg / forecastAvg, затем clamp scale в разумных пределах (0.7..1.3).
  //  - применяем scale к прогнозам (если прогноз явно присутствует и forecastAvg > 0).
  function alignForecastToHistory(forecastMap, historicalMap, lookbackWeeks = 3, minScale = 0.7, maxScale = 1.3) {
    const aligned = {};
    [1,2,3,4].forEach(id => {
      const hist = (historicalMap && historicalMap[id]) || [];
      // recentAvg: среднее по последним lookbackWeeks ненулевых значений
      const lastVals = [];
      for (let i = hist.length - 1; i >= 0 && lastVals.length < lookbackWeeks; i--) {
        if (hist[i] != null) lastVals.push(hist[i]);
      }
      const recentAvg = lastVals.length > 0 ? (lastVals.reduce((a,b)=>a+b,0) / lastVals.length) : null;
      const f = (forecastMap && forecastMap[id]) ? forecastMap[id].slice() : [];
      const fVals = f.filter(v => v != null);
      const forecastAvg = fVals.length > 0 ? (fVals.reduce((a,b)=>a+b,0) / fVals.length) : null;

      // Если обе средние есть и положительны — вычислим scale и применим (с ограничением)
      if (recentAvg != null && forecastAvg != null && forecastAvg !== 0) {
        let scale = recentAvg / forecastAvg;
        // ограничесм scale, чтобы прогноз не мутировал слишком сильно
        if (scale < minScale) scale = minScale;
        if (scale > maxScale) scale = maxScale;
        aligned[id] = f.map(v => (v == null ? null : Number((v * scale).toFixed(id <= 2 ? 3 : 2))));
      } else {
        // если не можем выровнять, просто возвращаем как есть
        aligned[id] = f.map(v => (v == null ? null : Number((v).toFixed(id <= 2 ? 3 : 2))));
      }
    });
    return aligned;
  }

  // Экстраполируем прогноз (линейно на основе двух последних известных точек, или вставаем константой)
  function extrapolateForecastMap(fmap, futureWeeks = DEFAULT_FUTURE_WEEKS) {
    const out = {};
    [1,2,3,4].forEach(id => {
      const base = Array.from((fmap && fmap[id]) || []);
      const res = Array(futureWeeks).fill(null);

      // Копируем доступные значения
      for (let i = 0; i < Math.min(base.length, futureWeeks); i++) res[i] = base[i] != null ? base[i] : null;

      // Найдём известные индексы
      const known = [];
      for (let i = 0; i < base.length; i++) if (base[i] != null) known.push({i, v: base[i]});

      if (known.length >= 2) {
        const a = known[known.length - 2], b = known[known.length - 1];
        const step = (b.v - a.v) / (b.i - a.i);
        for (let k = b.i + 1; k < futureWeeks; k++) {
          let val = b.v + step * (k - b.i);
          const places = (id <= 2) ? 3 : 2;
          res[k] = Number(val.toFixed(places));
        }
      } else if (known.length === 1) {
        for (let k = known[0].i + 1; k < futureWeeks; k++) res[k] = known[0].v;
      } else {
        // нет известных — оставляем null
      }

      out[id] = res;
    });
    return out;
  }

  // ================== СОСТАВЛЕНИЕ ДАННЫХ ДЛЯ ГРАФИКОВ ==================
  async function processChartData(pastWeeks = DEFAULT_PAST_WEEKS, futureWeeks = DEFAULT_FUTURE_WEEKS) {
    // загружаем параллельно
    const [realR, foreR] = await Promise.allSettled([loadRealData(), loadForecast()]);

    if (realR.status !== 'fulfilled') throw new Error('Ошибка загрузки реальных данных: ' + (realR.reason?.message || realR.reason));
    const realData = realR.value;

    const rawForecast = (foreR.status === 'fulfilled') ? foreR.value : {1:[null,null,null],2:[null,null,null],3:[null,null,null],4:[null,null,null]};

    // --- Историческая агрегация (детектор -> неделя -> среднее/сумма) ---
    const historicalByGroup = aggregateByWeeksPerDetector(realData, pastWeeks);

    // --- Выравнивание/масштабирование прогноза относительно истории (за последние 3 недели) ---
    const forecastAligned = alignForecastToHistory(rawForecast, historicalByGroup, 3, 0.7, 1.3);

    // --- Small (4 прошлые + Сейчас + 3 прогноза) ---
    const small = {1: Array(8).fill(null), 2: Array(8).fill(null), 3: Array(8).fill(null), 4: Array(8).fill(null)};
    // для индексации: прошлые 4 недели + сейчас — это последние 5 элементов из historicalByGroup[id]
    [1,2,3,4].forEach(id => {
      const hist = historicalByGroup[id] || [];
      const histLen = hist.length;
      // берем последние 5 значений (0..4: -4..Сейчас)
      for (let i = 0; i < 5; i++) {
        const idx = Math.max(0, histLen - 5 + i); // если истории меньше — от 0
        const v = hist[idx] !== undefined ? hist[idx] : null;
        small[id][i] = v != null ? v : null;
      }
      // прогнозные 3 значения (помещаем в позиции 5,6,7)
      for (let j = 0; j < 3; j++) small[id][5 + j] = (forecastAligned[id] && forecastAligned[id][j] !== undefined) ? forecastAligned[id][j] : null;
    });

    // --- Extended: история pastWeeks+1 + эктраполяция прогнозов на futureWeeks ---
    const forecastExtended = extrapolateForecastMap(forecastAligned, futureWeeks);
    const extended = {};
    const extLen = pastWeeks + 1 + futureWeeks;
    [1,2,3,4].forEach(id => {
      extended[id] = Array(extLen).fill(null);
      const hist = historicalByGroup[id] || [];
      // копируем историю (0..pastWeeks)
      for (let i = 0; i <= pastWeeks; i++) {
        extended[id][i] = (hist[i] !== undefined) ? hist[i] : null;
      }
      // копируем прогноз (pastWeeks+1 .. end)
      for (let j = 0; j < futureWeeks; j++) {
        extended[id][pastWeeks + 1 + j] = (forecastExtended[id] && forecastExtended[id][j] !== undefined) ? forecastExtended[id][j] : null;
      }
    });

    return { small, extended, weekDatesSmall: calculateWeekDates(4,3), weekDatesExtended: calculateWeekDatesExtended(pastWeeks, futureWeeks) };
  }

  // ================== CHART HELPERS (оставлены схожими с вашим оригиналом) ==================
  // (Для краткости - считаю что Chart.js уже подключен как в оригинале)
  const nowLinePlugin = {
    id: 'nowLineSmall',
    afterDraw(chart) {
      const xIdx = 4; // "Сейчас" в small
      const xScale = chart.scales?.x; if (!xScale) return;
      const x = xScale.getPixelForValue(xIdx);
      const ctx = chart.ctx; const top = chart.chartArea.top; const bottom = chart.chartArea.bottom;
      ctx.save(); ctx.beginPath(); ctx.setLineDash([6, 4]); ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1.2;
      ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.restore();
    }
  };

  function createSmallChart(canvasId, datasets, unitType, weekDates) {
    const canvas = document.getElementById(canvasId); if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const cfg = {
      type: 'line',
      data: { labels: smallLabels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: true } }, y: { beginAtZero: false, grid: { display: true } } },
        plugins: {
          tooltip: {
            mode: 'index', intersect: false,
            callbacks: {
              title: items => {
                const i = items[0].dataIndex; const lbl = smallLabels[i] || '';
                const date = (weekDates && weekDates[i]) ? weekDates[i] : '';
                return i >= 5 ? `${lbl} (${date}) [ПРОГНОЗ]` : `${lbl} (${date})`;
              },
              label: ctx => {
                const y = ctx.parsed?.y; let s = (ctx.dataset.label ? ctx.dataset.label + ': ' : '');
                if (y === null || y === undefined || isNaN(y)) s += 'нет данных';
                else s += (unitType === 'flow' ? Number(y).toFixed(0) + ' м³' : Number(y).toFixed(1) + ' °C') + (ctx.dataIndex >= 5 ? ' (прогноз)' : '');
                return s;
              }
            }
          },
          legend: { display: true, position: 'top' }
        },
        elements: { line: { borderWidth: 1, tension: 0.35 }, point: { radius: 3 } }
      },
      plugins: [nowLinePlugin]
    };
    cfg.data.datasets = cfg.data.datasets.map(ds => ({ ...ds, backgroundColor: (ds.borderColor && ds.borderColor.length === 7 ? ds.borderColor + '22' : ds.backgroundColor), spanGaps: false }));
    try { return new Chart(ctx, cfg); } catch (e) { console.error('createSmallChart error', e); return null; }
  }

  function prepareSmallDatasets(monthlyData, ids, colors, labels) {
    return ids.map((id, i) => {
      const arr = monthlyData[id] || Array(8).fill(null);
      return {
        label: labels && labels[i] ? labels[i] : `Детектор ${id}`,
        data: Array.from({ length: 8 }, (_, idx) => idx < arr.length ? arr[idx] : null),
        borderColor: colors && colors[i] ? colors[i] : '#000',
        fill: false,
        tension: 0.35,
        pointRadius: 3,
        segment: {
          borderDash: ctx => {
            try { return (ctx && ctx.p1DataIndex >= 5) ? [6, 4] : []; } catch { return []; }
          }
        }
      };
    });
  }

  function prepareExtendedDatasets(extendedData, ids, colors, labels) {
    return ids.map((id, i) => {
      const arr = (extendedData[id] && Array.isArray(extendedData[id])) ? extendedData[id] : [];
      return {
        label: labels && labels[i] ? labels[i] : `Детектор ${id}`,
        data: Array.from({ length: arr.length }, (_, idx) => arr[idx] !== undefined ? arr[idx] : null),
        borderColor: colors && colors[i] ? colors[i] : '#000',
        fill: false,
        tension: 0.25,
        pointRadius: 3,
        spanGaps: true
      };
    });
  }

  // ================== ИНИЦИАЛИЗАЦИЯ ВСЕГО ==================
  let modalStore = {};

  async function initialize() {
    try {
      const pastWeeks = DEFAULT_PAST_WEEKS;
      const futureWeeks = DEFAULT_FUTURE_WEEKS;
      const { small, extended, weekDatesSmall, weekDatesExtended } = await processChartData(pastWeeks, futureWeeks);

      // chart1 (XVS)
      const ds1 = prepareSmallDatasets(small, [1], ['#3b82f6'], ['Общее потребление ХВС, м³']);
      createSmallChart('chart1', ds1, 'flow', weekDatesSmall);
      const extDs1 = prepareExtendedDatasets(extended, [1], ['#3b82f6'], ['Общее потребление ХВС, м³']);
      const extLabels = [];
      for (let i = -pastWeeks; i <= futureWeeks; i++) extLabels.push(i < 0 ? `${i} нед` : (i === 0 ? 'Сейчас' : `+${i} нед`));
      modalStore['chart1'] = {
        datasets: extDs1,
        unitType: 'flow',
        title: 'Общее потребление ХВС, м³ — расширенный период',
        labelsArray: extLabels,
        weekDates: weekDatesExtended,
        centerIndex: pastWeeks,
        pastWeeks
      };

      // chart2 (GVS)
      const ds2 = prepareSmallDatasets(small, [2], ['#a855f7'], ['Общее потребление ГВС, м³']);
      createSmallChart('chart2', ds2, 'flow', weekDatesSmall);
      const extDs2 = prepareExtendedDatasets(extended, [2], ['#a855f7'], ['Общее потребление ГВС, м³']);
      modalStore['chart2'] = {
        datasets: extDs2,
        unitType: 'flow',
        title: 'Общее потребление ГВС, м³ — расширенный период',
        labelsArray: extLabels,
        weekDates: weekDatesExtended,
        centerIndex: pastWeeks,
        pastWeeks
      };

      // chart3 (подача/обратка)
      const ds3 = prepareSmallDatasets(small, [3,4], ['#1e40af','#a855f7'], ['Подача','Обратка']);
      createSmallChart('chart3', ds3, 'temp', weekDatesSmall);
      const extDs3 = prepareExtendedDatasets(extended, [3,4], ['#1e40af','#a855f7'], ['Подача','Обратка']);
      modalStore['chart3'] = {
        datasets: extDs3,
        unitType: 'temp',
        title: 'Подача / Обратка — расширенный период',
        labelsArray: extLabels,
        weekDates: weekDatesExtended,
        centerIndex: pastWeeks,
        pastWeeks
      };

      // chart4 — T1, T2, avg
      const dsT1 = prepareSmallDatasets(small, [3], ['#a855f7'], ['T1 (подача)']);
      const dsT2 = prepareSmallDatasets(small, [4], ['#3b82f6'], ['T2 (обратка)']);
      const avg = Array(8).fill(null).map((_, idx) => {
        const a = small[3][idx], b = small[4][idx];
        return (a != null && b != null) ? Number(((a + b) / 2).toFixed(2)) : null;
      });
      const avgDataset = {
        label: 'Средняя температура',
        data: avg,
        borderColor: '#10b981',
        borderDash: [6, 4],
        fill: false,
        tension: 0.35,
        pointRadius: 0,
        segment: { borderDash: ctx => (ctx && ctx.p1DataIndex >= 5 ? [6, 4] : []) }
      };
      createSmallChart('chart4', [...dsT1, ...dsT2, avgDataset], 'temp', weekDatesSmall);

      // extended avg
      const extT1 = prepareExtendedDatasets(extended, [3], ['#a855f7'], ['T1 (подача)'])[0];
      const extT2 = prepareExtendedDatasets(extended, [4], ['#3b82f6'], ['T2 (обратка)'])[0];
      const extLen = extended[3].length;
      const avgExt = Array(extLen).fill(null).map((_, idx) => {
        const a = extended[3][idx], b = extended[4][idx];
        return (a != null && b != null) ? Number(((a + b) / 2).toFixed(2)) : null;
      });
      const avgExtDs = { ...avgDataset, data: avgExt, pointRadius: 0, borderDash: [6,4] };
      modalStore['chart4'] = {
        datasets: [extT1, extT2, avgExtDs],
        unitType: 'temp',
        title: 'Температуры — расширенный период',
        labelsArray: extLabels,
        weekDates: weekDatesExtended,
        centerIndex: pastWeeks,
        pastWeeks
      };

      // биндим клики (если у вас есть функции modal open — оставил простую привязку)
      function bindClick(canvasId, key) {
        const el = document.getElementById(canvasId); if (!el) return;
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
          const payload = modalStore[key]; if (!payload) return;
          // Если у вас есть openModal — используйте. Здесь просто логируем.
          console.log('Open modal payload for', key, payload);
          // openModal(payload) // <-- подключите вашу реализацию модального окна
        });
      }
      bindClick('chart1','chart1'); bindClick('chart2','chart2'); bindClick('chart3','chart3'); bindClick('chart4','chart4');

      console.log('Charts initialized — small and extended data prepared.');
    } catch (err) {
      console.error('Init error', err);
      const alertBox = document.createElement('div');
      Object.assign(alertBox.style, { color: '#7f1d1d', background: '#fff1f2', border: '1px solid #fecaca', padding: '12px', margin: '10px', textAlign: 'center' });
      alertBox.textContent = 'Ошибка загрузки данных графиков: ' + (err.message || err);
      document.body.prepend(alertBox);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();

})();
