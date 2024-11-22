let audioContext;
let analyser;
let isPlaying = false;
let currentNode = null;
let oscillator = null;
let editor;
let startTime;

let library = {
  items: []
};

let gainNode;
let currentVolume = 0.5; // Default volume (50%)

// Cookie handling functions
function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = "expires=" + d.toUTCString();
  document.cookie = name + "=" + value + ";" + expires + ";path=/";
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  if (match) return JSON.parse(decodeURIComponent(match[2]));
  return [];
}

// Favorites handling
let favorites = getCookie('zanyZoundsFavorites') || [];

function saveFavorites() {
  setCookie('zanyZoundsFavorites', JSON.stringify(favorites), 365); // Save for 1 year
}

function toggleFavorite(index) {
  const item = library.items[index];
  const favIndex = favorites.findIndex(f => f.name === item.name);
  
  if (favIndex === -1) {
    // Create a clean copy of the item to store in favorites
    const favoriteItem = {
      name: item.name,
      author: item.author,
      code: item.code,
      mode: item.mode,
      sampleRate: item.sampleRate,
      favorite: true
    };
    favorites.push(favoriteItem);
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
    div.innerHTML = `
      <h3>${item.name}</h3>
      <div class="library-item-info">
        Author: ${item.author}<br>
        Mode: ${item.mode}<br>
        Sample Rate: ${item.sampleRate}Hz
      </div>
      <div class="library-item-actions">
        <button class="btn" onclick='loadPreset(${JSON.stringify(item)})'>Load</button>
        <span class="favorite-btn active" onclick="toggleFavorite(${library.items.findIndex(i => i.name === item.name)})">⭐</span>
      </div>
    `;
    container.appendChild(div);
  });
  
  if (favorites.length === 0) {
    container.innerHTML = '<p>No favorites yet! Add some from the library.</p>';
  }
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
  // Ensure we're working with an object, not a string representation
  let preset;
  if (typeof item === 'string') {
    try {
      preset = JSON.parse(item);
    } catch (e) {
      console.error('Error parsing preset:', e);
      return;
    }
  } else {
    preset = item;
  }
  
  // Validate the preset has required properties
  if (!preset || !preset.code) {
    console.error('Invalid preset:', preset);
    return;
  }
  
  // Set the editor value
  editor.setValue(preset.code || '');
  
  // Set mode and sample rate if they exist
  if (preset.mode) {
    document.getElementById('mode').value = preset.mode;
  }
  
  if (preset.sampleRate) {
    document.getElementById('sampleRate').value = preset.sampleRate;
  }

  // Close modals
  closeFavorites();
  closeLibrary();

  // Update URL and sound if playing
  saveState();
  if (isPlaying) {
    updateSound();
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
      <h3>${item.name}</h3>
      <div class="library-item-info">
        Author: ${item.author}<br>
        Mode: ${item.mode}<br>
        Sample Rate: ${item.sampleRate}Hz
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
  
  // Get current code size in bytes
  const code = editor.getValue();
  const bytes = new Blob([code]).size;
  const kb = bytes / 1024;
  const mb = kb / 1024;
  const gb = mb / 1024;
  const tb = gb / 1024;
  
  const sizeText = `Size: ${bytes.toFixed(0)} B | ${kb.toFixed(2)} KB | ${mb.toFixed(3)} MB | ${gb.toFixed(4)} GB | ${tb.toFixed(5)} TB`;
  counterElement.textContent = `Time: ${t.toLocaleString()} samples (${seconds.toFixed(2)} seconds) | ${sizeText}`;
}

function initAudio() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  gainNode = audioContext.createGain();
  gainNode.gain.value = currentVolume;
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

function bytebeat(t, formula) {
  try {
    const result = eval(formula);
    return Number.isNaN(result) ? 128 : result % 256;
  } catch (e) {
    console.error("Formula error:", e);
    return 128;
  }
}

function floatbeat(t, formula) {
  try {
    const result = eval(formula);
    return Number.isNaN(result) ? 0 : Math.max(-1, Math.min(1, result));
  } catch (e) {
    console.error("Formula error:", e);
    return 0;
  }
}

function bitbeat(t, formula) {
  try {
    const result = eval(formula);
    return Number.isNaN(result) ? 128 : (result & 1) ? 192 : 64;
  } catch (e) {
    console.error("Formula error:", e);
    return 128;
  }
}

function logMode(t, formula) {
  try {
    const result = eval(formula);
    return Number.isNaN(result) ? 128 : Math.log2(Math.abs(result) + 1) * 32 % 256;
  } catch (e) {
    console.error("Formula error:", e);
    return 128;
  }
}

function sinMode(t, formula) {
  try {
    const result = eval(formula);
    return Number.isNaN(result) ? 128 : Math.sin(result) * 127 + 128;
  } catch (e) {
    console.error("Formula error:", e);
    return 128;
  }
}

function sinFMode(t, formula) {
  try {
    const result = eval(formula);
    return Number.isNaN(result) ? 0 : Math.sin(result * Math.PI / 128);
  } catch (e) {
    console.error("Formula error:", e);
    return 0;
  }
}

