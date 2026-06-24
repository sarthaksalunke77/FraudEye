// FraudEye - Application Logic

let scanCount = 0;
let currentScanData = null;
let videoStream = null;
let animationFrameId = null;
let gaugeChart = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    updateTime();
    setInterval(updateTime, 1000);

    // Splash screen animation
    const splashProgress = document.getElementById('splashProgress');
    setTimeout(() => {
        splashProgress.style.width = '100%';
    }, 100);

    setTimeout(() => {
        hideScreen('splashScreen');
        showScreen('homeScreen');
        loadHistory();
    }, 3200);
});

function updateTime() {
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ':' +
        now.getMinutes().toString().padStart(2, '0');
    document.getElementById('currentTime').innerText = timeStr;
}

// Screen Management
function showScreen(screenId) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => {
        if (s.id === screenId) {
            s.classList.remove('hidden');
            setTimeout(() => {
                s.classList.remove('screen-exit');
                s.classList.add('screen-enter');
            }, 10);
        }
    });

    if (screenId === 'homeScreen') {
        document.getElementById('bottomNav').classList.remove('hidden');
        setActiveNav('navHome');
    } else if (screenId === 'historyScreen') {
        document.getElementById('bottomNav').classList.remove('hidden');
        setActiveNav('navHistory');
    } else {
        document.getElementById('bottomNav').classList.add('hidden');
    }
}

function hideScreen(screenId) {
    const screen = document.getElementById(screenId);
    screen.classList.add('screen-exit');
    screen.classList.remove('screen-enter');
    setTimeout(() => {
        screen.classList.add('hidden');
    }, 400);
}

function goHome() {
    stopCamera();
    const activeScreens = document.querySelectorAll('.screen:not(.hidden)');
    activeScreens.forEach(s => hideScreen(s.id));
    showScreen('homeScreen');
}

function setActiveNav(id) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if (document.getElementById(id)) {
        document.getElementById(id).classList.add('active');
    }
}

// Camera Scanning Logic
async function openCamera() {
    hideScreen('homeScreen');
    showScreen('cameraScreen');

    const video = document.getElementById('qrVideo');
    const canvasElement = document.getElementById('qrCanvas');
    const canvas = canvasElement.getContext('2d', { willReadFrequently: true });

    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = videoStream;
        video.setAttribute("playsinline", true);
        video.play();

        requestAnimationFrame(tick);
    } catch (err) {
        console.error("Camera access denied", err);
        alert("Camera access is required for scanning. Please enable it in your browser settings.");
        goHome();
    }

    function tick() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvasElement.hidden = false;
            canvasElement.height = video.videoHeight;
            canvasElement.width = video.videoWidth;
            canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);

            const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });

            if (code) {
                console.log("Found QR code", code.data);
                stopCamera();
                startAnalysis(code.data);
                return;
            }
        }
        animationFrameId = requestAnimationFrame(tick);
    }
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

