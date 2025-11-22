/*  CONFIGURABLE WAVY CIRCLES / POLYGONS — ULTRA SMOOTH EDITION
   Consolidated baseline with fixes:
   - Log distribution affects radial placement for circles, radiating lines, and Fibonacci spirals
   - Fibonacci reverse properly reverses direction while keeping same start point
   - numSpiralTurns per-layer slider + SVG export
*/

/* --------------------
   GLOBALS (UI controls are the editor for the selected layer)
   -------------------- */
let layerSelect, addLayerBtn, delLayerBtn, dupLayerBtn, layerColorPicker;
let startRSlider, endRSlider;
let polySidesStartSlider, polySidesEndSlider;
let startShapeSelect, endShapeSelect;
let freqSlider, ampStartSlider, ampEndSlider, countSlider, rotSlider;
let waveMenu, dutySlider;
let lineWStartSlider, lineWEndSlider;
let globalRotSlider;
let canvasScaleXSlider, canvasScaleYSlider;
let numSpiralsSlider; // number of turns slider (per-layer)

let erosionEnabledCheckbox, erosionScaleSlider, erosionThresholdSlider, erosionDecaySlider;

let uiPanel;
let valueSpans = {}; // holds the span elements used for numeric display/editing

let mainCanvas;
const SIDEBAR_WIDTH = 300;

/* --- Secondary S&H UI/state --- */
let sh2EnabledCheckbox;
let sh2FreqSlider, sh2AmpSlider;

/* --- Layers state --- */
let layers = [];
let selectedLayerIndex = 0;

/* --- deterministic pseudo-random helper seed (keeps results stable) --- */
const PRNG_CONST = 43758.5453;
function pseudoRandom(seed) {
  return fract(Math.sin(seed) * PRNG_CONST);
}
function fract(x) { return x - Math.floor(x); }

/* ==========================================================
   HIGH-PRECISION SETTINGS
   ========================================================== */
const LINE_STEP_T = 0.002;      // per-line sampling for radiating lines
const CURVE_STEP_ANGLE = 0.002; // per-angle sampling for curves

/* ==========================================================
   Layer object
   ========================================================== */
function createDefaultLayer(name = "Layer") {
  return {
    name: name,
    color: '#ffffff',
    startR: 60,
    endR: 220,
    startShape: "concentric circles",
    endShape: "concentric circles",
    polySidesStart: 6,
    polySidesEnd: 6,
    freq: 8,
    ampStart: 30,
    ampEnd: 0,
    count: 12,
    rotOffsetDeg: 0,   // per-layer rotation offset used in the shape morph
    globalRotDeg: 0,   // per-layer "global" rotation (used to rotate only that layer)
    wave: "sine",
    duty: 0.5,
    sh2Enabled: false,
    sh2Freq: 8,
    sh2Amp: 20,
    lineWStart: 2,
    lineWEnd: 2,
    erosionEnabled: false,
    erosionScale: 2.0,
    erosionThreshold: 0.5,
    erosionDecay: 0.5,
    // Fibonacci options
    fibonacciReversed: false,
    numSpiralTurns: 4 // default number of turns for Fibonacci spiral
  };
}

/* ==========================================================
   SETUP
   ========================================================== */
function setup() {
  setupSidebarGUI();

  mainCanvas = createCanvas(700, 830, P2D);
  mainCanvas.position(SIDEBAR_WIDTH, 0);

  angleMode(RADIANS);
  noLoop();

  // seed noise for deterministic erosion behavior
  noiseSeed(42);

  // create initial layer
  layers.push(createDefaultLayer("Layer 1"));
  selectedLayerIndex = 0;
  rebuildLayerList();
  syncUIToLayer();

  updateRotationRangeFromShapeSelectors();
  onWaveChange();
  updateLabelsAndRedraw();
}

