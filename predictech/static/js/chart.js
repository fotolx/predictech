// -----------------------------
// chart-combined.js
// Полный объединённый скрипт: слева реальные данные, справа прогнозные
// -----------------------------

const chartCommonTimeLabels = ['-4 нед', '-3 нед', '-2 нед', '-1 нед', 'Сейчас', '+1 нед', '+2 нед', '+3 нед'];

// --- Настройки URL ---
const REAL_DATA_URL = 'https://predictech.5d4.ru/detector_data_log/';
const FORECAST_URL = 'https://predictech.5d4.ru/forecast/?house_id=2';

// --- Прокси (fallback на случай CORS) ---
const PROXIES = [
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://proxy.cors.sh/',
  'https://cors-anywhere.herokuapp.com/'
];

// -----------------------------
// УТИЛИТЫ
// -----------------------------
function formatDate(d) {
  return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
}

function calculateWeekDates() {
  const now = new Date();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const arr = [];
  for (let i = 4; i >= 1; i--) arr.push(formatDate(new Date(now.getTime() - i * weekMs)));
  arr.push(formatDate(now));
  for (let i = 1; i <= 3; i++) arr.push(formatDate(new Date(now.getTime() + i * weekMs)));
  return arr;
}

function safeNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Универсальный fetch с fallback через прокси
async function fetchWithFallback(url, options = {}) {
  try {
    const r = await fetch(url, options);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch (err) {
    for (const proxy of PROXIES) {
      try {
        const r = await fetch(proxy + url, options);
        if (!r.ok) continue;
        return await r.text();
      } catch (e) { continue; }
    }
  }
  throw new Error('Не удалось загрузить данные (включая все прокси)');
}

function parsePossiblyWrappedJson(text) {
  const cleaned = String(text).trim();
  try { return JSON.parse(cleaned); } catch(e){}
  const arrMatch = cleaned.match(/\[.*\]/s);
  if (arrMatch) return JSON.parse(arrMatch[0]);
  const objMatch = cleaned.match(/\{.*\}/s);
  if (objMatch) return JSON.parse(objMatch[0]);
  throw new Error('Не удалось распарсить JSON');
}

// -----------------------------
// ЗАГРУЗКА ДАННЫХ
// -----------------------------
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

async function loadForecastData() {
  const txt = await fetchWithFallback(FORECAST_URL, { method: 'GET', mode: 'cors' });
  const parsed = parsePossiblyWrappedJson(txt);
  let best = Array.isArray(parsed) ? parsed.reduce((acc,it) => !acc || new Date(it.timestamp) > new Date(acc.timestamp) ? it : acc, null) : parsed;
  const src = best.fields || best;
  const pick = name => safeNum(src[name]);
  return {
    1: [pick('flow_xvs_168'), pick('flow_xvs_336'), pick('flow_xvs_504')],
    2: [pick('flow_gvs_168'), pick('flow_gvs_336'), pick('flow_gvs_504')],
    3: [pick('temp_supply_168'), pick('temp_supply_336'), pick('temp_supply_504')],
    4: [pick('temp_return_168'), pick('temp_return_336'), pick('temp_return_504')]
  };
}

// -----------------------------
// ОБРАБОТКА ДАННЫХ В НЕДЕЛЬНЫЕ СЛОТЫ
// -----------------------------
async function processChartMonthlyData() {
  const [realSettled, forecastSettled] = await Promise.allSettled([loadRealDetectorData(), loadForecastData()]);
  if (realSettled.status !== 'fulfilled') throw new Error('Ошибка загрузки реальных данных: ' + realSettled.reason);
  const realData = realSettled.value;
  const forecastMap = forecastSettled.status === 'fulfilled' ? forecastSettled.value : {1:[null,null,null],2:[null,null,null],3:[null,null,null],4:[null,null,null]};

  // Аккумуляторы для сумм/средних
  const sums = {1:Array(5).fill(0),2:Array(5).fill(0),3:Array(5).fill(0),4:Array(5).fill(0)};
  const counts = {1:Array(5).fill(0),2:Array(5).fill(0),3:Array(5).fill(0),4:Array(5).fill(0)};

  // Жёсткая привязка исторических данных к детекторам
  realData.forEach(item => {
    const f = item.fields || item;
    const id = Number(f.detector_id || f.detectorId || f.id || f.detector);
    const ts = new Date(f.timestamp || f.time || f.date);
    const val = safeNum(f.value !== undefined ? f.value : f.v);
    if (!id || isNaN(ts) || val === null) return;
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const weeksAgo = Math.floor((Date.now() - ts.getTime()) / weekMs);
    if (weeksAgo < 0 || weeksAgo > 4) return;
    const idx = 4 - weeksAgo;
    if (!sums[id]) return;
    sums[id][idx] += val;
    counts[id][idx]++;
  });

  const weeklyData = {1:Array(8).fill(null),2:Array(8).fill(null),3:Array(8).fill(null),4:Array(8).fill(null)};
  [1,2,3,4].forEach(id => {
    for (let i=0;i<5;i++){
      if(counts[id][i]===0) weeklyData[id][i]=null;
      else weeklyData[id][i]=(id<=2 ? Number(sums[id][i].toFixed(3)) : Number((sums[id][i]/counts[id][i]).toFixed(2)));
    }
    // Добавляем прогнозные данные справа
    if(forecastMap && forecastMap[id]){
      weeklyData[id][5]=forecastMap[id][0]||null;
      weeklyData[id][6]=forecastMap[id][1]||null;
      weeklyData[id][7]=forecastMap[id][2]||null;
    }
  });
  return weeklyData;
}

// -----------------------------
// ВИЗУАЛИЗАЦИЯ (Chart.js)
// -----------------------------
const nowLinePlugin = {
  id: 'nowLinePlugin',
  afterDraw: chart => {
    const xIndex = 4; 
    const xScale = chart.scales.x;
    if(!xScale) return;
    const x = xScale.getPixelForValue(xIndex);
    const ctx = chart.ctx;
    const top = chart.chartArea.top;
    const bottom = chart.chartArea.bottom;
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth=1.5; ctx.setLineDash([6,4]); ctx.strokeStyle='#6b7280';
    ctx.moveTo(x,top); ctx.lineTo(x,bottom); ctx.stroke();
    ctx.fillStyle='#6b7280'; ctx.textAlign='center'; ctx.font='12px Arial'; ctx.fillText('',x,bottom+20);
    ctx.restore();
  }
};

function createChart(canvasId,datasets,unitType){
  const weekDates = calculateWeekDates();
  const canvas = document.getElementById(canvasId);
  if(!canvas) return null;
  const ctx = canvas.getContext('2d');
  const cfg={
    type:'line',
    data:{labels:chartCommonTimeLabels,datasets},
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      scales:{
        x:{grid:{display:true},ticks:{callback:(val,idx)=>chartCommonTimeLabels[idx]||''}},
        y:{beginAtZero:false,grid:{display:true}}
      },
      plugins:{
        tooltip:{
          mode:'index', intersect:false,
          callbacks:{
            title: items => {
              const i = items[0].dataIndex;
              const label = chartCommonTimeLabels[i] || '';
              const date = weekDates[i] || '';
              return i>=5?`${label} (${date}) [ПРОГНОЗ]`:`${label} (${date})`;
            },
            label: ctx => {
              const y = ctx.parsed && ctx.parsed.y;
              let label = ctx.dataset.label ? ctx.dataset.label+': ' : '';
              if(y==null) return label+'нет данных';
              return unitType==='flow'?label+Number(y).toFixed(3)+' м³':label+Number(y).toFixed(1)+' °C';
            }
          }
        },
        legend:{display:true,position:'top'}
      },
      elements:{line:{borderWidth:1,tension:0.35},point:{radius:3}}
    },
    plugins:[nowLinePlugin]
  };
  return new Chart(ctx,cfg);
}