// File Upload Logic
function triggerFileInput() {
    document.getElementById('qrFileInput').click();
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code) {
                startAnalysis(code.data);
            } else {
                alert("No QR code found in this image.");
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Analysis Engine
function startAnalysis(url) {
    hideScreen('cameraScreen');
    hideScreen('homeScreen');
    showScreen('analysisScreen');

    // Check if it's a payment URL
    if (url.startsWith('upi://')) {
        setTimeout(() => startPaymentAnalysis(url), 500);
        return;
    }

    document.getElementById('analysisUrl').innerText = url;

    const steps = ['domain', 'ssl', 'behavior', 'score'];
    const progress = document.getElementById('analysisProgress');

    // Reset steps
    steps.forEach(s => {
        const el = document.getElementById(`step-${s}`);
        el.classList.remove('active', 'done');
        el.querySelector('i.fa-check').classList.add('hidden');
    });
    progress.style.width = '0%';

    let currentStepIndex = 0;

    const runStep = () => {
        if (currentStepIndex >= steps.length) {
            setTimeout(() => finalizeAnalysis(url), 1000);
            return;
        }

        const stepId = steps[currentStepIndex];
        const el = document.getElementById(`step-${stepId}`);
        el.classList.add('active');

        const stepDuration = 1000 + Math.random() * 800;

        setTimeout(() => {
            el.classList.remove('active');
            el.classList.add('done');
            el.querySelector('i.fa-check').classList.remove('hidden');
            progress.style.width = `${((currentStepIndex + 1) / steps.length) * 100}%`;

            currentStepIndex++;
            runStep();
        }, stepDuration);
    };

    runStep();
}

function finalizeAnalysis(url) {
    const result = analyzeUrl(url);
    currentScanData = result;

    hideScreen('analysisScreen');
    showScreen('verdictScreen');

    // Update Verdict UI
    const popup = document.querySelector('.verdict-popup');
    popup.style.transform = 'translateY(0)';

    const iconContainer = document.getElementById('verdictIconContainer');
    const icon = document.getElementById('verdictIcon');
    const statusText = document.getElementById('verdictStatusText');
    const riskLabel = document.getElementById('verdictRiskLabel');
    const scoreDisplay = document.getElementById('verdictScore');

    document.getElementById('verdictUrl').innerText = url;
    scoreDisplay.innerText = `${result.score}%`;

    // Visual presentation based on risk
    if (result.risk === 'SAFE') {
        iconContainer.className = 'w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center text-3xl bg-green-500/20 text-green-500';
        icon.className = 'fas fa-shield-check';
        statusText.innerText = 'Website Verified';
        riskLabel.innerText = 'LOW RISK';
        riskLabel.className = 'text-xl font-bold text-green-500';
    } else if (result.risk === 'WARNING') {
        iconContainer.className = 'w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center text-3xl bg-yellow-500/20 text-yellow-500';
        icon.className = 'fas fa-exclamation-triangle';
        statusText.innerText = 'Suspicious Site';
        riskLabel.innerText = 'MODERATE';
        riskLabel.className = 'text-xl font-bold text-yellow-500';
    } else {
        iconContainer.className = 'w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center text-3xl bg-red-500/20 text-red-500';
        icon.className = 'fas fa-skull-crossbones';
        statusText.innerText = 'Scam Detected';
        statusText.className = 'text-2xl font-bold mb-2 text-red-500';
        riskLabel.innerText = 'HIGH RISK';
        riskLabel.className = 'text-xl font-bold text-red-500';
    }

    addToHistory(result);
}

function analyzeUrl(url) {
    let score = 95;
    const reasons = [];
    const lowerUrl = url.toLowerCase();

    // Domain Check
    const suspiciousKeywords = ['paypal', 'bank', 'login', 'verify', 'account', 'secure', 'update', 'signin', 'walmart', 'amazon', 'crypto'];
    let foundKeywords = suspiciousKeywords.filter(k => lowerUrl.includes(k));

    if (foundKeywords.length > 0) {
        score -= foundKeywords.length * 15;
        reasons.push({ icon: 'fa-search', text: `Suspicious keywords: ${foundKeywords.join(', ')}`, severity: 'high' });
    }

    // SSL Check
    const isHttps = url.startsWith('https://');
    if (!isHttps) {
        score -= 25;
        reasons.push({ icon: 'fa-unlock', text: 'Insecure connection (No HTTPS)', severity: 'high' });
    }

    // Shortener Check
    const shorteners = ['bit.ly', 't.co', 'tinyurl', 'clck.ru', 'cutt.ly', 'is.gd'];
    const isShortened = shorteners.some(s => lowerUrl.includes(s));
    if (isShortened) {
        score -= 20;
        reasons.push({ icon: 'fa-random', text: 'URL masking detected via shortener', severity: 'medium' });
    }

    // Domain Reputations (Whitelisting for demo)
    const reputable = ['google.com', 'apple.com', 'microsoft.com', 'github.com', 'linkedin.com', 'facebook.com'];
    const isReputable = reputable.some(s => lowerUrl.includes(s));
    if (isReputable) {
        score = Math.min(100, score + 20);
    }

    // Faked Metadata
    const age = isReputable ? (5 + Math.random() * 15).toFixed(1) : (Math.random() * 3).toFixed(1);
    if (parseFloat(age) < 0.5 && !isReputable) {
        score -= 15;
        reasons.push({ icon: 'fa-clock', text: 'Very new domain registration', severity: 'medium' });
    }

    score = Math.max(0, Math.min(100, score));

    let risk = 'SAFE';
    if (score < 40) risk = 'SCAM';
    else if (score < 75) risk = 'WARNING';

    if (reasons.length === 0) {
        reasons.push({ icon: 'fa-check-circle', text: 'Domain age is verified (> 4 years)', severity: 'low' });
        reasons.push({ icon: 'fa-lock', text: 'Valid SSL encryption standard', severity: 'low' });
        reasons.push({ icon: 'fa-user-check', text: 'No phishing behavior detected', severity: 'low' });
    }

    return {
        url,
        score,
        risk,
        reasons,
        age: `${age} Years`,
        ssl: isHttps ? 'TLS 1.3 Certified' : 'None / Self-signed',
        redirects: isShortened ? 'Shortened URL' : 'Direct Link',
        timestamp: new Date().toISOString()
    };
}

// Intelligence Screen
function showIntelligence() {
    const result = currentScanData;
    if (!result) return;

    hideScreen('verdictScreen');
    showScreen('intelScreen');

    document.getElementById('intelScoreLabel').innerText = `${result.score}%`;
    document.getElementById('intelDomainAge').innerText = result.age;
    document.getElementById('intelSsl').innerText = result.ssl;
    document.getElementById('intelSsl').className = `text-sm font-bold ${result.ssl.includes('None') ? 'text-red-400' : 'text-green-400'}`;
    document.getElementById('intelRedirects').innerText = result.redirects;
    document.getElementById('intelKeywords').innerText = result.reasons.filter(r => r.text.includes('keywords')).length ? 'Multiple' : 'None detected';

    const reasonsList = document.getElementById('intelReasons');
    reasonsList.innerHTML = '';
    result.reasons.forEach(r => {
        const li = document.createElement('li');
        li.className = 'flex items-center gap-3 text-xs';
        const iconColor = r.severity === 'high' ? 'text-red-400' : (r.severity === 'medium' ? 'text-yellow-400' : 'text-green-400');
        li.innerHTML = `<i class="fas ${r.icon} ${iconColor} w-4 shrink-0"></i> <span class="text-gray-300 font-medium">${r.text}</span>`;
        reasonsList.appendChild(li);
    });

    renderGauge(result.score);
}

function renderGauge(score) {
    const ctx = document.getElementById('gaugeChart').getContext('2d');

    if (gaugeChart) {
        gaugeChart.destroy();
    }

    const color = score > 75 ? '#22c55e' : (score > 40 ? '#eab308' : '#ef4444');

    gaugeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [score, 100 - score],
                backgroundColor: [color, 'rgba(255,255,255,0.05)'],
                borderWidth: 0,
                circumference: 180,
                rotation: 270,
                cutout: '85%',
                borderRadius: 20
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: { tooltip: { enabled: false }, legend: { display: false } }
        }
    });
}

