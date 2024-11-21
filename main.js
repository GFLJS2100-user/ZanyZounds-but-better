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

let library = {
  items: []
};

// Cookie handling functions
function setCookie(name, value, days) {
  try {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + d.toUTCString();
    document.cookie = name + "=" + encodeURIComponent(value) + ";" + expires + ";path=/";
  } catch (err) {
    console.error('Error setting cookie:', err);
    showError('Failed to save favorites to cookie');
  }
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  if (match) return JSON.parse(decodeURIComponent(match[2]));
  return [];
}

// Favorites handling
let favorites = getCookie('zanyZoundsFavorites') || [];

function saveFavorites() {
  try {
    const safeData = favorites.map(item => ({
      name: String(item.name || ''),
      author: String(item.author || ''),
      mode: String(item.mode || ''),
      sampleRate: Number(item.sampleRate) || 44100,
      code: String(item.code || ''),
      favorite: Boolean(item.favorite)
    }));
    setCookie('zanyZoundsFavorites', JSON.stringify(safeData), 365);
  } catch (err) {
    console.error('Error saving favorites:', err);
    showError('Failed to save favorites');
  }
}

function toggleFavorite(index) {
  const item = library.items[index];
  const favIndex = favorites.findIndex(f => f.name === item.name);
  
  if (favIndex === -1) {
    favorites.push(item);
    item.favorite = true;
  } else {
    favorites.splice(favIndex, 1);
    item.favorite = false;
  }
  
  saveFavorites();
  renderLibrary();
  renderFavorites();
}

function openFavorites() {
  document.getElementById('favoritesModal').style.display = 'block';
  renderFavorites();
}

function closeFavorites() {
  document.getElementById('favoritesModal').style.display = 'none';
}

function renderFavorites() {
  const container = document.getElementById('favoritesItems');
  container.innerHTML = '';
  
  favorites.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'library-item';
    
    // Create load button using a safer approach
    const loadButton = document.createElement('button');
    loadButton.className = 'btn';
    loadButton.textContent = 'Load';
    loadButton.onclick = () => loadPreset(item);

    div.innerHTML = `
      <h3>${escapeHtml(item.name)}</h3>
      <div class="library-item-info">
        Author: ${escapeHtml(item.author)}<br>
        Mode: ${escapeHtml(item.mode)}<br>
        Sample Rate: ${escapeHtml(String(item.sampleRate))}Hz
      </div>
      <div class="library-item-actions">
        <span class="favorite-btn active" onclick="toggleFavorite(${library.items.findIndex(i => i.name === item.name)})">⭐</span>
      </div>
    `;
    
    // Insert the load button safely
    const actionsDiv = div.querySelector('.library-item-actions');
    actionsDiv.insertBefore(loadButton, actionsDiv.firstChild);
    
    container.appendChild(div);
  });
  
  if (favorites.length === 0) {
    container.innerHTML = '<p>No favorites yet! Add some from the library.</p>';
  }
}

// Add helper function to escape HTML
function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function loadLibrary() {
  fetch('./zoundlibrary/library.json')
    .then(response => {
      if (!response.ok) throw new Error('Failed to load library');
      return response.json();
    })
    .then(data => {
      library = data;
      // Restore favorite status from cookies
      favorites = getCookie('zanyZoundsFavorites') || [];
      library.items.forEach(item => {
        item.favorite = favorites.some(f => f.name === item.name);
      });
      renderLibrary();
    })
    .catch(err => {
      console.error('Error loading library:', err);
      library = { items: [] };
    });
}

function openLibrary() {
  document.getElementById('libraryModal').style.display = 'block';
  renderLibrary();
}

function closeLibrary() {
  document.getElementById('libraryModal').style.display = 'none';
}

function loadPreset(item) {
  try {
    // Ensure we're working with an object
    const preset = (typeof item === 'string') ? JSON.parse(item) : item;
    
    // Safely set the code value
    if (typeof preset.code === 'string') {
      editor.setValue(preset.code, -1);
    }
    
    // Safely set mode and sample rate
    if (typeof preset.mode === 'string') {
      document.getElementById('mode').value = preset.mode;
    }
    
    if (typeof preset.sampleRate === 'number' || typeof preset.sampleRate === 'string') {
      document.getElementById('sampleRate').value = preset.sampleRate;
    }

    // Close modals
    closeFavorites();
    closeLibrary();

    // Update URL and sound if playing
    saveState();
    updateSound();
  } catch (err) {
    console.error('Error loading preset:', err);
    showError('Failed to load preset: ' + err.message);
  }
}

