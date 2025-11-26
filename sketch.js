/*  CONFIGURABLE WAVY CIRCLES / POLYGONS — ULTRA SMOOTH EDITION
   Consolidated baseline with curated 2-column GUI + Solid Fill per-layer + Dual Colors:
   - 2-column layout for selected pairs (Start/End Radius, Poly Sides, Amplitude, Canvas Scale X/Y, Array Scale Start/End)
   - Complex blocks (layers, collapsibles, export, etc.) full-width
   - NEW: Solid Fill toggle per layer
   - NEW: Independent lineColor (stroke) and fillColor
   - Behavior A:
       Solid Fill OFF  → stroke = lineColor, noFill()
       Solid Fill ON   → stroke = lineColor, fill = fillColor (except line-based modes)
*/

let layerSelect, addLayerBtn, delLayerBtn, dupLayerBtn, layerColorPicker;
let fillColorPicker; // NEW: global fill color picker

let startRSlider, endRSlider;
let polySidesStartSlider, polySidesEndSlider, startShapeSelect, endShapeSelect;
let freqSlider, ampStartSlider, ampEndSlider, countSlider, rotSlider;
let waveMenu, dutySlider;
let lineWStartSlider, lineWEndSlider;
let globalRotSlider;
let canvasScaleXSlider, canvasScaleYSlider;
let numSpiralsSlider;

let erosionEnabledCheckbox, erosionScaleSlider, erosionThresholdSlider, erosionDecaySlider;

let uiPanel;
let valueSpans = {};

let mainCanvas;
const SIDEBAR_WIDTH = 300;

/* Solid Fill checkbox (global handle) */
let solidFillCheckbox;

/* Secondary S&H UI/state */
let sh2EnabledCheckbox;
let sh2FreqSlider, sh2AmpSlider;

/* Circular Array controls */
let circularArrayCheckbox;
let arrayScaleStartSlider, arrayScaleEndSlider, radialSpreadSlider;

/* Layers state */
let layers = [];
let selectedLayerIndex = 0;

/* deterministic pseudo-random helper seed */
const PRNG_CONST = 43758.5453;
function pseudoRandom(seed) { return fract(Math.sin(seed) * PRNG_CONST); }
function fract(x) { return x - Math.floor(x); }

/* High-precision settings */
const LINE_STEP_T = 0.002;
const CURVE_STEP_ANGLE = 0.002;

/* Layer object */
function createDefaultLayer(name = "Layer") {
  return {
    name: name,
    /* Colors */
    color: '#ffffff',     // stroke (line) color
    fillColor: '#ffffff', // NEW: fill color

    /* Geometry / morph */
    startR: 60,
    endR: 220,
    startShape: "concentric circles",
    endShape: "concentric circles",
    polySidesStart: 6,
    polySidesEnd: 6,

    /* Modulation */
    freq: 8,
    ampStart: 30,
    ampEnd: 0,
    wave: "sine",
    duty: 0.5,

    /* Layout / count */
    count: 12,
    rotOffsetDeg: 0,
    globalRotDeg: 0,

    /* Secondary Sample & Hold (modulation) */
    sh2Enabled: false,
    sh2Freq: 8,
    sh2Amp: 20,

    /* Appearance */
    lineWStart: 2,
    lineWEnd: 2,
    solidFill: false,   // NEW: toggle

    /* Erosion (noise masking) */
    erosionEnabled: false,
    erosionScale: 2.0,
    erosionThreshold: 0.5,
    erosionDecay: 0.5,

    /* Fibonacci */
    fibonacciReversed: false,
    numSpiralTurns: 4,

    /* Circular array */
    circularArrayEnabled: false,
    arrayScaleStart: 100,
    arrayScaleEnd: 100,
    radialSpread: 0
  };
}

/* ===== setup ===== */
function setup() {
  setupSidebarGUI();

  mainCanvas = createCanvas(700, 830, P2D);
  mainCanvas.position(SIDEBAR_WIDTH, 0);

  angleMode(RADIANS);
  noLoop();
  noiseSeed(42);

  layers.push(createDefaultLayer("Layer 1"));
  selectedLayerIndex = 0;
  rebuildLayerList();
  syncUIToLayer();

  updateRotationRangeFromShapeSelectors();
  onWaveChange();
  updateLabelsAndRedraw();
}

