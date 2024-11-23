let audioCtx;
let processor;
let isPlaying = false;
let currentSampleRate = 44100;
let timeScaling = 1;
let sampleTime = 0;
let analyser;
let editor;
let presets = {};
let currentMode = 'byte';

// Add Math functions to global scope
for (let name of Object.getOwnPropertyNames(Math)) {
    globalThis[name] = Math[name];
}

function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 4096;
}

function drawWaveform() {
    if (!isPlaying) return;
    
    const canvas = document.getElementById('waveform');
    const canvasCtx = canvas.getContext('2d');
    
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    analyser.getByteTimeDomainData(dataArray);
    
    canvasCtx.fillStyle = '#264653';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    canvasCtx.lineWidth = 1.5;
    canvasCtx.strokeStyle = '#2a9d8f';
    canvasCtx.beginPath();
    
    const sliceWidth = canvas.width / bufferLength;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
        const v = 1 - dataArray[i] / 128.0;
        const y = (v+1) * canvas.height/2;
        
        if (i === 0) {
            canvasCtx.moveTo(x, y);
        } else {
            canvasCtx.lineTo(x, y);
        }
        
        x += sliceWidth;
    }
    
    canvasCtx.lineTo(canvas.width, canvas.height/2);
    canvasCtx.stroke();
    requestAnimationFrame(drawWaveform);
}

function bytebeat(t, formula) {
    try {
        return eval(formula) % 256;
    } catch (e) {
        console.error("Formula error:", e);
        return 0;
    }
}

function floatbeat(t, formula) {
    try {
        // Ensure the output is clamped between -1 and 1 for proper audio
        const result = eval(formula);
        return Math.max(-1, Math.min(1, result)); // Clamp values
    } catch (e) {
        console.error("Formula error:", e);
        return 0;
    }
}

function formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1e4));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

function updateURL() {
    const code = editor.getValue();
    const mode = document.getElementById('mode-select').value;
    const sampleRate = document.getElementById('sample-rate').value;
    
    try {
        const newUrl = new URL(window.location.origin + window.location.pathname);
        // Convert string to hex
        const hexCode = Array.from(code)
            .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
            .join('');
        newUrl.searchParams.set('code', hexCode);
        newUrl.searchParams.set('mode', mode);
        newUrl.searchParams.set('sampleRate', sampleRate);

        window.history.replaceState({}, '', newUrl);
    } catch (e) {
        console.error('Error updating URL parameters:', e);
    }
}

function loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    
    if (params.has('code')) {
        try {
            const hexCode = params.get('code');
            // Convert hex back to string
            const code = hexCode.match(/.{1,2}/g)
                ?.map(hex => String.fromCharCode(parseInt(hex, 16)))
                .join('') || '';
            editor.setValue(code, -1);
            editor.clearSelection();
        } catch (e) {
            console.error('Error decoding code from URL:', e);
        }
    }
    
    if (params.has('mode')) {
        const mode = params.get('mode');
        document.getElementById('mode-select').value = mode;
        currentMode = mode;
    }
    
    if (params.has('sampleRate')) {
        const sampleRate = params.get('sampleRate');
        document.getElementById('sample-rate').value = sampleRate;
        currentSampleRate = parseInt(sampleRate);
    }
}

function updateCounters() {
    if (!isPlaying) return;
    
    const seconds = sampleTime / currentSampleRate;
    const codeSize = new Blob([editor.getValue()]).size;
    
    document.getElementById('counter-display').innerHTML = `
        Time: ${seconds.toFixed(2)}s<br>
        Samples: ${Math.floor(sampleTime)}<br>
        Code Size: ${formatBytes(codeSize)}
    `;
    
    requestAnimationFrame(updateCounters);
}

function updateSampleRate() {
    const newRate = parseInt(document.getElementById('sample-rate').value);
    if (newRate && newRate > 0) {
        currentSampleRate = newRate;
        updateURL();
        if (isPlaying) {
            stopAudio();
            startAudio(editor.getValue());
        }
    }
}

