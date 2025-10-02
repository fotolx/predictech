const chartCommonTimeLabels = ['-4 нед', '-3 нед', '-2 нед', '-1 нед', 'Сейчас', '+1 нед', '+2 нед', '+3 нед'];
const REAL_DATA_URL = 'https://predictech.5d4.ru/detector_data_log/';
const FORECAST_URL = 'https://predictech.5d4.ru/forecast/?house_id=2';
const PROXIES = ['https://corsproxy.io/?', 'https://api.codetabs.com/v1/proxy?quest=', 'https://proxy.cors.sh/', 'https://cors-anywhere.herokuapp.com/'];

// -------------------------------
// УТИЛИТЫ
// -------------------------------
function formatDate(d) {
  return String(d.getDate()).padStart(2,'0') + '.' +
         String(d.getMonth()+1).padStart(2,'0') + '.' +
         d.getFullYear();
}

function calculateWeekDates() {
  const now = new Date();
  const weekMs = 7*24*60*60*1000;
  const arr = [];
  for(let i=4;i>=1;i--) arr.push(formatDate(new Date(now.getTime()-i*weekMs)));
  arr.push(formatDate(now));
  for(let i=1;i<=3;i++) arr.push(formatDate(new Date(now.getTime()+i*weekMs)));
  return arr;
}

async function fetchWithFallback(url, options={}) {
  try { 
    const r = await fetch(url, options); if(!r.ok) throw new Error(`HTTP ${r.status}`); 
    return await r.text();
  } catch(err){ console.warn('Прямая загрузка не удалась:', err.message); }
  for(const proxy of PROXIES){
    try{ 
      console.log('Пробуем через прокси:', proxy); 
      const r = await fetch(proxy+url, options); 
      if(!r.ok) continue; 
      return await r.text();
    } catch(e){ console.warn('Прокси не сработал:', e.message); }
  }
  throw new Error('Не удалось загрузить данные');
}

function parsePossiblyWrappedJson(text){
  const cleaned = String(text).trim();
  try { return JSON.parse(cleaned); } 
  catch(e){
    const arrMatch = cleaned.match(/\[.*\]/s);
    if(arrMatch) try{return JSON.parse(arrMatch[0]);}catch{}
    const objMatch = cleaned.match(/\{.*\}/s);
    if(objMatch) try{return JSON.parse(objMatch[0]);}catch{}
    throw new Error('Не удалось распарсить JSON');
  }
}

function safeNum(v){ return v===null||v===undefined||v==='' ? null : Number.isFinite(Number(v)) ? Number(v) : null; }

// -------------------------------
// ЗАГРУЗКА ДАННЫХ
// -------------------------------
async function loadRealDetectorData() {
  const txt = await fetchWithFallback(REAL_DATA_URL, {method:'GET', mode:'cors'});
  const parsed = parsePossiblyWrappedJson(txt);
  if(Array.isArray(parsed)) return parsed;
  if(parsed && Array.isArray(parsed.results)) return parsed.results;
  for(const k of Object.keys(parsed||{})) if(Array.isArray(parsed[k])) return parsed[k];
  return [parsed];
}

async function loadForecastPerDetector() {
  const txt = await fetchWithFallback(FORECAST_URL, {method:'GET', mode:'cors'});
  const parsed = parsePossiblyWrappedJson(txt);
  let best=null;
  if(Array.isArray(parsed)) best = parsed.reduce((acc,it)=>{
    const ts = it.timestamp || (it.fields && it.fields.timestamp) || '';
    if(!acc) return it;
    const aTs = acc.timestamp || (acc.fields && acc.fields.timestamp) || '';
    return new Date(ts) > new Date(aTs) ? it : acc;
  }, null);
  else if(parsed && typeof parsed==='object') best=parsed;
  if(!best) throw new Error('Прогноз не найден');

  const src = best.fields ? best.fields : best;
  const pick = name => safeNum(src[name]);

  return {
    1:[pick('flow_xvs_168'), pick('flow_xvs_336'), pick('flow_xvs_504')],
    2:[pick('flow_gvs_168'), pick('flow_gvs_336'), pick('flow_gvs_504')],
    3:[pick('temp_supply_168'), pick('temp_supply_336'), pick('temp_supply_504')],
    4:[pick('temp_return_168'), pick('temp_return_336'), pick('temp_return_504')]
  };
}

