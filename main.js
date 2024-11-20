let audioContext;
let analyser;
let isPlaying = false;
let currentNode = null;
let oscillator = null;
let editor;
let startTime;

// Enhanced Math functions
const mathFunctions = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  asinh: Math.asinh,
  acosh: Math.acosh,
  atanh: Math.atanh,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  trunc: Math.trunc,
  sign: Math.sign,
  int: Math.floor,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  log: Math.log,
  log2: Math.log2,
  log10: Math.log10,
  exp: Math.exp,
  pow: Math.pow,
  min: Math.min,
  max: Math.max,
  random: Math.random,
  PI: Math.PI,
  E: Math.E,
  SQRT2: Math.SQRT2,
  SQRT1_2: Math.SQRT1_2,
  LN2: Math.LN2,
  LN10: Math.LN10,
  clamp: (num, min, max) => Math.min(Math.max(num, min), max),
  lerp: (start, end, amt) => (1-amt)*start + amt*end,
  map: (value, start1, stop1, start2, stop2) => 
    start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1)),
  smooth: (x) => x * x * (3 - 2 * x),
  wrap: (x, min, max) => min + ((x - min) % (max - min)),
  noise: (x) => Math.sin(x * 12.9898 + x * 78.233) * 43758.5453 % 1,
  saw: (x) => (x % 1) * 2 - 1,
  square: (x) => Math.sin(x) >= 0 ? 1 : -1,
  triangle: (x) => Math.abs(((x % 1) * 4 - 2)) - 1,
  pulse: (x, width = 0.5) => ((x % 1) < width) ? 1 : -1,
  dist: (x, y) => Math.sqrt(x*x + y*y),
  fract: (x) => x - Math.floor(x),
  mix: (a, b, t) => a * (1 - t) + b * t,
};

async function loadPreset(url) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error loading preset:', error);
    return null;
  }
}

function updateCounter(t, sampleRate) {
  const counterElement = document.getElementById('counter');
  const seconds = t / sampleRate;
  counterElement.textContent = `Time: ${t.toLocaleString()} samples (${seconds.toFixed(2)} seconds)`;
}

function initAudio() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
}

function playByteBeat(code, sampleRate, mode) {
  updateCanvasTitle();

  if (currentNode) {
    currentNode.disconnect();
  }

  const bufferSize = 256;
  const node = audioContext.createScriptProcessor(bufferSize, 1, 1);
  
  let t = 0;
  startTime = Date.now();
  const timeScale = sampleRate / audioContext.sampleRate;
  
  node.onaudioprocess = function(e) {
    const output = e.outputBuffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      try {
        const scaledT = Math.floor(t * timeScale);
        const fn = new Function(...Object.keys(mathFunctions), 't', `return ${code};`);
        let value = fn(...Object.values(mathFunctions), scaledT) || 0;

        if (mode === 'floatbeat') {
          if (isNaN(value) || !isFinite(value)) {
            value = 0;
          } else {
            value = Math.max(-1, Math.min(1, value));
          }
        } else {
          if (isNaN(value) || !isFinite(value)) {
            value = 128;
          } else {
            value = Math.floor(value);
            value = ((value % 256) + 256) % 256;
            value = (value - 128) / 128;
          }
        }
        
        output[i] = value;
        t++;
        
        if (i === 0) {
          updateCounter(Math.floor(t * timeScale), sampleRate);
        }
      } catch (err) {
        console.error('Error in audio processing:', err);
        output[i] = 0;
      }
    }
  };

  node.connect(analyser);
  analyser.connect(audioContext.destination);
  currentNode = node;
  isPlaying = true;
  drawWaveform();
}

function stopSound() {
  if (currentNode) {
    currentNode.disconnect();
    currentNode = null;
  }
  isPlaying = false;
  updateCanvasTitle();
}