function setupSidebarGUI() {
  uiPanel = createDiv();
  uiPanel.id("ui-panel");
  uiPanel.style(`
    position: fixed;
    left: 0;
    top: 0;
    width: ${SIDEBAR_WIDTH}px;
    height: 100vh;
    background: #111;
    color: #fff;
    padding: 14px;
    overflow-y: auto;
    box-sizing: border-box;
    font-family: Arial, Helvetica, sans-serif;
    border-right: 1px solid rgba(255,255,255,0.04);

    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 12px;
  `);

  function addRow(labelText) {
    const row = createDiv().parent(uiPanel);
    row.style("margin-bottom: 12px");

    const label = createP(labelText).parent(row);
    label.style("margin:0 0 6px 0; font-size:13px; color:#ddd;");

    const val = createSpan("").parent(row);
    val.style("float:right; color:#9bd; font-weight:600; cursor:pointer;");

    const ctrlWrap = createDiv().parent(row);
    ctrlWrap.style("margin-top:6px;");

    return { row, label, ctrlWrap, val };
  }

  function addRowTo(parentEl, labelText) {
    const row = createDiv().parent(parentEl);
    row.style("margin-bottom: 12px");

    const label = createP(labelText).parent(row);
    label.style("margin:0 0 6px 0; font-size:13px; color:#ddd;");

    const val = createSpan("").parent(row);
    val.style("float:right; color:#9bd; font-weight:600; cursor:pointer;");

    const ctrlWrap = createDiv().parent(row);
    ctrlWrap.style("margin-top:6px;");

    return { row, label, ctrlWrap, val };
  }

  function createCollapsible(title, initiallyOpen = true) {
    const header = createDiv().parent(uiPanel);
    header.style("display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.03); margin-bottom:8px;");
    header.addClass("full");

    const titleP = createP(title).parent(header);
    titleP.style("margin:0; font-size:13px; color:#ddd;");

    const caret = createSpan(initiallyOpen ? "▾" : "▸").parent(header);
    caret.style("color:#9bd; font-weight:700;");

    const content = createDiv().parent(uiPanel);
    content.style(`margin-bottom:12px; display:${initiallyOpen ? "block" : "none"};`);
    content.addClass("full");
    content.addClass("section-content");
    content.addClass("two-col");

    header.mousePressed(() => {
      const isOpen = content.style("display") !== "none";
      if (isOpen) { content.style("display", "none"); caret.html("▸"); }
      else { content.style("display", "block"); caret.html("▾"); }
    });

    return { header, content, caret };
  }

  /* Layers */
  const layerRow = addRow("Layers");
  layerRow.row.addClass("full");
  layerSelect = createSelect().parent(layerRow.ctrlWrap);
  layerSelect.style("width:100%");
  layerSelect.changed(() => {
    selectedLayerIndex = Math.max(0, Math.min(layers.length - 1, int(layerSelect.value())));
    syncUIToLayer();
  });

  const layerBtnRow = createDiv().parent(uiPanel);
  layerBtnRow.style("display:flex; gap:6px; margin-bottom:10px;");
  layerBtnRow.addClass("full");
  addLayerBtn = createButton("+ Add Layer").parent(layerBtnRow);
  addLayerBtn.mousePressed(() => {
    const idx = layers.length + 1;
    const newLayer = createDefaultLayer("Layer " + idx);
    updateLayerFromUI(newLayer);
    layers.push(newLayer);
    selectedLayerIndex = layers.length - 1;
    rebuildLayerList();
    syncUIToLayer();
    redraw();
  });

  dupLayerBtn = createButton("Duplicate Layer").parent(layerBtnRow);
  dupLayerBtn.mousePressed(() => {
    const src = layers[selectedLayerIndex];
    if (!src) return;
    const clone = JSON.parse(JSON.stringify(src));
    let base = src.name || "Layer";
    let newName = base + " copy";
    let i = 2;
    while (layers.some(l => l.name === newName)) { newName = base + " copy " + i; i++; }
    clone.name = newName;
    layers.push(clone);
    selectedLayerIndex = layers.length - 1;
    rebuildLayerList();
    syncUIToLayer();
    redraw();
  });

  delLayerBtn = createButton("Delete Layer").parent(layerBtnRow);
  delLayerBtn.mousePressed(() => {
    if (layers.length <= 1) return;
    layers.splice(selectedLayerIndex, 1);
    selectedLayerIndex = constrain(selectedLayerIndex - 1, 0, layers.length - 1);
    rebuildLayerList();
    syncUIToLayer();
    redraw();
  });

  /* Line Color */
  const colorRow = addRow("Line Color");
  colorRow.row.addClass("full");
  layerColorPicker = createColorPicker('#ffffff').parent(colorRow.ctrlWrap);
  layerColorPicker.input(() => {
    const l = layers[selectedLayerIndex];
    l.color = layerColorPicker.value();
    redraw();
  });
  valueSpans.layerColor = colorRow.val;

  /* Fill Color (NEW) */
  const fillColorRow = addRow("Fill Color");
  fillColorRow.row.addClass("full");
  fillColorPicker = createColorPicker('#ffffff').parent(fillColorRow.ctrlWrap);
  fillColorPicker.input(() => {
    const l = layers[selectedLayerIndex];
    l.fillColor = fillColorPicker.value();
    redraw();
  });
  valueSpans.fillColor = fillColorRow.val;

  /* Solid Fill toggle */
  const fillRow = addRow("Solid Fill");
  fillRow.row.addClass("full");
  solidFillCheckbox = createCheckbox("Enable Solid Fill", false).parent(fillRow.ctrlWrap);
  solidFillCheckbox.changed(() => {
    const L = layers[selectedLayerIndex];
    L.solidFill = solidFillCheckbox.checked();
    redraw();
  });

  /* Start / End Radius (half + half) */
  let r1 = addRow("Start Radius");
  r1.row.addClass("half");
  startRSlider = createSlider(10, 300, 60, 1).parent(r1.ctrlWrap);
  startRSlider.style("width:100%");
  startRSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.startR = r1.val;

  let r2 = addRow("End Radius");
  r2.row.addClass("half");
  endRSlider = createSlider(10, 400, 220, 1).parent(r2.ctrlWrap);
  endRSlider.style("width:100%");
  endRSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.endR = r2.val;

  /* Start / End Shape (full) */
  let rStartShape = addRow("Start Shape");
  rStartShape.row.addClass("full");
  startShapeSelect = createSelect().parent(rStartShape.ctrlWrap);
  startShapeSelect.option("concentric circles");
  startShapeSelect.option("multi-sided shapes");
  startShapeSelect.option("radiating lines");
  startShapeSelect.option("fibonacci spiral");
  startShapeSelect.style("width:100%");
  startShapeSelect.changed(() => { updateRotationRangeFromShapeSelectors(); updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.startShape = rStartShape.val;

  let rEndShape = addRow("End Shape");
  rEndShape.row.addClass("full");
  endShapeSelect = createSelect().parent(rEndShape.ctrlWrap);
  endShapeSelect.option("concentric circles");
  endShapeSelect.option("multi-sided shapes");
  endShapeSelect.option("radiating lines");
  endShapeSelect.option("fibonacci spiral");
  endShapeSelect.style("width:100%");
  endShapeSelect.changed(() => { updateRotationRangeFromShapeSelectors(); updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.endShape = rEndShape.val;

  /* Polygon Sides (Start/End) half + half */
  let rPolyStart = addRow("Polygon Sides (Start)");
  rPolyStart.row.addClass("half");
  polySidesStartSlider = createSlider(3, 48, 6, 1).parent(rPolyStart.ctrlWrap);
  polySidesStartSlider.style("width:100%");
  polySidesStartSlider.input(() => { updateRotationRangeFromShapeSelectors(); updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.polySidesStart = rPolyStart.val;

  let rPolyEnd = addRow("Polygon Sides (End)");
  rPolyEnd.row.addClass("half");
  polySidesEndSlider = createSlider(3, 48, 6, 1).parent(rPolyEnd.ctrlWrap);
  polySidesEndSlider.style("width:100%");
  polySidesEndSlider.input(() => { updateRotationRangeFromShapeSelectors(); updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.polySidesEnd = rPolyEnd.val;

  /* Frequency (full) */
  let rFreq = addRow("Frequency");
  rFreq.row.addClass("full");
  freqSlider = createSlider(0, 96, 12, 1).parent(rFreq.ctrlWrap);
  freqSlider.style("width:100%");
  freqSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.freq = rFreq.val;

  /* Amplitude Start/End (half + half) */
  let rAmpStart = addRow("Amplitude Start");
  rAmpStart.row.addClass("half");
  ampStartSlider = createSlider(0, 240, 80, 1).parent(rAmpStart.ctrlWrap);
  ampStartSlider.style("width:100%");
  ampStartSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.ampStart = rAmpStart.val;

  let rAmpEnd = addRow("Amplitude End");
  rAmpEnd.row.addClass("half");
  ampEndSlider = createSlider(0, 240, 30, 1).parent(rAmpEnd.ctrlWrap);
  ampEndSlider.style("width:100%");
  ampEndSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.ampEnd = rAmpEnd.val;

  /* Count + Rotation (full) */
  let rCount = addRow("Shapes (count)");
  rCount.row.addClass("full");
  countSlider = createSlider(1, 120, 10, 1).parent(rCount.ctrlWrap);
  countSlider.style("width:100%");
  countSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.count = rCount.val;

  let rRot = addRow("Rotation Offset (deg)");
  rRot.row.addClass("full");
  rotSlider = createSlider(-30, 180, 0, 0.1).parent(rRot.ctrlWrap);
  rotSlider.style("width:100%");
  rotSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.rot = rRot.val;

  /* Global rotation (full) */
  let rGR = addRow("Global Rotation (deg) — per-layer");
  rGR.row.addClass("full");
  globalRotSlider = createSlider(-180, 180, 0, 0.1).parent(rGR.ctrlWrap);
  globalRotSlider.style("width:100%");
  globalRotSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.globalRot = rGR.val;

  /* Fibonacci options (full) */
  const fibRow = addRow("Fibonacci Options");
  fibRow.row.addClass("full");
  const fibReverseBtn = createButton("Reverse Spiral").parent(fibRow.ctrlWrap);
  fibReverseBtn.mousePressed(() => {
    const L = layers[selectedLayerIndex];
    L.fibonacciReversed = !L.fibonacciReversed;
    syncUIToLayer();
    redraw();
  });
  valueSpans.fibReverse = fibRow.val;

  const spiralRow = addRow("Number of Spiral Turns");
  spiralRow.row.addClass("full");
  numSpiralsSlider = createSlider(1, 12, 4, 1).parent(spiralRow.ctrlWrap);
  numSpiralsSlider.style("width:100%");
  numSpiralsSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.numSpirals = spiralRow.val;

  const logRow = addRow("Logarithmic Distribution");
  logRow.row.addClass("full");
  var logSlider = createSlider(-3, 3, 0, 0.01).parent(logRow.ctrlWrap);
  logSlider.style("width:100%");
  window.logDistSlider = logSlider;
  logSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.logDist = logRow.val;

  /* Waveform + duty (full) */
  let rWave = addRow("Waveform");
  rWave.row.addClass("full");
  waveMenu = createSelect().parent(rWave.ctrlWrap);
  waveMenu.option("sine");
  waveMenu.option("cosine");
  waveMenu.option("square");
  waveMenu.option("triangle");
  waveMenu.option("sample & hold");
  waveMenu.changed(() => { onWaveChange(); updateLayerFromUI(); });
  waveMenu.style("width:100%");
  valueSpans.wave = rWave.val;

  let rDuty = addRow("Duty Cycle (%)");
  rDuty.row.addClass("full");
  dutySlider = createSlider(1, 99, 50, 1).parent(rDuty.ctrlWrap);
  dutySlider.style("width:100%");
  dutySlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.duty = rDuty.val;

  /* Secondary S&H (collapsible) */
  const shPanel = createCollapsible("Secondary Sample & Hold (S&H) — modulation", true);
  let shH = addRowTo(shPanel.content, "Secondary S&H Enabled");
  shH.row.addClass("full");
  sh2EnabledCheckbox = createCheckbox("", false).parent(shH.ctrlWrap);
  sh2EnabledCheckbox.changed(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });

  let shF = addRowTo(shPanel.content, "S&H Frequency (cycles per segment)");
  shF.row.addClass("full");
  sh2FreqSlider = createSlider(0.1, 60, 8, 0.1).parent(shF.ctrlWrap);
  sh2FreqSlider.style("width:100%");
  sh2FreqSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });

  let shA = addRowTo(shPanel.content, "S&H Amplitude (+ only)");
  shA.row.addClass("full");
  sh2AmpSlider = createSlider(0, 200, 20, 0.1).parent(shA.ctrlWrap);
  sh2AmpSlider.style("width:100%");
  sh2AmpSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });

  valueSpans.sh2Freq = shF.val;
  valueSpans.sh2Amp = shA.val;

  /* Line widths (full) */
  let rLW1 = addRow("Line Width Start");
  rLW1.row.addClass("full");
  lineWStartSlider = createSlider(0.1, 100, 2, 0.1).parent(rLW1.ctrlWrap);
  lineWStartSlider.style("width:100%");
  lineWStartSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.lineWStart = rLW1.val;

  let rLW2 = addRow("Line Width End");
  rLW2.row.addClass("full");
  lineWEndSlider = createSlider(0.1, 100, 2, 0.1).parent(rLW2.ctrlWrap);
  lineWEndSlider.style("width:100%");
  lineWEndSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.lineWEnd = rLW2.val;

  /* Erosion (collapsible) */
  const erPanel = createCollapsible("Erosion (Perlin noise)", false);
  let erH = addRowTo(erPanel.content, "Enable Erosion (Perlin)");
  erH.row.addClass("full");
  erosionEnabledCheckbox = createCheckbox("", false).parent(erH.ctrlWrap);
  erosionEnabledCheckbox.changed(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });

  let erS = addRowTo(erPanel.content, "Erosion Noise Scale");
  erS.row.addClass("full");
  erosionScaleSlider = createSlider(0.30, 10, 2.0, 0.01).parent(erS.ctrlWrap);
  erosionScaleSlider.style("width:100%");
  erosionScaleSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.erosionScale = erS.val;

  let erT = addRowTo(erPanel.content, "Erosion Threshold");
  erT.row.addClass("full");
  erosionThresholdSlider = createSlider(0.36, 1, 0.5, 0.01).parent(erT.ctrlWrap);
  erosionThresholdSlider.style("width:100%");
  erosionThresholdSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.erosionThreshold = erT.val;

  let erD = addRowTo(erPanel.content, "Erosion Decay (center → edge)");
  erD.row.addClass("full");
  erosionDecaySlider = createSlider(0, 1, 0.5, 0.01).parent(erD.ctrlWrap);
  erosionDecaySlider.style("width:100%");
  erosionDecaySlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.erosionDecay = erD.val;

  /* Canvas scaling (half + half) */
  let rCSX = addRow("Canvas Width Scale");
  rCSX.row.addClass("half");
  canvasScaleXSlider = createSlider(0.5, 1.5, 1.0, 0.01).parent(rCSX.ctrlWrap);
  canvasScaleXSlider.style("width:100%");
  canvasScaleXSlider.input(resizeCanvasFromSliders);
  valueSpans.canvasScaleX = rCSX.val;

  let rCSY = addRow("Canvas Height Scale");
  rCSY.row.addClass("half");
  canvasScaleYSlider = createSlider(0.5, 1.5, 1.0, 0.01).parent(rCSY.ctrlWrap);
  canvasScaleYSlider.style("width:100%");
  canvasScaleYSlider.input(resizeCanvasFromSliders);
  valueSpans.canvasScaleY = rCSY.val;

  /* Circular Array (mixed) */
  const arrRow = addRow("Circular Array Mode (per-layer)");
  arrRow.row.addClass("full");
  circularArrayCheckbox = createCheckbox("Enable Circular Array", false).parent(arrRow.ctrlWrap);
  circularArrayCheckbox.changed(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });

  const scaleRow = addRow("Array Scale Start (%)");
  scaleRow.row.addClass("half");
  arrayScaleStartSlider = createSlider(1, 400, 100, 1).parent(scaleRow.ctrlWrap);
  arrayScaleStartSlider.style("width:100%");
  arrayScaleStartSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.arrayScaleStart = scaleRow.val;

  const scaleRow2 = addRow("Array Scale End (%)");
  scaleRow2.row.addClass("half");
  arrayScaleEndSlider = createSlider(1, 400, 100, 1).parent(scaleRow2.ctrlWrap);
  arrayScaleEndSlider.style("width:100%");
  arrayScaleEndSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.arrayScaleEnd = scaleRow2.val;

  const spreadRow = addRow("Radial Spread (0 = centerLine only → 1 = start→end)");
  spreadRow.row.addClass("full");
  radialSpreadSlider = createSlider(0, 1, 0, 0.01).parent(spreadRow.ctrlWrap);
  radialSpreadSlider.style("width:100%");
  radialSpreadSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.radialSpread = spreadRow.val;

  /* Export & Reset */
  const btnWrap = createDiv().parent(uiPanel);
  btnWrap.addClass("full");
  btnWrap.style("margin-top:12px");

  const exportBtn = createButton("Export SVG").parent(btnWrap);
  exportBtn.style(`
    width:100%;
    padding:10px;
    background:#1b1b1b;
    color:#fff;
    border:1px solid rgba(255,255,255,0.06);
  `);
  exportBtn.mousePressed(() => exportSVG(true));

  const resetBtn = createButton("Reset Defaults (selected layer)").parent(btnWrap);
  resetBtn.style(`
    width:100%;
    padding:8px;
    margin-top:8px;
    background:#222;
    color:#fff;
  `);
  resetBtn.mousePressed(() => {
    const l = layers[selectedLayerIndex];
    const def = createDefaultLayer(l.name);
    /* keep current colors to avoid surprise */
    def.color = l.color;
    def.fillColor = l.fillColor;
    layers[selectedLayerIndex] = def;
    syncUIToLayer();
    redraw();
  });

  if (waveMenu.value() !== "square") dutySlider.hide();

  setupInlineEditableFields();
}

/* rebuild layer list */
function rebuildLayerList() {
  layerSelect.elt.innerHTML = '';
  for (let i = 0; i < layers.length; i++) layerSelect.option(layers[i].name, i);
  selectedLayerIndex = constrain(selectedLayerIndex, 0, layers.length - 1);
  layerSelect.selected(selectedLayerIndex);
}

/* inline numeric editing */
function setupInlineEditableFields() {
  function attachEditable(spanElem, sliderElem, opts = {}) {
    const isInt = opts.isInt || false;
    const percent = opts.percent || false;
    spanElem.mousePressed(() => {
      if (spanElem.elt.querySelector('input')) return;
      let curVal = sliderElem ? (percent ? Math.round(sliderElem.value()) : sliderElem.value()) : (parseFloat(spanElem.html()) || 0);
      spanElem.elt.innerHTML = '';
      const inp = createInput(String(curVal), 'number').parent(spanElem);
      inp.elt.style.width = '78px';
      inp.elt.style.background = 'transparent';
      inp.elt.style.color = '#9bd';
      inp.elt.style.border = '1px solid rgba(255,255,255,0.06)';
      inp.elt.style.padding = '2px 4px';
      inp.elt.style.fontSize = '12px';
      inp.elt.style.outline = 'none';
      setTimeout(() => { try { inp.elt.select(); } catch (e) {} }, 5);

      function commitAndClose() {
        let num = Number(inp.value());
        if (isNaN(num)) num = 0;
        if (isInt) num = Math.round(num);
        if (sliderElem) {
          const smin = Number(sliderElem.elt.min ?? sliderElem.elt.getAttribute('min') ?? -Infinity);
          const smax = Number(sliderElem.elt.max ?? sliderElem.elt.getAttribute('max') ?? Infinity);
          if (!isNaN(smin)) num = max(num, smin);
          if (!isNaN(smax)) num = min(num, smax);
          sliderElem.value(num);
        }
        spanElem.elt.innerHTML = String(isInt ? Math.round(num) : num);
        updateLayerFromUI();
        updateLabelsAndRedraw();
      }

      inp.elt.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); commitAndClose(); }
        else if (ev.key === 'Escape') { spanElem.elt.innerHTML = String(curVal); }
      });
      inp.elt.addEventListener('blur', () => { commitAndClose(); });
    });
  }

  if (valueSpans.startR) attachEditable(valueSpans.startR, startRSlider);
  if (valueSpans.endR) attachEditable(valueSpans.endR, endRSlider);
  if (valueSpans.polySidesStart) attachEditable(valueSpans.polySidesStart, polySidesStartSlider, { isInt: true });
  if (valueSpans.polySidesEnd) attachEditable(valueSpans.polySidesEnd, polySidesEndSlider, { isInt: true });
  if (valueSpans.freq) attachEditable(valueSpans.freq, freqSlider, { isInt: true });
  if (valueSpans.ampStart) attachEditable(valueSpans.ampStart, ampStartSlider);
  if (valueSpans.ampEnd) attachEditable(valueSpans.ampEnd, ampEndSlider);
  if (valueSpans.count) attachEditable(valueSpans.count, countSlider, { isInt: true });
  if (valueSpans.rot) attachEditable(valueSpans.rot, rotSlider);
  if (valueSpans.globalRot) attachEditable(valueSpans.globalRot, globalRotSlider);
  if (valueSpans.duty) attachEditable(valueSpans.duty, dutySlider, { isInt: true, percent: true });
  if (valueSpans.lineWStart) attachEditable(valueSpans.lineWStart, lineWStartSlider);
  if (valueSpans.lineWEnd) attachEditable(valueSpans.lineWEnd, lineWEndSlider);
  if (valueSpans.sh2Freq) attachEditable(valueSpans.sh2Freq, sh2FreqSlider);
  if (valueSpans.sh2Amp) attachEditable(valueSpans.sh2Amp, sh2AmpSlider);
  if (valueSpans.erosionScale) attachEditable(valueSpans.erosionScale, erosionScaleSlider);
  if (valueSpans.erosionThreshold) attachEditable(valueSpans.erosionThreshold, erosionThresholdSlider);
  if (valueSpans.erosionDecay) attachEditable(valueSpans.erosionDecay, erosionDecaySlider);
  if (valueSpans.canvasScaleX) attachEditable(valueSpans.canvasScaleX, canvasScaleXSlider);
  if (valueSpans.canvasScaleY) attachEditable(valueSpans.canvasScaleY, canvasScaleYSlider);
  if (valueSpans.logDist && window.logDistSlider) attachEditable(valueSpans.logDist, window.logDistSlider);
  if (valueSpans.numSpirals && numSpiralsSlider) attachEditable(valueSpans.numSpirals, numSpiralsSlider, { isInt: true });
  if (valueSpans.arrayScaleStart) attachEditable(valueSpans.arrayScaleStart, arrayScaleStartSlider);
  if (valueSpans.arrayScaleEnd) attachEditable(valueSpans.arrayScaleEnd, arrayScaleEndSlider);
  if (valueSpans.radialSpread) attachEditable(valueSpans.radialSpread, radialSpreadSlider);
}

