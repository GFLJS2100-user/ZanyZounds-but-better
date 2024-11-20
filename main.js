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
  analyser.fftSize = 1024; // Changed from 2048 to 1024
}

function playByteBeat(code, sampleRate, mode) {
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
            // Direct scaling for floatbeat, just clamp between -1 and 1
            value = Math.max(-1, Math.min(1, value));
          }
        } else if (mode === 'bitbeat') {
          if (isNaN(value) || !isFinite(value)) {
            value = 64;
          } else {
            // BitBeat mode: apply bitwise operation
            value = value & 1 ? 192 : 64;
            // Convert to audio range (-1 to 1)
            value = (value - 128) / 128;
          }
        } else if (mode === 'logmode') {
          if (isNaN(value) || !isFinite(value)) {
            value = 0;
          } else {
            // LogMode: apply log2 and multiply by 32
            value = Math.log2(Math.abs(value) + 1) * 32;
            // Normalize to (-1, 1) range
            value = Math.max(-1, Math.min(1, (value % 256 - 128) / 128));
          }
        } else if (mode === 'sinmode') {
          if (isNaN(value) || !isFinite(value)) {
            value = 0;
          } else {
            // SinMode: apply sine to the value
            value = Math.sin(value);
            // Already in -1 to 1 range since we're using Math.sin
          }
        } else if (mode === 'sinfmode') {
          if (isNaN(value) || !isFinite(value)) {
            value = 0;
          } else {
            // SinFMode: apply sine with PI/128 scaling
            value = Math.sin(value * Math.PI / 128);
            // Already in -1 to 1 range since we're using Math.sin
          } 
        } else if (mode === 'nolimit') {
          // No Limit mode: like bytebeat but without the % 256 constraint
          if (isNaN(value) || !isFinite(value)) {
            value = 128;
          } else {
            value = Math.floor(value);
            // Convert to audio range (-1 to 1) without limiting the range
            value = (value - 128) / 128;
          }
        } else if (mode === 'signed') {
          // Signed ByteBeat mode: like bytebeat but with signed range
          if (isNaN(value) || !isFinite(value)) {
            value = 128;
          } else {
            value = Math.floor(value);
            value = ((value % 256) + 256) % 256; // First ensure positive range
            value = (value + 128) % 256 - 128;   // Center around zero
            value = value / 128; // Scale to -1 to 1 range
          }
        } else {
          // Original Bytebeat mode
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

document.addEventListener('DOMContentLoaded', () => {
  editor = ace.edit("editor");
  editor.setTheme("ace/theme/monokai");
  editor.session.setMode("ace/mode/javascript");
  editor.setFontSize(16);

  // Load initial state from URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('code')) {
    const code = atob(urlParams.get('code'));
    editor.setValue(code, -1); // Move cursor to start
  }
  if (urlParams.has('mode')) {
    document.getElementById('mode').value = urlParams.get('mode');
  }
  if (urlParams.has('sampleRate')) {
    document.getElementById('sampleRate').value = urlParams.get('sampleRate');
  }

  // Add state saving functionality
  let saveTimeout;
  const saveState = () => {
    const code = editor.getValue();
    const mode = document.getElementById('mode').value;
    const sampleRate = document.getElementById('sampleRate').value;
    
    const newUrl = new URL(window.location.origin + window.location.pathname);  // Updated line
    newUrl.searchParams.set('code', btoa(code));
    newUrl.searchParams.set('mode', mode);
    newUrl.searchParams.set('sampleRate', sampleRate);
    
    window.history.replaceState({}, '', newUrl);
  };

  // Add real-time sound update for code and mode changes
  const updateSound = () => {
    if (isPlaying && audioContext) {
      const code = editor.getValue();
      const mode = document.getElementById('mode').value;
      const sampleRate = parseInt(document.getElementById('sampleRate').value);
      playByteBeat(code, sampleRate, mode);
    }
  };

  const debouncedSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveState();
      updateSound();
    }, 1000);
  };

  // Update on code changes
  editor.session.on('change', debouncedSave);
  
  // Update on mode changes
  document.getElementById('mode').addEventListener('change', () => {
    saveState();
    updateSound();
  });

  // Update on sample rate changes (only when Enter is pressed)
  document.getElementById('sampleRate').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      saveState();
      updateSound();
    }
  });

  window.addEventListener('resize', () => {
    editor.resize();
  });

  const playButton = document.querySelector('.btn');
  const stopButton = document.querySelector('.btn-stop');
  const modeSelect = document.getElementById('mode');
  const sampleRateInput = document.getElementById('sampleRate');

  playButton.addEventListener('click', () => {
    if (!audioContext) {
      initAudio();
    }
    
    const code = editor.getValue();
    const mode = modeSelect.value;
    const sampleRate = parseInt(sampleRateInput.value);
    
    if (code) {
      playByteBeat(code, sampleRate, mode);
    }
  });

  stopButton.addEventListener('click', () => {
    stopSound();
  });
});
