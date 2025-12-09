// Global State
function safeParse(key, fallback) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : fallback;
    } catch (e) {
        console.error(`Error parsing ${key} from localStorage`, e);
        return fallback;
    }
}

let currentMode = 'forex';
let journalData = safeParse('tradingJournal', []);
let strategies = safeParse('tradingStrategies', getDefaultStrategies());
let tradingSettings = safeParse('tradingSettings', {
    dailyLossLimit: 0,
    maxTradesPerDay: 0,
    theme: 'dark'
});
let filteredData = [...journalData];
let cumulativeChart = null;
let dayOfWeekChart = null;
let emotionChart = null;
let strategyChart = null;
let drawdownChart = null;
let streakChart = null;
let currentCalculation = null;
let currentDateFilter = 'all';
let checklistVisible = false;
let miniPnLChart = null;
let miniDistributionChart = null;
let currentEditTradeId = null;
let geminiApiKey = localStorage.getItem('geminiApiKey') || '';

// Default Strategies Template
function getDefaultStrategies() {
    return [
        {
            id: 1,
            name: 'Stochastic Divergence',
            description: 'Divergence stochastic dengan konfirmasi candlestick pattern',
            openChecklist: [
                'Stochastic di zona overbought/oversold',
                'Divergence terlihat jelas (minimal 2 swing)',
                'Candlestick pattern konfirmasi (engulfing/pinbar)',
                'Volume meningkat',
                'Support/Resistance level jelas'
            ],
            slTpChecklist: [
                'SL di atas/bawah swing high/low terakhir',
                'TP minimal 1:2 Risk:Reward',
                'TP di level resistance/support berikutnya'
            ],
            indicatorChecklist: [
                'EMA 20 & 50 alignment',
                'RSI konfirmasi (oversold/overbought)',
                'MACD histogram mulai berubah arah'
            ],
            trades: 0,
            wins: 0,
            totalPnL: 0
        },
        {
            id: 2,
            name: 'EMA Crossover + Support/Resistance',
            description: 'EMA 20/50 crossover dengan konfirmasi SR level',
            openChecklist: [
                'EMA 20 cross EMA 50',
                'Harga di level support/resistance',
                'Candle rejection di SR level',
                'Volume confirmation'
            ],
            slTpChecklist: [
                'SL 10-20 pips dari SR level',
                'TP di SR level berikutnya',
                'Trailing stop setelah 1:1 RR'
            ],
            indicatorChecklist: [
                'Bollinger Bands tidak terlalu lebar',
                'ADX > 25 (trending)',
                'Stochastic konfirmasi arah'
            ]
        }
    ];
}

// Initialize
function init() {
    document.querySelectorAll('.tab-btn, .nav-item').forEach(btn => {
        const tabName = btn.getAttribute('data-tab');
        if (tabName) btn.dataset.tab = tabName;
    });

    calculate();
    renderStrategies();
    filterJournal();
    updateStrategyFilter();
    updateCalculatorStrategyDropdown();
    renderDashboard();
    renderDashboard();
    initGreeting(); // Initialize Greeting
    initPreMarketChecklist(); // Initialize Pre-Market Checklist
    initAICoach(); // Initialize AI Coach
    initTooltips(); // Initialize Tooltips
    initKeyboardShortcuts();
}

// Global Quotes
const tradingQuotes = [
    "Plan the trade, trade the plan.",
    "Cut your losses early and let your profits run.",
    "The trend is your friend until the end.",
    "Risk comes from not knowing what you're doing. - Warren Buffett",
    "It's not whether you're right or wrong, it's how much you make when you're right and how much you lose when you're wrong. - George Soros",
    "Trading is a waiting game. You sit, you wait, and you make a lot of money waiting.",
    "Do not anticipate and move without market confirmation - being a little late in your trade is your insurance that you are right or wrong.",
    "Amateurs think about how much money they can make. Professionals think about how much money they can lose."
];

function initGreeting() {
    const hours = new Date().getHours();
    let greeting = 'Selamat Pagi';
    if (hours >= 12) greeting = 'Selamat Siang';
    if (hours >= 15) greeting = 'Selamat Sore';
    if (hours >= 19) greeting = 'Selamat Malam';

    const quote = tradingQuotes[Math.floor(Math.random() * tradingQuotes.length)];

    // Check if element exists, if not inject it
    let greetingCard = document.getElementById('dashboardGreeting');
    if (!greetingCard) {
        const dashboard = document.getElementById('dashboard');
        greetingCard = document.createElement('div');
        greetingCard.id = 'dashboardGreeting';
        greetingCard.className = 'card greeting-card';
        greetingCard.style.marginBottom = '1.5rem';
        greetingCard.style.background = 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)';
        greetingCard.style.borderLeft = '4px solid var(--accent-primary)';
        dashboard.insertBefore(greetingCard, dashboard.firstChild);
    }

    greetingCard.innerHTML = `
        <h2 style="font-size: 1.5rem; margin-bottom: 0.5rem;">${greeting}, Trader! 👋</h2>
        <p style="color: var(--text-muted); font-style: italic;">"${quote}"</p>
    `;
}

// Settings Management
function openSettingsModal() {
    document.getElementById('settingsModal').classList.add('active');
    document.getElementById('settingsDailyLossLimit').value = tradingSettings.dailyLossLimit || 0;
    document.getElementById('settingsMaxTrades').value = tradingSettings.maxTradesPerDay || 0;
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.remove('active');
}

function saveSettings() {
    tradingSettings.dailyLossLimit = parseFloat(document.getElementById('settingsDailyLossLimit').value) || 0;
    tradingSettings.maxTradesPerDay = parseInt(document.getElementById('settingsMaxTrades').value) || 0;

    localStorage.setItem('tradingSettings', JSON.stringify(tradingSettings));
    closeSettingsModal();
    showToast('✅ Settings saved successfully!');

    // Refresh dashboard if visible
    if (document.getElementById('dashboard').classList.contains('active')) {
        renderDashboard();
    }
}

// Daily P&L Tracking
function getDailyPnL() {
    const today = new Date().toDateString();
    const todayTrades = journalData.filter(trade => {
        if (trade.result === 'PENDING') return false;
        const tradeDate = new Date(trade.date).toDateString();
        return tradeDate === today;
    });

    return todayTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
}

function getDailyDrawdown() {
    const todayTrades = journalData.filter(trade => {
        if (trade.result === 'PENDING') return false;
        return new Date(trade.date).toDateString() === new Date().toDateString();
    });

    if (todayTrades.length === 0) return 0;

    // Simulate equity curve for today
    let currentPnL = 0;
    let peakPnL = 0;
    let maxDrawdown = 0;

    // Sort by time/date ensures correct order
    todayTrades.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(t => {
        currentPnL += t.pnl;
        if (currentPnL > peakPnL) peakPnL = currentPnL;
        const dd = peakPnL - currentPnL;
        if (dd > maxDrawdown) maxDrawdown = dd;
    });

    return maxDrawdown;
}

function getTodayTradeCount() {
    const today = new Date().toDateString();
    return journalData.filter(trade => {
        const tradeDate = new Date(trade.date).toDateString();
        return tradeDate === today;
    }).length;
}

function checkDailyLimit() {
    if (tradingSettings.dailyLossLimit <= 0) return { allowed: true, percentage: 0 };

    const dailyPnL = getDailyPnL();
    const loss = Math.abs(Math.min(0, dailyPnL)); // Only count losses
    const percentage = (loss / tradingSettings.dailyLossLimit) * 100;

    return {
        allowed: percentage < 100,
        percentage: percentage,
        loss: loss,
        limit: tradingSettings.dailyLossLimit,
        warning: percentage >= 80 && percentage < 100
    };
}

function checkTradeLimit() {
    if (tradingSettings.maxTradesPerDay <= 0) return { allowed: true, count: 0 };

    const count = getTodayTradeCount();
    return {
        allowed: count < tradingSettings.maxTradesPerDay,
        count: count,
        limit: tradingSettings.maxTradesPerDay,
        warning: count >= tradingSettings.maxTradesPerDay - 1 && count < tradingSettings.maxTradesPerDay
    };
}

function showLimitWarning(type, data) {
    let message = '';
    if (type === 'loss') {
        message = `⚠️ Warning: You've lost $${data.loss.toFixed(2)} today (${data.percentage.toFixed(0)}% of your $${data.limit} daily limit).\n\nConsider stopping for today to protect your capital.`;
    } else if (type === 'trade') {
        message = `⚠️ Warning: This is trade #${data.count + 1} of your ${data.limit} daily limit.\n\nBe careful not to overtrade!`;
    }

    if (confirm(message + '\n\nDo you want to continue?')) {
        return true;
    }
    return false;
}

function showLimitBlocked(type, data) {
    let message = '';
    if (type === 'loss') {
        message = `🛑 Daily Loss Limit Reached!\n\nYou've lost $${data.loss.toFixed(2)} today, reaching your $${data.limit} limit.\n\nTrading is blocked for today. Come back tomorrow with a fresh mindset! 💪`;
    } else if (type === 'trade') {
        message = `🛑 Max Trades Limit Reached!\n\nYou've already made ${data.count} trades today (your limit is ${data.limit}).\n\nNo more trades today. Rest and review your performance! 📊`;
    }

    showToast(message);
}

// Theme Toggle
function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const btn = document.querySelector('.theme-toggle');
    const icon = btn.querySelector('i');
    if (icon) {
        icon.setAttribute('data-lucide', document.body.classList.contains('light-mode') ? 'sun' : 'moon');
        lucide.createIcons();
    }
    localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
    if (cumulativeChart && document.getElementById('cumulativeChart')) {
        updateCumulativeChart();
    }
    if (miniPnLChart || miniDistributionChart) {
        renderDashboard();
    }
}

// Load saved theme
if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-mode');
}

function resetAllData() {
    if (confirm('⚠️ PERINGATAN: Aksi ini akan menghapus SEMUA data jurnal, strategi, dan pengaturan Anda.\n\nApakah Anda yakin ingin melanjutkan?')) {
        if (confirm('⚠️ KONFIRMASI TERAKHIR: Data yang dihapus TIDAK BISA dikembalikan.\n\nHapus semua data?')) {
            localStorage.clear();
            alert('Semua data telah dihapus. Aplikasi akan dimuat ulang.');
            location.reload();
        }
    }
}

// Tab Switching
function switchTab(tabName) {
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const desktopBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (desktopBtn) desktopBtn.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const mobileItem = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
    if (mobileItem) mobileItem.classList.add('active');

    if (tabName === 'analytics') {
        setTimeout(() => updateAnalytics(), 100);
    }
}

// Mode Switching
function switchMode(mode, element) {
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    if (element) element.classList.add('active');

    document.getElementById('forexInputs').style.display = mode === 'forex' ? 'block' : 'none';
    document.getElementById('cryptoInputs').style.display = mode === 'crypto' ? 'block' : 'none';

    calculate();
}

// Calculator Strategy Dropdown
function updateCalculatorStrategyDropdown() {
    const select = document.getElementById('calculatorStrategy');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Tidak Menggunakan Strategi --</option>';
    strategies.forEach(s => {
        select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });

    // Restore previous selection if it still exists
    if (currentValue && strategies.find(s => s.id == currentValue)) {
        select.value = currentValue;
        showStrategyInfo();
    }
}

function showStrategyInfo() {
    const select = document.getElementById('calculatorStrategy');
    const strategyId = parseInt(select.value);
    const infoDiv = document.getElementById('strategyInfo');

    if (!strategyId || !infoDiv) {
        if (infoDiv) infoDiv.style.display = 'none';
        return;
    }

    const strategy = strategies.find(s => s.id === strategyId);
    if (strategy) {
        const sopEntry = strategy.sopEntry || (strategy.openChecklist ? strategy.openChecklist.join('\\n') : '');
        const sopExit = strategy.sopExit || (strategy.slTpChecklist ? strategy.slTpChecklist.join('\\n') : '');

        infoDiv.innerHTML = `
            <div style="margin-bottom: 0.75rem;">
                <strong style="color: var(--accent-primary); font-size: 1rem;">${strategy.name}</strong>
                <p style="margin: 0.25rem 0 0 0; color: var(--text-muted); font-size: 0.875rem;">${strategy.description || ''}</p>
            </div>
            ${sopEntry ? `
                <div style="margin-bottom: 0.75rem;">
                    <strong style="color: var(--success); font-size: 0.875rem;">📈 SOP Entry:</strong>
                    <p style="white-space: pre-wrap; margin: 0.25rem 0 0 0; font-size: 0.875rem; line-height: 1.5;">${sopEntry}</p>
                </div>
            ` : ''}
            ${sopExit ? `
                <div>
                    <strong style="color: var(--danger); font-size: 0.875rem;">📉 SOP Exit:</strong>
                    <p style="white-space: pre-wrap; margin: 0.25rem 0 0 0; font-size: 0.875rem; line-height: 1.5;">${sopExit}</p>
                </div>
            ` : ''}
        `;
        infoDiv.style.display = 'block';
    } else {
        infoDiv.style.display = 'none';
    }
}