/* ===========================
   SIDEBAR GUI
   =========================== */
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

  // --- Layer selector + add/delete/duplicate + color ---
  const layerRow = addRow("Layers");
  layerSelect = createSelect().parent(layerRow.ctrlWrap);
  layerSelect.style("width:100%");
  layerSelect.changed(() => {
    const v = layerSelect.value();
    selectedLayerIndex = Math.max(0, Math.min(layers.length - 1, int(v)));
    syncUIToLayer();
  });

  const layerBtnRow = createDiv().parent(uiPanel);
  layerBtnRow.style("display:flex; gap:6px; margin-bottom:10px;");
  addLayerBtn = createButton("+ Add Layer").parent(layerBtnRow);
  addLayerBtn.mousePressed(() => {
    const idx = layers.length + 1;
    const newLayer = createDefaultLayer("Layer " + idx);
    updateLayerFromUI(newLayer); // copy current UI into new layer
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
    let suffix = " copy";
    let newName = base + suffix;
    let i = 2;
    while (layers.some(l => l.name === newName)) {
      newName = base + " copy " + i;
      i++;
    }
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

  const colorRow = addRow("Layer Color");
  layerColorPicker = createColorPicker('#ffffff').parent(colorRow.ctrlWrap);
  layerColorPicker.input(() => {
    const l = layers[selectedLayerIndex];
    l.color = layerColorPicker.value();
    redraw();
  });
  valueSpans.layerColor = colorRow.val;

  /* --------------------
     Start / End Radius
     -------------------- */
  let r1 = addRow("Start Radius");
  startRSlider = createSlider(10, 300, 60, 1).parent(r1.ctrlWrap);
  startRSlider.style("width:100%");
  startRSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.startR = r1.val;

  let r2 = addRow("End Radius");
  endRSlider = createSlider(10, 400, 220, 1).parent(r2.ctrlWrap);
  endRSlider.style("width:100%");
  endRSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.endR = r2.val;

  /* --------------------
     Start / End Shape (morph targets)
     -------------------- */
  let rStartShape = addRow("Start Shape");
  startShapeSelect = createSelect().parent(rStartShape.ctrlWrap);
  startShapeSelect.option("concentric circles");
  startShapeSelect.option("multi-sided shapes");
  startShapeSelect.option("radiating lines");
  startShapeSelect.option("fibonacci spiral"); // added shape
  startShapeSelect.style("width:100%");
  startShapeSelect.changed(() => { updateRotationRangeFromShapeSelectors(); updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.startShape = rStartShape.val;

  let rEndShape = addRow("End Shape");
  endShapeSelect = createSelect().parent(rEndShape.ctrlWrap);
  endShapeSelect.option("concentric circles");
  endShapeSelect.option("multi-sided shapes");
  endShapeSelect.option("radiating lines");
  endShapeSelect.option("fibonacci spiral"); // added shape
  endShapeSelect.style("width:100%");
  endShapeSelect.changed(() => { updateRotationRangeFromShapeSelectors(); updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.endShape = rEndShape.val;

  /* --------------------
     Polygon Sides - START / END (independent)
     -------------------- */
  let rPolyStart = addRow("Polygon Sides (Start)");
  polySidesStartSlider = createSlider(3, 48, 6, 1).parent(rPolyStart.ctrlWrap);
  polySidesStartSlider.style("width:100%");
  polySidesStartSlider.input(() => { updateRotationRangeFromShapeSelectors(); updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.polySidesStart = rPolyStart.val;

  let rPolyEnd = addRow("Polygon Sides (End)");
  polySidesEndSlider = createSlider(3, 48, 6, 1).parent(rPolyEnd.ctrlWrap);
  polySidesEndSlider.style("width:100%");
  polySidesEndSlider.input(() => { updateRotationRangeFromShapeSelectors(); updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.polySidesEnd = rPolyEnd.val;

  /* --------------------
     Waveform parameters
     -------------------- */
  let rFreq = addRow("Frequency");
  freqSlider = createSlider(0, 96, 12, 1).parent(rFreq.ctrlWrap);
  freqSlider.style("width:100%");
  freqSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.freq = rFreq.val;

  /* --------------------
     Amplitude Start / End (NEW)
     -------------------- */
  let rAmpStart = addRow("Amplitude Start");
  ampStartSlider = createSlider(0, 240, 80, 1).parent(rAmpStart.ctrlWrap);
  ampStartSlider.style("width:100%");
  ampStartSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.ampStart = rAmpStart.val;

  let rAmpEnd = addRow("Amplitude End");
  ampEndSlider = createSlider(0, 240, 30, 1).parent(rAmpEnd.ctrlWrap);
  ampEndSlider.style("width:100%");
  ampEndSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.ampEnd = rAmpEnd.val;

  /* --------------------
     Count + Rotation offset
     -------------------- */
  let rCount = addRow("Shapes (count)");
  countSlider = createSlider(1, 120, 10, 1).parent(rCount.ctrlWrap); // default 10
  countSlider.style("width:100%");
  countSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.count = rCount.val;

  let rRot = addRow("Rotation Offset (deg)");
  rotSlider = createSlider(-30, 180, 0, 0.1).parent(rRot.ctrlWrap);
  rotSlider.style("width:100%");
  rotSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.rot = rRot.val;

  /* --------------------
     GLOBAL ROTATION (now per-layer)
     -------------------- */
  let rGR = addRow("Global Rotation (deg) — per-layer");
  globalRotSlider = createSlider(-180, 180, 0, 0.1).parent(rGR.ctrlWrap);
  globalRotSlider.style("width:100%");
  globalRotSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.globalRot = rGR.val;

  /* --------------------
     Fibonacci reverse button (only shown for Fibonacci) + turns + log distribution slider
     -------------------- */
  // reverse button row
  const fibRow = addRow("Fibonacci Options");
  // reverse button
  const fibReverseBtn = createButton("Reverse Spiral").parent(fibRow.ctrlWrap);
  fibReverseBtn.mousePressed(() => {
    const L = layers[selectedLayerIndex];
    L.fibonacciReversed = !L.fibonacciReversed;
    syncUIToLayer();
    redraw();
  });
  valueSpans.fibReverse = fibRow.val;

  // number of spiral turns (per-layer)
  const spiralRow = addRow("Number of Spiral Turns");
  numSpiralsSlider = createSlider(1, 12, 4, 1).parent(spiralRow.ctrlWrap);
  numSpiralsSlider.style("width:100%");
  numSpiralsSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.numSpirals = spiralRow.val;

  // log distribution slider (positive/negative)
  const logRow = addRow("Logarithmic Distribution");
  // range -3..3 (user can type arbitrary values via the numeric input)
  var logSlider = createSlider(-3, 3, 0, 0.01).parent(logRow.ctrlWrap);
  logSlider.style("width:100%");
  // store as a top-level so the editable code can attach
  window.logDistSlider = logSlider;
  logSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.logDist = logRow.val;

  /* --------------------
     Waveform type + duty
     -------------------- */
  let rWave = addRow("Waveform");
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
  dutySlider = createSlider(1, 99, 50, 1).parent(rDuty.ctrlWrap);
  dutySlider.style("width:100%");
  dutySlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.duty = rDuty.val;

  /* --------------------
     Secondary S&H Modulation
     -------------------- */
  let shH = addRow("Secondary S&H Enabled");
  sh2EnabledCheckbox = createCheckbox("", false).parent(shH.ctrlWrap);
  sh2EnabledCheckbox.changed(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });

  let shF = addRow("S&H Frequency (cycles per segment)");
  sh2FreqSlider = createSlider(0.1, 60, 8, 0.1).parent(shF.ctrlWrap);
  sh2FreqSlider.style("width:100%");
  sh2FreqSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });

  let shA = addRow("S&H Amplitude (+ only)");
  sh2AmpSlider = createSlider(0, 200, 20, 0.1).parent(shA.ctrlWrap); // scale matches amp units
  sh2AmpSlider.style("width:100%");
  sh2AmpSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });

  valueSpans.sh2Freq = shF.val;
  valueSpans.sh2Amp = shA.val;

  /* --------------------
     Line widths
     -------------------- */
  let rLW1 = addRow("Line Width Start");
  lineWStartSlider = createSlider(0.1, 100, 2, 0.1).parent(rLW1.ctrlWrap);
  lineWStartSlider.style("width:100%");
  lineWStartSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.lineWStart = rLW1.val;

  let rLW2 = addRow("Line Width End");
  lineWEndSlider = createSlider(0.1, 100, 2, 0.1).parent(rLW2.ctrlWrap);
  lineWEndSlider.style("width:100%");
  lineWEndSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.lineWEnd = rLW2.val;

  /* --------------------
     EROSION (Perlin noise) UI
     -------------------- */
  let erH = addRow("Enable Erosion (Perlin)");
  erosionEnabledCheckbox = createCheckbox("", false).parent(erH.ctrlWrap);
  erosionEnabledCheckbox.changed(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });

  let erS = addRow("Erosion Noise Scale");
  erosionScaleSlider = createSlider(0.30, 10, 2.0, 0.01).parent(erS.ctrlWrap);
  erosionScaleSlider.style("width:100%");
  erosionScaleSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.erosionScale = erS.val;

  let erT = addRow("Erosion Threshold");
  erosionThresholdSlider = createSlider(0.36, 1, 0.5, 0.01).parent(erT.ctrlWrap);
  erosionThresholdSlider.style("width:100%");
  erosionThresholdSlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.erosionThreshold = erT.val;

  let erD = addRow("Erosion Decay (center → edge)");
  erosionDecaySlider = createSlider(0, 1, 0.5, 0.01).parent(erD.ctrlWrap);
  erosionDecaySlider.style("width:100%");
  erosionDecaySlider.input(() => { updateLayerFromUI(); updateLabelsAndRedraw(); });
  valueSpans.erosionDecay = erD.val;

  /* --------------------
     Canvas scaling
     -------------------- */
  let rCSX = addRow("Canvas Width Scale");
  canvasScaleXSlider = createSlider(0.5, 1.5, 1.0, 0.01).parent(rCSX.ctrlWrap);
  canvasScaleXSlider.style("width:100%");
  canvasScaleXSlider.input(resizeCanvasFromSliders);
  valueSpans.canvasScaleX = rCSX.val;

  let rCSY = addRow("Canvas Height Scale");
  canvasScaleYSlider = createSlider(0.5, 1.5, 1.0, 0.01).parent(rCSY.ctrlWrap);
  canvasScaleYSlider.style("width:100%");
  canvasScaleYSlider.input(resizeCanvasFromSliders);
  valueSpans.canvasScaleY = rCSY.val;

  /* --------------------
     Export & Reset
     -------------------- */
  const btnWrap = createDiv().parent(uiPanel);
  btnWrap.style("margin-top:12px");

  const exportBtn = createButton("Export SVG").parent(btnWrap);
  exportBtn.style(`
    width:100%;
    padding:10px;
    background:#1b1b1b;
    color:#fff;
    border:1px solid rgba(255,255,255,0.06);
  `);
  exportBtn.mousePressed(() => exportSVG(true)); // high-precision SVG export

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
    def.color = l.color;
    layers[selectedLayerIndex] = def;
    syncUIToLayer();
    redraw();
  });

  if (waveMenu.value() !== "square") dutySlider.hide();

  // After all controls created, wire up inline editing for each valueSpan
  setupInlineEditableFields();
}

/* --------------------
   helpers: rebuild layer select
   -------------------- */
function rebuildLayerList() {
  // clear options & re-add using option value === index
  layerSelect.elt.innerHTML = '';
  for (let i = 0; i < layers.length; i++) {
    layerSelect.option(layers[i].name, i);
  }
  selectedLayerIndex = constrain(selectedLayerIndex, 0, layers.length - 1);
  layerSelect.selected(selectedLayerIndex);
}

/* --------------------
   Attach inline numeric editing to the spans.
   - auto-select on focus (user requested option 1)
   -------------------- */
function setupInlineEditableFields() {
  // helper that attaches editing behavior to a span element
  function attachEditable(spanElem, sliderElem, opts = {}) {
    // spanElem: p5.Element (span)
    // sliderElem: p5.Element (slider) or null
    // opts: {isInt, percent, min, max, step, onCommit}
    const isInt = opts.isInt || false;
    const percent = opts.percent || false;

    spanElem.mousePressed(() => {
      // do nothing if an input is already present
      if (spanElem.elt.querySelector('input')) return;

      // determine current numeric value
      let curVal;
      if (sliderElem) {
        curVal = sliderElem.value();
        // if percent/duty slider, show as percent number 0..100
        if (percent) curVal = Math.round(sliderElem.value());
      } else {
        // try match numeric text
        curVal = parseFloat(spanElem.html()) || 0;
      }

      // clear span and add input inside it
      spanElem.elt.innerHTML = '';
      const inp = createInput(String(curVal), 'number').parent(spanElem);
      inp.elt.style.width = '78px';
      inp.elt.style.background = 'transparent';
      inp.elt.style.color = '#9bd';
      inp.elt.style.border = '1px solid rgba(255,255,255,0.06)';
      inp.elt.style.padding = '2px 4px';
      inp.elt.style.fontSize = '12px';
      inp.elt.style.outline = 'none';

      // auto select all
      setTimeout(() => {
        try { inp.elt.select(); } catch (e) {}
      }, 5);

      function commitAndClose() {
        let val = inp.value();
        if (val === '') val = 0;
        let num = Number(val);
        if (isNaN(num)) num = 0;

        if (isInt) num = Math.round(num);

        if (sliderElem) {
          // clamp to slider range if slider has min/max
          const smin = Number(sliderElem.elt.min !== undefined ? sliderElem.elt.min : sliderElem.elt.getAttribute('min') || -Infinity);
          const smax = Number(sliderElem.elt.max !== undefined ? sliderElem.elt.max : sliderElem.elt.getAttribute('max') || Infinity);

          if (!isNaN(smin)) num = max(num, smin);
          if (!isNaN(smax)) num = min(num, smax);

          // update slider with the committed value
          sliderElem.value(num);

          // special handling for percent field mapped to duty slider (store 0..100)
          if (percent) {
            sliderElem.value(num);
          }
        }

        // replace input with new text
        spanElem.elt.innerHTML = String(isInt ? Math.round(num) : num);

        // commit to layer & redraw
        updateLayerFromUI();
        updateLabelsAndRedraw();

        // remove event handlers
        try {
          inp.input(null);
          inp.changed(null);
        } catch (e) {}
      }

      // Enter commits, blur commits
      inp.elt.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          commitAndClose();
        } else if (ev.key === 'Escape') {
          // cancel: restore original display
          spanElem.elt.innerHTML = String(curVal);
        }
      });
      inp.elt.addEventListener('blur', () => { commitAndClose(); });
    });
  }

  // attach editables for each value span we created earlier
  // many of these map to slider controls; pass relevant flags (isInt, percent)
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
  if (valueSpans.wave) { /* not numeric */ }
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
  if (valueSpans.layerColor) {
    // color is not numeric but the span can be clickable to open color picker — keep default behavior
  }
  if (valueSpans.logDist) {
    // log distribution slider created as window.logDistSlider
    if (window.logDistSlider) attachEditable(valueSpans.logDist, window.logDistSlider);
  }
  if (valueSpans.numSpirals) {
    if (numSpiralsSlider) attachEditable(valueSpans.numSpirals, numSpiralsSlider, { isInt: true });
  }
}