/* sync UI to selected layer */
function syncUIToLayer() {
  const l = layers[selectedLayerIndex];
  if (!l) return;

  startRSlider.value(l.startR);
  endRSlider.value(l.endR);
  startShapeSelect.value(l.startShape);
  endShapeSelect.value(l.endShape);
  polySidesStartSlider.value(l.polySidesStart);
  polySidesEndSlider.value(l.polySidesEnd);
  freqSlider.value(l.freq);
  ampStartSlider.value(l.ampStart);
  ampEndSlider.value(l.ampEnd);
  countSlider.value(l.count);
  rotSlider.value(l.rotOffsetDeg);
  waveMenu.value(l.wave);
  dutySlider.value(Math.round(l.duty * 100));
  sh2EnabledCheckbox.checked(l.sh2Enabled);
  sh2FreqSlider.value(l.sh2Freq);
  sh2AmpSlider.value(l.sh2Amp);
  lineWStartSlider.value(l.lineWStart);
  lineWEndSlider.value(l.lineWEnd);
  erosionEnabledCheckbox.checked(l.erosionEnabled);
  erosionScaleSlider.value(l.erosionScale);
  erosionThresholdSlider.value(l.erosionThreshold);
  erosionDecaySlider.value(l.erosionDecay);
  globalRotSlider.value(l.globalRotDeg);
  layerColorPicker.value(l.color);

  /* NEW */
  fillColorPicker.value(l.fillColor);
  if (solidFillCheckbox) solidFillCheckbox.checked(!!l.solidFill);

  if (numSpiralsSlider) numSpiralsSlider.value(l.numSpiralTurns);

  if (circularArrayCheckbox) circularArrayCheckbox.checked(!!l.circularArrayEnabled);
  if (arrayScaleStartSlider) arrayScaleStartSlider.value(l.arrayScaleStart);
  if (arrayScaleEndSlider) arrayScaleEndSlider.value(l.arrayScaleEnd);
  if (radialSpreadSlider) radialSpreadSlider.value(l.radialSpread);

  updateRotationRangeFromShapeSelectors();
  updateLabelsAndRedraw();
}