function backToVerdict() {
    hideScreen('intelScreen');
    showScreen('verdictScreen');
}

// Iframe / Action logic
function renderIframe() {
    const result = currentScanData;
    if (result.risk === 'SCAM') {
        hideScreen('verdictScreen');
        showScreen('blockedScreen');
        return;
    }

    hideScreen('verdictScreen');
    showScreen('previewScreen');
    document.getElementById('previewUrlLabel').innerText = result.url;
}

// History logic
function loadHistory() {
    const history = JSON.parse(localStorage.getItem('fraudEyeHistory') || '[]');
    const list = document.getElementById('historyList');
    const scanDisplay = document.getElementById('scanCountDisplay');

    scanCount = history.length;
    scanDisplay.innerText = scanCount;

    if (history.length === 0) {
        list.innerHTML = `
            <div class="text-center py-20 opacity-20">
                <i class="fas fa-box-open text-6xl mb-4"></i>
                <p>No history yet</p>
            </div>
        `;
        return;
    }

    list.innerHTML = '';
    history.reverse().forEach(item => {
        const div = document.createElement('div');
        div.className = 'glass-card p-4 flex justify-between items-center';

        const riskColor = item.risk === 'SAFE' ? 'text-green-500' : (item.risk === 'WARNING' ? 'text-yellow-500' : 'text-red-500');
        const riskIcon = item.risk === 'SAFE' ? 'fa-shield-check' : (item.risk === 'WARNING' ? 'fa-exclamation-triangle' : 'fa-skull-crossbones');

        const date = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        div.innerHTML = `
            <div class="flex items-center gap-4 overflow-hidden">
                <div class="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center shrink-0">
                    <i class="fas ${riskIcon} ${riskColor}"></i>
                </div>
                <div class="overflow-hidden">
                    <h4 class="text-sm font-bold text-white truncate w-40">${item.url.replace(/(^\w+:|^)\/\//, '')}</h4>
                    <p class="text-[10px] text-gray-500">${date} • Score: ${item.score}%</p>
                </div>
            </div>
            <div class="text-right">
                <span class="text-[10px] font-black tracking-widest ${riskColor}">${item.risk}</span>
            </div>
        `;
        list.appendChild(div);
    });
}