/* --------------------
   sync UI to selected layer
   -------------------- */
function syncUIToLayer() {
  const l = layers[selectedLayerIndex];
  if (!l) return;

  // set controls to layer values
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

  // per-layer global rotation
  globalRotSlider.value(l.globalRotDeg);

  layerColorPicker.value(l.color);

  // per-layer spiral turns and reversed
  if (numSpiralsSlider) numSpiralsSlider.value(l.numSpiralTurns);
  // fib reverse button has no separate visual indicator; we show value in span
  if (valueSpans.fibReverse) valueSpans.fibReverse.html(l.fibonacciReversed ? "Reversed" : "");

  updateRotationRangeFromShapeSelectors();
  updateLabelsAndRedraw();
}

/* --------------------
   update a layer object from UI controls (if layerObj omitted, updates current layer)
   -------------------- */
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
  // update per-layer global rotation from slider
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
  l.color = layerColorPicker.value();

  // store per-layer Fibonacci turns if control exists
  if (numSpiralsSlider) l.numSpiralTurns = int(numSpiralsSlider.value());
  // fibonacciReversed toggled by button (already stored)

  // (log distribution remains a global slider for now)
}

/* -------------------- Reset -------------------- */
/* (keeps layering; just resets the selected layer to defaults) */
function resetDefaults() {
  const def = createDefaultLayer(layers[selectedLayerIndex].name);
  def.color = layers[selectedLayerIndex].color;
  layers[selectedLayerIndex] = def;
  syncUIToLayer();
  redraw();
}