function renderLibrary() {
  const container = document.getElementById('libraryItems');
  container.innerHTML = '';

  const sortedItems = [...library.items].sort((a, b) => {
    if (a.favorite && !b.favorite) return -1;
    if (!a.favorite && b.favorite) return 1;
    return new Date(b.created) - new Date(a.created);
  });

  sortedItems.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'library-item';
    div.innerHTML = `
      <h3>${escapeHtml(item.name)}</h3>
      <div class="library-item-info">
        Author: ${escapeHtml(item.author)}<br>
        Mode: ${escapeHtml(item.mode)}<br>
        Sample Rate: ${escapeHtml(String(item.sampleRate))}Hz
      </div>
      <div class="library-item-actions">
        <button class="btn" onclick="loadPreset(library.items[${index}])">Load</button>
        <span class="favorite-btn ${item.favorite ? 'active' : ''}" 
              onclick="toggleFavorite(${index})">⭐</span>
      </div>
    `;
    container.appendChild(div);
  });
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

function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  errorDiv.textContent = `Error: ${message}`;
  errorDiv.style.display = 'block';
  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 5000); // Hide after 5 seconds
}

function playByteBeat(code, sampleRate, mode) {
  if (currentNode) {
    currentNode.disconnect();
  }

  const bufferSize = 256;
  // Change to stereo output (2 channels)
  const node = audioContext.createScriptProcessor(bufferSize, 1, 2);
  
  let t = 0;
  startTime = Date.now();
  const timeScale = sampleRate / audioContext.sampleRate;
  
  node.onaudioprocess = function(e) {
    const leftOutput = e.outputBuffer.getChannelData(0);
    const rightOutput = e.outputBuffer.getChannelData(1);
    
    for (let i = 0; i < bufferSize; i++) {
      try {
        const scaledT = Math.floor(t * timeScale);
        
        // Check if code contains array syntax [left,right]
        let leftValue, rightValue;
        
        if (code.includes('[') && code.includes(']')) {
          // Parse array syntax for stereo
          const stereoCode = code.trim();
          if (stereoCode.startsWith('[') && stereoCode.endsWith(']')) {
            const channels = stereoCode.slice(1, -1).split(',');
            if (channels.length === 2) {
              const leftFn = new Function(...Object.keys(mathFunctions), 't', `return ${channels[0].trim()};`);
              const rightFn = new Function(...Object.keys(mathFunctions), 't', `return ${channels[1].trim()};`);
              
              leftValue = leftFn(...Object.values(mathFunctions), scaledT) || 0;
              rightValue = rightFn(...Object.values(mathFunctions), scaledT) || 0;
            } else {
              throw new Error('Stereo code must have exactly two channels');
            }
          }
        } else {
          // Mono code - same value for both channels
          const fn = new Function(...Object.keys(mathFunctions), 't', `return ${code};`);
          leftValue = rightValue = fn(...Object.values(mathFunctions), scaledT) || 0;
        }

        // Process values based on mode
        if (mode === 'floatbeat') {
          leftValue = Math.max(-1, Math.min(1, leftValue));
          rightValue = Math.max(-1, Math.min(1, rightValue));
        } else if (mode === 'bitbeat') {
          leftValue = ((leftValue & 1) ? 192 : 64);
          rightValue = ((rightValue & 1) ? 192 : 64);
          leftValue = (leftValue - 128) / 128;
          rightValue = (rightValue - 128) / 128;
        } else if (mode === 'logmode') {
          leftValue = Math.log2(Math.abs(leftValue) + 1) * 32;
          rightValue = Math.log2(Math.abs(rightValue) + 1) * 32;
          leftValue = Math.max(-1, Math.min(1, (leftValue % 256 - 128) / 128));
          rightValue = Math.max(-1, Math.min(1, (rightValue % 256 - 128) / 128));
        } else if (mode === 'sinmode') {
          leftValue = Math.sin(leftValue);
          rightValue = Math.sin(rightValue);
        } else if (mode === 'sinfmode') {
          leftValue = Math.sin(leftValue * Math.PI / 128);
          rightValue = Math.sin(rightValue * Math.PI / 128);
        } else if (mode === 'nolimit') {
          leftValue = Math.floor(leftValue);
          rightValue = Math.floor(rightValue);
          leftValue = (leftValue - 128) / 128;
          rightValue = (rightValue - 128) / 128;
        } else if (mode === 'signed') {
          leftValue = Math.floor(leftValue);
          rightValue = Math.floor(rightValue);
          leftValue = ((leftValue % 256) + 256) % 256;
          rightValue = ((rightValue % 256) + 256) % 256;
          leftValue = ((leftValue + 128) % 256 - 128) / 128;
          rightValue = ((rightValue + 128) % 256 - 128) / 128;
        } else {
          // Original Bytebeat mode
          leftValue = Math.floor(leftValue);
          rightValue = Math.floor(rightValue);
          leftValue = ((leftValue % 256) + 256) % 256;
          rightValue = ((rightValue % 256) + 256) % 256;
          leftValue = (leftValue - 128) / 128;
          rightValue = (rightValue - 128) / 128;
        }
        
        leftOutput[i] = leftValue;
        rightOutput[i] = rightValue;
        t++;
        
        if (i === 0) {
          updateCounter(Math.floor(t * timeScale), sampleRate);
        }
      } catch (err) {
        console.error('Error in audio processing:', err);
        leftOutput[i] = 0;
        rightOutput[i] = 0;
        
        // Only show error once when it first occurs
        if (i === 0) {
          showError(err.message);
          // Optional: stop playback on error
          // stopSound();
        }
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

    canvasCtx.lineTo(width, height / 2);
    canvasCtx.stroke();
  }

  draw();
}

document.addEventListener('DOMContentLoaded', () => {
  editor = ace.edit("editor");
  editor.setTheme("ace/theme/monokai");
  editor.session.setMode("ace/mode/javascript");
  editor.setFontSize(16);

  // Set default code if no code in URL
  const defaultCode = 't%(t^t>>8)^t>>8|t>>6';

  // Load initial state from URL
  const urlParams = new URLSearchParams(window.location.search);
  
  // Load code
  if (urlParams.has('code')) {
    const code = atob(urlParams.get('code'));
    editor.setValue(code, -1);
  } else {
    editor.setValue(defaultCode, -1);
  }

  // Load mode
  if (urlParams.has('mode')) {
    document.getElementById('mode').value = urlParams.get('mode');
  }

  // Load sample rate
  if (urlParams.has('sampleRate')) {
    document.getElementById('sampleRate').value = urlParams.get('sampleRate');
  }

  // Add state saving functionality
  let saveTimeout;
  const saveState = () => {
    const code = editor.getValue();
    const mode = document.getElementById('mode').value;
    const sampleRate = document.getElementById('sampleRate').value;

    const newUrl = new URL(window.location.origin + window.location.pathname);
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
    }, 1);
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

  playButton.addEventListener('click', () => {
    try {
      if (!audioContext) {
        initAudio();
      }

      const code = editor.getValue();
      const mode = document.getElementById('mode').value;
      const sampleRate = parseInt(document.getElementById('sampleRate').value);

      if (!code) {
        throw new Error('No code entered');
      }
      
      if (isNaN(sampleRate) || sampleRate <= 0) {
        throw new Error('Invalid sample rate');
      }

      playByteBeat(code, sampleRate, mode);
    } catch (err) {
      showError(err.message);
    }
  });

  stopButton.addEventListener('click', () => {
    stopSound();
  });

  document.querySelector('.btn-library').addEventListener('click', openLibrary);
  document.querySelector('.close').addEventListener('click', closeLibrary);
  document.querySelector('.btn-favorites').addEventListener('click', openFavorites);
  document.querySelector('.close-favorites').addEventListener('click', closeFavorites);

  // Load library on startup
  loadLibrary();
});