function prepareChartDatasets(monthlyData, ids, colors, labels, unitType){
  return ids.map((id,i)=>{
    const arr = monthlyData[id]||Array(8).fill(null);
    return {
      label: labels[i],
      data: arr,
      borderColor: colors[i],
      backgroundColor: colors[i]+'22',
      fill:false,
      tension:0.35,
      pointRadius:3
    };
  });
}

// -----------------------------
// ИНИЦИАЛИЗАЦИЯ ГРАФИКОВ
// -----------------------------
async function initializeCharts(){
  try{
    const monthly = await processChartMonthlyData();

    // График 1 — ХВС
    createChart('chart1',prepareChartDatasets(monthly,[1],['#3b82f6'],['Общее потребление ХВС, м³'],'flow'));
    // График 2 — ГВС
    createChart('chart2',prepareChartDatasets(monthly,[2],['#a855f7'],['Общее потребление ГВС, м³'],'flow'));
    // График 3 — температуры
    createChart('chart3',prepareChartDatasets(monthly,[3,4],['#1e40af','#a855f7'],['Подача','Обратка'],'temp'));
    // График 4 — средняя температура
    const avg = Array(8).fill(null).map((_,i)=>(monthly[3][i]!=null && monthly[4][i]!=null)?Number(((monthly[3][i]+monthly[4][i])/2).toFixed(2)):null);
    createChart('chart4',[
      ...prepareChartDatasets(monthly,[3],['#a855f7'],['T1'],'temp'),
      ...prepareChartDatasets(monthly,[4],['#3b82f6'],['T2'],'temp'),
      {label:'Средняя температура', data:avg, borderColor:'#10b981', borderDash:[6,4], fill:false, tension:0.35, pointRadius:0}
    ],'temp');

    console.log('Графики инициализированы успешно');
  }catch(e){
    console.error('Ошибка инициализации графиков:',e);
    const el = document.createElement('div');
    el.style='color:#7f1d1d;background:#fff1f2;border:1px solid #fecaca;padding:12px;margin:10px;text-align:center;';
    el.textContent='Ошибка загрузки данных графиков: '+(e.message||e);
    document.body.prepend(el);
  }
}

document.addEventListener('DOMContentLoaded',initializeCharts);