/* --------------------
   Update rotation range based on whether either morph target is a polygon
   (keeps rot slider sensible when polygons present)
   -------------------- */
function updateRotationRangeFromShapeSelectors() {
  const startIsPoly = (startShapeSelect.value() === "multi-sided shapes");
  const endIsPoly = (endShapeSelect.value() === "multi-sided shapes");
  const isPoly = startIsPoly || endIsPoly;

  // choose conservative polygon side count for rotation limit (use smaller polygon)
  let nStart = int(polySidesStartSlider.value());
  let nEnd = int(polySidesEndSlider.value());
  let nForRotation = nStart;
  if (startIsPoly && endIsPoly) {
    nForRotation = max(1, min(nStart, nEnd)); // smaller sides produce larger max rotation; be safe
  } else if (endIsPoly) {
    nForRotation = max(1, nEnd);
  } else if (startIsPoly) {
    nForRotation = max(1, nStart);
  }

  setRotationRange(isPoly, nForRotation);
  // visually indicate polygon controls when polygon present
  polySidesStartSlider.style("opacity", startIsPoly ? "1" : "0.35");
  polySidesEndSlider.style("opacity", endIsPoly ? "1" : "0.35");
}

/* --------------------
   Wave change handler
   -------------------- */
function onWaveChange() {
  if (waveMenu.value() === "square") dutySlider.show();
  else dutySlider.hide();

  updateLayerFromUI();
  updateLabelsAndRedraw();
}