// Utility: Debounce
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Calculator Logic (Internal)
function performCalculation() {
    const balance = parseFloat(document.getElementById('balance').value) || 0;
    const riskPercent = parseFloat(document.getElementById('riskPercent').value) || 0;

    let warning = '';
    if (balance <= 0) {
        warning = '<div class="alert alert-danger">⚠️ Warning: Saldo akun harus lebih dari 0!</div>';
    }

    const maxRisk = balance * (riskPercent / 100);
    let outputs = '';
    let calculation = {
        balance,
        riskPercent,
        maxRisk,
        mode: currentMode.toUpperCase()
    };

    if (currentMode === 'forex') {
        const entry = parseFloat(document.getElementById('entry').value) || 0;
        const sl = parseFloat(document.getElementById('sl').value) || 0;
        const tp = parseFloat(document.getElementById('tp').value) || 0;
        const pair = document.getElementById('pair').value;

        let pipMultiplier = pair.includes('JPY') ? 100 : 10000;
        const pips = Math.abs(entry - sl) * pipMultiplier;

        // Calculate dynamic pip value
        let pipValue = 10;
        if (pair.endsWith('USD')) {
            pipValue = 10;
        } else if (pair.startsWith('USD') && pair.includes('JPY')) {
            // For USD/JPY, Standard Lot (100k units) -> 1 pip (0.01) is 1000 JPY.
            // Convert 1000 JPY to USD: 1000 / USDJPY_ExchangeRate
            pipValue = 1000 / (entry || 1);
        } else if (pair.startsWith('USD')) {
            // For USD/CHF, USD/CAD etc.
            // Standard Lot -> 1 pip (0.0001) is 10 Counter Currency.
            // Convert to USD: 10 / Rate
            pipValue = 10 / (entry || 1);
        }

        const lotSize = maxRisk / (pips * pipValue);

        let direction = '';
        if (sl < entry) direction = 'LONG';
        else if (sl > entry) direction = 'SHORT';
        else warning += '<div class="alert alert-danger">⚠️ Warning: SL tidak boleh sama dengan Entry!</div>';

        const rrRatio = tp > 0 ? Math.abs(tp - entry) / Math.abs(entry - sl) : 0;

        calculation = {
            ...calculation,
            asset: pair,
            entry,
            sl,
            tp,
            direction,
            lotSize: lotSize.toFixed(2),
            pips: pips.toFixed(1),
            rrRatio: rrRatio.toFixed(2)
        };

        outputs = `
            <div class="output-card-hero">
                <div class="output-label">📊 LOT SIZE</div>
                <div class="output-value">${lotSize.toFixed(2)}</div>
                <div class="output-helper">👉 Enter this value in MT4/MT5</div>
            </div>
            <div class="output-card-important">
                <div class="output-label">🎯 Direction</div>
                <div class="output-value">${direction || '-'}</div>
            </div>
            <div class="output-card-important">
                <div class="output-label">⚖️ Risk:Reward</div>
                <div class="output-value">1:${rrRatio.toFixed(2)}</div>
            </div>
            <div class="output-card-info">
                <div class="output-label">💰 Risk Amount</div>
                <div class="output-value">$${maxRisk.toFixed(2)}</div>
            </div>
            <div class="output-card-info">
                <div class="output-label">📏 SL Distance (Pips)</div>
                <div class="output-value">${pips.toFixed(1)}</div>
            </div>
        `;
    } else {
        const entry = parseFloat(document.getElementById('entryCrypto').value) || 0;
        const sl = parseFloat(document.getElementById('slCrypto').value) || 0;
        const tp = parseFloat(document.getElementById('tpCrypto').value) || 0;
        const leverage = parseFloat(document.getElementById('leverage').value) || 1;

        const priceDiff = Math.abs(entry - sl);
        // Correct Formula: Risk / PriceDiff
        // Leverage only affects Margin, NOT the Position Size for Risk
        const quantity = maxRisk / priceDiff; const exposure = quantity * entry;
        const marginNeeded = exposure / leverage;
        const suggestedPercent = balance > 0 ? Math.min(((marginNeeded / balance) * 100), 100).toFixed(1) : 0;

        let direction = '';
        if (sl < entry) direction = 'LONG';
        else if (sl > entry) direction = 'SHORT';
        else warning += '<div class="alert alert-danger">⚠️ Warning: SL tidak boleh sama dengan Entry!</div>';

        const rrRatio = tp > 0 ? Math.abs(tp - entry) / Math.abs(entry - sl) : 0;

        calculation = {
            ...calculation,
            asset: document.getElementById('asset').value,
            entry,
            sl,
            tp,
            leverage,
            direction,
            quantity: quantity.toFixed(6),
            exposure: exposure.toFixed(2),
            marginNeeded: marginNeeded.toFixed(2),
            suggestedPercent,
            rrRatio: rrRatio.toFixed(2)
        };

        outputs = `
            <div class="output-card-hero">
                <div class="output-label">🪙 QUANTITY</div>
                <div class="output-value">${quantity.toFixed(6)}</div>
                <div class="output-helper">👉 Enter this in Binance/Exchange</div>
            </div>
            <div class="output-card-important">
                <div class="output-label">💵 Margin Needed</div>
                <div class="output-value">$${marginNeeded.toFixed(2)}</div>
            </div>
            <div class="output-card-important">
                <div class="output-label">📊 Margin % (Binance)</div>
                <div class="output-value">${suggestedPercent}%</div>
            </div>
            <div class="output-card-info">
                <div class="output-label">🎯 Direction</div>
                <div class="output-value">${direction || '-'}</div>
            </div>
            <div class="output-card-info">
                <div class="output-label">⚖️ Risk:Reward</div>
                <div class="output-value">1:${rrRatio.toFixed(2)}</div>
            </div>
            <div class="output-card-info">
                <div class="output-label">💰 Risk Amount</div>
                <div class="output-value">$${maxRisk.toFixed(2)}</div>
            </div>
        `;
    }


    document.getElementById('warningAlert').innerHTML = warning;
    document.getElementById('outputs').innerHTML = outputs;
    document.getElementById('warningAlert').innerHTML = warning;
    document.getElementById('outputs').innerHTML = outputs;
    currentCalculation = calculation;
}

// Global Calculate Function (Debounced)
const calculate = debounce(performCalculation, 300);

// Strategy Management
function renderStrategies() {
    const list = document.getElementById('strategyList');
    if (!list) return;

    list.innerHTML = '';
    strategies.forEach(strategy => {
        // Dynamic Calculation
        const strategyTrades = journalData.filter(t => t.strategyId == strategy.id && t.result !== 'PENDING');
        const tradesCount = strategyTrades.length;
        const wins = strategyTrades.filter(t => t.result === 'WIN' || t.result === 'TP HIT').length;
        const totalPnL = strategyTrades.reduce((sum, t) => sum + t.pnl, 0);
        const winRate = tradesCount > 0 ? ((wins / tradesCount) * 100).toFixed(1) : 0;

        const item = document.createElement('div');
        item.className = 'strategy-item';
        item.innerHTML = `
            <div class="strategy-header">
                <div class="strategy-name">${strategy.name}</div>
                <button class="btn btn-danger" onclick="deleteStrategy(${strategy.id})">Hapus</button>
            </div>
            <p style="font-size: 0.875rem; color: var(--text-muted); margin: 0.5rem 0;">${strategy.description}</p>
            <div class="strategy-stats">
                <span>📊 ${tradesCount} trades</span>
                <span>✅ ${winRate}% WR</span>
                <span>💰 $${totalPnL.toFixed(2)}</span>
            </div>
        `;
        list.appendChild(item);
    });
}

function openStrategyModal() {
    document.getElementById('strategyModal').classList.add('active');
    // Clear form fields
    document.getElementById('strategyName').value = '';
    document.getElementById('strategyDesc').value = '';
    document.getElementById('strategySopEntry').value = '';
    document.getElementById('strategySopExit').value = '';
}

function closeStrategyModal() {
    document.getElementById('strategyModal').classList.remove('active');
}

// Removed addChecklistItem - no longer needed with textarea input

function saveStrategy() {
    const name = document.getElementById('strategyName').value.trim();
    const desc = document.getElementById('strategyDesc').value.trim();
    const sopEntry = document.getElementById('strategySopEntry').value.trim();
    const sopExit = document.getElementById('strategySopExit').value.trim();

    if (!name) {
        showToast('Nama strategi harus diisi!');
        return;
    }

    // Parse textarea content into checklist arrays (each line becomes an item)
    const sopEntryList = sopEntry.split('\n').map(line => line.trim()).filter(line => line);
    const sopExitList = sopExit.split('\n').map(line => line.trim()).filter(line => line);

    const newStrategy = {
        id: Date.now(),
        name,
        description: desc,
        sopEntry: sopEntry,           // Store as text for display
        sopExit: sopExit,             // Store as text for display
        sopEntryList: sopEntryList,   // Store as array for checklist
        sopExitList: sopExitList,     // Store as array for checklist
        // Keep old format for backward compatibility
        openChecklist: sopEntryList,
        slTpChecklist: sopExitList,
        indicatorChecklist: []
    };

    strategies.push(newStrategy);
    localStorage.setItem('tradingStrategies', JSON.stringify(strategies));

    renderStrategies();
    updateStrategyFilter();
    updateCalculatorStrategyDropdown();
    closeStrategyModal();
    showToast('✅ Strategi berhasil disimpan!');
}

function deleteStrategy(id) {
    if (!confirm('Yakin hapus strategi ini?')) return;
    strategies = strategies.filter(s => s.id !== id);
    localStorage.setItem('tradingStrategies', JSON.stringify(strategies));
    renderStrategies();
    updateStrategyFilter();
    showToast('Strategi dihapus');
}

// Save to Journal
function openSaveModal() {
    if (!currentCalculation || !currentCalculation.entry || !currentCalculation.sl) {
        showToast('⚠️ Isi semua data kalkulator terlebih dahulu!');
        return;
    }
    if (currentCalculation.entry === currentCalculation.sl) {
        showToast('⚠️ Entry dan SL tidak boleh sama!');
        return;
    }

    const select = document.getElementById('selectedStrategy');
    select.innerHTML = '<option value="">-- Pilih Strategi --</option>';
    strategies.forEach(s => {
        select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });

    checklistVisible = false;
    document.getElementById('checklistContainer').style.display = 'none';
    document.getElementById('toggleChecklistBtn').textContent = '📋 Tampilkan Checklist SOP';

    document.getElementById('saveModal').classList.add('active');
}

function closeSaveModal() {
    document.getElementById('saveModal').classList.remove('active');
}

function toggleChecklistVisibility() {
    checklistVisible = !checklistVisible;
    const container = document.getElementById('checklistContainer');
    const btn = document.getElementById('toggleChecklistBtn');

    if (checklistVisible) {
        container.style.display = 'block';
        btn.textContent = '📋 Sembunyikan Checklist SOP';
        updateChecklist();
    } else {
        container.style.display = 'none';
        btn.textContent = '📋 Tampilkan Checklist SOP';
    }
}