/* update layer from UI */
function updateLayerFromUI(layerObj) {
  const l = layerObj || layers[selectedLayerIndex];
  if (!l) return;

  l.startR = Number(startRSlider.value());
  l.endR = Number(endRSlider.value());
  l.startShape = startShapeSelect.value();
  l.endShape = endShapeSelect.value();
  l.polySidesStart = int(polySidesStartSlider.value());
  l.polySidesEnd = int(polySidesEndSlider.value());
  l.freq = Number(freqSlider.value());
  l.ampStart = Number(ampStartSlider.value());
  l.ampEnd = Number(ampEndSlider.value());
  l.count = int(countSlider.value());
  l.rotOffsetDeg = Number(rotSlider.value());
  l.globalRotDeg = Number(globalRotSlider.value());
  l.wave = waveMenu.value();
  l.duty = Number(dutySlider.value()) / 100.0;

  l.sh2Enabled = sh2EnabledCheckbox.checked();
  l.sh2Freq = Number(sh2FreqSlider.value());
  l.sh2Amp = Number(sh2AmpSlider.value());

  l.lineWStart = Number(lineWStartSlider.value());
  l.lineWEnd = Number(lineWEndSlider.value());

  l.erosionEnabled = erosionEnabledCheckbox.checked();
  l.erosionScale = Number(erosionScaleSlider.value());
  l.erosionThreshold = Number(erosionThresholdSlider.value());
  l.erosionDecay = Number(erosionDecaySlider.value());

  /* Colors */
  l.color = layerColorPicker.value();
  l.fillColor = fillColorPicker.value();
  l.solidFill = solidFillCheckbox.checked();

  if (numSpiralsSlider) l.numSpiralTurns = int(numSpiralsSlider.value());

  if (circularArrayCheckbox) l.circularArrayEnabled = circularArrayCheckbox.checked();
  if (arrayScaleStartSlider) l.arrayScaleStart = Number(arrayScaleStartSlider.value());
  if (arrayScaleEndSlider) l.arrayScaleEnd = Number(arrayScaleEndSlider.value());
  if (radialSpreadSlider) l.radialSpread = Number(radialSpreadSlider.value());
}