// -------------------------------
// ОБРАБОТКА ДАННЫХ
// -------------------------------
async function processChartMonthlyData() {
  const [realSettled, forecastSettled] = await Promise.allSettled([loadRealDetectorData(), loadForecastPerDetector()]);

  if(realSettled.status!=='fulfilled') throw new Error('Ошибка загрузки реальных данных: '+(realSettled.reason?.message||realSettled.reason));
  const realData = realSettled.value;
  const forecastMap = forecastSettled.status==='fulfilled' ? forecastSettled.value : {1:[null,null,null],2:[null,null,null],3:[null,null,null],4:[null,null,null]};

  // Суммируем только нужные detector_id
  const chart1Ids = [1,5,9,13,17];
  const chart2Ids = [2,6,10,14,18];

  const sums = {1:Array(5).fill(0),2:Array(5).fill(0),3:Array(5).fill(0),4:Array(5).fill(0)};
  const counts = {1:Array(5).fill(0),2:Array(5).fill(0),3:Array(5).fill(0),4:Array(5).fill(0)};

  realData.forEach(item=>{
    const f=item.fields?item.fields:item;
    const id = Number(f.detector_id || f.detectorId || f.id || f.detector);
    const timestampStr=f.timestamp||f.time||f.date;
    const value = safeNum(f.value!==undefined?f.value:f.v);
    if(!id || !timestampStr || value===null) return;

    // Жесткая фильтрация: только нужные id для графиков 1 и 2
    if(!chart1Ids.includes(id) && !chart2Ids.includes(id) && id!==3 && id!==4) return;

    const ts = new Date(timestampStr); if(isNaN(ts)) return;
    const now = Date.now();
    const weekMs = 7*24*60*60*1000;
    const weeksAgo = Math.floor((now-ts.getTime())/weekMs);
    if(weeksAgo<0||weeksAgo>4) return;
    const idx = 4-weeksAgo; 
    const targetId = (chart1Ids.includes(id)?1:(chart2Ids.includes(id)?2:id)); // 1->ХВС,2->ГВС, 3->T1,4->T2
    sums[targetId][idx]+=value;
    counts[targetId][idx]+=1;
  });

  // Формируем итог
  const weeklyData={1:Array(8).fill(null),2:Array(8).fill(null),3:Array(8).fill(null),4:Array(8).fill(null)};
  [1,2,3,4].forEach(id=>{
    for(let i=0;i<5;i++){
      if(counts[id][i]===0) weeklyData[id][i]=null;
      else weeklyData[id][i]=(id===1||id===2)?Number(sums[id][i].toFixed(3)):Number((sums[id][i]/counts[id][i]).toFixed(2));
    }
    if(forecastMap[id]){
      weeklyData[id][5]=forecastMap[id][0]!==undefined?forecastMap[id][0]:null;
      weeklyData[id][6]=forecastMap[id][1]!==undefined?forecastMap[id][1]:null;
      weeklyData[id][7]=forecastMap[id][2]!==undefined?forecastMap[id][2]:null;
    }else weeklyData[id][5]=weeklyData[id][6]=weeklyData[id][7]=null;
  });
  return weeklyData;
}

// -------------------------------
// ВИЗУАЛИЗАЦИЯ (Chart.js)
// -------------------------------
const nowLinePlugin = {
  id:'nowLinePlugin',
  afterDraw:(chart)=>{
    const xIndex=4;
    const xScale=chart.scales.x; if(!xScale) return;
    const x=xScale.getPixelForValue(xIndex);
    const ctx=chart.ctx; const top=chart.chartArea.top; const bottom=chart.chartArea.bottom;
    ctx.save(); ctx.beginPath(); ctx.lineWidth=1.5; ctx.setLineDash([6,4]); ctx.strokeStyle='#6b7280';
    ctx.moveTo(x,top); ctx.lineTo(x,bottom); ctx.stroke(); ctx.restore();
  }
};