function updateChecklist() {
    const strategyId = parseInt(document.getElementById('selectedStrategy').value);
    const strategy = strategies.find(s => s.id === strategyId);
    const container = document.getElementById('checklistContainer');

    if (!strategy) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Pilih strategi untuk melihat checklist</p>';
        return;
    }

    let html = '<h4 style="margin: 1rem 0 0.5rem; color: var(--text-secondary);">SOP Entry/Open Position</h4>';

    // Use sopEntryList if available (new format), otherwise use openChecklist (old format)
    const entryItems = strategy.sopEntryList || strategy.openChecklist || [];
    if (entryItems.length === 0 && strategy.sopEntry) {
        // Parse from text if arrays not available
        entryItems.push(...strategy.sopEntry.split('\\n').filter(l => l.trim()));
    }

    entryItems.forEach((item, i) => {
        html += `
            <div class="checklist-item">
                <input type="checkbox" class="checklist-checkbox" id="entry_${i}" onchange="toggleChecklist(this)">
                <label class="checklist-label" for="entry_${i}">${item}</label>
            </div>
        `;
    });

    html += '<h4 style="margin: 1rem 0 0.5rem; color: var(--text-secondary);">SOP Exit/TP-SL</h4>';

    // Use sopExitList if available (new format), otherwise use slTpChecklist (old format)
    const exitItems = strategy.sopExitList || strategy.slTpChecklist || [];
    if (exitItems.length === 0 && strategy.sopExit) {
        // Parse from text if arrays not available
        exitItems.push(...strategy.sopExit.split('\\n').filter(l => l.trim()));
    }

    exitItems.forEach((item, i) => {
        html += `
            <div class="checklist-item">
                <input type="checkbox" class="checklist-checkbox" id="exit_${i}" onchange="toggleChecklist(this)">
                <label class="checklist-label" for="exit_${i}">${item}</label>
            </div>
        `;
    });

    container.innerHTML = html;
}

function toggleChecklist(checkbox) {
    const item = checkbox.closest('.checklist-item');
    if (checkbox.checked) {
        item.classList.add('checked');
    } else {
        item.classList.remove('checked');
    }
}

function saveToJournal() {
    // Check trade count limit
    const tradeLimit = checkTradeLimit();
    if (!tradeLimit.allowed) {
        showLimitBlocked('trade', tradeLimit);
        return;
    }
    if (tradeLimit.warning) {
        if (!showLimitWarning('trade', tradeLimit)) {
            return;
        }
    }

    // Check daily loss limit
    const lossLimit = checkDailyLimit();
    if (!lossLimit.allowed) {
        showLimitBlocked('loss', lossLimit);
        return;
    }
    if (lossLimit.warning) {
        if (!showLimitWarning('loss', lossLimit)) {
            return;
        }
    }

    const strategyId = parseInt(document.getElementById('selectedStrategy').value);
    if (!strategyId) {
        showToast('⚠️ Pilih strategi terlebih dahulu!');
        return;
    }

    // Check checklist only if visible
    if (checklistVisible) {
        const allCheckboxes = document.querySelectorAll('#checklistContainer .checklist-checkbox');
        const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
        if (!allChecked) {
            if (!confirm('⚠️ Tidak semua checklist tercentang! Yakin lanjut simpan?')) {
                return;
            }
        }
    }

    const strategy = strategies.find(s => s.id === strategyId);
    const notes = document.getElementById('tradeNotes').value.trim();
    const emotion = document.getElementById('tradeEmotion')?.value || 'neutral';
    const positionSize = currentMode === 'forex' ? currentCalculation.lotSize : currentCalculation.quantity;

    const trade = {
        id: Date.now(),
        date: new Date().toISOString(),
        entryTime: new Date().toISOString(),
        exitTime: null,
        mode: currentCalculation.mode,
        asset: currentCalculation.asset,
        direction: currentCalculation.direction || '',
        entry: currentCalculation.entry,
        sl: currentCalculation.sl,
        tp: currentCalculation.tp || '',
        positionSize: positionSize || '-',
        leverage: currentCalculation.leverage || '-',
        risk: currentCalculation.maxRisk.toFixed(2),
        rrRatio: currentCalculation.rrRatio,
        strategyId: strategyId,
        strategyName: strategy.name,
        emotion: emotion,
        result: 'PENDING',
        pnl: 0,
        notes: notes,
        checklistComplete: checklistVisible ? Array.from(document.querySelectorAll('#checklistContainer .checklist-checkbox')).every(cb => cb.checked) : false
    };

    journalData.unshift(trade);
    localStorage.setItem('tradingJournal', JSON.stringify(journalData));

    closeSaveModal();
    showToast('✅ Trade disimpan ke jurnal!');
    switchTab('journal');
    filterJournal();
}

// Journal
function filterJournal() {
    const modeFilter = document.getElementById('filterMode').value;
    const resultFilter = document.getElementById('filterResult').value;
    const strategyFilter = document.getElementById('filterStrategy').value;
    const emotionFilter = document.getElementById('filterEmotion')?.value || 'all';

    filteredData = journalData.filter(trade => {
        const modeMatch = modeFilter === 'all' || trade.mode === modeFilter;
        const resultMatch = resultFilter === 'all' || trade.result === resultFilter;
        const strategyMatch = strategyFilter === 'all' || trade.strategyId == strategyFilter;
        const emotionMatch = emotionFilter === 'all' || trade.emotion === emotionFilter;
        return modeMatch && resultMatch && strategyMatch && emotionMatch;
    });

    renderJournal();
}

function renderJournal() {
    const list = document.getElementById('transactionList');
    list.innerHTML = '';

    if (filteredData.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">Belum ada data trading</p>';
        updateStats();
        return;
    }

    // Helper function to get emotion display
    const getEmotionDisplay = (emotion) => {
        const emotions = {
            'confident': '😎 Confident',
            'calm': '😌 Calm',
            'neutral': '😐 Neutral',
            'excited': '🤩 Excited',
            'anxious': '😰 Anxious',
            'fearful': '😨 Fearful',
            'frustrated': '😤 Frustrated',
            'greedy': '🤑 Greedy',
            'fomo': '😱 FOMO'
        };
        return emotions[emotion] || '😐 Neutral';
    };

    filteredData.forEach(trade => {
        const date = new Date(trade.date).toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Format entry and exit times
        const entryTime = trade.entryTime ? new Date(trade.entryTime).toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        }) : '-';

        const exitTime = trade.exitTime ? new Date(trade.exitTime).toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        }) : '-';

        const badgeClass = trade.result === 'WIN' ? 'badge-win' :
            trade.result === 'LOSS' ? 'badge-loss' :
                trade.result === 'TP HIT' ? 'badge-tp' :
                    trade.result === 'SL HIT' ? 'badge-sl' :
                        trade.result === 'BREAKEVEN' ? 'badge-breakeven' :
                            'badge-pending';

        const pnlClass = trade.pnl > 0 ? 'success' : trade.pnl < 0 ? 'danger' : '';

        // Direction badge
        const directionBadge = trade.direction ?
            `<span class="badge" style="background: ${trade.direction === 'LONG' ? '#10b981' : '#ef4444'}; margin-left: 0.5rem;">${trade.direction}</span>` : '';

        const item = document.createElement('div');
        item.className = 'transaction-item';
        item.innerHTML = `
            <div class="transaction-header">
                <div>
                    <span class="transaction-date">${date}</span>
                    ${directionBadge}
                </div>
                <span class="badge ${badgeClass}">${trade.result}</span>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin: 0.75rem 0; padding: 0.75rem; background: var(--bg-secondary); border-radius: 0.375rem;">
                <div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">⏰ Entry Time</div>
                    <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">${entryTime}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">🏁 Exit Time</div>
                    <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">${exitTime}</div>
                </div>
            </div>

            <div style="margin-bottom: 0.75rem;">
                <span style="display: inline-block; padding: 0.25rem 0.75rem; background: var(--bg-tertiary); border-radius: 0.375rem; font-size: 0.875rem;">
                    ${getEmotionDisplay(trade.emotion || 'neutral')}
                </span>
                <span style="display: inline-block; padding: 0.25rem 0.75rem; background: var(--bg-tertiary); border-radius: 0.375rem; font-size: 0.875rem; margin-left: 0.5rem;">
                    📊 ${trade.strategyName || 'N/A'}
                </span>
            </div>

            <div class="transaction-info">
                <div class="info-item">
                    <div class="info-label">Mode</div>
                    <div class="info-value">${trade.mode}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Asset</div>
                    <div class="info-value">${trade.asset}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Entry</div>
                    <div class="info-value">${trade.entry}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">SL</div>
                    <div class="info-value">${trade.sl}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">TP</div>
                    <div class="info-value">${trade.tp || 'N/A'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">RR Ratio</div>
                    <div class="info-value">1:${trade.rrRatio || 'N/A'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Risk</div>
                    <div class="info-value">$${trade.risk}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Position Size</div>
                    <div class="info-value">${trade.positionSize || 'N/A'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">P&L</div>
                    <div class="info-value" style="color: var(--${pnlClass}); font-weight: 700;">$${trade.pnl.toFixed(2)}</div>
                </div>
            </div>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                <select class="form-select" style="flex: 1;" onchange="updateResult(${trade.id}, this.value)">
                    <option value="PENDING" ${trade.result === 'PENDING' ? 'selected' : ''}>PENDING</option>
                    <option value="TP HIT" ${trade.result === 'TP HIT' ? 'selected' : ''}>TP HIT</option>
                    <option value="SL HIT" ${trade.result === 'SL HIT' ? 'selected' : ''}>SL HIT</option>
                    <option value="BREAKEVEN" ${trade.result === 'BREAKEVEN' ? 'selected' : ''}>BREAKEVEN</option>
                </select>
                <input type="number" class="form-input" style="width: 120px;" value="${trade.pnl}" onchange="updatePnL(${trade.id}, parseFloat(this.value))" step="0.01" placeholder="P&L">
                <button class="btn btn-danger" onclick="deleteTrade(${trade.id})">Hapus</button>
            </div>
            ${trade.notes ? `<p style="margin-top: 0.75rem; font-size: 0.875rem; color: var(--text-muted);">📝 ${trade.notes}</p>` : ''}
        `;
        list.appendChild(item);
    });

    updateStats();
}

function updateResult(id, result) {
    const trade = journalData.find(t => t.id === id);
    if (!trade) return;

    const oldResult = trade.result;
    trade.result = result;

    // Set exit time when trade is closed
    if (oldResult === 'PENDING' && result !== 'PENDING' && !trade.exitTime) {
        trade.exitTime = new Date().toISOString();
    }

    // Auto calculate P&L
    const riskAmount = parseFloat(trade.risk.replace(',', '')) || 0;
    const rrRatio = parseFloat(trade.rrRatio) || 2;

    if (result === 'TP HIT') {
        trade.pnl = riskAmount * rrRatio;
    } else if (result === 'SL HIT') {
        trade.pnl = -riskAmount;
    } else if (result === 'WIN') {
        trade.pnl = Math.abs(trade.pnl) || riskAmount * rrRatio;
    } else if (result === 'LOSS') {
        trade.pnl = -Math.abs(trade.pnl) || -riskAmount;
    } else if (result === 'BREAKEVEN') {
        trade.pnl = 0;
    } else {
        trade.pnl = 0;
    }

    localStorage.setItem('tradingJournal', JSON.stringify(journalData));
    filterJournal();
    renderStrategies(); // Will recalc stats dynamically
}


function updatePnL(id, pnl) {
    const trade = journalData.find(t => t.id === id);
    if (!trade) return;

    trade.pnl = pnl;

    localStorage.setItem('tradingJournal', JSON.stringify(journalData));
    filterJournal();
    renderStrategies(); // Will recalc stats dynamically
}

function deleteTrade(id) {
    if (!confirm('Yakin hapus trade ini?')) return;

    const trade = journalData.find(t => t.id === id);


    journalData = journalData.filter(t => t.id !== id);
    localStorage.setItem('tradingJournal', JSON.stringify(journalData));
    filterJournal();
    renderStrategies();
    showToast('Trade dihapus');
}

function updateStats() {
    const completedData = filteredData.filter(t => t.result !== 'PENDING');
    const totalTrades = completedData.length;
    const wins = completedData.filter(t => t.result === 'WIN' || t.result === 'TP HIT').length;
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : 0;
    const netPnL = filteredData.reduce((sum, t) => sum + t.pnl, 0);

    const avgRR = completedData.length > 0
        ? (completedData.reduce((sum, t) => sum + (parseFloat(t.rrRatio) || 0), 0) / completedData.length).toFixed(2)
        : 0;

    document.getElementById('totalTrades').textContent = totalTrades;
    document.getElementById('winRate').textContent = winRate + '%';
    document.getElementById('netPnL').textContent = '$' + netPnL.toFixed(2);
    document.getElementById('netPnL').style.color = netPnL >= 0 ? 'var(--success)' : 'var(--danger)';
    document.getElementById('avgRR').textContent = avgRR;
}