/* reset to defaults for selected layer (keep current colors) */
function resetDefaults() {
  const cur = layers[selectedLayerIndex];
  const def = createDefaultLayer(cur.name);
  def.color = cur.color;
  def.fillColor = cur.fillColor;
  layers[selectedLayerIndex] = def;
  syncUIToLayer();
  redraw();
}

/* rotation range updates */
function updateRotationRangeFromShapeSelectors() {
  const startIsPoly = (startShapeSelect.value() === "multi-sided shapes");
  const endIsPoly = (endShapeSelect.value() === "multi-sided shapes");
  const isPoly = startIsPoly || endIsPoly;

  let nStart = int(polySidesStartSlider.value());
  let nEnd = int(polySidesEndSlider.value());
  let nForRotation = nStart;
  if (startIsPoly && endIsPoly) nForRotation = max(1, min(nStart, nEnd));
  else if (endIsPoly) nForRotation = max(1, nEnd);
  else if (startIsPoly) nForRotation = max(1, nStart);

  setRotationRange(isPoly, nForRotation);
  polySidesStartSlider.style("opacity", startIsPoly ? "1" : "0.35");
  polySidesEndSlider.style("opacity", endIsPoly ? "1" : "0.35");
}

/* waveform change */
function onWaveChange() {
  if (waveMenu.value() === "square") dutySlider.show(); else dutySlider.hide();
  updateLayerFromUI();
  updateLabelsAndRedraw();
}

function setRotationRange(isPoly, n) {
  if (isPoly) { rotSlider.elt.min = 0; rotSlider.elt.max = 180 / max(1, n); }
  else { rotSlider.elt.min = -30; rotSlider.elt.max = 30; }
}

/* labels + redraw */
function updateLabelsAndRedraw() {
  if (valueSpans.startR) valueSpans.startR.html(startRSlider.value());
  if (valueSpans.endR) valueSpans.endR.html(endRSlider.value());

  if (valueSpans.canvasScaleX) valueSpans.canvasScaleX.html(canvasScaleXSlider ? nf(canvasScaleXSlider.value(), 1, 2) : '1.00');
  if (valueSpans.canvasScaleY) valueSpans.canvasScaleY.html(canvasScaleYSlider ? nf(canvasScaleYSlider.value(), 1, 2) : '1.00');

  let nStart = int(polySidesStartSlider.value());
  let nEnd = int(polySidesEndSlider.value());
  let sidesForLabel = max(nStart, nEnd);

  if (valueSpans.freq) {
    if ((startShapeSelect.value() === "multi-sided shapes") || (endShapeSelect.value() === "multi-sided shapes"))
      valueSpans.freq.html(`${freqSlider.value()} × ${sidesForLabel} = ${freqSlider.value() * sidesForLabel}`);
    else valueSpans.freq.html(freqSlider.value());
  }

  if (valueSpans.ampStart) valueSpans.ampStart.html(ampStartSlider.value());
  if (valueSpans.ampEnd) valueSpans.ampEnd.html(ampEndSlider.value());
  if (valueSpans.count) valueSpans.count.html(countSlider.value());
  if (valueSpans.rot) valueSpans.rot.html(rotSlider.value());
  if (valueSpans.globalRot) valueSpans.globalRot.html(globalRotSlider.value());
  if (valueSpans.wave) valueSpans.wave.html(waveMenu.value());
  if (valueSpans.duty) valueSpans.duty.html(dutySlider.value() + "%");
  if (valueSpans.lineWStart) valueSpans.lineWStart.html(lineWStartSlider.value());
  if (valueSpans.lineWEnd) valueSpans.lineWEnd.html(lineWEndSlider.value());
  if (valueSpans.sh2Freq) valueSpans.sh2Freq.html(sh2FreqSlider.value());
  if (valueSpans.sh2Amp) valueSpans.sh2Amp.html(sh2AmpSlider.value());
  if (valueSpans.erosionScale) valueSpans.erosionScale.html(nf(erosionScaleSlider.value(), 1, 2));
  if (valueSpans.erosionThreshold) valueSpans.erosionThreshold.html(nf(erosionThresholdSlider.value(), 1, 2));
  if (valueSpans.erosionDecay) valueSpans.erosionDecay.html(nf(erosionDecaySlider.value(), 1, 2));
  if (valueSpans.startShape) valueSpans.startShape.html(startShapeSelect.value());
  if (valueSpans.endShape) valueSpans.endShape.html(endShapeSelect.value());
  if (valueSpans.polySidesStart) valueSpans.polySidesStart.html(polySidesStartSlider.value());
  if (valueSpans.polySidesEnd) valueSpans.polySidesEnd.html(polySidesEndSlider.value());
  if (valueSpans.layerColor) valueSpans.layerColor.html(layerColorPicker.value());
  if (valueSpans.fillColor) valueSpans.fillColor.html(fillColorPicker.value());
  if (valueSpans.logDist && window.logDistSlider) valueSpans.logDist.html(window.logDistSlider.value());
  if (valueSpans.numSpirals && numSpiralsSlider) valueSpans.numSpirals.html(numSpiralsSlider.value());

  redraw();
}

/* resize canvas */
function resizeCanvasFromSliders() {
  let sx = canvasScaleXSlider.value();
  let sy = canvasScaleYSlider.value();
  resizeCanvas(700 * sx, 830 * sy);
  mainCanvas.position(SIDEBAR_WIDTH, 0);
  if (valueSpans.canvasScaleX) valueSpans.canvasScaleX.html(nf(sx, 1, 2));
  if (valueSpans.canvasScaleY) valueSpans.canvasScaleY.html(nf(sy, 1, 2));
  redraw();
}

