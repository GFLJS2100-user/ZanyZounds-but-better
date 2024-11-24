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

// New variables for visualization and debug mode
let fftEnabled = false;
let xyEnabled = false;
let debugMode = false;
let debugFrameCount = 0;

function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    processor = audioCtx.createScriptProcessor(8192, 1, 1);
    analyser = audioCtx.createAnalyser();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = currentVolume;
    analyser.fftSize = 8192;
}

function resumeAudioContext() {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function drawWaveform() {
    const canvas = document.getElementById('waveform');
    let width = canvas.offsetWidth;
    let height = canvas.offsetHeight;
    
    // Make canvas dimensions match the CSS dimensions
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    const canvasCtx = canvas.getContext('2d', { alpha: false });
    canvasCtx.imageSmoothingEnabled = false;
    
    const bufferLength = analyser.frequencyBinCount;
    const timeData = new Uint8Array(bufferLength);
    const freqData = new Uint8Array(bufferLength);

    function draw() {
        if (!isPlaying) return;
        
        requestAnimationFrame(draw);
        
        // Clear canvas
        canvasCtx.fillStyle = 'rgb(20, 20, 20)';
        canvasCtx.fillRect(0, 0, width, height);
        
        if (fftEnabled) {
            // Draw FFT
            analyser.getByteFrequencyData(freqData);
            canvasCtx.strokeStyle = 'rgb(0, 255, 0)';
            canvasCtx.beginPath();
            const barWidth = width / bufferLength;
            
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (freqData[i] / 255.0) * height;
                canvasCtx.fillStyle = `hsl(${(i/bufferLength) * 360}, 100%, 50%)`;
                canvasCtx.fillRect(i * barWidth, height - barHeight, barWidth, barHeight);
            }
        } else if (xyEnabled) {
            // XY Mode (Lissajous)
            analyser.getByteTimeDomainData(timeData);
            canvasCtx.strokeStyle = 'rgb(0, 255, 0)';
            canvasCtx.beginPath();
            
            for (let i = 0; i < bufferLength; i += 2) {
                const x = (timeData[i] / 255.0) * width;
                const y = (timeData[i + 1] / 255.0) * height;
                
                if (i === 0) {
                    canvasCtx.moveTo(x, y);
                } else {
                    canvasCtx.lineTo(x, y);
                }
            }
            canvasCtx.stroke();
        } else {
            // Normal waveform
            analyser.getByteTimeDomainData(timeData);
            canvasCtx.strokeStyle = 'rgb(0, 255, 0)';
            canvasCtx.beginPath();
            const sliceWidth = width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = timeData[i] / 128.0;
                // Inverted Y coordinate
                const y = height - (v * height / 2); // Added height- to invert
                
                if (i === 0) {
                    canvasCtx.moveTo(x, y);
                } else {
                    canvasCtx.lineTo(x, y);
                }
                x += sliceWidth;
            }
            canvasCtx.stroke();
        }

        // Debug info
        if (debugMode) {
            debugFrameCount++;
            if (debugFrameCount % 30 === 0) { // Update every 30 frames
                const debugInfo = {
                    'Frame Count': debugFrameCount,
                    'Sample Time': sampleTime,
                    'Sample Rate': currentSampleRate,
                    'Buffer Size': bufferLength,
                    'Mode': currentMode,
                    'Audio Context State': audioCtx.state,
                    'Current Volume': currentVolume,
                    'FFT Enabled': fftEnabled,
                    'XY Mode': xyEnabled,
                    'Peak Level': Math.max(...timeData) / 255
                };
                
                document.querySelector('#debug-display pre').textContent = 
                    JSON.stringify(debugInfo, null, 2);
            }
        }
    }

    draw();
}

function bytebeat(t, formula) {
    try {
        const fn = new Function("t", `return ${formula};`);
        return fn(t) & 255;
    } catch (e) {
        console.error("Formula error:", e);
        return 128; // Return middle value instead of 0 to reduce audio popping
    }
}

