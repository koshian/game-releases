const DB = window.GAME_RELEASE_DB;
const DEFAULT_SELECTED = new Set(["fc", "sfc", "ps1", "ps2", "switch", "ps5"]);
const selected = new Set(DEFAULT_SELECTED);
let panelIndex = null;
const hiddenPanelSeries = new Set();
let panelSearch = "";
let restoreSearchFocus = false;
const groups = [
  [
    "Nintendo",
    [
      "fc",
      "fds",
      "gb",
      "sfc",
      "n64",
      "gba",
      "gc",
      "ds",
      "wii",
      "3ds",
      "wiiu",
      "switch",
      "switchpkg",
    ],
  ],
  ["SEGA", ["md", "gg", "saturn", "dc"]],
  ["Sony", ["ps1", "ps2", "psp", "ps3", "vita", "ps4", "ps5"]],
  ["Microsoft", ["xbox", "xbox360", "xboxone", "xboxseries"]],
  ["NEC / SNK / Bandai", ["pce", "neogeo", "ngp", "ws"]],
];

function colorFor(id) {
  const index = DB.order.indexOf(id);
  const base = [
    "#b13b2e",
    "#265ea8",
    "#268b6e",
    "#8a4fa1",
    "#d17a13",
    "#267e9d",
    "#6b8135",
    "#a8496e",
    "#5d58a7",
    "#9a6732",
  ];

  if (index < base.length) {
    return base[index];
  }

  const hue = (index * 137.508 + 18) % 360;
  return `hsl(${hue.toFixed(1)} 52% 43%)`;
}

function fmt(number) {
  return number.toLocaleString("ja-JP");
}

function buildControls() {
  const root = document.getElementById("checklist");
  root.innerHTML = "";

  for (const [groupName, ids] of groups) {
    const section = document.createElement("div");
    section.className = "group";
    section.innerHTML = `<div class="group-title">${groupName}</div>`;

    ids.forEach((id) => {
      const series = DB.series[id];
      if (!series) return;

      const label = document.createElement("label");
      label.className = "platform-check";
      label.innerHTML = `<input type="checkbox" data-id="${id}" ${selected.has(id) ? "checked" : ""}><span class="swatch" style="--c:${colorFor(id)}"></span><span>${series.label}</span><span class="pcount">${fmt(series.unique_titles)}</span>`;
      section.appendChild(label);
    });

    root.appendChild(section);
  }

  root.querySelectorAll("input").forEach((element) => {
    element.addEventListener("change", () => {
      if (element.checked) {
        selected.add(element.dataset.id);
      } else {
        selected.delete(element.dataset.id);
      }
      render();
      closePanel();
    });
  });
}

function syncChecks() {
  document.querySelectorAll(".platform-check input").forEach((element) => {
    element.checked = selected.has(element.dataset.id);
  });
}

function rolling12(values) {
  return values.map((_, index) => {
    const start = Math.max(0, index - 11);
    let sum = 0;
    for (let j = start; j <= index; j++) sum += values[j];
    return sum / (index - start + 1);
  });
}

function niceMax(value) {
  if (value <= 0) return 10;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / power;
  const multiplier =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * power;
}

function pathFor(values, x, y) {
  let path = "";
  values.forEach((value, index) => {
    const px = x(index);
    const py = y(value);
    path += `${index ? "L" : "M"}${px.toFixed(2)},${py.toFixed(2)}`;
  });
  return path;
}

function svgEl(name, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs))
    element.setAttribute(key, value);
  return element;
}