function addToHistory(item) {
    const history = JSON.parse(localStorage.getItem('fraudEyeHistory') || '[]');
    history.push(item);
    localStorage.setItem('fraudEyeHistory', JSON.stringify(history));
    loadHistory();
}

function showDashboard() {
    const activeScreens = document.querySelectorAll('.screen:not(.hidden)');
    activeScreens.forEach(s => hideScreen(s.id));
    showScreen('historyScreen');
}

function showArchitecture() {
    hideScreen('homeScreen');
    showScreen('archScreen');
}

// Payment Logic Extensions
function startPaymentAnalysis(url) {
    const upiData = parseUpiUrl(url);

    // Update Analysis UI for Payment
    document.getElementById('analysisUrl').innerText = "UPI Protocol Detected";
    document.getElementById('analysisIcon').className = "fas fa-money-check-dollar text-4xl text-indigo-400 animate-pulse";

    const steps = ['domain', 'ssl', 'behavior', 'score'];
    const stepLabels = {
        'domain': 'Handshaking VPA...',
        'ssl': 'Encrypting Channel...',
        'behavior': 'Verifying Merchant...',
        'score': 'Safety Check Complete'
    };

    steps.forEach(s => {
        const el = document.getElementById(`step-${s}`);
        el.querySelector('span').innerText = stepLabels[s];
    });

    // Run custom payment progress
    let currentStepIndex = 0;
    const progress = document.getElementById('analysisProgress');

    const runStep = () => {
        if (currentStepIndex >= steps.length) {
            setTimeout(() => finalizePaymentAnalysis(upiData, url), 1000);
            return;
        }

        const stepId = steps[currentStepIndex];
        const el = document.getElementById(`step-${stepId}`);
        el.classList.add('active');

        setTimeout(() => {
            el.classList.remove('active');
            el.classList.add('done');
            el.querySelector('i.fa-check').classList.remove('hidden');
            progress.style.width = `${((currentStepIndex + 1) / steps.length) * 100}%`;
            currentStepIndex++;
            runStep();
        }, 800);
    };

    runStep();
}

function parseUpiUrl(url) {
    const params = new URLSearchParams(url.split('?')[1]);
    return {
        pa: params.get('pa') || 'unknown@upi',
        pn: decodeURIComponent(params.get('pn') || 'Unknown Receiver'),
        am: params.get('am') || '0',
        cu: params.get('cu') || 'INR'
    };
}

function finalizePaymentAnalysis(data, url) {
    hideScreen('analysisScreen');
    showScreen('paymentScreen');

    document.getElementById('payeeName').innerText = data.pn;
    document.getElementById('payeeVPA').innerText = data.pa;

    const badge = document.getElementById('payeeRiskBadge');
    const appSource = document.getElementById('payeeApp');

    // Simulate App Detection
    const apps = [
        { name: 'PhonePe', icon: 'fa-phone-flip text-purple-500' },
        { name: 'Google Pay', icon: 'fa-google text-blue-500' },
        { name: 'Paytm', icon: 'fa-wallet text-cyan-500' },
        { name: 'BHIM', icon: 'fa-building-columns text-orange-500' }
    ];
    const randomApp = apps[Math.floor(Math.random() * apps.length)];
    appSource.innerHTML = `<i class="fab ${randomApp.icon}"></i> <span class="text-xs font-bold">${randomApp.name}</span>`;

    // Risk Logic for Payment
    const isSuspicious = data.pa.includes('fraud') || data.pn.includes('Unverified');

    if (isSuspicious) {
        badge.className = "flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black tracking-widest bg-red-500/20 text-red-500 border border-red-500/20";
        badge.innerHTML = `<i class="fas fa-exclamation-circle"></i> HIGH RISK: UNVERIFIED MERCHANT`;
    } else {
        badge.className = "flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black tracking-widest bg-green-500/20 text-green-500 border border-green-500/20";
        badge.innerHTML = `<i class="fas fa-check-circle"></i> VERIFIED BUSINESS`;
    }

    addToHistory({
        url: `Payment: ${data.pn}`,
        score: isSuspicious ? 35 : 98,
        risk: isSuspicious ? 'SCAM' : 'SAFE',
        timestamp: new Date().toISOString()
    });
}