/* ===== DRAWING ===== */
function draw() {
  background(20);

  for (let li = 0; li < layers.length; li++) {
    const L = layers[li];

    push();
    translate(width / 2, height / 2);
    rotate(radians(L.globalRotDeg));

    const useRadiating = (L.startShape === "radiating lines") && (L.endShape === "radiating lines");
    const useFibonacci = (L.startShape === "fibonacci spiral") || (L.endShape === "fibonacci spiral");

    /* Behavior A:
       - Always stroke with lineColor
       - If Solid Fill ON and not a line-based mode → also fill with fillColor
       - Line-based modes stay stroke-only
    */
    stroke(L.color);
    if (L.solidFill && !useRadiating && !useFibonacci) fill(L.fillColor);
    else noFill();

    if (useRadiating) {
      drawRadialLines(
        L.startR, L.endR, radians(L.rotOffsetDeg),
        L.freq, L.ampStart, L.ampEnd,
        L.wave, L.duty, L.lineWStart, L.lineWEnd,
        L.startShape, L.endShape, L.polySidesStart, L.polySidesEnd,
        L.count, li
      );
    } else if (useFibonacci) {
      drawFibonacciLines(L, li);
    } else {
      let logVal = window.logDistSlider ? Number(window.logDistSlider.value()) : 0;

      const circularEnabled = !!L.circularArrayEnabled;
      if (circularEnabled) {
        const arrayCount = max(1, int(L.count));
        const scaleStart = (L.arrayScaleStart || 100) / 100.0;
        const scaleEnd = (L.arrayScaleEnd || 100) / 100.0;
        const radialSpread = L.radialSpread || 0.0;

        for (let j = 0; j < arrayCount; j++) {
          let t = arrayCount > 1 ? j / (arrayCount - 1) : 0;
          let rPos = lerp(L.startR, L.endR, radialSpread * t);
          let angle = j * TWO_PI / arrayCount;
          let instScale = lerp(scaleStart, scaleEnd, t);
          let mappedRadT = applyDistribution(t, logVal);
          let baseRadius = lerp(L.startR, L.endR, mappedRadT);

          push();
          translate(rPos * cos(angle), rPos * sin(angle));
          rotate(angle + radians(L.rotOffsetDeg));
          scale(instScale);

          let lwActual = lerp(L.lineWStart, L.lineWEnd, t) / max(0.0001, instScale);
          strokeWeight(max(0.1, lwActual));

          beginShape();
          drawSampledShape(baseRadius, 0, L.freq, lerp(L.ampStart, L.ampEnd, t), L.wave, L.duty, L.startShape, L.endShape, 0, L.polySidesStart, L.polySidesEnd, li);
          endShape(CLOSE);
          pop();
        }
      } else {
        for (let i = 0; i < L.count; i++) {
          let tLayer = L.count > 1 ? i / (L.count - 1) : 0;
          let mappedRadT = applyDistribution(tLayer, logVal);
          let radius = lerp(L.startR, L.endR, mappedRadT);
          let morphT = tLayer;
          let amp = lerp(L.ampStart, L.ampEnd, tLayer);
          let shift = i * radians(L.rotOffsetDeg);
          let lwActual = lerp(L.lineWStart, L.lineWEnd, tLayer);
          strokeWeight(max(0.1, lwActual));

          beginShape();
          drawSampledShape(radius, shift, L.freq, amp, L.wave, L.duty, L.startShape, L.endShape, morphT, L.polySidesStart, L.polySidesEnd, li);
          endShape(CLOSE);
        }
      }
    }

    pop();
  }
}

/* applyDistribution */
function applyDistribution(t, logParam) {
  const k = Number(logParam) || 0;
  if (abs(k) < 1e-6) return t;
  if (k > 0) {
    const num = exp(k * t) - 1;
    const den = exp(k) - 1;
    return num / max(1e-12, den);
  } else {
    const kp = -k;
    const tt = 1 - t;
    const num = exp(kp * tt) - 1;
    const den = exp(kp) - 1;
    return 1 - (num / max(1e-12, den));
  }
}

/* Fibonacci lines (canvas) */
function drawFibonacciLines(L, layerIndex) {
  const reversed = !!L.fibonacciReversed;
  const numTurns = max(1, int(L.numSpiralTurns || 4));
  const thetaMax = TWO_PI * numTurns;
  const b = 0.55 / max(1, numTurns);
  const count = max(1, int(L.count));
  const samples = Math.max(ceil(thetaMax / 0.02), 50);
  const du = 1.0 / samples;

  const rExp0 = 1.0;
  const thetaStart = 0;
  const thetaEnd = thetaMax;
  const reMin = rExp0 * Math.exp(b * thetaStart);
  const reMax = rExp0 * Math.exp(b * thetaEnd);

  let logVal = window.logDistSlider ? Number(window.logDistSlider.value()) : 0;

  for (let i = 0; i < count; i++) {
    const baseAngle = i * TWO_PI / count + radians(L.rotOffsetDeg);
    let prevX = null, prevY = null, prevKeep = false, prevU = 0;

    for (let u = 0; u <= 1.000001; u += du) {
      const theta = (reversed ? -1 : 1) * u * thetaMax;
      const thetaAbs = u * thetaMax;

      const re = rExp0 * Math.exp(b * thetaAbs);
      const reNorm = (re - reMin) / max(1e-12, (reMax - reMin));
      const mapped = applyDistribution(reNorm, logVal);
      const r = lerp(L.startR, L.endR, mapped);

      const phase = u * L.freq * TWO_PI;
      const primary = waveformFunc(L.wave, phase, L.duty);
      const sec = secondarySH_by_t(u, L);
      const offset = primary * lerp(L.ampStart, L.ampEnd, u) + sec;

      const angleAtPoint = baseAngle + theta;
      const tangent = angleAtPoint + HALF_PI;

      const x = r * cos(angleAtPoint) + offset * cos(tangent);
      const y = r * sin(angleAtPoint) + offset * sin(tangent);

      const keep = erosionTestAtXY(x, y, layerIndex);

      if (prevX !== null) {
        if (prevKeep || keep) {
          let midT = (prevU + u) * 0.5;
          let segLW = lerp(L.lineWStart, L.lineWEnd, midT);
          strokeWeight(max(0.1, segLW));
          line(prevX, prevY, x, y);
        }
      }

      prevX = x; prevY = y; prevU = u; prevKeep = keep;
    }
  }
}