function updateStrategyFilter() {
    const select = document.getElementById('filterStrategy');
    const currentValue = select.value;
    select.innerHTML = '<option value="all">All Strategies</option>';
    strategies.forEach(s => {
        select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });
    select.value = currentValue;
}

// ========== ANALYTICS FUNCTIONS ==========

function updateAnalytics() {
    renderCumulativeChart();
    renderDayOfWeekChart();
    renderEmotionChart();
    renderStrategyChart();
    renderDrawdownChart();
    renderStreakChart();
}

// 1. Chart P&L Kumulatif
function renderCumulativeChart() {
    const ctx = document.getElementById('cumulativeChart');
    if (!ctx) return;

    if (cumulativeChart) cumulativeChart.destroy();

    // Filter Data Logic
    const filterVal = document.getElementById('dateFilter').value;
    let filtered = journalData.filter(t => t.result !== 'PENDING');

    const now = new Date();
    if (filterVal === '7d') {
        const d = new Date(); d.setDate(now.getDate() - 7);
        filtered = filtered.filter(t => new Date(t.date) >= d);
    } else if (filterVal === '30d') {
        const d = new Date(); d.setDate(now.getDate() - 30);
        filtered = filtered.filter(t => new Date(t.date) >= d);
    } else if (filterVal === 'year') {
        const d = new Date(now.getFullYear(), 0, 1);
        filtered = filtered.filter(t => new Date(t.date) >= d);
    }

    filtered.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Group by day
    const grouped = {};
    filtered.forEach(t => {
        const d = new Date(t.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        if (!grouped[d]) grouped[d] = 0;
        grouped[d] += t.pnl;
    });

    const labels = Object.keys(grouped);
    let acc = 0;
    const data = Object.values(grouped).map(val => {
        acc += val;
        return acc;
    });

    // Style
    const isLight = document.body.classList.contains('light-mode');
    const color = isLight ? '#0ea5e9' : '#22c55e';
    const gridColor = isLight ? 'rgba(148, 163, 184, 0.2)' : 'rgba(51, 65, 85, 0.2)';
    const textColor = isLight ? '#64748b' : '#cbd5e1';

    cumulativeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cumulative P&L',
                data: data,
                borderColor: color,
                backgroundColor: isLight ? 'rgba(14, 165, 233, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return 'Total P&L: $' + context.parsed.y.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: textColor, maxRotation: 45 }
                }
            }
        }
    });
}

// 2. Chart Win Rate by Day of Week
function renderDayOfWeekChart() {
    const ctx = document.getElementById('dayOfWeekChart');
    if (!ctx) return;
    if (dayOfWeekChart) dayOfWeekChart.destroy();

    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const stats = days.map(() => ({ wins: 0, total: 0 }));

    // Process Data
    journalData.forEach(t => {
        if (t.result === 'PENDING') return;
        const d = new Date(t.date).getDay(); // 0-6
        stats[d].total++;
        if (t.result === 'WIN' || t.result === 'TP HIT') stats[d].wins++;
    });

    const dataset = stats.map(s => s.total > 0 ? (s.wins / s.total) * 100 : 0);

    const isLight = document.body.classList.contains('light-mode');
    const color = isLight ? 'rgba(59, 130, 246, 0.8)' : 'rgba(99, 102, 241, 0.8)';
    const textColor = isLight ? '#64748b' : '#cbd5e1';

    dayOfWeekChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: days,
            datasets: [{
                label: 'Win Rate (%)',
                data: dataset,
                backgroundColor: color,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { color: textColor }
                },
                x: {
                    ticks: { color: textColor }
                }
            }
        }
    });
}

// 3. Chart Emotion Analysis (Polar Area)
function renderEmotionChart() {
    const ctx = document.getElementById('emotionChart');
    if (!ctx) return;
    if (emotionChart) emotionChart.destroy();

    const emotions = {};
    journalData.forEach(t => {
        if (t.result === 'PENDING' || !t.emotion) return;
        if (!emotions[t.emotion]) emotions[t.emotion] = { wins: 0, total: 0 };
        emotions[t.emotion].total++;
        if (t.result === 'WIN' || t.result === 'TP HIT') emotions[t.emotion].wins++;
    });

    const labels = Object.keys(emotions);
    if (labels.length === 0) return;

    const data = labels.map(e => {
        return (emotions[e].wins / emotions[e].total) * 100;
    });

    const isLight = document.body.classList.contains('light-mode');

    emotionChart = new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels: labels,
            datasets: [{
                label: 'Win Rate (%)',
                data: data,
                backgroundColor: [
                    'rgba(255, 99, 132, 0.7)',
                    'rgba(54, 162, 235, 0.7)',
                    'rgba(255, 206, 86, 0.7)',
                    'rgba(75, 192, 192, 0.7)',
                    'rgba(153, 102, 255, 0.7)',
                    'rgba(255, 159, 64, 0.7)'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: isLight ? '#475569' : '#cbd5e1',
                        font: { size: 10 }
                    }
                }
            },
            scales: {
                r: {
                    ticks: { display: false }
                }
            }
        }
    });
}

// 4. Strategy Performance (Horizontal Bar)
function renderStrategyChart() {
    const ctx = document.getElementById('strategyChart');
    if (!ctx) return;
    if (strategyChart) strategyChart.destroy();

    const stratMap = {};
    journalData.forEach(t => {
        if (t.result === 'PENDING' || !t.strategyName) return;
        if (!stratMap[t.strategyName]) stratMap[t.strategyName] = { wins: 0, total: 0 };
        stratMap[t.strategyName].total++;
        if (t.result === 'WIN' || t.result === 'TP HIT') stratMap[t.strategyName].wins++;
    });

    const labels = Object.keys(stratMap);
    const winRates = labels.map(s => (stratMap[s].wins / stratMap[s].total) * 100);
    const totals = labels.map(s => stratMap[s].total);

    const isLight = document.body.classList.contains('light-mode');
    const textColor = isLight ? '#64748b' : '#cbd5e1';

    strategyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Win Rate (%)',
                    data: winRates,
                    backgroundColor: isLight ? 'rgba(34, 197, 94, 0.8)' : 'rgba(34, 197, 94, 0.8)',
                    order: 1
                },
                {
                    label: 'Total Trades',
                    data: totals,
                    type: 'line',
                    borderColor: isLight ? '#f59e0b' : '#fbbf24',
                    borderWidth: 2,
                    pointRadius: 4,
                    order: 0,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    beginAtZero: true,
                    max: 100,
                    title: { display: true, text: 'Win Rate %', color: textColor },
                    ticks: { color: textColor }
                },
                y: {
                    ticks: { color: textColor }
                },
                y1: {
                    position: 'right',
                    title: { display: true, text: 'Total Trades', color: isLight ? '#f59e0b' : '#fbbf24' },
                    ticks: { color: isLight ? '#f59e0b' : '#fbbf24' },
                    grid: { display: false }
                }
            }
        }
    });
}

// 5. Drawdown Chart
function renderDrawdownChart() {
    const ctx = document.getElementById('drawdownChart');
    if (!ctx) return;
    if (drawdownChart) drawdownChart.destroy();

    // Filter relevant trades (sorted by date)
    const sortedTrades = journalData
        .filter(t => t.result !== 'PENDING')
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (sortedTrades.length === 0) return;

    // Calculate Drawdown
    let cumulative = 0;
    let peak = 0;
    const drawdownData = [];
    const labels = [];

    sortedTrades.forEach(t => {
        cumulative += t.pnl;
        if (cumulative > peak) peak = cumulative;
        const dd = cumulative - peak; // Always <= 0

        drawdownData.push(dd);
        labels.push(new Date(t.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
    });

    const isLight = document.body.classList.contains('light-mode');
    const color = '#ef4444'; // Red for danger/loss
    const gridColor = isLight ? 'rgba(148, 163, 184, 0.2)' : 'rgba(51, 65, 85, 0.2)';
    const textColor = isLight ? '#64748b' : '#cbd5e1';

    drawdownChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Drawdown ($)',
                data: drawdownData,
                borderColor: color,
                backgroundColor: 'rgba(239, 68, 68, 0.2)', // Light red fill
                fill: true,
                tension: 0.2,
                pointRadius: 2,
                pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return 'Drawdown: $' + context.parsed.y.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: textColor, maxRotation: 45 }
                }
            }
        }
    });
}

// 6. Streak Tracker Chart
function renderStreakChart() {
    const ctx = document.getElementById('streakChart');
    if (!ctx) return;
    if (streakChart) streakChart.destroy();

    const sortedTrades = journalData
        .filter(t => t.result !== 'PENDING')
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (sortedTrades.length === 0) return;

    // Calculate Streaks
    const streaks = [];
    let currentStreak = 0;
    // Positive = Win Streak, Negative = Loss Streak

    sortedTrades.forEach(t => {
        const isWin = (t.result === 'WIN' || t.result === 'TP HIT');

        if (isWin) {
            if (currentStreak >= 0) {
                currentStreak++;
            } else {
                streaks.push(currentStreak); // End loss streak
                currentStreak = 1; // Start win streak
            }
        } else {
            // Loss or BE (treat BE as breaker? or ignore? Let's treat BE as neutral/breaker towards loss logic for safety or just simplistic W vs L)
            // Simplified: Loss/SL = Loss. BE breaks win streak.
            // Let's assume Breakeven breaks streak and resets to 0, or counts as 'not win'.
            // For robust tracker: Win vs Not Win

            if (currentStreak <= 0) {
                currentStreak--;
            } else {
                streaks.push(currentStreak); // End win streak
                currentStreak = -1; // Start loss streak
            }
        }
    });
    streaks.push(currentStreak); // Push final streak

    // Filter out 0s if any
    const finalStreaks = streaks.filter(s => s !== 0);
    const labels = finalStreaks.map((_, i) => `Streak ${i + 1}`);

    const isLight = document.body.classList.contains('light-mode');
    const colorWin = isLight ? '#22c55e' : '#22c55e';
    const colorLoss = isLight ? '#ef4444' : '#ef4444';
    const textColor = isLight ? '#64748b' : '#cbd5e1';

    const bgColors = finalStreaks.map(s => s > 0 ? colorWin : colorLoss);

    streakChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Streak Length',
                data: finalStreaks,
                backgroundColor: bgColors,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const val = context.parsed.y;
                            return val > 0 ? `Win Streak: ${val} trades` : `Loss Streak: ${Math.abs(val)} trades`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: isLight ? 'rgba(148, 163, 184, 0.2)' : 'rgba(51, 65, 85, 0.2)' },
                    ticks: { color: textColor, stepSize: 1 }
                },
                x: {
                    grid: { display: false },
                    ticks: { display: false } // Hide x labels for cleaner look if many streaks
                }
            }
        }
    });
}

// Export to CSV
function exportToCSV() {
    if (journalData.length === 0) {
        showToast('⚠️ Tidak ada data untuk di-export');
        return;
    }

    const headers = ['Date', 'Mode', 'Asset', 'Entry', 'SL', 'TP', 'Position Size', 'Leverage', 'Risk', 'RR Ratio', 'Strategy', 'Result', 'P&L', 'Notes'];
    const rows = journalData.map(t => [
        new Date(t.date).toLocaleString('id-ID'),
        t.mode,
        t.asset,
        t.entry,
        t.sl,
        t.tp || '',
        t.positionSize,
        t.leverage,
        t.risk,
        t.rrRatio || '',
        t.strategyName || '',
        t.result,
        t.pnl.toFixed(2),
        t.notes || ''
    ]);

    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ Data berhasil di-export!');
}

// ========== DASHBOARD FUNCTIONS ==========

// Helper Functions for Dashboard
function getTodayTrades() {
    const today = new Date().toDateString();
    return journalData.filter(t => new Date(t.date).toDateString() === today);
}

function getDailyPnL() {
    const todayTrades = getTodayTrades();
    return todayTrades.reduce((sum, t) => sum + t.pnl, 0);
}

function getTodayTradeCount() {
    return getTodayTrades().length;
}