function render() {
  const mode = document.getElementById("mode").value;
  const ids = DB.order.filter((id) => selected.has(id));
  document.getElementById("selectionCount").textContent =
    `${ids.length} / ${DB.order.length} 系列を表示`;
  renderLegend(ids);
  renderRefs(ids);

  const svg = document.getElementById("chart");
  svg.innerHTML = "";
  if (!ids.length) {
    const foreignObject = svgEl("foreignObject", {
      x: 0,
      y: 0,
      width: 1100,
      height: 600,
    });
    foreignObject.innerHTML =
      '<div xmlns="http://www.w3.org/1999/xhtml" class="empty">左のチェックボックスから<br>表示する系列を選択してください。</div>';
    svg.appendChild(foreignObject);
    return;
  }

  const width = 1100;
  const height = 600;
  const margin = { l: 66, r: 22, t: 22, b: 58 };
  const innerWidth = width - margin.l - margin.r;
  const innerHeight = height - margin.t - margin.b;
  const values = {};
  let maxMonth = 0;
  let maxY = 0;

  ids.forEach((id) => {
    let seriesValues = DB.series[id].counts;
    if (mode === "ma12") seriesValues = rolling12(seriesValues);
    values[id] = seriesValues;
    maxMonth = Math.max(maxMonth, seriesValues.length - 1);
    for (const value of seriesValues) maxY = Math.max(maxY, value);
  });

  maxY = niceMax(maxY * 1.04);
  const x = (index) => margin.l + (index / maxMonth) * innerWidth;
  const y = (value) => margin.t + innerHeight - (value / maxY) * innerHeight;

  const ySteps = 5;
  for (let step = 0; step <= ySteps; step++) {
    const value = (maxY * step) / ySteps;
    const py = y(value);
    svg.appendChild(
      svgEl("line", {
        x1: margin.l,
        y1: py,
        x2: width - margin.r,
        y2: py,
        class: "gridline",
      }),
    );
    const tick = svgEl("text", {
      x: margin.l - 10,
      y: py + 4,
      "text-anchor": "end",
      class: "ticktext",
    });
    tick.textContent =
      mode === "ma12" ? value.toFixed(value < 10 ? 1 : 0) : Math.round(value);
    svg.appendChild(tick);
  }

  const maxYears = maxMonth / 12;
  const yearStep = maxYears > 14 ? 2 : 1;
  for (let year = 0; year <= Math.floor(maxYears); year += yearStep) {
    const px = x(year * 12);
    svg.appendChild(
      svgEl("line", {
        x1: px,
        y1: margin.t,
        x2: px,
        y2: margin.t + innerHeight,
        class: "gridline",
      }),
    );
    const tick = svgEl("text", {
      x: px,
      y: height - 31,
      "text-anchor": "middle",
      class: "ticktext",
    });
    tick.textContent = year;
    svg.appendChild(tick);
  }

  svg.appendChild(
    svgEl("line", {
      x1: margin.l,
      y1: margin.t + innerHeight,
      x2: width - margin.r,
      y2: margin.t + innerHeight,
      class: "axisline",
    }),
  );
  svg.appendChild(
    svgEl("line", {
      x1: margin.l,
      y1: margin.t,
      x2: margin.l,
      y2: margin.t + innerHeight,
      class: "axisline",
    }),
  );
  const xLabel = svgEl("text", {
    x: margin.l + innerWidth / 2,
    y: height - 7,
    "text-anchor": "middle",
    class: "axislabel",
  });
  xLabel.textContent = "発売からの経過年数";
  svg.appendChild(xLabel);
  const yLabel = svgEl("text", {
    x: 16,
    y: margin.t + innerHeight / 2,
    "text-anchor": "middle",
    class: "axislabel",
    transform: `rotate(-90 16 ${margin.t + innerHeight / 2})`,
  });
  yLabel.textContent =
    mode === "ma12" ? "月間新作本数（12か月移動平均）" : "月間新作本数";
  svg.appendChild(yLabel);

  ids.forEach((id) => {
    svg.appendChild(
      svgEl("path", {
        d: pathFor(values[id], x, y),
        stroke: colorFor(id),
        class: "data-line",
        "data-id": id,
      }),
    );
  });

  const cross = svgEl("line", {
    x1: margin.l,
    y1: margin.t,
    x2: margin.l,
    y2: margin.t + innerHeight,
    stroke: "#6f695f",
    "stroke-width": "1",
    "stroke-dasharray": "3 4",
    visibility: "hidden",
  });
  svg.appendChild(cross);
  const overlay = svgEl("rect", {
    x: margin.l,
    y: margin.t,
    width: innerWidth,
    height: innerHeight,
    fill: "transparent",
    style: "cursor:crosshair",
  });
  svg.appendChild(overlay);
  const tip = document.getElementById("tooltip");
  const box = document.getElementById("chartbox");

  function hide() {
    cross.setAttribute("visibility", "hidden");
    tip.style.display = "none";
  }

  overlay.addEventListener("pointerleave", hide);
  const monthIndexForEvent = (event) => {
    const rect = svg.getBoundingClientRect();
    const scaleX = 1100 / rect.width;
    const px = (event.clientX - rect.left) * scaleX;
    return Math.max(0, Math.min(maxMonth, Math.round(((px - margin.l) / innerWidth) * maxMonth)));
  };
  overlay.addEventListener("pointermove", (event) => {
    const index = monthIndexForEvent(event);
    const centerX = x(index);
    cross.setAttribute("x1", centerX);
    cross.setAttribute("x2", centerX);
    cross.setAttribute("visibility", "visible");

    let html = `<div class="month">発売後 ${index}か月（${(index / 12).toFixed(1)}年）</div>`;
    ids.forEach((id) => {
      if (index < values[id].length) {
        const value = values[id][index];
        const calendarMonth = DB.series[id].months[index] || "";
        html += `<div class="tooltip-row"><span class="tooltip-dot" style="--c:${colorFor(id)}"></span><span>${DB.series[id].label} <span style="opacity:.6">${calendarMonth}</span></span><span class="tooltip-val">${mode === "ma12" ? value.toFixed(1) : value} 本</span></div>`;
      }
    });
    html += '<div class="tooltip-hint">クリックでこの月のタイトル一覧</div>';

    tip.innerHTML = html;
    tip.style.display = "block";
    const boxRect = box.getBoundingClientRect();
    const left = event.clientX - boxRect.left + 14;
    const top = event.clientY - boxRect.top + 14;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    requestAnimationFrame(() => {
      if (left + tip.offsetWidth > boxRect.width - 8)
        tip.style.left = `${left - tip.offsetWidth - 28}px`;
      if (top + tip.offsetHeight > boxRect.height - 8)
        tip.style.top = `${top - tip.offsetHeight - 28}px`;
    });
  });
  overlay.addEventListener("click", (event) => openPanel(monthIndexForEvent(event)));
}