function createChart(canvasId,datasets,unitType){
  const weekDates=calculateWeekDates();
  const canvas=document.getElementById(canvasId);
  if(!canvas) return null;
  const ctx=canvas.getContext('2d');
  const makeBg = hex => typeof hex==='string'&&hex.startsWith('#')&&hex.length===7?hex+'22':hex;

  const cfg={
    type:'line',
    data:{labels:chartCommonTimeLabels,datasets},
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      scales:{x:{grid:{display:true}},y:{beginAtZero:false,grid:{display:true}}},
      plugins:{
        tooltip:{
          mode:'index',intersect:false,
          callbacks:{
            title:items=>{const i=items[0].dataIndex; const label=chartCommonTimeLabels[i]||''; const date=weekDates[i]||''; return i>=5?`${label} (${date}) [ПРОГНОЗ]`:`${label} (${date})`;},
            label:ctx=>{const y=ctx.parsed?.y; let l=ctx.dataset.label?ctx.dataset.label+': ':''; if(y===null||y===undefined||isNaN(y)) l+='нет данных'; else l+=(unitType==='flow'?Number(y).toFixed(3)+' м³':Number(y).toFixed(1)+' °C')+(ctx.dataIndex>=5?' (прогноз)':''); return l;}
          }
        },
        legend:{display:true,position:'top'}
      },
      elements:{line:{borderWidth:1,tension:0.35},point:{radius:3}}
    },
    plugins:[nowLinePlugin]
  };

  cfg.data.datasets=cfg.data.datasets.map(ds=>({...ds,backgroundColor:makeBg(ds.borderColor||ds.backgroundColor),spanGaps:false}));
  try{return new Chart(ctx,cfg);}catch(e){console.error('Ошибка Chart:',e);return null;}
}

function prepareChartDatasets(monthlyData, ids, colors, labels){
  return ids.map((id,i)=>{
    const arr=monthlyData[id]||Array(8).fill(null);
    return {label:labels[i]||`Детектор ${id}`,data:Array.from({length:8},(_,idx)=>idx<arr.length?arr[idx]:null),borderColor:colors[i]||'#000',fill:false,tension:0.35,pointRadius:3,segment:{borderDash:ctx=>ctx.p1DataIndex>=5?[5,5]:[]}};
  });
}

// -------------------------------
// ИНИЦИАЛИЗАЦИЯ
// -------------------------------
async function initializeCharts(){
  try{
    const monthly = await processChartMonthlyData();

    const ds1 = prepareChartDatasets(monthly,[1],['#3b82f6'],['Общее потребление ХВС, м³']);
    createChart('chart1', ds1,'flow');

    const ds2 = prepareChartDatasets(monthly,[2],['#a855f7'],['Общее потребление ГВС, м³']);
    createChart('chart2', ds2,'flow');

    const ds3 = prepareChartDatasets(monthly,[3,4],['#1e40af','#a855f7'],['Подача','Обратка']);
    createChart('chart3', ds3,'temp');

    const dsT1 = prepareChartDatasets(monthly,[3],['#a855f7'],['T1 (подача)']);
    const dsT2 = prepareChartDatasets(monthly,[4],['#3b82f6'],['T2 (обратка)']);
    const avg = Array(8).fill(null).map((_,idx)=>{const v1=monthly[3][idx];const v2=monthly[4][idx];return v1!=null&&v2!=null?Number(((v1+v2)/2).toFixed(2)):null;});
    const avgDataset = {label:'Средняя температура',data:avg,borderColor:'#10b981',borderDash:[6,4],fill:false,tension:0.35,pointRadius:0,segment:{borderDash:ctx=>ctx.p1DataIndex>=5?[5,5]:[]}};
    createChart('chart4',[...dsT1,...dsT2,avgDataset],'temp');

    const infoDiv=document.createElement('div');
    infoDiv.style='color:#6b7280;text-align:center;padding:10px;font-size:12px;font-style:italic;';
    infoDiv.textContent='Данные справа от вертикальной линии являются прогнозными и обновляются регулярно';
    document.body.prepend(infoDiv);

    console.log('Графики успешно инициализированы');
  } catch(e){
    console.error('Ошибка инициализации графиков:',e);
    const el=document.createElement('div');
    el.style='color:#7f1d1d;background:#fff1f2;border:1px solid #fecaca;padding:12px;margin:10px;text-align:center;';
    el.textContent='Ошибка загрузки данных графиков: '+(e.message||e);
    document.body.prepend(el);
  }
}

document.addEventListener('DOMContentLoaded',()=>{initializeCharts();});

