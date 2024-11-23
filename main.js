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
let gainNode;
let currentVolume = 0.5;

// Add Math functions to global scope
for (let name of Object.getOwnPropertyNames(Math)) {
    globalThis[name] = Math[name];
}

function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    processor = audioCtx.createScriptProcessor(1024, 1, 1);
    analyser = audioCtx.createAnalyser();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = currentVolume;
    analyser.fftSize = 4096;
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

function bytebeat(t, formula) {
    try {
        const fn = new Function("t", `return ${formula};`);
        return fn(t) & 255;
    } catch (e) {
        console.error("Formula error:", e);
        return 0;
    }
}

function floatbeat(t, formula) {
    try {
        const fn = new Function("t", `return ${formula};`);
        const result = fn(t);
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
    const volume = document.getElementById('volume-slider').value;
    
    try {
        const newUrl = new URL(window.location.origin + window.location.pathname);
        const hexCode = Array.from(code)
            .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
            .join('');
        newUrl.searchParams.set('code', hexCode);
        newUrl.searchParams.set('mode', mode);
        newUrl.searchParams.set('sampleRate', sampleRate);
        newUrl.searchParams.set('volume', volume);

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

    if (params.has('volume')) {
        const volume = params.get('volume');
        document.getElementById('volume-slider').value = volume;
        currentVolume = parseFloat(volume);
        if (gainNode) {
            gainNode.gain.value = currentVolume;
        }
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

    // Create function from formula
    let fn;
    try {
        fn = new Function("t", `return ${formula};`);
    } catch (e) {
        console.error("Invalid formula:", e);
        return;
    }

    processor.onaudioprocess = (e) => {
        const output = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < output.length; i++) {
            const t = Math.floor(sampleTime);
            try {
                if (currentMode === 'byte') {
                    output[i] = ((fn(t) & 255) - 128) / 128.0;
                } else {
                    output[i] = Math.max(-1, Math.min(1, fn(t))); // Clamp to [-1, 1]
                }
            } catch (err) {
                output[i] = 0; // Handle formula errors gracefully
            }
            sampleTime += sampleRateRatio;
        }
    };

    processor.connect(gainNode);
    gainNode.connect(analyser);
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

    const volumeSlider = document.getElementById('volume-slider');
    volumeSlider.value = currentVolume;

    volumeSlider.addEventListener('input', () => {
        currentVolume = parseFloat(volumeSlider.value);
        if (gainNode) {
            gainNode.gain.value = currentVolume;
        }
    });

    loadPresets();
});
