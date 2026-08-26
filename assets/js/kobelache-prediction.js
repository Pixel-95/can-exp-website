(() => {
  'use strict';

  const DATA_URL = 'https://storage.googleapis.com/canyon-kobelache-prediction-enz-forecast/enz-200204/latest.json';
  const TIME_ZONE = 'Europe/Vienna';
  const UPDATE_MINUTES = [3, 18, 33, 48];
  const visible = { median: true, fifty: true };
  const chartElement = document.getElementById('prediction-chart');
  const statusElement = document.getElementById('prediction-status');
  const currentElement = document.getElementById('prediction-current-q');
  const cutoffElement = document.getElementById('prediction-cutoff');
  const issuedElement = document.getElementById('prediction-issued-at');
  const nextElement = document.getElementById('prediction-next-update');
  let chart;
  let forecastPoints = [];

  const dateFormatter = new Intl.DateTimeFormat('de-AT', {
    timeZone: TIME_ZONE,
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const numberFormatter = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatDate = (value) => dateFormatter.format(new Date(value)).replace(',', '');
  const formatQ = (value) => `${numberFormatter.format(value)} m³/s`;

  function nextUpdate(issuedAt) {
    const issued = new Date(issuedAt);
    const next = new Date(issued.getTime());
    next.setUTCSeconds(0, 0);
    const minute = issued.getUTCMinutes();
    const candidate = UPDATE_MINUTES.find((value) => value > minute);
    if (candidate === undefined) {
      next.setUTCHours(next.getUTCHours() + 1, UPDATE_MINUTES[0], 0, 0);
    } else {
      next.setUTCMinutes(candidate, 0, 0);
    }
    return next;
  }

  function xLabelIndexes() {
    const fullHours = forecastPoints.map((point, index) => new Date(point.valid_time).getUTCMinutes() === 0 ? index : null).filter(Number.isInteger);
    const width = chartElement.clientWidth || window.innerWidth;
    const labelCount = Math.min(fullHours.length, Math.max(3, Math.floor((width - 100) / 110)));
    return new Set(Array.from({ length: labelCount }, (_, index) => fullHours[Math.round(index * (fullHours.length - 1) / (labelCount - 1))]));
  }

  function niceStep(value) {
    const exponent = Math.floor(Math.log10(Math.max(value, 0.001)));
    const magnitude = 10 ** exponent;
    const normalized = value / magnitude;
    const base = [1, 2, 2.5, 5, 10].find((candidate) => candidate >= normalized) || 10;
    return base * magnitude;
  }

  function yAxis() {
    const maximum = Math.max(...forecastPoints.map((point) => Number(point.q_p75) || 0), 0.1);
    const minimumWanted = maximum * 1.1;
    const interval = niceStep(minimumWanted / 5);
    return { max: Math.ceil(minimumWanted / interval) * interval, interval };
  }

  function bandSeries(name, lowerKey, upperKey, color, active, stack) {
    const lower = forecastPoints.map((point) => Number(point[lowerKey]));
    const range = forecastPoints.map((point) => Number(point[upperKey]) - Number(point[lowerKey]));
    const inactiveData = active ? undefined : lower.map(() => null);
    return [
      { name, type: 'line', stack, data: inactiveData || lower, symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 }, tooltip: { show: false }, emphasis: { disabled: true }, silent: true, z: 1 },
      { name, type: 'line', stack, data: active ? range : range.map(() => null), symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color, opacity: 1 }, tooltip: { show: false }, emphasis: { disabled: true }, silent: true, z: 2 }
    ];
  }

  function tooltipFormatter(params) {
    const selected = params.find((item) => Number.isInteger(item.dataIndex));
    const point = forecastPoints[selected ? selected.dataIndex : 0];
    if (!point) return '';
    return `<div class="prediction-tooltip"><strong>${formatDate(point.valid_time)}</strong><br><span>Median</span><b>${formatQ(point.q_p50)}</b><br><span>50%-Bereich</span><b>${formatQ(point.q_p25)} – ${formatQ(point.q_p75)}</b></div>`;
  }

  function renderChart() {
    if (!chart) chart = echarts.init(chartElement, null, { renderer: 'canvas' });
    const axis = yAxis();
    const timestamps = forecastPoints.map((point) => point.valid_time);
    chart.setOption({
      animation: false,
      aria: { enabled: true, description: 'Abflussprognose der Kobelache für die nächsten 60 Stunden.' },
      grid: { top: 18, right: 38, bottom: 100, left: 78, containLabel: false },
      xAxis: {
        type: 'category', boundaryGap: false, data: timestamps,
        axisLine: { lineStyle: { color: '#747474' } }, axisTick: { show: false },
        axisLabel: { color: '#d5d5d5', fontSize: 11, rotate: 40, margin: 17, hideOverlap: false, formatter: (value, index) => xLabelIndexes().has(index) ? formatDate(value) : '' }
      },
      yAxis: {
        type: 'value', min: 0, max: axis.max, interval: axis.interval, name: 'Abfluss (m³/s)', nameTextStyle: { color: '#d5d5d5', fontSize: 12, padding: [0, 0, 8, -4] },
        axisLabel: { color: '#d5d5d5', formatter: (value) => new Intl.NumberFormat('de-AT', { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value) },
        splitLine: { lineStyle: { color: '#454545' } }, axisLine: { show: false }, axisTick: { show: false }
      },
      tooltip: {
        trigger: 'axis', triggerOn: 'mousemove|click', axisPointer: { type: 'line', snap: true, lineStyle: { color: '#9bdcff', width: 1 } },
        backgroundColor: 'rgba(16, 16, 16, .96)', borderWidth: 0, padding: [10, 12], textStyle: { color: '#fff', fontSize: 12 },
        confine: true, className: 'prediction-echarts-tooltip', formatter: tooltipFormatter,
        position: (_point, _params, _dom, _rect, size) => [Math.max(8, (size.viewSize[0] - size.contentSize[0]) / 2), 10]
      },
      series: [
        { name: '', type: 'line', data: forecastPoints.map((point) => Number(point.q_p50)), symbol: 'none', lineStyle: { opacity: 0 }, itemStyle: { opacity: 0 }, silent: true, z: 0 },
        ...bandSeries('50%-Bereich', 'q_p25', 'q_p75', 'rgba(101, 199, 255, .26)', visible.fifty, 'fifty'),
        { name: 'Median', type: 'line', data: visible.median ? forecastPoints.map((point) => Number(point.q_p50)) : forecastPoints.map(() => null), symbol: 'none', smooth: false, lineStyle: { color: '#65c7ff', width: 3, type: 'dashed' }, itemStyle: { color: '#65c7ff' }, z: 5 }
      ]
    }, true);
  }

  function showStatus(message, type = '') {
    statusElement.textContent = message;
    statusElement.className = `prediction-status${type ? ` prediction-status--${type}` : ''}`;
  }

  function populateOverview(forecast) {
    const first = forecast.points[0];
    currentElement.textContent = numberFormatter.format(Number(first.q_p50));
    cutoffElement.textContent = formatDate(forecast.data_cutoff);
    issuedElement.textContent = formatDate(forecast.issued_at);
    nextElement.textContent = formatDate(nextUpdate(forecast.issued_at));
    const ageMinutes = (Date.now() - new Date(forecast.data_cutoff).getTime()) / 60000;
    showStatus(ageMinutes > 45 ? 'Hinweis: Der Datenstand ist älter als 45 Minuten.' : 'Prognose ist aktuell.', ageMinutes > 45 ? 'stale' : '');
  }

  async function loadForecast() {
    showStatus('Prognose wird geladen …');
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Server antwortet mit ${response.status}`);
      const forecast = await response.json();
      if (!Array.isArray(forecast.points) || forecast.points.length !== 241) throw new Error('Die Prognosedaten sind unvollständig.');
      forecastPoints = forecast.points;
      populateOverview(forecast);
      renderChart();
    } catch (error) {
      console.error('Kobelache prediction could not be loaded.', error);
      showStatus('Die aktuelle Prognose konnte nicht geladen werden. Bitte versuche es später erneut.', 'error');
    }
  }

  document.querySelectorAll('[data-prediction-series]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.predictionSeries;
      visible[key] = !visible[key];
      button.setAttribute('aria-pressed', String(visible[key]));
      renderChart();
    });
  });

  window.addEventListener('resize', () => {
    if (chart) {
      chart.resize();
      renderChart();
    }
  });

  loadForecast();
})();