// Update Discipline Score UI
function updateDisciplineUI() {
    const card = document.getElementById('disciplineCard');
    if (!card) return;

    const todayTrades = getTodayTrades();
    const dailyPnL = getDailyPnL();
    const result = calculateDisciplineScore(todayTrades, dailyPnL);

    // Update Score Text
    const scoreEl = document.getElementById('disciplineScoreValue');
    scoreEl.textContent = result.score;
    // Animate counter effect could be added here, but direct set is fine for now

    // Update Gauge Color
    const gaugePath = document.getElementById('disciplineGaugePath');
    let color = '#22c55e'; // Green
    if (result.score < 50) color = '#ef4444'; // Red
    else if (result.score < 80) color = '#eab308'; // Yellow

    // Update stroke color
    gaugePath.style.stroke = color;
    scoreEl.style.color = color;

    // Update Badge Status
    const badgeEl = document.getElementById('disciplineBadge');
    if (result.score >= 90) {
        badgeEl.textContent = 'Elite Discipline';
        badgeEl.className = 'badge badge-win';
        badgeEl.style.background = 'rgba(34, 197, 94, 0.1)';
        badgeEl.style.color = '#22c55e';
    } else if (result.score >= 70) {
        badgeEl.textContent = 'Solid Discipline';
        badgeEl.className = 'badge badge-tp'; // Reuse existing class for style
        badgeEl.style.background = 'rgba(234, 179, 8, 0.1)';
        badgeEl.style.color = '#eab308';
    } else {
        badgeEl.textContent = 'Discipline Risk';
        badgeEl.className = 'badge badge-loss';
        badgeEl.style.background = 'rgba(239, 68, 68, 0.1)';
        badgeEl.style.color = '#ef4444';
    }

    // Update Infractions List
    const infractionsContainer = document.getElementById('disciplineInfractions');
    infractionsContainer.innerHTML = '';
    if (result.infractions.length > 0) {
        result.infractions.forEach(inf => {
            const div = document.createElement('div');
            div.className = 'infraction-item';
            div.innerHTML = `<span>${inf.reason}</span> <span>${inf.points}</span>`;
            infractionsContainer.appendChild(div);
        });
    } else {
        infractionsContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted);">No infractions today. Keep it up!</div>';
    }

    // Update Badges List
    const badgesContainer = document.getElementById('disciplineBadges');
    badgesContainer.innerHTML = '';

    // Logic for Badges
    const todayStr = new Date().toISOString().split('T')[0];
    const preMarketDone = localStorage.getItem('lastPreMarketRoutineDate') === todayStr;

    if (result.score === 100 && todayTrades.length > 0) {
        addDisciplineBadge(badgesContainer, '🏆', 'Perfect Day');
    }
    if (dailyPnL > 0) {
        addDisciplineBadge(badgesContainer, '💰', 'Green Day', 'green');
    }
    const perfectNotes = todayTrades.every(t => t.notes && t.notes.length > 10);
    if (todayTrades.length > 0 && perfectNotes) {
        addDisciplineBadge(badgesContainer, '📝', 'Scribe', 'gold');
    }
    const noRiskBreach = result.infractions.length === 0;
    if (todayTrades.length >= 3 && noRiskBreach) {
        addDisciplineBadge(badgesContainer, '🛡️', 'Guardian', 'green');
    }
    if (preMarketDone) {
        addDisciplineBadge(badgesContainer, '🌅', 'Ready', 'gold');
    }
}

function addDisciplineBadge(container, icon, text, type = 'default') {
    const div = document.createElement('div');
    div.className = `discipline-badge ${type}`;
    div.innerHTML = `<span>${icon}</span> <span>${text}</span>`;
    container.appendChild(div);
}

// Calculate Discipline Score Logic
function calculateDisciplineScore(trades, dailyPnL) {
    let score = 100;
    const infractions = [];

    // 1. Daily Loss Limit Breach
    if (tradingSettings.dailyLossLimit > 0 && dailyPnL <= -tradingSettings.dailyLossLimit) {
        score -= 50;
        infractions.push({ reason: 'Daily Loss Limit Hit', points: '-50' });
    }

    // 2. Max Trades Exceeded
    if (tradingSettings.maxTradesPerDay > 0 && trades.length > tradingSettings.maxTradesPerDay) {
        score -= 30;
        infractions.push({ reason: 'Max Trades Exceeded', points: '-30' });
    }

    // 3. Per Trade Checks
    trades.forEach(t => {
        // No Checklist (if tracked)
        if (t.checklistComplete === false) { // Explicit false check
            score -= 5;
            infractions.push({ reason: 'Skipped Checklist', points: '-5' });
        }
    });

    // Bonuses (Capped at 100 total)
    if (dailyPnL > 0) score += 5;

    // Pre-Market Bonus
    const todayStr = new Date().toISOString().split('T')[0];
    const preMarketDone = localStorage.getItem('lastPreMarketRoutineDate') === todayStr;
    if (preMarketDone) {
        // We handle bonus as implicit score boost or just 'not penalty'.
        // Let's add bonus points but ensure we don't go over 100 logic if we were strictly deducting.
        // Actually, let's treat it as a +5 buffer against penalties or just pure bonus?
        // Implementation plan said +5 points.
        score += 5;
        // Note: Score is clamped below.
    }

    // Clamp Score 0-100
    score = Math.max(0, Math.min(100, score));

    return { score, infractions };
}

// Update Risk Exposure Monitor
function updateRiskMonitor() {
    const riskCard = document.getElementById('riskMonitorCard');
    if (!riskCard) return;

    // Filter Open Trades
    const openTrades = journalData.filter(t => t.result === 'PENDING');
    const openCount = openTrades.length;

    // Calculate Total Open Risk
    let totalRisk = 0;
    const assetCounts = {};

    openTrades.forEach(t => {
        const risk = parseFloat(t.risk) || 0;
        totalRisk += risk;

        // Count assets for correlation
        const asset = t.asset || 'Unknown';
        assetCounts[asset] = (assetCounts[asset] || 0) + 1;
    });

    // Update DOM
    document.getElementById('totalOpenRisk').textContent = `$${totalRisk.toFixed(2)}`;
    document.getElementById('openPositionsCount').textContent = openCount;

    // Calculate Exposure vs Daily Limit
    const dailyLimit = tradingSettings.dailyLossLimit || 0;
    const progressBar = document.getElementById('exposureProgressBar');
    const exposureText = document.getElementById('exposurePercentage');
    const badge = document.getElementById('riskStatusBadge');

    if (dailyLimit > 0) {
        const exposureRatio = (totalRisk / dailyLimit) * 100;
        const displayPercentage = Math.min(exposureRatio, 100);

        exposureText.textContent = `${exposureRatio.toFixed(1)}% of Daily Limit ($${dailyLimit})`;
        progressBar.style.width = `${displayPercentage}%`;

        // Status Logic
        if (exposureRatio >= 100) {
            progressBar.style.background = 'var(--danger)';
            badge.textContent = 'CRITICAL OVERLOAD';
            badge.className = 'risk-danger';
        } else if (exposureRatio >= 70) {
            progressBar.style.background = '#eab308'; // Warning Yellow
            badge.textContent = 'High Exposure';
            badge.className = 'risk-warning';
        } else {
            progressBar.style.background = '#22c55e'; // Safe Green
            badge.textContent = 'Safe';
            badge.className = 'risk-safe';
        }
    } else {
        exposureText.textContent = 'No Daily Limit Set';
        progressBar.style.width = '0%';
        badge.textContent = 'No Limit';
        badge.className = '';
    }

    // Correlation Alerts
    const alertContainer = document.getElementById('correlationAlerts');
    alertContainer.innerHTML = '';

    Object.entries(assetCounts).forEach(([asset, count]) => {
        if (count > 1) {
            const tag = document.createElement('div');
            tag.className = 'correlation-tag';
            tag.innerHTML = `<i data-lucide="alert-triangle" style="width: 12px; height: 12px;"></i> Multiple positions on ${asset} (${count})`;
            alertContainer.appendChild(tag);
        }
    });

    // Re-initialize icons for new alerts
    lucide.createIcons();
}

// Render Dashboard
function renderDashboard() {
    // Update Daily P&L Meter
    const dailyPnL = getDailyPnL();
    const todayTradeCount = getTodayTradeCount();
    const meterCard = document.getElementById('dailyPnLMeter');

    if (tradingSettings.dailyLossLimit > 0 || tradingSettings.maxTradesPerDay > 0) {
        meterCard.style.display = 'block';

        // Update values
        const pnlValue = document.getElementById('dailyPnLValue');
        pnlValue.textContent = `$${dailyPnL.toFixed(2)}`;
        pnlValue.style.color = dailyPnL >= 0 ? 'var(--success)' : 'var(--danger)';

        document.getElementById('dailyLimitValue').textContent = tradingSettings.dailyLossLimit > 0
            ? `$${tradingSettings.dailyLossLimit}`
            : 'No Limit';

        document.getElementById('dailyTradeCount').textContent = tradingSettings.maxTradesPerDay > 0
            ? `${todayTradeCount} / ${tradingSettings.maxTradesPerDay}`
            : todayTradeCount;

        // Update progress bar
        const bar = document.getElementById('dailyPnLBar');
        if (tradingSettings.dailyLossLimit > 0 && dailyPnL < 0) {
            const loss = Math.abs(dailyPnL);
            const percentage = Math.min((loss / tradingSettings.dailyLossLimit) * 100, 100);
            bar.style.width = `${percentage}%`;
            bar.textContent = `${percentage.toFixed(0)}% of limit`;

            if (percentage >= 100) {
                bar.style.background = 'var(--danger)';
            } else if (percentage >= 80) {
                bar.style.background = 'var(--warning)';
            } else {
                bar.style.background = 'var(--success)';
            }
        } else {
            bar.style.width = '0%';
            bar.textContent = '';
        }
    } else {
        meterCard.style.display = 'none';
    }

    // Drawdown Card Logic
    const ddValue = getDailyDrawdown();
    const ddCard = document.getElementById('dailyDrawdownCard');
    if (ddCard) {
        document.getElementById('dailyDrawdownValue').textContent = `-$${ddValue.toFixed(2)}`;
    }

    updateRiskMonitor();
    updateDisciplineUI(); // New Call
    renderDashboardStats();
    renderRecentTrades();
    renderMiniCharts();
}

// Render Dashboard Statistics
function renderDashboardStats() {
    const completedData = journalData.filter(t => t.result !== 'PENDING');
    const totalTrades = completedData.length;
    const wins = completedData.filter(t => t.result === 'WIN' || t.result === 'TP HIT').length;
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : 0;
    const netPnL = journalData.reduce((sum, t) => sum + t.pnl, 0);

    const bestStrategy = getBestStrategy();

    document.getElementById('dash-totalTrades').textContent = totalTrades;
    document.getElementById('dash-winRate').textContent = winRate + '%';
    document.getElementById('dash-netPnL').textContent = '$' + netPnL.toFixed(2);
    document.getElementById('dash-netPnL').style.color = netPnL >= 0 ? 'var(--success)' : 'var(--danger)';
    document.getElementById('dash-bestStrategy').textContent = bestStrategy || '-';
}

// Get Best Strategy
function getBestStrategy() {
    if (strategies.length === 0) return null;

    const strategyPerformance = strategies.map(s => {
        const strategyTrades = journalData.filter(t => t.strategyId === s.id && t.result !== 'PENDING');
        const wins = strategyTrades.filter(t => t.result === 'WIN' || t.result === 'TP HIT').length;
        const winRate = strategyTrades.length > 0 ? (wins / strategyTrades.length) * 100 : 0;
        const totalPnL = strategyTrades.reduce((sum, t) => sum + t.pnl, 0);

        return {
            name: s.name,
            score: (winRate * 0.5) + (totalPnL * 0.5)
        };
    });

    strategyPerformance.sort((a, b) => b.score - a.score);
    return strategyPerformance[0]?.name || null;
}