function setRotationRange(isPoly, n) {
  if (isPoly) {
    rotSlider.elt.min = 0;
    rotSlider.elt.max = 180 / max(1, n);
  } else {
    rotSlider.elt.min = -30;
    rotSlider.elt.max = 30;
  }
}

/* ===========================
   LABEL UPDATE + REDRAW
   =========================== */
function updateLabelsAndRedraw() {
  // update UI side value spans for the currently shown controls
  const l = layers[selectedLayerIndex];

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
    else
      valueSpans.freq.html(freqSlider.value());
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
  if (valueSpans.logDist && window.logDistSlider) valueSpans.logDist.html(window.logDistSlider.value());
  if (valueSpans.numSpirals && numSpiralsSlider) valueSpans.numSpirals.html(numSpiralsSlider.value());
  if (valueSpans.fibReverse) {
    const l = layers[selectedLayerIndex];
    valueSpans.fibReverse.html(l && l.fibonacciReversed ? "Reversed" : "");
  }

  redraw();
}

/* ===========================
   RESIZE CANVAS
   =========================== */
function resizeCanvasFromSliders() {
  let sx = canvasScaleXSlider.value();
  let sy = canvasScaleYSlider.value();
  resizeCanvas(700 * sx, 830 * sy);
  mainCanvas.position(SIDEBAR_WIDTH, 0);

  if (valueSpans.canvasScaleX) valueSpans.canvasScaleX.html(nf(sx, 1, 2));
  if (valueSpans.canvasScaleY) valueSpans.canvasScaleY.html(nf(sy, 1, 2));

  redraw();
}

