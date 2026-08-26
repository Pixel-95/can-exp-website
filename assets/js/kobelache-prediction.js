(() => {
  'use strict';

  const DATA_URL = 'https://storage.googleapis.com/canyon-kobelache-prediction-enz-forecast/enz-200204/latest.json';
  const TIME_ZONE = 'Europe/Vienna';
  const UPDATE_MINUTES = [3, 18, 33, 48];
  const visible = { observed: true, median: true, fifty: true };
  const chartElement = document.getElementById('prediction-chart');
  const statusElement = document.getElementById('prediction-status');
  const currentElement = document.getElementById('prediction-current-q');
  const cutoffElement = document.getElementById('prediction-cutoff');
  const issuedElement = document.getElementById('prediction-issued-at');
  const nextElement = document.getElementById('prediction-next-update');
  let chart;
  let forecastPoints = [];
  let chartRows = [];

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

  const asTimeSeries = (values) => values.map((value, index) => [chartRows[index].valid_time, value]);

  function timeAxisBounds() {
    const first = new Date(chartRows[0].valid_time);
    const last = new Date(chartRows[chartRows.length - 1].valid_time);
    first.setUTCMinutes(0, 0, 0);
    last.setUTCMinutes(0, 0, 0);
    last.setUTCHours(last.getUTCHours() + 1);
    return { min: first.getTime(), max: last.getTime() };
  }

  function latestMeasurementTime() {
    for (let index = chartRows.length - 1; index >= 0; index -= 1) {
      if (chartRows[index].observed_q !== undefined) return chartRows[index].valid_time;
    }
    return null;
  }

  function niceStep(value) {
    const exponent = Math.floor(Math.log10(Math.max(value, 0.001)));
    const magnitude = 10 ** exponent;
    const normalized = value / magnitude;
    const base = [1, 2, 2.5, 5, 10].find((candidate) => candidate >= normalized) || 10;
    return base * magnitude;
  }

  function yAxis() {
    const values = [];
    chartRows.forEach((point) => {
      if (visible.observed && point.observed_q !== undefined) values.push(Number(point.observed_q));
      if (visible.median && point.q_p50 !== undefined) values.push(Number(point.q_p50));
      if (visible.fifty && point.q_p25 !== undefined && point.q_p75 !== undefined) values.push(Number(point.q_p25), Number(point.q_p75));
    });
    const maximum = Math.max(...values.filter(Number.isFinite), 0.1);
    const minimumWanted = maximum * 1.1;
    const interval = niceStep(minimumWanted / 5);
    return { max: Math.ceil(minimumWanted / interval) * interval, interval };
  }

  function bandSeries(name, lowerKey, upperKey, color, active, stack) {
    const lower = chartRows.map((point) => point[lowerKey] === undefined ? null : Number(point[lowerKey]));
    const range = chartRows.map((point) => point[lowerKey] === undefined ? null : Number(point[upperKey]) - Number(point[lowerKey]));
    const inactiveData = active ? undefined : lower.map(() => null);
    return [
      { name, type: 'line', stack, data: asTimeSeries(inactiveData || lower), symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 }, tooltip: { show: false }, emphasis: { disabled: true }, silent: true, z: 1 },
      { name, type: 'line', stack, data: asTimeSeries(active ? range : range.map(() => null)), symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color, opacity: 1 }, tooltip: { show: false }, emphasis: { disabled: true }, silent: true, z: 2 }
    ];
  }

  function tooltipFormatter(params) {
    const selected = params.find((item) => Number.isInteger(item.dataIndex));
    const point = chartRows[selected ? selected.dataIndex : 0];
    if (!point) return '';
    if (point.observed_q !== undefined) {
      return `<div class="prediction-tooltip"><strong>${formatDate(point.valid_time)}</strong><br><span>Gemessen</span><b>${formatQ(point.observed_q)}</b></div>`;
    }
    return `<div class="prediction-tooltip"><strong>${formatDate(point.valid_time)}</strong><br><span>Vorhersage</span><b>${formatQ(point.q_p50)}</b><br><span>50%-Bereich</span><b>${formatQ(point.q_p25)} – ${formatQ(point.q_p75)}</b></div>`;
  }

  function renderChart() {
    if (!chart) chart = echarts.init(chartElement, null, { renderer: 'canvas' });
    const axis = yAxis();
    const timeBounds = timeAxisBounds();
    chart.setOption({
      animation: false,
      aria: { enabled: true, description: 'Abflussprognose der Kobelache für die nächsten 60 Stunden.' },
      grid: { top: 18, right: 38, bottom: 100, left: 78, containLabel: false },
      xAxis: {
        type: 'time', min: timeBounds.min, max: timeBounds.max, interval: 6 * 60 * 60 * 1000,
        axisLine: { lineStyle: { color: '#747474' } }, axisTick: { show: false },
        axisLabel: { color: '#d5d5d5', fontSize: 11, rotate: 40, margin: 17, hideOverlap: false, formatter: (value) => formatDate(value) }
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
        position: (point, _params, _dom, _rect, size) => {
          const tooltipWidth = size.contentSize[0];
          const x = Math.max(8, Math.min(point[0] - tooltipWidth / 2, size.viewSize[0] - tooltipWidth - 8));
          return [x, 10];
        }
      },
      series: [
        { name: '', type: 'line', data: asTimeSeries(chartRows.map((point) => Number(point.observed_q ?? point.q_p50))), symbol: 'none', lineStyle: { opacity: 0 }, itemStyle: { opacity: 0 }, silent: true, markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: '#454545', width: 1, type: 'solid' }, data: [{ xAxis: latestMeasurementTime() }] }, z: 0 },
        { name: 'Gemessen', type: 'line', data: asTimeSeries(visible.observed ? chartRows.map((point) => point.observed_q ?? null) : chartRows.map(() => null)), symbol: 'none', smooth: false, lineStyle: { color: '#65c7ff', width: 3 }, itemStyle: { color: '#65c7ff' }, z: 6 },
        ...bandSeries('50%-Bereich', 'q_p25', 'q_p75', 'rgba(101, 199, 255, .26)', visible.fifty, 'fifty'),
        { name: 'Vorhersage', type: 'line', data: asTimeSeries(visible.median ? chartRows.map((point) => point.q_p50 === undefined ? null : Number(point.q_p50)) : chartRows.map(() => null)), symbol: 'none', smooth: false, lineStyle: { color: '#65c7ff', width: 3, type: 'dashed' }, itemStyle: { color: '#65c7ff' }, z: 5 }
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

  function buildChartRows(forecast) {
    forecastPoints = forecast.points;
    const observationCutoff = new Date(forecast.data_cutoff).getTime();
    const observations = Array.isArray(forecast.observations?.points) ? forecast.observations.points : [];
    const measured = observations
      .filter((point) => Number.isFinite(Number(point.q)) && new Date(point.valid_time).getTime() <= observationCutoff)
      .map((point) => ({ valid_time: point.valid_time, observed_q: Number(point.q) }));
    if (!measured.length) {
      measured.push({ valid_time: forecast.data_cutoff, observed_q: Number(forecastPoints[0].q_p50) });
    }
    measured.sort((left, right) => new Date(left.valid_time) - new Date(right.valid_time));
    const predictionAnchor = measured[measured.length - 1];
    for (const quantile of ['q_p05', 'q_p25', 'q_p50', 'q_p75', 'q_p95']) {
      predictionAnchor[quantile] = predictionAnchor.observed_q;
    }
    chartRows = [
      ...measured,
      ...forecastPoints.filter((point) => new Date(point.valid_time).getTime() > observationCutoff),
    ];
  }

  async function loadForecast() {
    showStatus('Prognose wird geladen …');
    try {
      const requestUrl = new URL(DATA_URL);
      requestUrl.searchParams.set('_', Date.now().toString());
      const response = await fetch(requestUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Server antwortet mit ${response.status}`);
      const forecast = await response.json();
      if (!Array.isArray(forecast.points) || forecast.points.length !== 241 || !Array.isArray(forecast.observations?.points)) throw new Error('Die Prognosedaten sind unvollständig.');
      buildChartRows(forecast);
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

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) loadForecast();
  });

  loadForecast();
})();