/* Fibonacci lines (SVG) */
function drawFibonacciLinesSVG(g, L, layerIndex = 0) {
  const reversed = !!L.fibonacciReversed;
  const numTurns = max(1, int(L.numSpiralTurns || 4));
  const thetaMax = TWO_PI * numTurns;
  const b = 0.55 / max(1, numTurns);
  const count = max(1, int(L.count));
  const samples = Math.max(Math.ceil(thetaMax / 0.02), 50);
  const du = 1.0 / samples;

  const rExp0 = 1.0;
  const thetaStart = 0;
  const thetaEnd = thetaMax;
  const reMin = rExp0 * Math.exp(b * thetaStart);
  const reMax = rExp0 * Math.exp(b * thetaEnd);

  let logVal = window.logDistSlider ? Number(window.logDistSlider.value()) : 0;

  for (let i = 0; i < count; i++) {
    const baseAngle = i * TWO_PI / count + radians(L.rotOffsetDeg);
    let prevX = null, prevY = null, prevKeep = false, prevU = 0;

    for (let u = 0; u <= 1.000001; u += du) {
      const theta = (reversed ? -1 : 1) * u * thetaMax;
      const thetaAbs = u * thetaMax;

      const re = rExp0 * Math.exp(b * thetaAbs);
      const reNorm = (re - reMin) / max(1e-12, (reMax - reMin));
      const mapped = applyDistribution(reNorm, logVal);
      const r = lerp(L.startR, L.endR, mapped);

      const phase = u * L.freq * TWO_PI;
      const primary = waveformFunc(L.wave, phase, L.duty);
      const sec = secondarySH_by_t(u, L);
      const offset = primary * lerp(L.ampStart, L.ampEnd, u) + sec;

      const angleAtPoint = baseAngle + theta;
      const tangent = angleAtPoint + HALF_PI;

      const x = r * cos(angleAtPoint) + offset * cos(tangent);
      const y = r * sin(angleAtPoint) + offset * sin(tangent);

      const keep = erosionTestAtXY(x, y, layerIndex);

      if (prevX !== null) {
        if (prevKeep || keep) {
          let midT = (prevU + u) * 0.5;
          let lw = lerp(L.lineWStart, L.lineWEnd, midT);
          g.strokeWeight(max(0.1, lw));
          g.line(prevX, prevY, x, y);
        }
      }

      prevX = x; prevY = y; prevU = u; prevKeep = keep;
    }
  }
}

/* S&H + waveform */
function secondarySH_by_t(t, layerObj) {
  if (!layerObj || !layerObj.sh2Enabled) return 0;
  let idx = Math.floor(t * layerObj.sh2Freq);
  let val = pseudoRandom(idx + 1.2345);
  return val * layerObj.sh2Amp;
}
function primarySH_byPhase(phaseRad) {
  let idx = Math.floor(phaseRad / TWO_PI);
  return pseudoRandom(idx + 0.4321) * 2.0 - 1.0;
}
function waveformFunc(type, phaseRad, duty = 0.5) {
  if (type === "sine") return sin(phaseRad);
  if (type === "cosine") return cos(phaseRad);
  if (type === "triangle") return (2 / PI) * asin(sin(phaseRad));
  if (type === "square") {
    let f = ((phaseRad % TWO_PI) + TWO_PI) % TWO_PI; f /= TWO_PI;
    return f < duty ? 1 : -1;
  }
  if (type === "sample & hold") return primarySH_byPhase(phaseRad);
  return 0;
}

/* Erosion */
function erosionTestAtXY(x, y, lineIndex = 0) {
  const layerToUse = layers[Math.min(lineIndex, layers.length - 1)] || layers[0];
  if (!layerToUse.erosionEnabled) return true;

  const scale = layerToUse.erosionScale;
  const baseThresh = layerToUse.erosionThreshold;
  const decay = layerToUse.erosionDecay;

  const lineOffset = lineIndex * 103.764;
  let n = noise((x + lineOffset) * scale, (y + lineOffset) * scale);

  let maxR = max(1, layers.reduce((m, L) => max(m, L.startR, L.endR), 1));
  let rNorm = constrain(sqrt(x * x + y * y) / maxR, 0, 1);

  let finalThresh = lerp(baseThresh, 1.0, decay * rNorm);
  return n >= finalThresh;
}

/* Base sampling + morph */
function sampleBaseRadius(shapeType, radiusParam, sidesN, angle, layerCountForSpikes = 60) {
  if (shapeType === "concentric circles") return radiusParam;

  if (shapeType === "multi-sided shapes") {
    let half = PI / max(1, sidesN);
    let sector = TWO_PI / max(1, sidesN);
    let shifted = angle + half;
    let wrapped = ((shifted % sector) + sector) % sector;
    let phi = wrapped - half;

    let c = cos(phi);
    if (abs(c) < 1e-6) c = c < 0 ? -1e-6 : 1e-6;

    let apothem = radiusParam * cos(PI / max(1, sidesN));
    return (apothem / c);
  }

  if (shapeType === "radiating lines") {
    let spikeCount = max(6, layerCountForSpikes);
    let spikeAmp = radiusParam * 0.45;
    let s = sin(angle * spikeCount);
    let spike = pow(abs(s), 6.0);
    return radiusParam + spikeAmp * spike;
  }

  if (shapeType === "fibonacci spiral") return radiusParam;

  return radiusParam;
}

function drawSampledShape(radius, shift, f, amp, wave, duty, startShapeType, endShapeType, tMorph, sidesStart, sidesEnd, layerIndex = 0) {
  let keepSegment = false;
  const L = layers[layerIndex] || layers[0];

  for (let a = 0; a <= TWO_PI + 1e-9; a += CURVE_STEP_ANGLE) {
    let baseStart = sampleBaseRadius(startShapeType, radius, sidesStart, a, int(L.count));
    let baseEnd   = sampleBaseRadius(endShapeType,   radius, sidesEnd,   a, int(L.count));
    let baseR = lerp(baseStart, baseEnd, tMorph);

    let phaseRad = (a) * f + shift;
    let mod = waveformFunc(wave, phaseRad, duty);
    let tAng = a / TWO_PI;
    let sec = secondarySH_by_t(tAng, L);

    let r = baseR + (mod * amp) + sec;
    let x = r * cos(a + shift);
    let y = r * sin(a + shift);

    let keep = erosionTestAtXY(x, y, layerIndex);

    if (keep) {
      if (!keepSegment) { endShape(); beginShape(); keepSegment = true; }
      vertex(x, y);
    } else {
      if (keepSegment) { endShape(); beginShape(); keepSegment = false; }
    }
  }
  if (keepSegment) endShape();
}

function drawRadialLines(startR, endR, globalShiftRad, f, ampStart, ampEnd, wave, duty, lwStart, lwEnd, startShapeType, endShapeType, sidesStart, sidesEnd, count, layerIndex = 0) {
  let stepT = LINE_STEP_T;
  let stepAngle = TWO_PI / max(1, count);

  const L = layers[layerIndex] || layers[0];
  let logVal = window.logDistSlider ? Number(window.logDistSlider.value()) : 0;

  for (let i = 0; i < count; i++) {
    let baseAngle = i * stepAngle + globalShiftRad;

    let prevX = null, prevY = null, prevT = 0, prevKeep = false;

    for (let t = 0; t <= 1.000001; t += stepT) {
      let amp = lerp(ampStart, ampEnd, t);

      let mapped = applyDistribution(t, logVal);
      let r = lerp(startR, endR, mapped);

      let baseStart = sampleBaseRadius(startShapeType, r, sidesStart, baseAngle, count);
      let baseEnd   = sampleBaseRadius(endShapeType,   r, sidesEnd,   baseAngle, count);
      let baseRInterp = lerp(baseStart, baseEnd, t);
      let nudge = (baseRInterp - r) * 0.2;

      let phaseRad = t * f * TWO_PI;
      let primary = waveformFunc(wave, phaseRad, duty);
      let sec = secondarySH_by_t(t, L);
      let offset = primary * amp + sec;

      let tangentAngle = baseAngle + HALF_PI;
      let x = (r + nudge) * cos(baseAngle) + offset * cos(tangentAngle);
      let y = (r + nudge) * sin(baseAngle) + offset * sin(tangentAngle);

      let keep = erosionTestAtXY(x, y, layerIndex);

      if (prevX !== null) {
        if (prevKeep || keep) {
          let midT = (prevT + t) * 0.5;
          let segLW = lerp(lwStart, lwEnd, midT);
          strokeWeight(max(0.1, segLW));
          line(prevX, prevY, x, y);
        }
      }

      prevX = x; prevY = y; prevT = t; prevKeep = keep;
    }
  }
}