function closePanel() {
  const panel = document.getElementById("titlePanel");
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
}

function panelText(parent, text, className) {
  const element = document.createElement("span");
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function renderPanel(index) {
  const panel = document.getElementById("titlePanel");
  panel.innerHTML = "";
  const header = document.createElement("div");
  header.className = "title-panel-head";
  const heading = document.createElement("h2");
  heading.textContent = `発売後 ${index}か月（${(index / 12).toFixed(1)}年）`;
  header.appendChild(heading);
  const close = document.createElement("button");
  close.className = "panel-close";
  close.type = "button";
  close.setAttribute("aria-label", "閉じる");
  close.textContent = "×";
  close.addEventListener("click", closePanel);
  header.appendChild(close);
  panel.appendChild(header);

  const available = [];
  DB.order.filter((id) => selected.has(id)).forEach((id) => {
    const series = DB.series[id];
    const source = window.GAME_RELEASE_TITLES && window.GAME_RELEASE_TITLES[series.source_id];
    let rows = (source && source[String(index)]) || [];
    if (series.package_filter === "true") rows = rows.filter((row) => row[2] === 1);
    if (rows.length) available.push({ id, series, rows });
  });

  if (!available.length) {
    restoreSearchFocus = false;
    panelText(panel, "この月の新作タイトルはありません", "panel-empty");
    return;
  }

  const chips = document.createElement("div");
  chips.className = "panel-chips";
  available.forEach(({ id, series, rows }) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `panel-chip${hiddenPanelSeries.has(id) ? " is-muted" : ""}`;
    const dot = document.createElement("span");
    dot.className = "panel-dot";
    dot.style.setProperty("--c", colorFor(id));
    chip.append(dot);
    panelText(chip, series.label);
    panelText(chip, ` ${rows.length}`, "panel-chip-count");
    chip.addEventListener("click", () => {
      if (hiddenPanelSeries.has(id)) hiddenPanelSeries.delete(id); else hiddenPanelSeries.add(id);
      renderPanel(index);
    });
    chips.appendChild(chip);
  });
  panel.appendChild(chips);

  const search = document.createElement("input");
  search.type = "search";
  search.className = "panel-search";
  search.placeholder = "タイトル・メーカーを検索";
  search.value = panelSearch;
  search.setAttribute("aria-label", "タイトルまたはメーカーを検索");
  search.addEventListener("input", () => { panelSearch = search.value; restoreSearchFocus = true; renderPanel(index); });
  panel.appendChild(search);
  if (restoreSearchFocus) {
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
    restoreSearchFocus = false;
  }

  const query = panelSearch.trim().toLocaleLowerCase();
  available.forEach(({ id, series, rows }) => {
    if (hiddenPanelSeries.has(id)) return;
    const filtered = rows.filter((row) => !query || `${row[1]} ${row[3]}`.toLocaleLowerCase().includes(query));
    if (!filtered.length) return;
    const group = document.createElement("section");
    group.className = "panel-group";
    const groupHead = document.createElement("h3");
    const dot = document.createElement("span");
    dot.className = "panel-dot";
    dot.style.setProperty("--c", colorFor(id));
    groupHead.append(dot);
    panelText(groupHead, `${series.label}　${series.months[index] || ""}　${filtered.length}件`);
    group.appendChild(groupHead);
    filtered.forEach((row) => {
      const item = document.createElement("div");
      item.className = "title-row";
      panelText(item, `${String(series.months[index] || "--").slice(5)}-${String(row[0]).padStart(2, "0")}`, "title-date");
      const info = document.createElement("div");
      info.className = "title-info";
      panelText(info, row[1], "title-name");
      const maker = document.createElement("span");
      maker.className = "title-maker";
      maker.textContent = row[3] || "—";
      info.appendChild(maker);
      if (row[2] === 0) panelText(info, "DL専売", "download-badge");
      item.appendChild(info);
      const link = document.createElement("a");
      link.className = "wikipedia-link";
      link.href = `https://ja.wikipedia.org/w/index.php?search=${encodeURIComponent(row[1])}`;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Wikipedia";
      item.appendChild(link);
      group.appendChild(item);
    });
    panel.appendChild(group);
  });
}