// Render Recent Trades
function renderRecentTrades() {
    const container = document.getElementById('recentTradesList');
    if (!container) return;

    const recentTrades = journalData.slice(0, 5);

    if (recentTrades.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">Belum ada trade</p>';
        return;
    }

    container.innerHTML = '';
    recentTrades.forEach(trade => {
        const date = new Date(trade.date).toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });

        const badgeClass = trade.result === 'WIN' ? 'badge-win' :
            trade.result === 'LOSS' ? 'badge-loss' :
                trade.result === 'TP HIT' ? 'badge-tp' :
                    trade.result === 'SL HIT' ? 'badge-sl' :
                        trade.result === 'BREAKEVEN' ? 'badge-breakeven' :
                            'badge-pending';

        const pnlClass = trade.pnl > 0 ? 'success' : trade.pnl < 0 ? 'danger' : '';

        const item = document.createElement('div');
        item.className = 'recent-trade-item';
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 600; color: var(--text-primary);">${trade.asset}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${date}</div>
                </div>
                <div style="text-align: right;">
                    <span class="badge ${badgeClass}">${trade.result}</span>
                    <div style="font-weight: 700; color: var(--${pnlClass}); margin-top: 0.25rem;">$${trade.pnl.toFixed(2)}</div>
                </div>
            </div>
        `;
        container.appendChild(item);
    });
}

// Render Mini Charts
function renderMiniCharts() {
    renderMiniPnLChart();
    renderMiniDistributionChart();
}

// Render Mini P&L Chart (7 Days)
function renderMiniPnLChart() {
    const ctx = document.getElementById('miniPnLChart');
    if (!ctx) return;

    if (miniPnLChart) miniPnLChart.destroy();

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentTrades = journalData.filter(t => new Date(t.date) >= sevenDaysAgo);

    if (recentTrades.length === 0) {
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        return;
    }

    const sortedData = [...recentTrades].sort((a, b) => new Date(a.date) - new Date(b.date));

    const groupedByDay = {};
    sortedData.forEach(trade => {
        const date = new Date(trade.date);
        const day = date.getDate();
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        const month = monthNames[date.getMonth()];
        const dayKey = `${day} ${month}`;

        if (!groupedByDay[dayKey]) {
            groupedByDay[dayKey] = 0;
        }
        groupedByDay[dayKey] += trade.pnl;
    });

    const labels = Object.keys(groupedByDay);
    const data = Object.values(groupedByDay);

    let cumulative = 0;
    const cumulativeData = data.map(val => {
        cumulative += val;
        return cumulative;
    });

    const isLight = document.body.classList.contains('light-mode');
    const lineColor = isLight ? 'rgb(14, 165, 233)' : 'rgb(34, 197, 94)';
    const bgColor = isLight ? 'rgba(14, 165, 233, 0.1)' : 'rgba(34, 197, 94, 0.1)';
    const tickColor = isLight ? 'rgb(100, 116, 139)' : 'rgb(203, 213, 225)';
    const gridColor = isLight ? 'rgba(148, 163, 184, 0.3)' : 'rgba(51, 65, 85, 0.3)';

    miniPnLChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'P&L',
                data: cumulativeData,
                borderColor: lineColor,
                backgroundColor: bgColor,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: tickColor, font: { size: 10 } },
                    grid: { color: gridColor }
                },
                x: {
                    ticks: { color: tickColor, font: { size: 10 }, maxRotation: 45 },
                    grid: { display: false }
                }
            }
        }
    });
}

// Render Mini Distribution Chart
function renderMiniDistributionChart() {
    const ctx = document.getElementById('miniDistributionChart');
    if (!ctx) return;

    if (miniDistributionChart) miniDistributionChart.destroy();

    const completedTrades = journalData.filter(t => t.result !== 'PENDING');
    const wins = completedTrades.filter(t => t.result === 'WIN' || t.result === 'TP HIT').length;
    const losses = completedTrades.filter(t => t.result === 'LOSS' || t.result === 'SL HIT').length;
    const breakeven = completedTrades.filter(t => t.result === 'BREAKEVEN').length;

    if (completedTrades.length === 0) {
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        return;
    }

    const isLight = document.body.classList.contains('light-mode');
    const tickColor = isLight ? 'rgb(100, 116, 139)' : 'rgb(203, 213, 225)';

    miniDistributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Win', 'Loss', 'Breakeven'],
            datasets: [{
                data: [wins, losses, breakeven],
                backgroundColor: [
                    isLight ? 'rgba(34, 197, 94, 0.9)' : 'rgba(34, 197, 94, 1)',
                    isLight ? 'rgba(239, 68, 68, 0.9)' : 'rgba(239, 68, 68, 1)',
                    isLight ? 'rgba(251, 191, 36, 0.9)' : 'rgba(251, 191, 36, 1)'
                ],
                borderColor: isLight ? '#fff' : '#0f172a',
                borderWidth: 3,
                hoverBorderColor: '#fff',
                hoverBorderWidth: 4,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 1000,
                easing: 'easeInOutQuart'
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: tickColor,
                        font: {
                            size: 11,
                            weight: '600'
                        },
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.95)',
                    titleColor: isLight ? '#0f172a' : '#f1f5f9',
                    bodyColor: isLight ? '#475569' : '#cbd5e1',
                    borderColor: isLight ? '#e2e8f0' : '#334155',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: true,
                    boxPadding: 6,
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ========== EDIT TRADE FUNCTIONS ==========

// Open Edit Modal
function openEditModal(tradeId) {
    const trade = journalData.find(t => t.id === tradeId);
    if (!trade) return;

    currentEditTradeId = tradeId;

    document.getElementById('editEntry').value = trade.entry;
    document.getElementById('editSL').value = trade.sl;
    document.getElementById('editTP').value = trade.tp || '';
    document.getElementById('editPnL').value = trade.pnl;
    document.getElementById('editNotes').value = trade.notes || '';

    document.getElementById('editModal').classList.add('active');
}

// Close Edit Modal
function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    currentEditTradeId = null;
}

// Save Edit Trade
// Save Edit Trade
function saveEditTrade() {
    if (!currentEditTradeId) return;

    const trade = journalData.find(t => t.id === currentEditTradeId);
    if (!trade) return;

    // Update values
    trade.entry = parseFloat(document.getElementById('editEntry').value) || 0;
    trade.sl = parseFloat(document.getElementById('editSL').value) || 0;
    trade.tp = parseFloat(document.getElementById('editTP').value) || 0;
    trade.pnl = parseFloat(document.getElementById('editPnL').value) || 0;
    trade.notes = document.getElementById('editNotes').value;

    // Recalculate RR/Pips if needed (Optional simplified recalc)
    // For now we trust user input or simply update the record.

    localStorage.setItem('tradingJournal', JSON.stringify(journalData));

    closeEditModal();
    filterJournal();
    renderStrategies();
    renderDashboard();

    showToast('✅ Perubahan berhasil disimpan!');
}

// Export Backup (JSON)
function exportBackup() {
    if (journalData.length === 0 && strategies.length === 0) {
        showToast('⚠️ Tidak ada data untuk di-export');
        return;
    }

    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        journalData: journalData,
        strategies: strategies
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trading-manager-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ Data berhasil di-export!');
}

// Import from JSON
function importFromJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importData = JSON.parse(e.target.result);

            if (!importData.journalData || !importData.strategies) {
                showToast('⚠️ Format file tidak valid!');
                return;
            }

            if (!confirm('⚠️ Import akan mengganti semua data yang ada. Lanjutkan?')) {
                return;
            }

            journalData = importData.journalData;
            strategies = importData.strategies;
            filteredData = [...journalData];

            localStorage.setItem('tradingJournal', JSON.stringify(journalData));
            localStorage.setItem('tradingStrategies', JSON.stringify(strategies));

            renderStrategies();
            filterJournal();
            updateStrategyFilter();
            renderDashboard();

            showToast('✅ Data berhasil di-import!');
        } catch (error) {
            showToast('❌ Error: File tidak valid!');
            console.error(error);
        }
    };
    reader.readAsText(file);

    // Reset file input
    event.target.value = '';
}

// ========== AI COACH FUNCTIONS ==========

function initAICoach() {
    // Scroll chat to bottom if exists
    const chatContainer = document.getElementById('chatMessages');
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;

    // Show warning if no API key
    if (!geminiApiKey) {
        setTimeout(() => {
            if (!geminiApiKey) {
                showToast('⚠️ Set API Key dulu di Settings (icon ⚙️) untuk menggunakan AI Coach');
            }
        }, 1000);
    }

    // Populate strategy selector
    populateStrategySelector();
}

// Populate Strategy Selector
function populateStrategySelector() {
    const selector = document.getElementById('strategySelector');
    if (!selector) return;

    // Clear existing options except first
    selector.innerHTML = '<option value="">Pilih Strategy (opsional)</option>';

    // Add strategies
    strategies.forEach(strategy => {
        const option = document.createElement('option');
        option.value = strategy.id;
        option.textContent = strategy.name;
        selector.appendChild(option);
    });
}

// Chart Analysis Functions
function openChartAnalysis() {
    document.getElementById('chartImageInput').click();
}

let currentChartImage = null;

function handleChartUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        showToast('⚠️ File harus berupa gambar (JPG, PNG, dll)');
        return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('⚠️ Ukuran file maksimal 5MB');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        currentChartImage = e.target.result;

        // Add image preview to chat
        addImagePreviewToChat(currentChartImage);

        // Prompt user to select strategy if not selected
        const strategySelector = document.getElementById('strategySelector');
        if (!strategySelector.value) {
            showToast('💡 Pilih strategy untuk analisa yang lebih akurat!');
        } else {
            // Auto-analyze
            analyzeChartWithAI();
        }
    };
    reader.readAsDataURL(file);

    // Reset input
    event.target.value = '';
}

function addImagePreviewToChat(imageBase64) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = 'ai-message-bubble user-bubble';
    div.innerHTML = `
        <div class="message-avatar">👤</div>
        <div class="message-content">
            <strong>You</strong>
            <p>📸 Chart uploaded</p>
            <img src="${imageBase64}" class="chart-image-preview" alt="Chart">
            <button class="btn btn-sm btn-primary" onclick="analyzeChartWithAI()" style="margin-top: 0.5rem;">
                <i data-lucide="sparkles"></i> Analyze Chart
            </button>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function analyzeChartWithAI() {
    if (!currentChartImage) {
        showToast('⚠️ Upload chart terlebih dahulu');
        return;
    }

    if (!geminiApiKey || geminiApiKey.trim() === '') {
        addMessageToChat('ai', '⚠️ API Key belum diset. Klik icon ⚙️ di header untuk mengatur API Key terlebih dahulu.');
        return;
    }

    const strategySelector = document.getElementById('strategySelector');
    const selectedStrategyId = strategySelector.value;

    // Build prompt
    let prompt = 'Analisa chart trading berikut dan berikan rekomendasi setup trading.';

    if (selectedStrategyId) {
        const strategy = strategies.find(s => s.id == selectedStrategyId);
        if (strategy) {
            prompt = buildStrategyAnalysisPrompt(strategy);
        }
    } else {
        prompt += '\n\nBerikan:\n1. Analisa trend & pattern\n2. Support/Resistance levels\n3. Entry point yang disarankan\n4. Stop Loss level\n5. Take Profit target\n6. Risk:Reward ratio\n\nJawab dalam Bahasa Indonesia, format Markdown.';
    }

    const chatInput = document.getElementById('chatInput');
    chatInput.disabled = true;

    const sendBtn = document.querySelector('.btn-send');
    if (sendBtn) {
        const originalContent = sendBtn.innerHTML;
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';

        const loadingId = addMessageToChat('ai', 'Sedang menganalisa chart...', true);

        try {
            const response = await fetch(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${geminiApiKey}`,
                        'HTTP-Referer': window.location.origin,
                        'X-Title': 'Trading Manager Pro'
                    },
                    body: JSON.stringify({
                        model: 'anthropic/claude-3.5-sonnet',
                        messages: [
                            {
                                role: 'user',
                                content: [
                                    {
                                        type: 'text',
                                        text: prompt
                                    },
                                    {
                                        type: 'image_url',
                                        image_url: {
                                            url: currentChartImage
                                        }
                                    }
                                ]
                            }
                        ],
                        max_tokens: 2000
                    })
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Gagal menganalisa chart');
            }

            const data = await response.json();
            const aiText = data.choices?.[0]?.message?.content || "Maaf, saya tidak dapat menganalisa chart ini.";

            const loadingMsg = document.getElementById(loadingId);
            if (loadingMsg) loadingMsg.remove();

            addMessageToChat('ai', aiText);

            // Clear current image
            currentChartImage = null;

        } catch (error) {
            console.error(error);
            const loadingMsg = document.getElementById(loadingId);
            if (loadingMsg) loadingMsg.remove();

            let errorMsg = `❌ Error: ${error.message}`;
            if (error.message.includes('cookie auth') || error.message.includes('credentials')) {
                errorMsg = `❌ **API Key Tidak Valid**\n\nPastikan API Key OpenRouter sudah benar.\n\nBuka https://openrouter.ai/keys untuk generate key baru.`;
            }
            addMessageToChat('ai', errorMsg);
        } finally {
            chatInput.disabled = false;
            sendBtn.disabled = false;
            sendBtn.innerHTML = originalContent;
            chatInput.focus();
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
}

function buildStrategyAnalysisPrompt(strategy) {
    let prompt = `Kamu adalah AI Trading Coach. Analisa chart berikut menggunakan strategy: **${strategy.name}**\n\n`;
    prompt += `**Deskripsi Strategy:** ${strategy.description}\n\n`;

    if (strategy.openChecklist && strategy.openChecklist.length > 0) {
        prompt += `**CHECKLIST ENTRY (harus terpenuhi semua):**\n`;
        strategy.openChecklist.forEach((item, i) => {
            prompt += `${i + 1}. ${item}\n`;
        });
        prompt += '\n';
    }

    if (strategy.slTpChecklist && strategy.slTpChecklist.length > 0) {
        prompt += `**CHECKLIST SL/TP:**\n`;
        strategy.slTpChecklist.forEach((item, i) => {
            prompt += `${i + 1}. ${item}\n`;
        });
        prompt += '\n';
    }

    if (strategy.indicatorChecklist && strategy.indicatorChecklist.length > 0) {
        prompt += `**CHECKLIST INDIKATOR:**\n`;
        strategy.indicatorChecklist.forEach((item, i) => {
            prompt += `${i + 1}. ${item}\n`;
        });
        prompt += '\n';
    }

    prompt += `\n**TUGAS KAMU:**\n`;
    prompt += `1. **Validasi Setup:** Apakah chart ini memenuhi SEMUA checklist? (✅ VALID atau ❌ TIDAK VALID)\n`;
    prompt += `2. **Entry Point:** Harga entry yang disarankan (jika valid)\n`;
    prompt += `3. **Stop Loss:** Level SL berdasarkan checklist\n`;
    prompt += `4. **Take Profit:** Target TP yang realistis\n`;
    prompt += `5. **Risk:Reward:** Hitung R:R ratio\n`;
    prompt += `6. **Catatan:** Checklist mana yang terpenuhi/tidak terpenuhi + saran tambahan\n\n`;
    prompt += `Jawab dalam Bahasa Indonesia, gunakan format Markdown (bold, list). Berikan jawaban yang jelas dan actionable.`;

    return prompt;
}


// AI Settings Modal Functions
function openAISettings() {
    const modal = document.getElementById('aiSettingsModal');
    const input = document.getElementById('aiApiKeyInput');
    if (input) input.value = geminiApiKey || '';
    if (modal) modal.classList.add('active');
}

function closeAISettings() {
    const modal = document.getElementById('aiSettingsModal');
    if (modal) modal.classList.remove('active');
}

function saveAIApiKey() {
    const input = document.getElementById('aiApiKeyInput');
    const key = input.value.trim();

    if (!key) {
        showToast('⚠️ Masukkan API Key terlebih dahulu');
        return;
    }

    geminiApiKey = key;
    localStorage.setItem('geminiApiKey', key);
    showToast('✅ API Key berhasil disimpan');
    closeAISettings();
}

function removeAIApiKey() {
    if (!confirm('Apakah Anda yakin ingin menghapus API Key?')) return;

    geminiApiKey = '';
    localStorage.removeItem('geminiApiKey');
    showToast('🗑️ API Key dihapus');
    closeAISettings();

    // Clear chat
    const chatContainer = document.getElementById('chatMessages');
    if (chatContainer) {
        chatContainer.innerHTML = `
            <div class="ai-message-bubble ai-bubble">
                <div class="message-avatar">🤖</div>
                <div class="message-content">
                    <strong>AI Coach</strong>
                    <p>Halo! Saya siap membantu menganalisa trading Anda. Apa yang bisa saya bantu hari ini?</p>
                </div>
            </div>
        `;
    }
}



async function askAI(prompt) {
    if (!prompt) return;

    // Check if API key exists
    if (!geminiApiKey || geminiApiKey.trim() === '') {
        addMessageToChat('ai', '⚠️ API Key belum diset. Klik icon ⚙️ di header untuk mengatur API Key terlebih dahulu.');
        return;
    }

    // Add user message
    addMessageToChat('user', prompt);

    const chatInput = document.getElementById('chatInput');
    chatInput.value = '';
    chatInput.disabled = true;

    // Find send button to disable it
    const sendBtn = document.querySelector('.btn-send');
    if (sendBtn) {
        const originalContent = sendBtn.innerHTML;
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>'; // Need spin class or animation

        // Show typing indicator
        const loadingId = addMessageToChat('ai', 'Sedang mengetik...', true);

        try {
            const context = buildTradingContext();
            const fullPrompt = `${context}\n\nUser Question: ${prompt}\n\nJawab dalam Bahasa Indonesia yang santai tapi profesional. Gunakan format Markdown untuk bold/list jika perlu.`;

            const response = await fetch(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${geminiApiKey}`,
                        'HTTP-Referer': window.location.origin,
                        'X-Title': 'Trading Manager Pro'
                    },
                    body: JSON.stringify({
                        model: 'deepseek/deepseek-chat',
                        messages: [
                            {
                                role: 'system',
                                content: 'Kamu adalah AI Trading Coach yang membantu trader menganalisa performa dan memberikan saran trading. Jawab dalam Bahasa Indonesia yang santai tapi profesional.'
                            },
                            {
                                role: 'user',
                                content: fullPrompt
                            }
                        ],
                        temperature: 0.7,
                        max_tokens: 2000
                    })
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Gagal terhubung ke AI API');
            }

            const data = await response.json();
            const aiText = data.choices?.[0]?.message?.content || "Maaf, saya tidak dapat memproses permintaan tersebut.";

            // Remove loading and add real message
            const loadingMsg = document.getElementById(loadingId);
            if (loadingMsg) loadingMsg.remove();

            addMessageToChat('ai', aiText);

        } catch (error) {
            console.error(error);
            const loadingMsg = document.getElementById(loadingId);
            if (loadingMsg) loadingMsg.remove();

            // More helpful error message
            let errorMsg = `❌ Error: ${error.message}`;

            if (error.message.includes('cookie auth') || error.message.includes('credentials')) {
                errorMsg = `❌ **API Key Tidak Valid**\n\nAPI Key yang Anda masukkan tidak valid atau kosong.\n\n**Solusi:**\n1. Buka https://openrouter.ai/keys\n2. Login dengan Google (GRATIS)\n3. Klik "Create Key" → Copy API key\n4. Kembali ke app → Klik ⚙️ → Paste API key → Simpan\n5. Coba chat lagi!\n\n💡 Tip: Pastikan copy API key yang LENGKAP (biasanya dimulai dengan "sk-or-...")`;
            } else if (error.message.includes('Failed to fetch')) {
                errorMsg = `❌ **Koneksi Gagal**\n\nTidak bisa terhubung ke AI API.\n\n**Solusi:**\n1. Cek koneksi internet Anda\n2. Pastikan API Key valid dari https://openrouter.ai/keys\n3. Refresh halaman dan coba lagi\n\nJika masih error, gunakan fitur lain dulu (Calculator, Journal, Analytics).`;
            } else if (error.message.includes('not found') || error.message.includes('not supported') || error.message.includes('401')) {
                errorMsg = `❌ **API Key Invalid**\n\nAPI Key Anda tidak valid atau expired.\n\n**Solusi:**\n1. Buka https://openrouter.ai/keys\n2. Login dengan Google\n3. Generate API Key baru (gratis $1 credit)\n4. Copy & paste ke Settings\n\nOpenRouter support 100+ AI models termasuk DeepSeek!`;
            }

            addMessageToChat('ai', errorMsg);
        } finally {
            chatInput.disabled = false;
            sendBtn.disabled = false;
            sendBtn.innerHTML = originalContent;
            chatInput.focus();
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
}

function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (message) {
        askAI(message);
    }
}

function handleChatKey(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function clearChat() {
    if (!confirm('Hapus riwayat chat?')) return;
    document.getElementById('chatMessages').innerHTML = `
        <div class="ai-message-bubble ai-bubble">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
                <strong>AI Coach</strong>
                <p>Halo! Saya siap membantu menganalisa trading Anda. Apa yang bisa saya bantu hari ini?</p>
            </div>
        </div>
    `;
}

function addMessageToChat(sender, text, isLoading = false) {
    const container = document.getElementById('chatMessages');
    const id = 'msg-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = sender === 'user' ? 'ai-message-bubble user-bubble' : 'ai-message-bubble ai-bubble';

    if (sender === 'user') {
        div.innerHTML = `
            <div class="message-avatar">👤</div>
            <div class="message-content">
                <strong>You</strong>
                <p>${text}</p>
            </div>
        `;
    } else {
        // Parse simple markdown (bold and list)
        let formattedText = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n- /g, '<br>• ')
            .replace(/\n/g, '<br>');

        div.innerHTML = `
            <div class="message-avatar">🤖</div>
            <div class="message-content">
                <strong>${isLoading ? 'AI Coach (typing...)' : 'AI Coach'}</strong>
                <p>${formattedText}</p>
            </div>
        `;
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return id;
}

function buildTradingContext() {
    const completedData = journalData.filter(t => t.result !== 'PENDING');
    const totalTrades = completedData.length;
    const wins = completedData.filter(t => t.result === 'WIN' || t.result === 'TP HIT').length;
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : 0;
    const netPnL = journalData.reduce((sum, t) => sum + t.pnl, 0);

    // Get last 10 trades summary
    const recentTrades = journalData.slice(0, 10).map(t =>
        `- ${t.date.split('T')[0]}: ${t.asset} (${t.result}) $${t.pnl} [Emosi: ${t.emotion || 'N/A'}]`
    ).join('\n');

    // Get strategies summary
    const strategiesList = strategies.map(s => `- ${s.name}`).join(', ');

    return `
CONTEXT DATA TRADER:
- Total Trades: ${totalTrades}
- Win Rate: ${winRate}%
- Net P&L: $${netPnL}
- Strategies: ${strategiesList}
- Daily Loss Limit: $${tradingSettings.dailyLossLimit || 0}
- Max Trades/Day: ${tradingSettings.maxTradesPerDay || 0}

RECENT TRADES (10 Terakhir):
${recentTrades}
`;
}

// ========== WEEKLY REPORT FUNCTIONS ==========

async function generateWeeklyReport() {
    // Check API Key
    if (!geminiApiKey) {
        showToast('⚠️ Set API Key dulu di tab AI Coach');
        return;
    }

    // Filter trades for last 7 days
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);

    // Reset hours to start of day
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const weeklyTrades = journalData.filter(t => new Date(t.date) >= sevenDaysAgo);

    // UI Loading State
    const btn = document.getElementById('btnGenerateReport');
    const loading = document.getElementById('reportLoading');
    const reportContainer = document.getElementById('weeklyReportContainer');
    const dateRangeSpan = document.getElementById('reportDateRange');

    if (weeklyTrades.length === 0) {
        showToast('⚠️ Tidak ada trade dalam 7 hari terakhir');
        return;
    }

    // Set Date Range Text
    const options = { day: 'numeric', month: 'short' };
    dateRangeSpan.textContent = `${sevenDaysAgo.toLocaleDateString('id-ID', options)} - ${today.toLocaleDateString('id-ID', options)}`;

    btn.style.display = 'none';
    loading.style.display = 'block';
    reportContainer.style.display = 'none';

    // Calculate Stats
    const totalTrades = weeklyTrades.length;
    const wins = weeklyTrades.filter(t => t.result === 'WIN' || t.result === 'TP HIT').length;
    const losses = weeklyTrades.filter(t => t.result === 'LOSS' || t.result === 'SL HIT').length;
    const totalPnL = weeklyTrades.reduce((acc, t) => acc + t.pnl, 0);
    const winRate = ((wins / totalTrades) * 100).toFixed(1);

    // Build Context
    const context = `
    DATA MINGGUAN (${dateRangeSpan.textContent}):
    - Total Trades: ${totalTrades}
    - Wins: ${wins}
    - Losses: ${losses}
    - Win Rate: ${winRate}%
    - Net P&L: $${totalPnL.toFixed(2)}
    
    DETAIL TRADE:
    ${weeklyTrades.map(t => `- ${t.date.split('T')[0]}: ${t.asset} (${t.result}) $${t.pnl} [Emosi: ${t.emotion || '-'}]`).join('\n')}
    `;

    const prompt = `
    Bertindaklah sebagai Senior Trading Coach profesional. Berdasarkan data trading mingguan di atas, buatlah "Laporan Performa Mingguan" yang terstruktur.
    
    Format Laporan (gunakan Markdown):
    # Laporan Mingguan
    
    ## 📊 Ringkasan Eksekutif
    **Grade Minggu Ini:** [Berikan nilai A/B/C/D/E berdasarkan profitabilitas & disiplin]
    [Paragraf singkat ringkasan performa]
    
    ## ✅ Yang Sudah Bagus (Strengths)
    - [Poin positif 1]
    - [Poin positif 2]
    
    ## ⚠️ Area Improvement (Mistakes)
    - [Poin negatif/kesalahan 1]
    - [Poin negatif/kesalahan 2]
    
    ## 🎯 Fokus Minggu Depan
    [Saran spesifik dan actionable untuk minggu depan]
    
    Gunakan Bahasa Indonesia yang profesional, tegas, namun memotivasi.
    `;

    try {
        const fullPrompt = `${context}\n\n${prompt}`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: fullPrompt }]
                    }]
                })
            }
        );

        if (!response.ok) throw new Error('API Error');

        const data = await response.json();
        let aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Gagal generate laporan.";

        // Format Markdown to HTML (Simple regex for now)
        aiText = formatMarkdown(aiText);

        document.getElementById('reportContent').innerHTML = aiText;
        reportContainer.style.display = 'block';

        // Scroll to report
        setTimeout(() => {
            reportContainer.scrollIntoView({ behavior: 'smooth' });
        }, 100);

    } catch (error) {
        console.error(error);
        showToast('❌ Gagal membuat laporan: ' + error.message);
    } finally {
        btn.style.display = 'inline-flex';
        loading.style.display = 'none';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function copyReport() {
    const content = document.getElementById('reportContent').innerText;
    navigator.clipboard.writeText(content).then(() => {
        showToast('✅ Laporan disalin ke clipboard');
    });
}

function formatMarkdown(text) {
    return text
        .replace(/^# (.*$)/gim, '<h2 style="margin-top:0;">$1</h2>')
        .replace(/^## (.*$)/gim, '<h3 style="margin-top:1.5rem; margin-bottom:0.5rem; color:var(--accent-primary);">$1</h3>')
        .replace(/^\*\*Grade Minggu Ini:\*\* (.*$)/gim, '<div style="font-size:1.2rem; font-weight:bold; margin-bottom:1rem; padding:0.5rem; background:var(--bg-secondary); border-radius:0.5rem; border-left:4px solid var(--accent-primary);">Grade: $1</div>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^\- (.*$)/gim, '<li style="margin-left:1.5rem; margin-bottom:0.25rem;">$1</li>')
        .replace(/\n/g, '<br>');
}

// ========== MISTAKE PATTERN DETECTION ==========

async function analyzePatterns() {
    // Check API Key
    if (!geminiApiKey) {
        showToast('⚠️ Set API Key dulu di tab AI Coach');
        return;
    }

    const totalTrades = journalData.length;
    if (totalTrades < 5) {
        showToast('⚠️ Butuh minimal 5 trade untuk analisa pola');
        return;
    }

    // UI Loading State
    const btn = document.getElementById('btnAnalyzePatterns');
    const loading = document.getElementById('patternLoading');
    const resultContainer = document.getElementById('patternResult');

    btn.style.display = 'none';
    loading.style.display = 'block';
    resultContainer.style.display = 'none';

    try {
        // 1. Prepare Data Aggregation
        const completedTrades = journalData.filter(t => t.result !== 'PENDING');
        const wins = completedTrades.filter(t => t.result === 'WIN' || t.result === 'TP HIT').length;
        const globalWinRate = ((wins / completedTrades.length) * 100).toFixed(1);

        // Group by Emotion
        const emotionStats = {};
        completedTrades.forEach(t => {
            const emo = t.emotion || 'unknown';
            if (!emotionStats[emo]) emotionStats[emo] = { count: 0, wins: 0, pnl: 0 };
            emotionStats[emo].count++;
            emotionStats[emo].pnl += t.pnl;
            if (t.result === 'WIN' || t.result === 'TP HIT') emotionStats[emo].wins++;
        });

        // Group by Strategy
        const strategyStats = {};
        completedTrades.forEach(t => {
            const strat = t.strategyName || 'No Strategy';
            if (!strategyStats[strat]) strategyStats[strat] = { count: 0, wins: 0, pnl: 0 };
            strategyStats[strat].count++;
            strategyStats[strat].pnl += t.pnl;
            if (t.result === 'WIN' || t.result === 'TP HIT') strategyStats[strat].wins++;
        });

        // Group by Day of Week
        const dayStats = {};
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        completedTrades.forEach(t => {
            const d = new Date(t.date).getDay();
            const dayName = days[d];
            if (!dayStats[dayName]) dayStats[dayName] = { count: 0, wins: 0, pnl: 0 };
            dayStats[dayName].count++;
            dayStats[dayName].pnl += t.pnl;
            if (t.result === 'WIN' || t.result === 'TP HIT') dayStats[dayName].wins++;
        });

        // Construct Context
        const context = `
        DATA STATISTIK TRADER:
        - Total Trades: ${totalTrades}
        - Global Win Rate: ${globalWinRate}%
        
        PERFORMA PER EMOSI:
        ${JSON.stringify(emotionStats, null, 2)}
        
        PERFORMA PER STRATEGI:
        ${JSON.stringify(strategyStats, null, 2)}
        
        PERFORMA PER HARI:
        ${JSON.stringify(dayStats, null, 2)}
        `;

        const prompt = `
        Bertindaklah sebagai Psikolog Trading profesional. Analisa data statistik di atas secara mendalam.
        Tugasmu adalah menemukan "KEBOCORAN PROFIT" (Mistake Patterns) yang mungkin tidak disadari trader.
        
        Fokus pada anomali statistik, misalnya:
        - Win rate tinggi tapi P&L minus (artinya risk reward buruk).
        - Emosi tertentu (misal: "Fearful" atau "Greedy") yang selalu menyebabkan loss besar.
        - Hari tertentu yang selalu sial.
        - Strategi yang sebenarnya merugikan.

        Format Laporan (Markdown):
        ## 🚨 Diagnosa Kebocoran Profit
        [Ringkasan 1 paragraf tentang masalah utama]

        ## 🧠 Analisa Psikologi & Pola
        - **[Pola 1]:** [Penjelasan]
        - **[Pola 2]:** [Penjelasan]
        
        ## 🛠️ 3 Langkah Perbaikan Konkret
        1. [Langkah 1]
        2. [Langkah 2]
        3. [Langkah 3]

        Gunakan bahasa Indonesia yang tajam, analitis, dan solutif. Jangan basa-basi.
        `;

        const fullPrompt = `${context}\n\n${prompt}`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: fullPrompt }]
                    }]
                })
            }
        );

        if (!response.ok) throw new Error('API Error');

        const data = await response.json();
        let aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Gagal menganalisa pola.";

        // Format Markdown
        aiText = formatMarkdown(aiText);

        resultContainer.innerHTML = aiText;
        resultContainer.style.display = 'block';

        // Scroll to result
        setTimeout(() => {
            resultContainer.scrollIntoView({ behavior: 'smooth' });
        }, 100);

    } catch (error) {
        console.error(error);
        showToast('❌ Gagal menganalisa pola: ' + error.message);
    } finally {
        btn.style.display = 'inline-flex';
        loading.style.display = 'none';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// ========== KEYBOARD SHORTCUTS ==========


function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + S: Save (prevent default browser save)
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            const saveModal = document.getElementById('saveModal');
            const editModal = document.getElementById('editModal');

            if (saveModal.classList.contains('active')) {
                saveToJournal();
            } else if (editModal.classList.contains('active')) {
                saveEditTrade();
            }
        }

        // Escape: Close modals
        if (e.key === 'Escape') {
            closeSaveModal();
            closeStrategyModal();
            closeEditModal();
        }

        // Ctrl/Cmd + E: Export data
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            exportToJSON();
        }

        // Ctrl/Cmd + N: New trade (switch to calculator)
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            switchTab('calculator');
        }
    });
}