function startAudio(formula) {
    if (!audioCtx) initAudio();
    
    if (isPlaying) {
        processor.disconnect();
    }

    const sampleRateRatio = currentSampleRate / audioCtx.sampleRate;
    sampleTime = 0;
    currentMode = document.getElementById('mode-select').value;

    processor.onaudioprocess = (e) => {
        const output = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < output.length; i++) {
            const t = Math.floor(sampleTime);
            if (currentMode === 'byte') {
                output[i] = (bytebeat(t, formula) - 128) / 128.0;
            } else {
                // Direct floating point output for floatbeat mode
                output[i] = floatbeat(t, formula);
            }
            sampleTime += sampleRateRatio;
        }
    };

    processor.connect(analyser);
    analyser.connect(audioCtx.destination);
    isPlaying = true;
    drawWaveform();
    updateCounters();
}

function stopAudio() {
    if (processor) {
        processor.disconnect();
        isPlaying = false;
    }
}

function loadPresets() {
    fetch('zoundlibrary/library.json')
        .then(response => response.json())
        .then(data => {
            presets = data.presets;
            updatePresetButtons();
        })
        .catch(error => console.error('Error loading presets:', error));
}

function updatePresetButtons() {
    const scrollingFrame = document.getElementById('scrolling-frame');
    scrollingFrame.innerHTML = '';
    for (const preset of presets) {
        const button = document.createElement('div');
        button.className = 'frame';
        
        // Create formatted content with author, date and sample rate
        button.innerHTML = `
            <div class="preset-info">
                <div class="preset-name">${preset.name}</div>
                <div class="preset-details">
                    <span>By: ${preset.author || 'Anonymous'}</span>
                    <span>Date: ${preset.date || 'Unknown'}</span>
                    <span>Sample Rate: ${preset.sampleRate || '44100'}Hz</span>
                </div>
            </div>
        `;
        
        button.addEventListener('click', () => {
            editor.setValue(preset.code, -1);
            // Update sample rate from preset
            const sampleRateInput = document.getElementById('sample-rate');
            sampleRateInput.value = preset.sampleRate || '44100';
            currentSampleRate = parseInt(preset.sampleRate || '44100');
            
            if (isPlaying) {
                stopAudio();
            }
            startAudio(preset.code);
            updateURL(); // Update URL with new values
        });
        scrollingFrame.appendChild(button);
    }
}

// Update the editor initialization and styling
function updateEditor() {
    editor = ace.edit("editor");
    editor.setTheme("ace/theme/monokai");
    editor.session.setMode("ace/mode/javascript");
    editor.session.setTabSize(2);
    editor.session.setUseSoftTabs(true);
    editor.setShowPrintMargin(false);
    editor.setOptions({
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        enableSnippets: true,
        fontSize: "14px",
        showLineNumbers: true,
        showGutter: true,
        highlightActiveLine: true,
        wrap: true,
        behavioursEnabled: true,
        wrapBehavioursEnabled: true
    });
    
    // Save current state immediately when editor loads
    editor.session.on('changeScrollTop', function() {
        updateURL();
    });
    
    // Handle window unload
    window.addEventListener('beforeunload', function() {
        updateURL();
    });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize editor first
    updateEditor();
    
    // Then load from URL
    loadFromURL();
    
    // Save state when switching tabs or closing
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            updateURL();
        }
    });
    
    const playButton = document.querySelector('.play-btn');
    const stopButton = document.querySelector('.stop-btn');
    const sampleRateInput = document.getElementById('sample-rate');
    const modeSelect = document.getElementById('mode-select');
    
    playButton.addEventListener('click', () => {
        const code = editor.getValue();
        if (code) {
            if (isPlaying) {
                stopAudio();
            }
            startAudio(code);
        }
    });

    stopButton.addEventListener('click', stopAudio);
    
    // Add debounce function
    function debounce(func, delay) {
        let timeoutId;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(context, args), delay);
        };
    }

    // Apply debounced update to editor changes
    const debouncedUpdate = debounce(() => {
        updateURL();
        if (isPlaying) {
            stopAudio();
            startAudio(editor.getValue());
        }
    }, 1); // Very short debounce time

    editor.session.on('change', debouncedUpdate);

    // Ensure other inputs also trigger quick updates
    sampleRateInput.addEventListener('input', debounce(() => {
        updateSampleRate();
        updateURL();
    }, 1));

    modeSelect.addEventListener('change', debounce(() => {
        updateURL();
        if (isPlaying) {
            stopAudio();
            startAudio(editor.getValue());
        }
    }, 1));

    loadPresets();
});