/* ==========================================================
   DRAWING
   Iterate through layers and draw each using its stored params
   ========================================================== */
function draw() {
  background(20);

  // iterate layers in order and draw with per-layer rotation
  for (let li = 0; li < layers.length; li++) {
    const L = layers[li];

    push();
    translate(width / 2, height / 2);
    rotate(radians(L.globalRotDeg)); // per-layer rotation

    stroke(L.color);
    noFill();

    const useRadiating = (L.startShape === "radiating lines") && (L.endShape === "radiating lines");
    const useFibonacci = (L.startShape === "fibonacci spiral") || (L.endShape === "fibonacci spiral");

    if (useRadiating) {
      drawRadialLines(
        L.startR, L.endR, radians(L.rotOffsetDeg),
        L.freq, L.ampStart, L.ampEnd,
        L.wave, L.duty, L.lineWStart, L.lineWEnd,
        L.startShape, L.endShape, L.polySidesStart, L.polySidesEnd,
        L.count, li
      );
    } else if (useFibonacci) {
      // draw Fibonacci-spired lines (curved)
      drawFibonacciLines(L, li);
    } else {
      // Non-radiating (concentric / multi-sided / morph) mode.
      // We must apply logarithmic distribution to how shapes are distributed radially.
      let logVal = window.logDistSlider ? Number(window.logDistSlider.value()) : 0;

      for (let i = 0; i < L.count; i++) {
        let tLayer = L.count > 1 ? i / (L.count - 1) : 0; // linear t across shapes (used for morph)
        // map tLayer with log distribution to position radius
        let mappedRadT = applyDistribution(tLayer, logVal);
        let radius = lerp(L.startR, L.endR, mappedRadT);

        // morph parameter between start/end shape should remain linear (tLayer)
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

    pop();
  }
}

/* ==========================================================
   Apply logarithmic distribution mapping to linear t in [0,1]
   - logParam in [-3..3] (slider range used). Positive concentrates toward 1, negative toward 0.
   - Uses exponential mapping: out = (e^{k*t} - 1) / (e^{k} - 1), with sign handling
   ========================================================== */
function applyDistribution(t, logParam) {
  const k = Number(logParam) || 0;
  if (abs(k) < 1e-6) return t;
  if (k > 0) {
    const num = exp(k * t) - 1;
    const den = exp(k) - 1;
    return num / max(1e-12, den);
  } else {
    // negative k: flip and apply positive mapping, then flip back
    const kp = -k;
    const tt = 1 - t;
    const num = exp(kp * tt) - 1;
    const den = exp(kp) - 1;
    return 1 - (num / max(1e-12, den));
  }
}

/* ==========================================================
   Fibonacci curve helper:
   Draw curved lines that follow a logarithmic spiral approximating
   Fibonacci-like growth. numSpiralTurns controls θ range. reversed flips sign.
   ========================================================== */
function drawFibonacciLines(L, layerIndex) {
  // reversed toggles spiral direction (clockwise vs ccw) but keeps start angle at theta = 0
  const reversed = !!L.fibonacciReversed;
  const numTurns = max(1, int(L.numSpiralTurns || 4));

  // θ range
  const thetaMax = TWO_PI * numTurns;
  // choose b so the exponential covers reasonable change across thetaMax
  const b = 0.55 / max(1, numTurns);

  const count = max(1, int(L.count));
  const samples = Math.max(ceil(thetaMax / 0.02), 50);
  const du = 1.0 / samples;

  // precompute exponential range to normalize re -> [0..1]
  const rExp0 = 1.0;
  // The trick: keep the reMin/reMax chosen so reNorm increases with u for both orientations.
  const thetaStart = 0;
  const thetaEnd = thetaMax;
  const reMinForward = rExp0 * Math.exp(b * thetaStart);
  const reMaxForward = rExp0 * Math.exp(b * thetaEnd);
  // When reversed, theta = -u*thetaMax but we still want reNorm to increase with u.
  // So compute reMin/reMax over the same absolute theta interval, then map re computed with signed theta into [0..1].
  const reMin = reMinForward;
  const reMax = reMaxForward;

  let logVal = window.logDistSlider ? Number(window.logDistSlider.value()) : 0;

  for (let i = 0; i < count; i++) {
    const baseAngle = i * TWO_PI / count + radians(L.rotOffsetDeg);
    let prevX = null, prevY = null, prevKeep = false, prevU = 0;

    for (let u = 0; u <= 1.000001; u += du) {
      // compute theta with sign for direction, but compute an absolute thetaAbs to feed exponential normalization.
      const theta = (reversed ? -1 : 1) * u * thetaMax;
      const thetaAbs = u * thetaMax; // always positive increasing with u

      // exponential spiral re = r0 * e^{b*thetaAbs} (use abs to ensure mapping monotonic in u)
      const re = rExp0 * Math.exp(b * thetaAbs);
      const reNorm = (re - reMin) / max(1e-12, (reMax - reMin)); // in [0..1]

      // apply log distribution slider to push origins along diameter as requested
      const mapped = applyDistribution(reNorm, logVal);

      // map along radii
      const r = lerp(L.startR, L.endR, mapped);

      // wave + secondary S&H offset applied tangentially similar to radiating-lines
      const phase = u * L.freq * TWO_PI;
      const primary = waveformFunc(L.wave, phase, L.duty);
      const sec = secondarySH_by_t(u, L);
      const offset = primary * lerp(L.ampStart, L.ampEnd, u) + sec;

      // Note: angleAtPoint uses signed theta to rotate clockwise vs ccw
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

/* ==========================================================
   Draw fibonacci spirals into an SVG graphics context for export
   ========================================================== */
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
  const reMinForward = rExp0 * Math.exp(b * thetaStart);
  const reMaxForward = rExp0 * Math.exp(b * thetaEnd);
  const reMin = reMinForward;
  const reMax = reMaxForward;

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

/* ==========================================================
   SECONDARY SAMPLE & HOLD (deterministic) — now per-layer
   ========================================================== */
function secondarySH_by_t(t, layerObj) {
  if (!layerObj || !layerObj.sh2Enabled) return 0;
  // t in [0..1]
  let freq = layerObj.sh2Freq;
  let idx = Math.floor(t * freq);
  let val = pseudoRandom(idx + 1.2345);
  return val * layerObj.sh2Amp;
}

/* ==========================================================
   PRIMARY SAMPLE & HOLD (deterministic)
   ========================================================== */
function primarySH_byPhase(phaseRad) {
  let idx = Math.floor(phaseRad / TWO_PI);
  let v = pseudoRandom(idx + 0.4321) * 2.0 - 1.0;
  return v;
}

/* ==========================================================
   WAVEFORM FUNCTION (includes deterministic Sample & Hold)
   ========================================================== */
function waveformFunc(type, phaseRad, duty = 0.5) {
  if (type === "sine") return sin(phaseRad);
  if (type === "cosine") return cos(phaseRad);
  if (type === "triangle") return (2 / PI) * asin(sin(phaseRad));

  if (type === "square") {
    let f = ((phaseRad % TWO_PI) + TWO_PI) % TWO_PI;
    f /= TWO_PI;
    return f < duty ? 1 : -1;
  }

  if (type === "sample & hold") {
    return primarySH_byPhase(phaseRad);
  }

  return 0;
}

/* ==========================================================
   Helper: erosion test at world coordinates (x,y) with per-line offset
   Erosion decay modifies threshold with normalized radius from center (0..1).
   The lineIndex param is passed to decorrelate noise per layer/line.
   ========================================================== */
function erosionTestAtXY(x, y, lineIndex = 0) {
  const layerToUse = layers[Math.min(lineIndex, layers.length - 1)] || layers[0];
  if (!layerToUse.erosionEnabled) return true; // keep by default

  const scale = layerToUse.erosionScale;
  const baseThresh = layerToUse.erosionThreshold;
  const decay = layerToUse.erosionDecay;

  const lineOffset = lineIndex * 103.764; // arbitrary spacing
  let n = noise((x + lineOffset) * scale, (y + lineOffset) * scale);

  let maxR = max(1,
                 layers.reduce((m, L) => max(m, L.startR, L.endR), 1));
  let rMag = sqrt(x * x + y * y);
  let rNorm = constrain(rMag / maxR, 0, 1);

  let finalThresh = lerp(baseThresh, 1.0, decay * rNorm);

  return n >= finalThresh; // true => keep; false => erase/break
}

/* ==========================================================
   SAMPLE BASE RADIUS FOR A GIVEN SHAPE TYPE AT ANGLE a
   (unchanged from baseline)
   ========================================================== */
function sampleBaseRadius(shapeType, radiusParam, sidesN, angle, layerCountForSpikes = 60) {
  if (shapeType === "concentric circles") {
    return radiusParam;
  }

  if (shapeType === "multi-sided shapes") {
    let half = PI / max(1, sidesN);
    let sector = TWO_PI / max(1, sidesN);
    let shifted = angle + half;
    let wrapped = ((shifted % sector) + sector) % sector;
    let phi = wrapped - half;

    let c = cos(phi);
    if (abs(c) < 1e-6) c = c < 0 ? -1e-6 : 1e-6;

    let apothem = radiusParam * cos(PI / max(1, sidesN));
    let baseR = apothem / c;
    return baseR;
  }

  if (shapeType === "radiating lines") {
    let spikeCount = max(6, layerCountForSpikes);
    let spikeAmp = radiusParam * 0.45;
    let s = sin(angle * spikeCount);
    let spike = pow(abs(s), 6.0);
    return radiusParam + spikeAmp * spike;
  }

  if (shapeType === "fibonacci spiral") {
    // When morphing, treat as circular baseline; the real spiral drawing uses its own routine.
    return radiusParam;
  }

  return radiusParam;
}

/* ==========================================================
   DRAW SAMPLED SHAPE: morph between startShapeType and endShapeType
   (added 'layerIndex' param for erosion & S&H lookup)
   ========================================================== */
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
      if (!keepSegment) {
        endShape();
        beginShape();
        keepSegment = true;
      }
      vertex(x, y);
    } else {
      if (keepSegment) {
        endShape();
        beginShape();
        keepSegment = false;
      }
    }
  }

  if (keepSegment) endShape();
}

/* ==========================================================
   RADIATING LINES (open) - supports per-layer morph sampling
   ==========================================================
   NOTE: log distribution now applied to t across the line when requested.
   ========================================================== */
function drawRadialLines(startR, endR, globalShiftRad, f, ampStart, ampEnd, wave, duty, lwStart, lwEnd, startShapeType, endShapeType, sidesStart, sidesEnd, count, layerIndex = 0) {
  let stepT = LINE_STEP_T;
  let stepAngle = TWO_PI / max(1, count);

  const L = layers[layerIndex] || layers[0];
  let logVal = window.logDistSlider ? Number(window.logDistSlider.value()) : 0;

  for (let i = 0; i < count; i++) {
    let baseAngle = i * stepAngle + globalShiftRad;
    let lineIndex = i; // used for erosion decorrelation

    let prevX = null;
    let prevY = null;
    let prevT = 0;
    let prevKeep = false;

    for (let t = 0; t <= 1.000001; t += stepT) {
      let amp = lerp(ampStart, ampEnd, t);

      // apply log distribution to radial param t
      let mapped = applyDistribution(t, logVal);
      let r = lerp(startR, endR, mapped);

      let morphT = t;
      let baseStart = sampleBaseRadius(startShapeType, r, sidesStart, baseAngle, count);
      let baseEnd   = sampleBaseRadius(endShapeType,   r, sidesEnd,   baseAngle, count);
      let baseRInterp = lerp(baseStart, baseEnd, morphT);
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

      prevX = x;
      prevY = y;
      prevT = t;
      prevKeep = keep;
    }
  }
}

/* ==========================================================
   SVG: export all layers (preserves colors & stacking order)
   ========================================================== */
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

    svg.stroke(L.color);
    svg.noFill();

    const useRadiating = (L.startShape === "radiating lines") && (L.endShape === "radiating lines");
    const useFibonacci = (L.startShape === "fibonacci spiral") || (L.endShape === "fibonacci spiral");

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
      for (let i = 0; i < L.count; i++) {
        let tLayer = L.count > 1 ? i / (L.count - 1) : 0;
        // apply log distribution in SVG same as on-canvas
        let logVal = window.logDistSlider ? Number(window.logDistSlider.value()) : 0;
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

    svg.pop();
  }

  save(svg, "pattern.svg");
}

/* ==========================================================
   SVG helpers: sampled morphing equivalent to drawSampledShape()
   (accepts layerIndex for erosion & S&H)
   ========================================================== */
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

/* ==========================================================
   SVG: Radiating lines (approx matches canvas drawRadialLines)
   ========================================================== */
function drawRadialLinesSVG(g, startR, endR, shift, f, ampStart, ampEnd, wave, duty, lwStart, lwEnd, startShapeType, endShapeType, sidesStart, sidesEnd, count, layerIndex = 0) {
  let stepT = LINE_STEP_T;
  let stepAngle = TWO_PI / max(1, count);
  const L = layers[layerIndex] || layers[0];
  let logVal = window.logDistSlider ? Number(window.logDistSlider.value()) : 0;

  for (let i = 0; i < count; i++) {
    let baseAngle = i * stepAngle + shift;

    let prevX = null;
    let prevY = null;
    let prevT = 0;
    let prevKeep = false;

    for (let t = 0; t <= 1.000001; t += stepT) {
      let amp = lerp(ampStart, ampEnd, t);

      // apply log distribution for SVG radiating lines too
      let mapped = applyDistribution(t, logVal);
      let r = lerp(startR, endR, mapped);

      let morphT = t;
      let baseStart = sampleBaseRadius(startShapeType, r, sidesStart, baseAngle, count);
      let baseEnd   = sampleBaseRadius(endShapeType,   r, sidesEnd,   baseAngle, count);
      let baseRInterp = lerp(baseStart, baseEnd, morphT);
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

      prevX = x;
      prevY = y;
      prevT = t;
      prevKeep = keep;
    }
  }
}