function floatbeat(t, formula) {
    try {
        const fn = new Function("t", `return ${formula};`);
        const result = fn(t);
        return Math.max(-1, Math.min(1, result));
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
    
    // Only update every 100ms instead of every frame
    if (!updateCounters.lastUpdate || Date.now() - updateCounters.lastUpdate > 100) {
        const seconds = sampleTime / currentSampleRate;
        const codeSize = new Blob([editor.getValue()]).size;
        
        document.getElementById('counter-display').innerHTML = `
            Time: ${seconds.toFixed(2)}s<br>
            Samples: ${Math.floor(sampleTime)}<br>
            Code Size: ${formatBytes(codeSize)}
        `;
        
        updateCounters.lastUpdate = Date.now();
    }
    
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
    
    resumeAudioContext();
    
    if (isPlaying) {
        processor.disconnect();
    }

    const sampleRateRatio = currentSampleRate / audioCtx.sampleRate;
    sampleTime = 0;
    currentMode = document.getElementById('mode-select').value;

    // Create function from formula with error handling
    let fn;
    try {
        fn = new Function("t", `return ${formula};`);
    } catch (e) {
        console.error("Invalid formula:", e);
        // Don't return - continue with a default function that produces silence
        fn = (t) => currentMode === 'byte' ? 128 : 0;
    }

    let lastValidOutput = 0; // Keep track of last valid output to prevent clicks

    // Optimized audio processing
    processor.onaudioprocess = (e) => {
        const output = e.outputBuffer.getChannelData(0);
        const t_start = Math.floor(sampleTime);
        
        // Process in chunks for better performance
        const chunkSize = 128;
        for (let i = 0; i < output.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, output.length);
            
            if (currentMode === 'byte') {
                for (let j = i; j < end; j++) {
                    try {
                        const value = fn(t_start + Math.floor(j * sampleRateRatio));
                        output[j] = isNaN(value) || !isFinite(value) 
                            ? lastValidOutput 
                            : ((value & 255) - 128) / 128.0;
                        lastValidOutput = output[j];
                    } catch (err) {
                        output[j] = lastValidOutput;
                    }
                }
            } else {
                for (let j = i; j < end; j++) {
                    try {
                        const value = fn(t_start + Math.floor(j * sampleRateRatio));
                        output[j] = isNaN(value) || !isFinite(value)
                            ? lastValidOutput
                            : Math.max(-1, Math.min(1, value));
                        lastValidOutput = output[j];
                    } catch (err) {
                        output[j] = lastValidOutput;
                    }
                }
            }
        }
        sampleTime += output.length * sampleRateRatio;
    };

    processor.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    isPlaying = true;
    drawWaveform();
    updateCounters();
}

function stopAudio() {
    if (processor) {
        processor.disconnect();
        if (gainNode) {
            gainNode.disconnect();
        }
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
        
        button.innerHTML = `
            <div class="preset-info">
                <div class="preset-name">${preset.name}</div>
                <div class="preset-details">
                    <span>By: ${preset.author || 'Anonymous'}</span>
                    <span>Date: ${preset.date || 'Unknown'}</span>
                    <span>Sample Rate: ${preset.sampleRate || '44100'}Hz</span>
                    <span>Mode: ${preset.mode || 'byte'}</span>
                </div>
            </div>
        `;
        
        button.addEventListener('click', () => {
            editor.setValue(preset.code, -1);
            
            // Update sample rate from preset
            const sampleRateInput = document.getElementById('sample-rate');
            sampleRateInput.value = preset.sampleRate || '44100';
            currentSampleRate = parseInt(preset.sampleRate || '44100');
            
            // Update mode from preset
            const modeSelect = document.getElementById('mode-select');
            modeSelect.value = preset.mode || 'byte';
            currentMode = preset.mode || 'byte';
            
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
            resumeAudioContext(); // Keep audio playing when tab is not visible
        } else {
            resumeAudioContext(); // Also resume when returning to tab
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
    
    volumeSlider.addEventListener('input', (e) => {
        currentVolume = parseFloat(e.target.value);
        if (gainNode) {
            gainNode.gain.value = currentVolume;
        }
    });

    // Add visualization and debug controls
    const fftCheckbox = document.getElementById('fft-viz');
    const xyCheckbox = document.getElementById('xy-viz');
    const debugCheckbox = document.getElementById('debug-mode');
    const debugDisplay = document.getElementById('debug-display');

    fftCheckbox.addEventListener('change', (e) => {
        fftEnabled = e.target.checked;
        if (fftEnabled) xyCheckbox.checked = false;
        xyEnabled = false;
    });

    xyCheckbox.addEventListener('change', (e) => {
        xyEnabled = e.target.checked;
        const canvas = document.getElementById('waveform');
        
        if (xyEnabled) {
            fftCheckbox.checked = false;
            fftEnabled = false;
            canvas.classList.add('xy-mode');
        } else {
            canvas.classList.remove('xy-mode');
        }
    });

    debugCheckbox.addEventListener('change', (e) => {
        debugMode = e.target.checked;
        debugDisplay.style.display = debugMode ? 'block' : 'none';
    });

    loadPresets();
});