/* ===== SVG export ===== */
function exportSVG(isHighPrecision = false) {
  if (typeof SVG === "undefined") return saveCanvas("pattern", "png");

  let svg = createGraphics(width, height, SVG);
  svg.angleMode(RADIANS);
  svg.noFill();
  svg.fill(20);
  svg.rect(0, 0, width, height);

  for (let li = 0; li < layers.length; li++) {
    const L = layers[li];

    svg.push();
    svg.translate(width / 2, height / 2);
    svg.rotate(radians(L.globalRotDeg));

    const useRadiating = (L.startShape === "radiating lines") && (L.endShape === "radiating lines");
    const useFibonacci = (L.startShape === "fibonacci spiral") || (L.endShape === "fibonacci spiral");

    /* Behavior A mirrored in SVG */
    svg.stroke(L.color);
    if (L.solidFill && !useRadiating && !useFibonacci) svg.fill(L.fillColor);
    else svg.noFill();

    if (useRadiating) {
      drawRadialLinesSVG(svg,
        L.startR, L.endR, radians(L.rotOffsetDeg),
        L.freq, L.ampStart, L.ampEnd,
        L.wave, L.duty, L.lineWStart, L.lineWEnd,
        L.startShape, L.endShape, L.polySidesStart, L.polySidesEnd,
        L.count, li
      );
    } else if (useFibonacci) {
      drawFibonacciLinesSVG(svg, L, li);
    } else {
      const circularEnabled = !!L.circularArrayEnabled;
      let logVal = window.logDistSlider ? Number(window.logDistSlider.value()) : 0;

      if (circularEnabled) {
        const arrayCount = max(1, int(L.count));
        const scaleStart = (L.arrayScaleStart || 100) / 100.0;
        const scaleEnd = (L.arrayScaleEnd || 100) / 100.0;
        const radialSpread = L.radialSpread || 0.0;

        for (let j = 0; j < arrayCount; j++) {
          let t = arrayCount > 1 ? j / (arrayCount - 1) : 0;
          let rPos = lerp(L.startR, L.endR, radialSpread * t);
          let angle = j * TWO_PI / arrayCount;
          let instScale = lerp(scaleStart, scaleEnd, t);
          let mappedRadT = applyDistribution(t, logVal);
          let baseRadius = lerp(L.startR, L.endR, mappedRadT);

          svg.push();
          svg.translate(rPos * cos(angle), rPos * sin(angle));
          svg.rotate(angle + radians(L.rotOffsetDeg));
          svg.scale(instScale);

          let lwActual = lerp(L.lineWStart, L.lineWEnd, t) / max(0.0001, instScale);
          svg.strokeWeight(max(0.1, lwActual));

          svg.beginShape();
          drawSampledShapeSVG(svg, baseRadius, 0, L.freq, lerp(L.ampStart, L.ampEnd, t), L.wave, L.duty,
            L.startShape, L.endShape, 0, L.polySidesStart, L.polySidesEnd, li);
          svg.endShape(CLOSE);

          svg.pop();
        }
      } else {
        for (let i = 0; i < L.count; i++) {
          let tLayer = L.count > 1 ? i / (L.count - 1) : 0;
          let mappedRadT = applyDistribution(tLayer, logVal);
          let radius = lerp(L.startR, L.endR, mappedRadT);
          let shift = i * radians(L.rotOffsetDeg);

          let ampA = lerp(L.ampStart, L.ampEnd, tLayer);
          let lwA  = lerp(L.lineWStart,  L.lineWEnd,  tLayer);

          svg.strokeWeight(max(0.1, lwA));
          svg.beginShape();
          drawSampledShapeSVG(svg, radius, shift, L.freq, ampA, L.wave, L.duty,
            L.startShape, L.endShape, tLayer, L.polySidesStart, L.polySidesEnd, li);
          svg.endShape(CLOSE);
        }
      }
    }

    svg.pop();
  }

  save(svg, "pattern.svg");
}

function drawSampledShapeSVG(g, radius, shift, f, amp, wave, duty, startShapeType, endShapeType, tMorph, sidesStart, sidesEnd, layerIndex = 0) {
  let keepSegment = false;
  const L = layers[layerIndex] || layers[0];

  for (let a = 0; a <= TWO_PI + 1e-9; a += CURVE_STEP_ANGLE) {
    let baseStart = sampleBaseRadius(startShapeType, radius, sidesStart, a, int(L.count));
    let baseEnd   = sampleBaseRadius(endShapeType,   radius, sidesEnd,   a, int(L.count));
    let baseR = lerp(baseStart, baseEnd, tMorph);

    let phaseRad = (a) * f + shift;
    let mod = waveformFunc(wave, phaseRad, duty);
    let tAng = a / TWO_PI;
    let sec = secondarySH_by_t(tAng, L);

    let r = baseR + (mod * amp) + sec;
    let x = r * cos(a + shift);
    let y = r * sin(a + shift);

    let keep = erosionTestAtXY(x, y, layerIndex);

    if (keep) {
      if (!keepSegment) { g.beginShape(); keepSegment = true; }
      g.vertex(x, y);
    } else {
      if (keepSegment) { g.endShape(); keepSegment = false; }
    }
  }
  if (keepSegment) g.endShape();
}

function drawRadialLinesSVG(g, startR, endR, shift, f, ampStart, ampEnd, wave, duty, lwStart, lwEnd, startShapeType, endShapeType, sidesStart, sidesEnd, count, layerIndex = 0) {
  let stepT = LINE_STEP_T;
  let stepAngle = TWO_PI / max(1, count);
  const L = layers[layerIndex] || layers[0];
  let logVal = window.logDistSlider ? Number(window.logDistSlider.value()) : 0;

  for (let i = 0; i < count; i++) {
    let baseAngle = i * stepAngle + shift;

    let prevX = null, prevY = null, prevT = 0, prevKeep = false;

    for (let t = 0; t <= 1.000001; t += stepT) {
      let amp = lerp(ampStart, ampEnd, t);

      let mapped = applyDistribution(t, logVal);
      let r = lerp(startR, endR, mapped);

      let baseStart = sampleBaseRadius(startShapeType, r, sidesStart, baseAngle, count);
      let baseEnd   = sampleBaseRadius(endShapeType,   r, sidesEnd,   baseAngle, count);
      let baseRInterp = lerp(baseStart, baseEnd, t);
      let nudge = (baseRInterp - r) * 0.2;

      let phaseRad = t * f * TWO_PI;
      let primary = waveformFunc(wave, phaseRad, duty);
      let sec = secondarySH_by_t(t, L);
      let offset = primary * amp + sec;

      let tangentAngle = baseAngle + HALF_PI;
      let x = (r + nudge) * cos(baseAngle) + offset * cos(tangentAngle);
      let y = (r + nudge) * sin(baseAngle) + offset * sin(tangentAngle);

      let keep = erosionTestAtXY(x, y, layerIndex);

      if (prevX !== null) {
        if (prevKeep || keep) {
          let midT = (prevT + t) * 0.5;
          let lw = lerp(lwStart, lwEnd, midT);
          g.strokeWeight(max(0.1, lw));
          g.line(prevX, prevY, x, y);
        }
      }

      prevX = x; prevY = y; prevT = t; prevKeep = keep;
    }
  }
}