function openPanel(index) {
  const panel = document.getElementById("titlePanel");
  panelIndex = index;
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  if (window.GAME_RELEASE_TITLES) { renderPanel(index); return; }
  panel.innerHTML = "";
  panelText(panel, "タイトルデータを読み込み中…", "panel-loading");
  if (document.querySelector('script[data-title-data]')) return;
  const script = document.createElement("script");
  script.src = "./titles.js";
  script.dataset.titleData = "true";
  script.onload = () => renderPanel(panelIndex);
  script.onerror = () => {
    script.remove();
    panel.innerHTML = "";
    panelText(panel, "読み込みに失敗しました。もう一度クリックしてください。", "panel-error");
  };
  document.head.appendChild(script);
}

function renderLegend(ids) {
  const root = document.getElementById("legend");
  root.innerHTML = "";
  ids.forEach((id) => {
    const element = document.createElement("span");
    element.className = "legend-item";
    element.innerHTML = `<span class="legend-swatch" style="--c:${colorFor(id)}"></span>${DB.series[id].label}`;
    root.appendChild(element);
  });
}

function renderRefs(ids) {
  const root = document.getElementById("refs");
  root.innerHTML = "";
  ids.forEach((id) => {
    const series = DB.series[id];
    const reference = DB.sources[id];
    const listItem = document.createElement("li");
    const href = reference.url
      ? `<a class="ref-url" href="${reference.url}" target="_blank" rel="noreferrer">${reference.url}</a>`
      : "URL unavailable";
    listItem.innerHTML = `<span class="ref-platform">${series.label}.</span> ${reference.author}. “${reference.title}.” <span class="ref-meta">${reference.container}. Retrieved ${reference.accessed}.</span><br>${href}<span class="ref-note">${reference.note}　正規化後 ${fmt(series.unique_titles)} タイトル、観測 ${series.duration_months} か月。</span>`;
    root.appendChild(listItem);
  });
}

document.getElementById("selectAll").onclick = () => {
  DB.order.forEach((id) => selected.add(id));
  syncChecks();
  render();
  closePanel();
};
document.getElementById("clearAll").onclick = () => {
  selected.clear();
  syncChecks();
  render();
  closePanel();
};
document.getElementById("preset").onclick = () => {
  selected.clear();
  DEFAULT_SELECTED.forEach((id) => selected.add(id));
  syncChecks();
  render();
  closePanel();
};
document.getElementById("mode").addEventListener("change", render);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closePanel(); });
document.getElementById("platformTotal").textContent = DB.meta.platform_count;
document.getElementById("titleTotal").textContent = fmt(DB.meta.unique_titles);
buildControls();
render();