function drawWaveform() {
  const canvas = document.getElementById('waveform');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  
  const canvasCtx = canvas.getContext('2d');
  canvasCtx.imageSmoothingEnabled = false;
  
  const width = canvas.width;
  const height = canvas.height;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    if (!isPlaying) return;
    
    requestAnimationFrame(draw);
    
    analyser.getByteTimeDomainData(dataArray);
    
    canvasCtx.fillStyle = 'rgb(20, 20, 20)';
    canvasCtx.fillRect(0, 0, width, height);
    
    canvasCtx.lineWidth = 1;
    canvasCtx.strokeStyle = 'rgb(0, 255, 0)';
    
    canvasCtx.beginPath();
    
    const sliceWidth = width * 1.0 / bufferLength;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = height - (v * height / 2);
      
      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }
      
      x += sliceWidth;
    }
    
    canvasCtx.lineTo(width, height/2);
    canvasCtx.stroke();
  }
  
  draw();
}

function initCanvas() {
  const container = document.getElementById('waveform-container');
  const canvas = document.getElementById('waveform');
  const playBtn = container.querySelector('.canvas-btn.play');
  const stopBtn = container.querySelector('.canvas-btn.stop');
  
  playBtn.addEventListener('click', () => {
    if (!audioContext) {
      initAudio();
    }
    
    const code = editor.getValue();
    const mode = document.getElementById('mode').value;
    const sampleRate = parseInt(document.getElementById('sampleRate').value);
    
    if (code) {
      playByteBeat(code, sampleRate, mode);
    }
  });

  stopBtn.addEventListener('click', () => {
    stopSound();
  });

  // Update visibility of buttons based on play state
  const updateButtons = () => {
    playBtn.style.display = isPlaying ? 'none' : 'block';
    stopBtn.style.display = isPlaying ? 'block' : 'none';
  };

  // Call this whenever play state changes
  const oldPlayByteBeat = window.playByteBeat;
  window.playByteBeat = (...args) => {
    oldPlayByteBeat(...args);
    updateButtons();
  };

  const oldStopSound = window.stopSound;
  window.stopSound = () => {
    oldStopSound();
    updateButtons();
  };

  updateButtons(); // Initial state
}

function updateCanvasTitle() {
  const canvas = document.getElementById('waveform');
  canvas.title = isPlaying ? 'Click to pause' : 'Click to play';
}

document.addEventListener('DOMContentLoaded', () => {
  editor = ace.edit("editor");
  editor.setTheme("ace/theme/monokai");
  editor.session.setMode("ace/mode/javascript");
  editor.setFontSize(16);

  // Add button to add Math. prefix
  const addMathButton = document.createElement('button');
  addMathButton.className = 'btn';
  addMathButton.textContent = 'Add Math. prefix';
  addMathButton.onclick = () => {
    const text = editor.getValue();
    const mathFunctionNames = Object.keys(Math).filter(key => typeof Math[key] === 'function');
    let newText = text;
    
    for (const funcName of mathFunctionNames) {
      const regex = new RegExp(`(?<!Math\\.)\\b${funcName}\\s*\\(`, 'g');
      newText = newText.replace(regex, `Math.${funcName}(`);
    }
    
    editor.setValue(newText, -1);
  };
  document.querySelector('.button-container').insertBefore(addMathButton, document.querySelector('.btn-stop'));

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('code')) {
    const code = atob(urlParams.get('code'));
    editor.setValue(code);
  }
  if (urlParams.has('mode')) {
    document.getElementById('mode').value = urlParams.get('mode');
  }
  if (urlParams.has('sampleRate')) {
    document.getElementById('sampleRate').value = urlParams.get('sampleRate');
  }

  let saveTimeout;
  const saveState = () => {
    const code = editor.getValue();
    const mode = document.getElementById('mode').value;
    const sampleRate = document.getElementById('sampleRate').value;
    
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('code', btoa(code));
    newUrl.searchParams.set('mode', mode);
    newUrl.searchParams.set('sampleRate', sampleRate);
    
    window.history.replaceState({}, '', newUrl);
  };

  const debouncedSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveState, 1000);
  };

  editor.session.on('change', debouncedSave);
  document.getElementById('mode').addEventListener('change', saveState);
  document.getElementById('sampleRate').addEventListener('change', saveState);

  window.addEventListener('resize', () => {
    editor.resize();
  });

  // Initialize canvas click functionality
  const canvas = document.getElementById('waveform');
  canvas.style.cursor = 'pointer';
  initCanvas();
});