// Toast Notification
function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('active');
    toast.style.display = 'block';
    toast.style.zIndex = '9999';
    setTimeout(() => {
        toast.classList.remove('active');
        toast.style.display = 'none';
    }, 3000);
}

// ========== TOOLTIP FUNCTIONS ==========

function initTooltips() {
    tippy('[data-tippy-content]', {
        theme: 'custom',
        animation: 'shift-away',
        arrow: true,
        delay: [100, 50],
        maxWidth: 250,
        placement: 'top',
        allowHTML: true
    });
}

// Initialize on load
window.addEventListener('load', init);
window.addEventListener('resize', () => {
    if (cumulativeChart) cumulativeChart.resize();
    if (dayOfWeekChart) dayOfWeekChart.resize();
    if (emotionChart) emotionChart.resize();
    if (strategyChart) strategyChart.resize();
    if (drawdownChart) drawdownChart.resize();
    if (streakChart) streakChart.resize();
});

// ========== PRE-MARKET CHECKLIST FUNCTIONS ==========

let preMarketItems = [
    { id: 'news', text: 'Check Economic Calendar (News)', checked: false },
    { id: 'plan', text: 'Review Trading Plan', checked: false },
    { id: 'mindset', text: 'Mindset Check (Am I calm?)', checked: false }
];