function playByteBeat(code, sampleRate, mode) {
  // Add Math functions to global scope
  for (let name of Object.getOwnPropertyNames(Math)) {
    globalThis[name] = Math[name];
  }

  if (currentNode) {
    currentNode.disconnect();
  }

  const bufferSize = 4096;
  const node = audioContext.createScriptProcessor(bufferSize, 1, 2);
  
  let t = 0;
  startTime = Date.now();
  const timeScale = sampleRate / audioContext.sampleRate;

  node.onaudioprocess = function(e) {
    const leftOutput = e.outputBuffer.getChannelData(0);
    const rightOutput = e.outputBuffer.getChannelData(1);
    
    for (let i = 0; i < bufferSize; i++) {
      try {
        const scaledT = Math.floor(t);
        let value;

        if (code.includes('[') && code.includes(']')) {
          // Handle stereo code
          const stereoCode = code.trim();
          if (stereoCode.startsWith('[') && stereoCode.endsWith(']')) {
            const channels = stereoCode.slice(1, -1).split(',');
            if (channels.length === 2) {
              switch(mode) {
                case 'bytebeat':
                  leftOutput[i] = (bytebeat(scaledT, channels[0].trim()) - 128) / 128.0;
                  rightOutput[i] = (bytebeat(scaledT, channels[1].trim()) - 128) / 128.0;
                  break;
                case 'floatbeat':
                  leftOutput[i] = floatbeat(scaledT, channels[0].trim());
                  rightOutput[i] = floatbeat(scaledT, channels[1].trim());
                  break;
                case 'bitbeat':
                  leftOutput[i] = (bitbeat(scaledT, channels[0].trim()) - 128) / 128.0;
                  rightOutput[i] = (bitbeat(scaledT, channels[1].trim()) - 128) / 128.0;
                  break;
                case 'logmode':
                  leftOutput[i] = (logMode(scaledT, channels[0].trim()) - 128) / 128.0;
                  rightOutput[i] = (logMode(scaledT, channels[1].trim()) - 128) / 128.0;
                  break;
                case 'sinmode':
                  leftOutput[i] = (sinMode(scaledT, channels[0].trim()) - 128) / 128.0;
                  rightOutput[i] = (sinMode(scaledT, channels[1].trim()) - 128) / 128.0;
                  break;
                case 'sinfmode':
                  leftOutput[i] = sinFMode(scaledT, channels[0].trim());
                  rightOutput[i] = sinFMode(scaledT, channels[1].trim());
                  break;
              }
            }
          }
        } else {
          // Handle mono code
          switch(mode) {
            case 'bytebeat':
              value = (bytebeat(scaledT, code) - 128) / 128.0;
              break;
            case 'floatbeat':
              value = floatbeat(scaledT, code);
              break;
            case 'bitbeat':
              value = (bitbeat(scaledT, code) - 128) / 128.0;
              break;
            case 'logmode':
              value = (logMode(scaledT, code) - 128) / 128.0;
              break;
            case 'sinmode':
              value = (sinMode(scaledT, code) - 128) / 128.0;
              break;
            case 'sinfmode':
              value = sinFMode(scaledT, code);
              break;
            default:
              value = 0;
          }
          leftOutput[i] = rightOutput[i] = value;
        }

        t += timeScale;
        
        if (i === 0) {
          updateCounter(Math.floor(t), sampleRate);
        }
      } catch (err) {
        console.error('Error in audio processing:', err);
        leftOutput[i] = rightOutput[i] = 0;
        
        if (i === 0) {
          showError(err.message);
        }
      }
    }
  };

  // Modify the connection chain
  node.connect(analyser);
  analyser.connect(gainNode);
  gainNode.connect(audioContext.destination);
  currentNode = node;
  isPlaying = true;
  drawWaveform();
}

function stopSound() {
  if (currentNode) {
    currentNode.disconnect();
    currentNode = null;
  }
  if (gainNode) {
    gainNode.disconnect();
    gainNode = audioContext.createGain();
    gainNode.gain.value = currentVolume;
  }
  isPlaying = false;

  // Clear waveform
  const canvas = document.getElementById('waveform');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawWaveform() {
  if (!isPlaying) return;
  
  const canvas = document.getElementById('waveform');
  const ctx = canvas.getContext('2d');
  
  // Resize canvas to match its display size
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  
  // Get frequency data
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(dataArray);
  
  // Clear canvas
  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw waveform
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#61decd';
  ctx.beginPath();
  
  const sliceWidth = canvas.width * 1.0 / bufferLength;
  let x = 0;
  
  for (let i = 0; i < bufferLength; i++) {
    const v = 1 - dataArray[i] / 128.0;
    const y = (v + 1) * canvas.height / 2;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    
    x += sliceWidth;
  }
  
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
  
  // Request next frame
  requestAnimationFrame(drawWaveform);
}

document.addEventListener('DOMContentLoaded', () => {
  editor = CodeMirror(document.getElementById('editor'), {
    mode: "javascript",
    theme: "zanyZoundsTheme",
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
    autofocus: true,
    value: ""
  });

  // Set default code if no code in URL
  const defaultCode = 't%(t^t>>8)^t>>8|t>>6';

  // Load initial state from URL
  const urlParams = new URLSearchParams(window.location.search);
  
  // Load code
  if (urlParams.has('code')) {
    const code = decodeURIComponent(urlParams.get('code'));
    editor.setValue(code);
  } else {
    editor.setValue(defaultCode);
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
    newUrl.searchParams.set('code', encodeURIComponent(code));
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
  editor.on('change', debouncedSave);

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

  // Add volume control
  const volumeSlider = document.getElementById('volume');
  const volumeValue = document.getElementById('volumeValue');
  
  volumeSlider.addEventListener('input', (e) => {
    currentVolume = e.target.value / 100;
    volumeValue.textContent = `${e.target.value}%`;
    if (gainNode) {
      gainNode.gain.value = currentVolume;
    }
  });

  window.addEventListener('resize', () => {
    editor.refresh();
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
