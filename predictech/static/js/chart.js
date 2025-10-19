(() => {
  // ========================
  // ===  CONFIG / CONST  ===
  // ========================
  const REAL_DATA_URL = 'https://predictech.5d4.ru/detector_data_log/';
  const FORECAST_URL = 'https://predictech.5d4.ru/forecast/?house_id=2';

  // Если нужно — можно добавить прокси, но по умолчанию я не использую автоподстановку прокси.
  const PROXIES = [
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://proxy.cors.sh/',
    'https://cors-anywhere.herokuapp.com/'
  ];

  // Какие id входят в XVS и GVS (как у вас было)
  const chart1Ids = [1, 5, 9, 13, 17]; // XVS
  const chart2Ids = [2, 6, 10, 14, 18]; // GVS

  // Подписи для "small" графиков (8 точек: 4 прошлые + Сейчас + 3 прогноза)
  const smallLabels = ['-4 нед', '-3 нед', '-2 нед', '-1 нед', 'Сейчас', '+1 нед', '+2 нед', '+3 нед'];

  // ========================
  // ===  УТИЛИТЫ / PARSERS ===
  // ========================
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

  // Попытка безопасного JSON-парса (иногда API оборачивает данные текстом)
  function parsePossiblyWrappedJson(txt) {
    const s = String(txt).trim();
    try { return JSON.parse(s); } catch (_) {}
    // Ищем JSON-массив или объект в теле
    const arrMatch = s.match(/\[.*\]/s);
    if (arrMatch) try { return JSON.parse(arrMatch[0]); } catch (_) {}
    const objMatch = s.match(/\{.*\}/s);
    if (objMatch) try { return JSON.parse(objMatch[0]); } catch (_) {}
    throw new Error('JSON parse error');
  }

  // Fetch с последовательным фолбэком на прокси (если прямой fetch не прошёл)
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

  // ========================
  // ===  ЗАГРУЗКА ДАННЫХ  ===
  // ========================
  async function loadRealData() {
    const txt = await fetchWithFallback(REAL_DATA_URL, { mode: 'cors' });
    const parsed = parsePossiblyWrappedJson(txt);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.results)) return parsed.results;
    for (const k of Object.keys(parsed || {})) if (Array.isArray(parsed[k])) return parsed[k];
    return [parsed];
  }

  // Загружаем прогноз — НЕ умножаем по-умолчанию на 1000.
  // Возвращаем в формате {1: [v1,v2,v3], 2: [...], 3: [...], 4: [...]}
  async function loadForecast() {
    const txt = await fetchWithFallback(FORECAST_URL, { mode: 'cors' });
    const parsed = parsePossiblyWrappedJson(txt);

    // Если пришёл массив записей — выберем самую свежую
    let src = null;
    if (Array.isArray(parsed)) {
      src = parsed.reduce((acc, it) => {
        const ts = it.timestamp || (it.fields && it.fields.timestamp) || '';
        if (!acc) return it;
        const ats = acc.timestamp || (acc.fields && acc.fields.timestamp) || '';
        return new Date(ts) > new Date(ats) ? it : acc;
      }, null);
    } else {
      src = parsed;
    }
    if (!src) return {1:[null,null,null],2:[null,null,null],3:[null,null,null],4:[null,null,null]};

    const fields = src.fields ? src.fields : src;
    const p = name => safeNum(fields[name]);

    // IMPORTANT: тут мы НЕ умножаем на 1000 слепо.
    return {
      1: [p('flow_xvs_168'), p('flow_xvs_336'), p('flow_xvs_504')], // XVS forecast raw
      2: [p('flow_gvs_168'), p('flow_gvs_336'), p('flow_gvs_504')], // GVS forecast raw
      3: [p('temp_supply_168'), p('temp_supply_336'), p('temp_supply_504')],
      4: [p('temp_return_168'), p('temp_return_336'), p('temp_return_504')]
    };
  }

  // ========================
  // ===  ИСТОРИЧЕСКАЯ ОБРАБОТКА ===
  // Суммируем значения детекторов по неделям.
  // Для потоков (XVS/GVS) складываем значения всех детекторов в группе
  // Для температур — берём среднее по детекторам.
  // ========================
  function aggregateByWeeks(realData, pastWeeks = 10) {
    const wk = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const len = pastWeeks + 1; // includes "now" as last index

    const sums = {1: Array(len).fill(0), 2: Array(len).fill(0), 3: Array(len).fill(0), 4: Array(len).fill(0)};
    const counts = {1: Array(len).fill(0), 2: Array(len).fill(0), 3: Array(len).fill(0), 4: Array(len).fill(0)};

    for (const it of realData) {
      const f = it.fields ? it.fields : it;
      const id = Number(f.detector_id || f.detectorId || f.id || f.detector);
      const val = safeNum(f.value !== undefined ? f.value : (f.v !== undefined ? f.v : null));
      const tsStr = f.timestamp || f.time || f.date;
      if (!id || val === null || !tsStr) continue;
      // ignore unrelated detectors
      if (!chart1Ids.includes(id) && !chart2Ids.includes(id) && id !== 3 && id !== 4) continue;

      const dt = new Date(tsStr);
      if (isNaN(dt)) continue;

      const weeksAgo = Math.floor((now - dt.getTime()) / wk);
      if (weeksAgo < 0 || weeksAgo > pastWeeks) continue;

      const idx = pastWeeks - weeksAgo; // 0..pastWeeks (0 oldest, last index — сейчас)
      const target = chart1Ids.includes(id) ? 1 : (chart2Ids.includes(id) ? 2 : id);

      // Для потоков — складываем значения (итог — суммарное потребление по группе)
      sums[target][idx] += val;
      counts[target][idx] += 1;
    }

    // Сформируем итог: для потоков (1,2) возвращаем сумму;
    // для температур — среднее (с учётом counts).
    const out = {};
    [1,2,3,4].forEach(id => {
      out[id] = Array(len).fill(null);
      for (let i = 0; i < len; i++) {
        if (counts[id][i] === 0) { out[id][i] = null; continue; }
        if (id === 1 || id === 2) {
          // XVS/GVS — суммарное значение за эту неделю (оставляем целое значение)
          out[id][i] = Number(sums[id][i].toFixed(3)); // сохраняем точность, при отображении округлим
        } else {
          // Температуры — среднее
          out[id][i] = Number((sums[id][i] / counts[id][i]).toFixed(2));
        }
      }
    });
    return out;
  }

  // ========================
  // ===  ПРОГНОЗ: нормализация + экстраполяция  ===
  // 1) Нормализация прогнозов: если прогноз в другой шкале, приводим его к шкале истории.
  //    Делается по правилу: scale = histNow / forecastMean (ограниченный диапазон).
  //    Это предотвращает резкие расхождения и делает прогноз сопоставимым с историей.
  // 2) Экстраполяция: линейная экстраполяция, если в прогнозе есть >=2 значений; если 1 — константа.
  // ========================
  function normalizeForecastToHistory(forecastMap, historical, idsToNormalize = [1,2]) {
    // historical: {id: [..pastWeeks+1..]} — берем последнее значение (index = last) как "Now"
    const res = {};
    idsToNormalize.forEach(id => {
      const histArr = historical[id] || [];
      const histNow = (histArr.length > 0) ? histArr[histArr.length - 1] : null; // последнее — "сейчас"
      const fArr = Array.isArray(forecastMap[id]) ? forecastMap[id].slice() : [null, null, null];

      // вычислим среднее ненулевых значений прогноза (raw)
      const fVals = fArr.map(v => (v === null || v === undefined) ? null : Number(v)).filter(v => v != null);
      const fMean = (fVals.length > 0) ? (fVals.reduce((a,b) => a + b, 0) / fVals.length) : null;

      // Если у нас есть и histNow, и fMean > 0 — вычисляем scale
      if (histNow != null && fMean != null && fMean > 0) {
        let scale = histNow / fMean;
        // Ограничим scale в рамках разумного, чтобы не создавать абсурдных значений
        if (scale < 0.2) scale = 0.2;
        if (scale > 5) scale = 5;
        // Применяем масштаб
        res[id] = fArr.map(v => (v != null ? Number((v * scale)) : null));
      } else {
        // Если ничего не сравнить — возвращаем как есть (не меняем)
        res[id] = fArr.map(v => (v != null ? Number(v) : null));
      }
    });

    // Для температур — без масштабирования (идентична входящему прогнозу)
    [3,4].forEach(id => {
      res[id] = (Array.isArray(forecastMap[id]) ? forecastMap[id].map(v => (v != null ? Number(v) : null)) : [null,null,null]);
    });

    return res;
  }

  // Экстраполируем прогнозную серию на futureWeeks точек.
  function extrapolateForecast(fmap, futureWeeks = 10) {
    const out = {};
    [1,2,3,4].forEach(id => {
      const base = Array.from((fmap && fmap[id]) || []);
      const res = Array(futureWeeks).fill(null);

      // Сначала копируем имеющиеся прогнозные значения в начало (обычно 3 значения -> индекс 0..2 -> +1..+3 недели)
      for (let i = 0; i < Math.min(base.length, futureWeeks); i++) {
        res[i] = base[i] != null ? base[i] : null;
      }

      // Соберём известные (index, value)
      const known = [];
      for (let i = 0; i < base.length; i++) if (base[i] != null) known.push({ i: i, v: base[i] });

      if (known.length >= 2) {
        // линейная экстраполяция на основе двух последних известных точек
        const a = known[known.length - 2], b = known[known.length - 1];
        const step = (b.v - a.v) / (b.i - a.i);
        for (let k = b.i + 1; k < futureWeeks; k++) {
          let val = b.v + step * (k - b.i);
          // Округляем: если дробный — 2 знака, иначе 0
          const places = (String(b.v).includes('.') || String(a.v).includes('.')) ? 2 : 0;
          res[k] = Number(val.toFixed(places));
        }
      } else if (known.length === 1) {
        // только одна известная — заполняем далее константой
        for (let k = known[0].i + 1; k < futureWeeks; k++) res[k] = known[0].v;
      }
      // если нет известных — останутся null
      out[id] = res;
    });
    return out;
  }

  // ========================
  // ===  СОБИРАЕМ ДАННЫЕ ДЛЯ ГРАФИКОВ  ===
  // small: 8 точек (4 прошлые + Сейчас + 3 прогноза)
  // extended: pastWeeks+1 исторических значений + futureWeeks прогнозных (экстраполированных)
  // ========================
  async function processChartData(pastWeeks = 10, futureWeeks = 10) {
    const [realP, forecastP] = await Promise.allSettled([loadRealData(), loadForecast()]);

    if (realP.status !== 'fulfilled') throw new Error('Ошибка загрузки реальных данных: ' + (realP.reason?.message || realP.reason));
    const realData = realP.value;

    const rawForecast = (forecastP.status === 'fulfilled') ? forecastP.value : {1:[null,null,null],2:[null,null,null],3:[null,null,null],4:[null,null,null]};

    // 1) HISTORICAL for small (4 past + now)
    const small = (function buildSmall() {
      const wk = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const historyLen = 5; // 4 прошлые + сейчас (индексы 0..4)
      const sums = { 1: Array(historyLen).fill(0), 2: Array(historyLen).fill(0), 3: Array(historyLen).fill(0), 4: Array(historyLen).fill(0) };
      const counts = { 1: Array(historyLen).fill(0), 2: Array(historyLen).fill(0), 3: Array(historyLen).fill(0), 4: Array(historyLen).fill(0) };

      for (const it of realData) {
        const f = it.fields ? it.fields : it;
        const id = Number(f.detector_id || f.detectorId || f.id || f.detector);
        const val = safeNum(f.value !== undefined ? f.value : (f.v !== undefined ? f.v : null));
        const ts = f.timestamp || f.time || f.date;
        if (!id || val === null || !ts) continue;
        if (!chart1Ids.includes(id) && !chart2Ids.includes(id) && id !== 3 && id !== 4) continue;
        const dt = new Date(ts);
        if (isNaN(dt)) continue;
        const weeksAgo = Math.floor((now - dt.getTime()) / wk);
        if (weeksAgo < 0 || weeksAgo > 4) continue;
        const idx = 4 - weeksAgo; // 0..4
        const target = chart1Ids.includes(id) ? 1 : (chart2Ids.includes(id) ? 2 : id);
        sums[target][idx] += val;
        counts[target][idx] += 1;
      }

      // Формируем итог для small
      const out = { 1: Array(8).fill(null), 2: Array(8).fill(null), 3: Array(8).fill(null), 4: Array(8).fill(null) };
      [1,2,3,4].forEach(id => {
        for (let i = 0; i < historyLen; i++) {
          if (counts[id][i] === 0) out[id][i] = null;
          else out[id][i] = (id === 1 || id === 2) ? Number(sums[id][i].toFixed(3)) : Number((sums[id][i] / counts[id][i]).toFixed(2));
        }
        // прогнозные места (будут заполнены после нормализации)
        out[id][5] = null; out[id][6] = null; out[id][7] = null;
      });

      return out;
    })();

    // 2) HISTORICAL EXTENDED (pastWeeks+1)
    const historical = aggregateByWeeks(realData, pastWeeks);

    // 3) Нормализация прогноза под исторические данные (чтобы единицы совпали)
    const normForecast = normalizeForecastToHistory(rawForecast, historical, [1,2]); // масштабирует XVS/GVS
    // 4) Экстраполируем нормализованный прогноз на futureWeeks точек
    const forecastExtended = extrapolateForecast(normForecast, futureWeeks);

    // 5) Заполним small прогнозными значениями (индексы 5,6,7 -> +1,+2,+3)
    [1,2,3,4].forEach(id => {
      small[id][5] = (normForecast[id] && normForecast[id][0] != null) ? normForecast[id][0] : null;
      small[id][6] = (normForecast[id] && normForecast[id][1] != null) ? normForecast[id][1] : null;
      small[id][7] = (normForecast[id] && normForecast[id][2] != null) ? normForecast[id][2] : null;
    });

    // 6) Соберём extended: история (0..pastWeeks) + прогноз (pastWeeks+1..)
    const extLen = pastWeeks + 1 + futureWeeks;
    const extended = {};
    [1,2,3,4].forEach(id => {
      extended[id] = Array(extLen).fill(null);
      // копируем историю (0..pastWeeks)
      for (let i = 0; i <= pastWeeks; i++) {
        extended[id][i] = (historical[id] && historical[id][i] !== undefined) ? historical[id][i] : null;
      }
      // копируем прогноз (pastWeeks+1 .. end)
      for (let j = 0; j < futureWeeks; j++) {
        extended[id][pastWeeks + 1 + j] = (forecastExtended[id] && forecastExtended[id][j] !== undefined) ? forecastExtended[id][j] : null;
      }
    });

    return { small, extended };
  }

  // ========================
  // ===  CHART HELPERS (оставил ваш стиль) ===
  // ========================
  const nowLinePlugin = {
    id: 'nowLineSmall',
    afterDraw(chart) {
      const xIdx = 4; // index "Сейчас" для small charts
      const xScale = chart.scales.x; if (!xScale) return;
      const x = xScale.getPixelForValue(xIdx);
      const ctx = chart.ctx; const top = chart.chartArea.top; const bottom = chart.chartArea.bottom;
      ctx.save(); ctx.beginPath(); ctx.setLineDash([6, 4]); ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1.2;
      ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.restore();
    }
  };

  function nowLinePluginFactory(centerIndex) {
    return {
      id: 'nowLineLarge_' + centerIndex,
      afterDraw(chart) {
        const xScale = chart.scales.x; if (!xScale) return;
        const x = xScale.getPixelForValue(centerIndex);
        const ctx = chart.ctx; const top = chart.chartArea.top; const bottom = chart.chartArea.bottom;
        ctx.save(); ctx.beginPath(); ctx.setLineDash([6, 4]); ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1.2;
        ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.restore();
      }
    };
  }

  function createSmallChart(canvasId, datasets, unitType) {
    const canvas = document.getElementById(canvasId); if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const weekDates = calculateWeekDates(4, 3);
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
                const date = weekDates[i] || '';
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

  // Маленькая утилита для дат для тултипов (small)
  function calculateWeekDates(pastWeeks = 4, futureWeeks = 3) {
    const now = new Date();
    const wk = 7 * 24 * 60 * 60 * 1000;
    const arr = [];
    for (let i = pastWeeks; i >= 1; i--) arr.push(formatDate(new Date(now.getTime() - i * wk)));
    arr.push(formatDate(now));
    for (let i = 1; i <= futureWeeks; i++) arr.push(formatDate(new Date(now.getTime() + i * wk)));
    return arr;
  }

  function calculateWeekDatesExtended(pastWeeks = 10, futureWeeks = 10) {
    const now = new Date();
    const wk = 7 * 24 * 60 * 60 * 1000;
    const arr = [];
    for (let i = pastWeeks; i >= 1; i--) arr.push(formatDate(new Date(now.getTime() - i * wk)));
    arr.push(formatDate(now));
    for (let i = 1; i <= futureWeeks; i++) arr.push(formatDate(new Date(now.getTime() + i * wk)));
    return arr;
  }

  // ========================
  // ===  MODAL & BINDINGS  ===
  // (логика взята из вашего кода, без изменений по UX)
  // ========================
  let currentModal = null;
  function openModal(payload) {
    if (!payload) return;
    closeModal();

    const overlay = document.createElement('div');
    overlay.id = 'chart-modal-overlay';
    Object.assign(overlay.style, { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' });
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    const box = document.createElement('div');
    Object.assign(box.style, { width: '100%', maxWidth: '1100px', height: '80%', background: '#fff', borderRadius: '8px', boxShadow: '0 12px 40px rgba(2,6,23,0.4)', overflow: 'hidden', display: 'flex', flexDirection: 'column' });
    box.addEventListener('click', e => e.stopPropagation());

    const header = document.createElement('div');
    Object.assign(header.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #eee' });
    const h = document.createElement('div'); h.style.fontWeight = '600'; h.textContent = payload.title || 'Расширенный график';
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&#10005;'; closeBtn.title = 'Закрыть'; Object.assign(closeBtn.style, { background: 'transparent', border: 0, fontSize: '18px', cursor: 'pointer', padding: '6px' });
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(h); header.appendChild(closeBtn);

    const canvasWrap = document.createElement('div');
    Object.assign(canvasWrap.style, { flex: 1, position: 'relative', padding: '12px' });
    const canvas = document.createElement('canvas');
    canvas.id = 'modalChartCanvas';
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
    canvasWrap.appendChild(canvas);

    const footer = document.createElement('div');
    Object.assign(footer.style, { padding: '8px 12px', borderTop: '1px solid #eee', fontSize: '13px', color: '#444', background: '#fafafa' });
    footer.textContent = 'Просмотр расширенного периода. Нажмите Esc или крестик чтобы закрыть.';

    box.appendChild(header); box.appendChild(canvasWrap); box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function onKey(e) { if (e.key === 'Escape') closeModal(); }
    document.addEventListener('keydown', onKey);

    function closeModalInner() {
      if (currentModal && currentModal.chart) try { currentModal.chart.destroy(); } catch (_) {}
      try { document.removeEventListener('keydown', onKey); } catch (_) {}
      try { overlay.remove(); } catch (_) {}
      currentModal = null;
    }
    window._closeChartModal = closeModalInner;

    const centerIndex = payload.centerIndex;
    const datasetsForChart = payload.datasets.map(ds => {
      const copy = { ...ds };
      copy.segment = {
        borderDash: ctx => {
          try { return (ctx && ctx.p1DataIndex > centerIndex) ? [6, 4] : []; } catch { return []; }
        }
      };
      copy.backgroundColor = (copy.borderColor && copy.borderColor.length === 7) ? copy.borderColor + '22' : copy.backgroundColor;
      copy.spanGaps = true;
      return copy;
    });

    const ctx = canvas.getContext('2d');
    const cfg = {
      type: 'line',
      data: { labels: payload.labelsArray, datasets: datasetsForChart },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: true } }, y: { beginAtZero: false, grid: { display: true } } },
        plugins: {
          tooltip: {
            mode: 'index', intersect: false,
            callbacks: {
              title: items => {
                const i = items[0].dataIndex;
                const lbl = payload.labelsArray[i] || '';
                const date = payload.weekDates && payload.weekDates[i] ? payload.weekDates[i] : '';
                return i > payload.pastWeeks ? `${lbl} (${date}) [ПРОГНОЗ]` : `${lbl} (${date})`;
              },
              label: ctx => {
                const y = ctx.parsed?.y; let s = (ctx.dataset.label ? ctx.dataset.label + ': ' : '');
                if (y === null || y === undefined || isNaN(y)) s += 'нет данных';
                else s += (payload.unitType === 'flow' ? Number(y).toFixed(0) + ' м³' : Number(y).toFixed(1) + ' °C') + (ctx.dataIndex > payload.pastWeeks ? ' (прогноз)' : '');
                return s;
              }
            }
          },
          legend: { display: true, position: 'top' }
        },
        elements: { line: { borderWidth: 1.25, tension: 0.25 }, point: { radius: 3 } }
      },
      plugins: [nowLinePluginFactory(centerIndex)]
    };

    try { currentModal = { chart: new Chart(ctx, cfg), overlay }; } catch (e) { console.error('modal chart create error', e); currentModal = null; }
    return currentModal;
  }

  function closeModal() {
    try { window._closeChartModal && window._closeChartModal(); } catch (_) {}
  }

  const modalStore = {};
  function bindClick(canvasId, key) {
    const el = document.getElementById(canvasId); if (!el) return;
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      const p = modalStore[key]; if (!p) return;
      openModal(p);
    });
  }

  // ========================
  // ===  ИНИЦИАЛИЗАЦИЯ   ===
  // ========================
  async function initialize() {
    try {
      const pastWeeks = 10, futureWeeks = 10;
      const { small, extended } = await processChartData(pastWeeks, futureWeeks);

      // chart1 (flow XVS) — small + modal payload
      const ds1 = prepareSmallDatasets(small, [1], ['#3b82f6'], ['Общее потребление ХВС, м³']);
      createSmallChart('chart1', ds1, 'flow');
      const extDs1 = prepareExtendedDatasets(extended, [1], ['#3b82f6'], ['Общее потребление ХВС, м³']);
      const extLabels = [];
      for (let i = -pastWeeks; i <= futureWeeks; i++) extLabels.push(i < 0 ? `${i} нед` : (i === 0 ? 'Сейчас' : `+${i} нед`));
      modalStore['chart1'] = {
        datasets: extDs1,
        unitType: 'flow',
        title: 'Общее потребление ХВС, м³ — расширенный период',
        labelsArray: extLabels,
        weekDates: calculateWeekDatesExtended(pastWeeks, futureWeeks),
        centerIndex: pastWeeks,
        pastWeeks: pastWeeks
      };
      bindClick('chart1', 'chart1');

      // chart2 (flow GVS)
      const ds2 = prepareSmallDatasets(small, [2], ['#a855f7'], ['Общее потребление ГВС, м³']);
      createSmallChart('chart2', ds2, 'flow');
      const extDs2 = prepareExtendedDatasets(extended, [2], ['#a855f7'], ['Общее потребление ГВС, м³']);
      modalStore['chart2'] = {
        datasets: extDs2,
        unitType: 'flow',
        title: 'Общее потребление ГВС, м³ — расширенный период',
        labelsArray: extLabels,
        weekDates: calculateWeekDatesExtended(pastWeeks, futureWeeks),
        centerIndex: pastWeeks,
        pastWeeks: pastWeeks
      };
      bindClick('chart2', 'chart2');

      // chart3 (подача/обратка)
      const ds3 = prepareSmallDatasets(small, [3,4], ['#1e40af','#a855f7'], ['Подача','Обратка']);
      createSmallChart('chart3', ds3, 'temp');
      const extDs3 = prepareExtendedDatasets(extended, [3,4], ['#1e40af','#a855f7'], ['Подача','Обратка']);
      modalStore['chart3'] = {
        datasets: extDs3,
        unitType: 'temp',
        title: 'Подача / Обратка — расширенный период',
        labelsArray: extLabels,
        weekDates: calculateWeekDatesExtended(pastWeeks, futureWeeks),
        centerIndex: pastWeeks,
        pastWeeks: pastWeeks
      };
      bindClick('chart3', 'chart3');

      // chart4 (T1, T2, avg)
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
      createSmallChart('chart4', [...dsT1, ...dsT2, avgDataset], 'temp');

      // extended for chart4 (расширенная средняя)
      const extT1 = prepareExtendedDatasets(extended, [3], ['#a855f7'], ['T1 (подача)'])[0];
      const extT2 = prepareExtendedDatasets(extended, [4], ['#3b82f6'], ['T2 (обратка)'])[0];
      const extLen = extended[3].length;
      const avgExt = Array(extLen).fill(null).map((_, idx) => {
        const a = extended[3][idx], b = extended[4][idx];
        return (a != null && b != null) ? Number(((a + b) / 2).toFixed(2)) : null;
      });
      const avgExtDs = { ...avgDataset, data: avgExt, pointRadius: 0, borderDash: [6, 4] };
      modalStore['chart4'] = {
        datasets: [extT1, extT2, avgExtDs],
        unitType: 'temp',
        title: 'Температуры — расширенный период',
        labelsArray: extLabels,
        weekDates: calculateWeekDatesExtended(pastWeeks, futureWeeks),
        centerIndex: pastWeeks,
        pastWeeks: pastWeeks
      };
      bindClick('chart4', 'chart4');

      console.log('Charts initialized — исторические и прогнозные данные подготовлены.');
    } catch (e) {
      console.error('Init error', e);
      const alertBox = document.createElement('div');
      Object.assign(alertBox.style, { color: '#7f1d1d', background: '#fff1f2', border: '1px solid #fecaca', padding: '12px', margin: '10px', textAlign: 'center' });
      alertBox.textContent = 'Ошибка загрузки данных графиков: ' + (e.message || e);
      document.body.prepend(alertBox);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();

})();