function initPreMarketChecklist() {
    renderPreMarketChecklist();
}

function openPreMarketModal() {
    document.getElementById('preMarketModal').style.display = 'block';
    renderPreMarketChecklist();
}

function closePreMarketModal() {
    document.getElementById('preMarketModal').style.display = 'none';
}

function renderPreMarketChecklist() {
    const container = document.getElementById('preMarketChecklistContainer');
    if (!container) return;
    container.innerHTML = '';

    preMarketItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = `checklist-item-row ${item.checked ? 'checked' : ''}`;
        div.onclick = (e) => {
            if (e.target.type !== 'checkbox') {
                toggleChecklistItem(index);
            }
        };

        div.innerHTML = `
            <input type="checkbox" class="checklist-chk" ${item.checked ? 'checked' : ''} onchange="toggleChecklistItem(${index})">
            <span style="flex: 1;">${item.text}</span>
            ${index > 2 ? `<button class="btn-icon" onclick="removeChecklistItem(${index}, event)"><i data-lucide="trash-2" style="width:14px; height:14px; color:var(--text-muted);"></i></button>` : ''}
        `;
        container.appendChild(div);
    });

    // We don't call createIcons here to avoid flashing, but if needed we can
    // lucide.createIcons();
    const TrashIcons = container.querySelectorAll('.btn-icon i');
    if (TrashIcons.length > 0) lucide.createIcons();

    updateStartButtonState();
}

function toggleChecklistItem(index) {
    preMarketItems[index].checked = !preMarketItems[index].checked;
    renderPreMarketChecklist();
}

function addCustomChecklistItem() {
    const input = document.getElementById('newChecklistItem');
    const text = input.value.trim();
    if (text) {
        preMarketItems.push({ id: `custom-${Date.now()}`, text: text, checked: false });
        input.value = '';
        renderPreMarketChecklist();
    }
}

function removeChecklistItem(index, event) {
    event.stopPropagation(); // Prevent toggling
    preMarketItems.splice(index, 1);
    renderPreMarketChecklist();
}

function updateStartButtonState() {
    const allChecked = preMarketItems.every(i => i.checked);
    const btn = document.getElementById('startSessionBtn');
    if (btn) btn.disabled = !allChecked;
}

function completePreMarketRoutine() {
    // Award Bonus
    const todayStr = new Date().toISOString().split('T')[0];
    const lastRoutineDate = localStorage.getItem('lastPreMarketRoutineDate');

    if (lastRoutineDate !== todayStr) {
        // Award points
        localStorage.setItem('lastPreMarketRoutineDate', todayStr);
        localStorage.setItem('preMarketBonus', 'true');

        showToast('✅ Session Started! +5 Discipline Points');

        // Trigger dashboard update to reflect score
        renderDashboard();
    } else {
        showToast('ℹ️ Session Started');
    }

    closePreMarketModal();
}
