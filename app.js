// ========================================
// LENIS SMOOTH SCROLL
// ========================================
const lenis = new Lenis({
    duration: 0.6,           // Быстрее! (было 1.2)
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Easing функция (ease-out-expo)
    orientation: 'vertical', // Направление скролла
    smoothWheel: true,       // Плавный скролл колесиком
    wheelMultiplier: 1.2,    // Чуть быстрее колесико
    touchMultiplier: 2,      // Множитель для тач-устройств
});

// Make Lenis globally accessible
window.lenis = lenis;
window.isModalOpen = false;

// Animation frame loop для Lenis
function raf(time) {
    if (!window.isModalOpen) {
        lenis.raf(time);
    }
    requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// ========================================
// APP STATE
// ========================================
// Load bilets data
let biletsData = [];
let currentBiletIndex = 0;
let studiedBilets = new Set();
let carouselInitialized = false;

// Timer state
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;
const OPENROUTER_API_KEY_STORAGE_KEY = 'pharma-openrouter-api-key';
const OPENROUTER_MODEL = 'google/gemini-3-flash-preview';
// Если задан прокси — сайт не спрашивает ключ у пользователя, а пропускает запросы через Cloudflare Worker.
// Оставить '' чтобы вернуться к режиму "каждый вводит свой ключ".
const OPENROUTER_PROXY_URL = '';

function getOpenRouterEndpoint() {
    return OPENROUTER_PROXY_URL || 'https://openrouter.ai/api/v1/chat/completions';
}

function getOpenRouterAuthHeaders(apiKey) {
    if (OPENROUTER_PROXY_URL) return {};
    return {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Pharma Study Helper',
    };
}

function ensureOpenRouterKey() {
    if (OPENROUTER_PROXY_URL) return 'via-proxy';
    return requestOpenRouterApiKey();
}

// Load data and initialize app
async function init() {
    try {
        const response = await fetch('bilets-data.json');
        biletsData = (await response.json()).bilets;
        loadProgress();
        loadDarkMode();
        setupEventListeners();
        initCarousel();
        renderBiletList();
        populateAISelects();
        updateStats();
    } catch (error) {
        console.error('Error loading bilets:', error);
    }
}

// Local Storage functions
function saveProgress() {
    localStorage.setItem('pharma-studied-bilets', JSON.stringify([...studiedBilets]));
}

function loadProgress() {
    const saved = localStorage.getItem('pharma-studied-bilets');
    if (saved) {
        studiedBilets = new Set(JSON.parse(saved));
    }
}

function updateStats() {
    const studiedCount = studiedBilets.size;
    const totalCount = biletsData.length;
    const percentage = totalCount ? (studiedCount / totalCount) * 100 : 0;

    document.getElementById('studiedCount').textContent = studiedCount;
    document.getElementById('totalCount').textContent = totalCount;
    document.getElementById('progressFill').style.width = `${percentage}%`;
    const pct = document.getElementById('progressPercent');
    if (pct) pct.textContent = `${Math.round(percentage)}%`;
}

// Event Listeners
function setupEventListeners() {
    // Inline AI-справка (выделение текста → кнопка "Объяснить")
    setupInlineExplain();

    // Mode switching
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchMode(tab.dataset.mode));
    });

    // Flashcard controls - now using carousel (handlers are in initCarousel)
    document.getElementById('filterType')?.addEventListener('change', applyFilterCarousel);

    // List mode
    document.getElementById('markAllStudied')?.addEventListener('click', markAllStudied);
    document.getElementById('resetProgress')?.addEventListener('click', resetProgress);
    document.getElementById('exportProgress')?.addEventListener('click', exportProgress);
    document.getElementById('importProgress')?.addEventListener('click', importProgress);

    // Search mode
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');

    searchInput?.addEventListener('input', (e) => {
        handleSearch(e);
        // Show/hide clear button
        if (searchClear) {
            searchClear.style.display = e.target.value ? 'flex' : 'none';
        }
    });

    searchClear?.addEventListener('click', () => {
        if (searchInput) {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
            searchClear.style.display = 'none';
            searchInput.focus();
        }
    });

    // AI Check mode
    document.getElementById('aiBiletSelect')?.addEventListener('change', handleAIBiletChange);
    document.getElementById('checkAnswer')?.addEventListener('click', checkAnswerWithAI);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Header buttons
    document.getElementById('darkModeToggle')?.addEventListener('click', toggleDarkMode);
    document.getElementById('keyboardHelp')?.addEventListener('click', showKeyboardShortcutsHelp);

    // Study timer
    document.getElementById('timerToggle')?.addEventListener('click', toggleTimer);
}

// Keyboard Shortcuts Handler
function handleKeyboardShortcuts(e) {
    // Ignore if user is typing in input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }

    const activeMode = document.querySelector('.mode-content.active')?.id;

    switch (e.key.toLowerCase()) {
        case 'arrowright':
        case 'd':
        case 'в': // Russian layout
            if (activeMode === 'flashcardsMode') {
                e.preventDefault();
                navigateCarousel(1);
            }
            break;
        case 'arrowleft':
        case 'a':
        case 'ф': // Russian layout
            if (activeMode === 'flashcardsMode') {
                e.preventDefault();
                navigateCarousel(-1);
            }
            break;
        case ' ':
            if (activeMode === 'flashcardsMode') {
                e.preventDefault();
                // Toggle first answer
                const firstToggle = document.querySelector('.answer-toggle');
                if (firstToggle) firstToggle.click();
            }
            break;
        case 'r':
        case 'к': // Russian layout
            if (activeMode === 'flashcardsMode') {
                e.preventDefault();
                showRandomBiletCarousel();
            }
            break;
        case 'm':
        case 'ь': // Russian layout
            if (activeMode === 'flashcardsMode') {
                e.preventDefault();
                const bilet = biletsData[currentBiletIndex];
                if (bilet) toggleStudiedCarousel(bilet.id);
            }
            break;
        case '?':
            e.preventDefault();
            showKeyboardShortcutsHelp();
            break;
        case 'escape':
            // Close shortcuts help if open
            const helpModal = document.getElementById('keyboardShortcutsModal');
            if (helpModal && helpModal.style.display === 'flex') {
                helpModal.style.display = 'none';
            }
            break;
    }
}

// Mode Switching
function switchMode(mode) {
    // Update tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    // Update content
    document.querySelectorAll('.mode-content').forEach(content => {
        content.classList.remove('active');
    });

    const modeMap = {
        'flashcards': 'flashcardsMode',
        'list': 'listMode',
        'search': 'searchMode',
        'ai-check': 'aiCheckMode'
    };

    document.getElementById(modeMap[mode]).classList.add('active');
}

// Flashcard Mode Functions
function showBilet(index) {
    if (index < 0 || index >= biletsData.length) return;

    currentBiletIndex = index;
    const bilet = biletsData[index];

    document.getElementById('biletNumber').textContent = `Билет ${bilet.id}`;

    const questionList = document.getElementById('questionList');
    questionList.innerHTML = bilet.questions.map((q, i) => {
        const answer = bilet.answers && bilet.answers[i] ? bilet.answers[i] : 'Ответ пока не добавлен';
        return `
            <div class="question-item">
                <div class="question-number">Вопрос ${i + 1}</div>
                <div class="question-text">${q}</div>
                <div class="answer-section">
                    <button class="answer-toggle" onclick="toggleAnswer(${i})">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        Показать ответ
                    </button>
                    <div class="answer-content" id="answer-${i}">
                        ${formatAnswer(answer)}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Update studied button
    const studiedBtn = document.getElementById('toggleStudied');
    if (studiedBilets.has(bilet.id)) {
        studiedBtn.classList.add('studied');
        studiedBtn.title = 'Отметить как неизученный';
    } else {
        studiedBtn.classList.remove('studied');
        studiedBtn.title = 'Отметить как изученный';
    }
}

// Format answer text with basic markdown-like formatting
function formatAnswer(text) {
    if (!text) return '<p>Ответ пока не добавлен</p>';

    // Convert **text** to <strong>text</strong>
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Convert line breaks to paragraphs
    const paragraphs = text.split('\n\n').map(p => {
        if (p.trim()) {
            return `<p>${p.replace(/\n/g, '<br>')}</p>`;
        }
        return '';
    }).join('');

    return paragraphs || text;
}

// toggleAnswer is now defined at the bottom of file as window.toggleAnswer

function navigateBilet(direction) {
    const filterType = document.getElementById('filterType').value;
    let newIndex = currentBiletIndex + direction;

    // Apply filter
    if (filterType !== 'all') {
        while (newIndex >= 0 && newIndex < biletsData.length) {
            const bilet = biletsData[newIndex];
            const isStudied = studiedBilets.has(bilet.id);

            if ((filterType === 'studied' && isStudied) ||
                (filterType === 'unstudied' && !isStudied)) {
                break;
            }
            newIndex += direction;
        }
    }

    if (newIndex >= 0 && newIndex < biletsData.length) {
        showBilet(newIndex);
    }
}

function showRandomBilet() {
    const filterType = document.getElementById('filterType').value;
    let availableBilets = biletsData;

    if (filterType === 'studied') {
        availableBilets = biletsData.filter(b => studiedBilets.has(b.id));
    } else if (filterType === 'unstudied') {
        availableBilets = biletsData.filter(b => !studiedBilets.has(b.id));
    }

    if (availableBilets.length === 0) {
        alert('Нет доступных билетов с выбранным фильтром');
        return;
    }

    const randomBilet = availableBilets[Math.floor(Math.random() * availableBilets.length)];
    const index = biletsData.findIndex(b => b.id === randomBilet.id);
    showBilet(index);
}

function toggleStudied() {
    const bilet = biletsData[currentBiletIndex];

    if (studiedBilets.has(bilet.id)) {
        studiedBilets.delete(bilet.id);
    } else {
        studiedBilets.add(bilet.id);
    }

    saveProgress();
    updateStats();
    showBilet(currentBiletIndex);
    renderBiletList();
}

function applyFilter() {
    // Just update the display, navigation will handle filtering
    showBilet(currentBiletIndex);
}

// Carousel-specific functions
function showRandomBiletCarousel() {
    const filterType = document.getElementById('filterType')?.value || 'all';
    let availableBilets = biletsData;

    if (filterType === 'studied') {
        availableBilets = biletsData.filter(b => studiedBilets.has(b.id));
    } else if (filterType === 'unstudied') {
        availableBilets = biletsData.filter(b => !studiedBilets.has(b.id));
    }

    if (availableBilets.length === 0) {
        alert('Нет доступных билетов с выбранным фильтром');
        return;
    }

    const randomBilet = availableBilets[Math.floor(Math.random() * availableBilets.length)];
    const index = biletsData.findIndex(b => b.id === randomBilet.id);
    currentBiletIndex = index;
    updateCarouselState();
}

function applyFilterCarousel() {
    updateCarouselState();
}

// List Mode Functions
function renderBiletList() {
    const grid = document.getElementById('biletGrid');
    if (!grid || !biletsData.length) return;

    grid.innerHTML = biletsData.map(bilet => {
        const isStudied = studiedBilets.has(bilet.id);
        return `
            <div class="bilet-card ${isStudied ? 'studied' : ''}" data-bilet-id="${bilet.id}" onclick="openBiletWithAnimation(${bilet.id})">
                <div class="bilet-card-header">
                    <h3>Билет ${bilet.id}</h3>
                    ${isStudied ? '<span class="studied-badge">✓ Изучено</span>' : ''}
                </div>
                <div class="bilet-card-body">
                    ${bilet.questions.map((q, i) => `
                        <div class="bilet-question-preview">
                            <span class="question-number">${i + 1}.</span>
                            <span class="question-text">${q}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function openBiletWithAnimation(biletId) {
    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.style.opacity = '0';
    backdrop.style.display = 'block';

    backdrop.addEventListener('click', () => closeCardModal(modal, backdrop));

    document.body.appendChild(backdrop);

    // Get билет data
    const bilet = biletsData.find(b => b.id === biletId);
    const isStudied = studiedBilets.has(biletId);

    // Create modal from scratch
    const modal = document.createElement('div');
    modal.className = 'bilet-card-modal';
    modal.setAttribute('data-lenis-prevent', ''); // Prevent Lenis scroll on modal
    modal.innerHTML = `
        <button class="modal-close-btn" onclick="closeCardModal(this.parentElement, this.parentElement.previousElementSibling)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        </button>
        <div class="bilet-card-header">
            <h3>Билет ${bilet.id}</h3>
            ${isStudied ? '<span class="studied-badge">✓ Изучено</span>' : ''}
        </div>
        <div class="bilet-card-body">
            ${bilet.questions.map((q, i) => `
                <div class="bilet-question-preview">
                    <div class="question-number">${i + 1}.</div>
                    <div class="question-text">${q}</div>
                    <div class="answer-section">
                        <button class="answer-toggle" onclick="toggleModalAnswer(${biletId}, ${i})">
                            Показать ответ
                        </button>
                        <div class="answer-content" id="modal-answer-${biletId}-${i}">
                            <div>
                                ${bilet.answers && bilet.answers[i] ? formatAnswer(bilet.answers[i]) : '<p class="no-answer">Ответ пока не добавлен</p>'}
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    modal.onclick = (e) => e.stopPropagation();

    document.body.appendChild(modal);

    // Set initial state (invisible, small). На мобиле модалка full-screen — transform другой.
    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    const centerTf = isMobile ? '' : 'translate(-50%, -50%) ';
    modal.style.opacity = '0';
    modal.style.transform = `${centerTf}scale(0.92)`;

    // Animate in
    requestAnimationFrame(() => {
        backdrop.style.opacity = '1';

        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            modal.style.transform = `${centerTf}scale(1)`;
        });
    });

    // Set modal state
    window.isModalOpen = true;
    if (window.lenis) {
        window.lenis.stop();
    }

    // Block body scroll
    document.body.classList.add('modal-open');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    // Close on backdrop click
    backdrop.onclick = () => closeCardModal(modal, backdrop);
}

function closeCardModal(modal, backdrop) {
    // Быстрое плавное исчезновение
    modal.style.transition = 'opacity 0.15s cubic-bezier(0.4, 0, 1, 1), transform 0.15s cubic-bezier(0.4, 0, 1, 1)';
    backdrop.style.transition = 'opacity 0.12s ease-out';

    const isMobileClose = window.matchMedia('(max-width: 640px)').matches;
    modal.style.opacity = '0';
    modal.style.transform = `${isMobileClose ? '' : 'translate(-50%, -50%) '}scale(0.95)`;
    backdrop.style.opacity = '0';

    setTimeout(() => {
        modal.remove();
        backdrop.remove();

        // Restore state
        window.isModalOpen = false;
        if (window.lenis) {
            window.lenis.start();
        }

        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        document.body.classList.remove('modal-open');
    }, 150);
}

// Toggle answer in modal
function toggleModalAnswer(biletId, questionIndex) {
    const answerDiv = document.getElementById(`modal-answer-${biletId}-${questionIndex}`);
    const button = event.currentTarget;

    if (answerDiv.classList.contains('visible')) {
        answerDiv.classList.remove('visible');
        button.textContent = 'Показать ответ';
        button.classList.remove('active');
    } else {
        answerDiv.classList.add('visible');
        button.textContent = 'Скрыть ответ';
        button.classList.add('active');
    }
}

function markAllStudied() {
    if (confirm('Отметить все билеты как изученные?')) {
        biletsData.forEach(bilet => studiedBilets.add(bilet.id));
        saveProgress();
        updateStats();
        renderBiletList();
    }
}

function resetProgress() {
    if (confirm('Сбросить весь прогресс? Это действие нельзя отменить.')) {
        studiedBilets.clear();
        saveProgress();
        updateStats();
        renderBiletList();
        showBilet(currentBiletIndex);
    }
}

// Export Progress
function exportProgress() {
    const data = {
        studied: [...studiedBilets],
        exportDate: new Date().toISOString(),
        totalBilets: biletsData.length
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `pharma-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Import Progress
function importProgress() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.studied && Array.isArray(data.studied)) {
                    studiedBilets = new Set(data.studied);
                    saveProgress();
                    updateStats();
                    renderBiletList();
                    renderCarouselCards();
                    alert(`Прогресс восстановлен! Изучено билетов: ${studiedBilets.size}`);
                } else {
                    alert('Неверный формат файла');
                }
            } catch (err) {
                alert('Ошибка чтения файла: ' + err.message);
            }
        };
        reader.readAsText(file);
    };

    input.click();
}

// Search Mode Functions
function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    const resultsContainer = document.getElementById('searchResults');

    if (!query) {
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <circle cx="28" cy="28" r="18" stroke="currentColor" stroke-width="3"/>
                    <path d="M42 42L56 56" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                </svg>
                <p>Введите запрос для поиска по билетам</p>
            </div>
        `;
        return;
    }

    const results = [];
    biletsData.forEach(bilet => {
        bilet.questions.forEach((question, qIndex) => {
            if (question.toLowerCase().includes(query)) {
                results.push({
                    bilet,
                    question,
                    questionIndex: qIndex
                });
            }
        });
    });

    if (results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <circle cx="28" cy="28" r="18" stroke="currentColor" stroke-width="3"/>
                    <path d="M42 42L56 56" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                </svg>
                <p>Ничего не найдено по запросу "${query}"</p>
            </div>
        `;
        return;
    }

    resultsContainer.innerHTML = results.map(result => {
        const highlightedText = result.question.replace(
            new RegExp(query, 'gi'),
            match => `<mark>${match}</mark>`
        );

        return `
            <div class="search-result-card" onclick="openBiletFromList(${result.bilet.id})">
                <div class="search-result-header">
                    <h3 class="search-result-title">Билет ${result.bilet.id}, Вопрос ${result.questionIndex + 1}</h3>
                </div>
                <p class="search-result-question">${highlightedText}</p>
            </div>
        `;
    }).join('');
}

// Minimal safe markdown renderer for AI output (bold, italic, bullets, numbered lists, code, line breaks)
function renderMarkdown(text) {
    const escape = (s) => s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const lines = text.split(/\r?\n/);
    const out = [];
    let listType = null; // 'ul' | 'ol' | null

    const closeList = () => {
        if (listType) {
            out.push(`</${listType}>`);
            listType = null;
        }
    };

    const inline = (s) => escape(s)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trimEnd();
        if (!line.trim()) {
            // Peek next non-empty line — if it continues current list, don't close
            const next = lines.slice(i + 1).find((l) => l.trim());
            const nextIsList = next && (/^\s*[*\-]\s+/.test(next) || /^\s*\d+[.)]\s+/.test(next));
            if (!nextIsList) {
                closeList();
                out.push('<br>');
            }
            continue;
        }
        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        const bullet = line.match(/^\s*[*\-]\s+(.*)$/);
        const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (heading) {
            closeList();
            const level = Math.min(heading[1].length + 2, 6); // # → h3, ## → h4, etc (h1/h2 reserved for page)
            out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
            continue;
        }
        if (bullet) {
            if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
            out.push(`<li>${inline(bullet[1])}</li>`);
        } else if (numbered) {
            if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
            out.push(`<li value="${numbered[1]}">${inline(numbered[2])}</li>`);
        } else {
            closeList();
            out.push(`<p>${inline(line)}</p>`);
        }
    }
    closeList();
    return out.join('');
}

// AI Check Mode Functions
function getOpenRouterApiKey() {
    return localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY)?.trim() || '';
}

function requestOpenRouterApiKey() {
    const existingKey = getOpenRouterApiKey();
    if (existingKey) {
        return existingKey;
    }

    const providedKey = window.prompt(
        'Введите OpenRouter API key (sk-or-v1-...). Получить: https://openrouter.ai/keys\nКлюч сохранится только в localStorage этого браузера.'
    );
    const normalizedKey = providedKey ? providedKey.trim() : '';

    if (!normalizedKey) {
        return '';
    }

    localStorage.setItem(OPENROUTER_API_KEY_STORAGE_KEY, normalizedKey);
    return normalizedKey;
}

function populateAISelects() {
    const biletSelect = document.getElementById('aiBiletSelect');
    if (!biletSelect) return;
    biletSelect.innerHTML = '<option value="">Выберите билет...</option>' +
        biletsData.map(bilet => `<option value="${bilet.id}">Билет ${bilet.id}</option>`).join('');
}

function handleAIBiletChange(e) {
    const biletId = parseInt(e.target.value);
    const questionSelect = document.getElementById('aiQuestionSelect');
    const currentQuestion = document.getElementById('aiCurrentQuestion');

    if (!biletId) {
        questionSelect.innerHTML = '<option value="">Сначала выберите билет</option>';
        currentQuestion.innerHTML = '<p class="question-text">Выберите вопрос выше</p>';
        return;
    }

    const bilet = biletsData.find(b => b.id === biletId);
    questionSelect.innerHTML = bilet.questions.map((q, i) =>
        `<option value="${i}">Вопрос ${i + 1}</option>`
    ).join('');

    questionSelect.onchange = function () {
        const qIndex = parseInt(this.value);
        if (!isNaN(qIndex)) {
            currentQuestion.innerHTML = `
                <div class="question-number">Билет ${bilet.id}, Вопрос ${qIndex + 1}</div>
                <p class="question-text">${bilet.questions[qIndex]}</p>
            `;
        }
    };

    // Trigger first question
    questionSelect.dispatchEvent(new Event('change'));
}

async function checkAnswerWithAI() {
    const biletId = parseInt(document.getElementById('aiBiletSelect').value);
    const questionIndex = parseInt(document.getElementById('aiQuestionSelect').value);
    const userAnswer = document.getElementById('userAnswer').value.trim();
    const resultDiv = document.getElementById('aiResult');

    if (!biletId || isNaN(questionIndex)) {
        alert('Пожалуйста, выберите билет и вопрос');
        return;
    }

    if (!userAnswer) {
        alert('Пожалуйста, напишите ваш ответ');
        return;
    }

    const bilet = biletsData.find(b => b.id === biletId);
    const question = bilet.questions[questionIndex];
    const referenceAnswer = bilet.answers && bilet.answers[questionIndex]
        ? bilet.answers[questionIndex].trim()
        : '';
    const apiKey = ensureOpenRouterKey();

    if (!apiKey) {
        alert('Без OpenRouter API key AI-проверка не запустится');
        return;
    }

    // Show loading state
    const checkBtn = document.getElementById('checkAnswer');
    checkBtn.disabled = true;
    checkBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="animation: spin 1s linear infinite;">
            <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" stroke-dasharray="50" stroke-dashoffset="25"/>
        </svg>
        Проверка...
    `;

    try {
        const systemPrompt = `Ты — преподаватель фармакологии. Твоя задача — проверить ответ студента, СВЕРЯЯ его с эталонным ответом из учебного материала.

КРИТИЧЕСКИ ВАЖНО:
- Опирайся ТОЛЬКО на эталонный ответ. Не придумывай факты из общих знаний.
- Если эталонный ответ отсутствует — честно скажи "эталон для этого вопроса не добавлен, оценка ориентировочная" и дай оценку по общей фармакологической логике.
- Никогда не выдумывай препараты, дозировки или классификации, которых нет в эталоне.

Формат ответа:
1. **Вердикт:** правильно / частично правильно / неправильно
2. **Что совпадает с эталоном:** перечисли пункты
3. **Что упущено:** чего нет в ответе студента но есть в эталоне
4. **Что лишнее/неточное:** противоречия с эталоном
5. **Итог:** короткий фидбек в 1-2 предложениях`;

        const userPrompt = `ВОПРОС:
${question}

ЭТАЛОННЫЙ ОТВЕТ (из учебного материала):
${referenceAnswer || '⚠️ Эталон не добавлен для этого вопроса'}

ОТВЕТ СТУДЕНТА:
${userAnswer}

Проверь ответ студента СТРОГО ПО ЭТАЛОНУ выше.`;

        const response = await fetch(getOpenRouterEndpoint(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getOpenRouterAuthHeaders(apiKey),
            },
            body: JSON.stringify({
                model: OPENROUTER_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.2,
            })
        });

        if (!response.ok) {
            if ([400, 401, 403].includes(response.status)) {
                localStorage.removeItem(OPENROUTER_API_KEY_STORAGE_KEY);
            }

            const errorText = await response.text().catch(() => '');
            throw new Error(`OpenRouter API failed (${response.status}): ${errorText.slice(0, 200)}`);
        }

        const data = await response.json();
        const aiResponse = data?.choices?.[0]?.message?.content?.trim();

        if (!aiResponse) {
            throw new Error('OpenRouter API returned an empty response');
        }

        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
            <div class="ai-result-header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M10 3L12 8H17L13 11L14.5 16L10 13L5.5 16L7 11L3 8H8L10 3Z" fill="currentColor"/>
                </svg>
                Результат проверки AI
            </div>
            <div class="ai-result-content">${renderMarkdown(aiResponse)}</div>
        `;

        // Scroll to result
        resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (error) {
        console.error('Error checking answer:', error);
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
            <div class="ai-result-header" style="color: var(--color-text-secondary);">
                ⚠️ Ошибка проверки
            </div>
            <div class="ai-result-content">
                Не удалось проверить ответ. Убедитесь, что у вас есть подключение к интернету и API ключ настроен правильно.
            </div>
        `;
    } finally {
        checkBtn.disabled = false;
        checkBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 3L12 8H17L13 11L14.5 16L10 13L5.5 16L7 11L3 8H8L10 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            </svg>
            Проверить ответ с помощью AI
        `;
    }
}

// Add spin animation for loading
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Initialize app
init();

// Initialize carousel on page load
function initCarousel() {
    if (carouselInitialized) return;

    const container = document.getElementById('carouselContainer');
    if (!container) return;

    // Render all cards
    renderCarouselCards();

    // Setup navigation
    document.getElementById('carouselUp')?.addEventListener('click', () => navigateCarousel(-1));
    document.getElementById('carouselDown')?.addEventListener('click', () => navigateCarousel(1));

    // Setup random bilet button
    document.getElementById('randomBilet')?.addEventListener('click', () => {
        const randomIndex = Math.floor(Math.random() * biletsData.length);
        currentBiletIndex = randomIndex;
        renderCarouselCards();
        updateCarouselState();
    });

    // Update carousel state
    updateCarouselState();

    carouselInitialized = true;
}

function renderCarouselCards() {
    const container = document.getElementById('carouselContainer');
    if (!container || !biletsData.length) return;

    // Get current bilet or first one
    const currentBilet = biletsData[currentBiletIndex] || biletsData[0];
    const isStudied = studiedBilets.has(currentBilet.id);

    container.innerHTML = `
        <div class="simple-bilet-view">
            <div class="simple-bilet-header">
                <h2>Билет ${currentBilet.id}</h2>
                <button class="btn-icon ${isStudied ? 'studied' : ''}" 
                        onclick="toggleStudiedCarousel(${currentBilet.id})" 
                        title="${isStudied ? 'Отметить как неизученный' : 'Отметить как изученный'}">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M5 13L9 17L19 7" stroke="currentColor" stroke-width="2" 
                              stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </button>
            </div>
            <div class="simple-questions-list">
                ${currentBilet.questions.map((q, i) => {
        const answer = currentBilet.answers && currentBilet.answers[i] ? currentBilet.answers[i] : 'Ответ пока не добавлен';
        return `
                        <div class="simple-question-item">
                            <div class="simple-question-header">
                                <span class="simple-question-number">Вопрос ${i + 1}</span>
                            </div>
                            <div class="simple-question-text">${q}</div>
                            <div class="simple-answer-section">
                                <button class="answer-toggle" onclick="toggleAnswer(${currentBiletIndex}, ${i})">
                                    Показать ответ
                                </button>
                                <div class="answer-content" id="answer-${currentBiletIndex}-${i}">
                                    ${formatAnswer(answer)}
                                </div>
                            </div>
                        </div>
                    `;
    }).join('')}
            </div>
        </div>
    `;
}

function updateCarouselState() {
    const upBtn = document.getElementById('carouselUp');
    const downBtn = document.getElementById('carouselDown');

    if (upBtn) {
        upBtn.classList.toggle('disabled', currentBiletIndex === 0);
    }
    if (downBtn) {
        downBtn.classList.toggle('disabled', currentBiletIndex === biletsData.length - 1);
    }
}
function navigateCarousel(direction) {
    const filterType = document.getElementById('filterType')?.value || 'all';
    let newIndex = currentBiletIndex + direction;

    // Apply filter
    if (filterType !== 'all') {
        while (newIndex >= 0 && newIndex < biletsData.length) {
            const bilet = biletsData[newIndex];
            const isStudied = studiedBilets.has(bilet.id);

            if ((filterType === 'studied' && isStudied) ||
                (filterType === 'unstudied' && !isStudied)) {
                break;
            }
            newIndex += direction;
        }
    }

    if (newIndex >= 0 && newIndex < biletsData.length) {
        currentBiletIndex = newIndex;
        renderCarouselCards();
        updateCarouselState();
    }
}

function toggleStudiedCarousel(biletId) {
    if (studiedBilets.has(biletId)) {
        studiedBilets.delete(biletId);
    } else {
        studiedBilets.add(biletId);
    }

    saveProgress();
    updateStats();
    renderCarouselCards();
    updateCarouselState();
    renderBiletList();
}

// Update toggleAnswer to work with carousel
window.toggleAnswer = function (biletIndex, questionIndex) {
    const answerDiv = document.getElementById(`answer-${biletIndex}-${questionIndex}`);
    const button = event.currentTarget;

    if (answerDiv.classList.contains('visible')) {
        answerDiv.classList.remove('visible');
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            Показать ответ
        `;
        button.classList.remove('active');
    } else {
        answerDiv.classList.add('visible');
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            Скрыть ответ
        `;
        button.classList.add('active');
    }
};

// Show Keyboard Shortcuts Help
function showKeyboardShortcutsHelp() {
    let modal = document.getElementById('keyboardShortcutsModal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'keyboardShortcutsModal';
        modal.className = 'keyboard-shortcuts-modal';
        modal.innerHTML = `
            <div class="keyboard-shortcuts-content">
                <div class="keyboard-shortcuts-header">
                    <h2>⌨️ Горячие клавиши</h2>
                    <button class="modal-close-btn" onclick="document.getElementById('keyboardShortcutsModal').style.display='none'">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
                <div class="keyboard-shortcuts-body">
                    <div class="shortcuts-section">
                        <h3>Навигация</h3>
                        <div class="shortcut-item"><kbd>←</kbd> / <kbd>A</kbd> / <kbd>Ф</kbd><span>Предыдущий билет</span></div>
                        <div class="shortcut-item"><kbd>→</kbd> / <kbd>D</kbd> / <kbd>В</kbd><span>Следующий билет</span></div>
                        <div class="shortcut-item"><kbd>Пробел</kbd><span>Показать/скрыть ответ</span></div>
                    </div>
                    <div class="shortcuts-section">
                        <h3>Действия</h3>
                        <div class="shortcut-item"><kbd>R</kbd> / <kbd>К</kbd><span>Случайный билет</span></div>
                        <div class="shortcut-item"><kbd>M</kbd> / <kbd>Ь</kbd><span>Отметить изученным</span></div>
                    </div>
                    <div class="shortcuts-section">
                        <h3>Общие</h3>
                        <div class="shortcut-item"><kbd>?</kbd><span>Эта справка</span></div>
                        <div class="shortcut-item"><kbd>Esc</kbd><span>Закрыть окно</span></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }
    modal.style.display = 'flex';
}

// Dark Mode Functions
function loadDarkMode() {
    const isDark = localStorage.getItem('pharma-dark-mode') === 'true';
    if (isDark) {
        document.body.classList.add('dark-mode');
        updateDarkModeIcon(true);
    }
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('pharma-dark-mode', isDark);
    updateDarkModeIcon(isDark);
}

function updateDarkModeIcon(isDark) {
    const sunIcon = document.querySelector('#darkModeToggle .icon-sun');
    const moonIcon = document.querySelector('#darkModeToggle .icon-moon');
    if (sunIcon && moonIcon) {
        sunIcon.style.display = isDark ? 'none' : 'block';
        moonIcon.style.display = isDark ? 'block' : 'none';
    }
}

// Study Timer Functions
function toggleTimer() {
    if (timerRunning) {
        stopTimer();
    } else {
        startTimer();
    }
}

function startTimer() {
    timerRunning = true;
    const toggleBtn = document.getElementById('timerToggle');
    if (toggleBtn) toggleBtn.textContent = '⏸';

    timerInterval = setInterval(() => {
        timerSeconds++;
        updateTimerDisplay();
    }, 1000);
}

function stopTimer() {
    timerRunning = false;
    const toggleBtn = document.getElementById('timerToggle');
    if (toggleBtn) toggleBtn.textContent = '▶';

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// ========== Боковая панель-помощник + inline "Спросить у помощника" ==========
const CHAT_MODEL = 'google/gemini-2.5-flash';
const CHAT_SYSTEM = `Ты — помощник студента-фармацевта. Отвечай на вопросы по фармакологии кратко, ясно, простым языком.

Правила:
- 3-7 предложений в типичном ответе; длиннее только если тема требует.
- Препарат (МНН/торговое) → группа, механизм, основные показания, 1-2 ключевые побочки.
- Термин → определение + короткий пример.
- Группа → 2-3 ярких представителя и общий принцип.
- Используй **жирное** для ключевых слов и маркированные списки для перечней.
- Если пользователь задаёт уточнение — учитывай предыдущие сообщения.
- Русский язык, без "Давай разберёмся", без образных аналогий про солдат/замки/кирпичи.`;

let chatHistory = [];
let chatBusy = false;

function setupInlineExplain() {
    setupChatPanel();
    setupSelectionTrigger();
}

function setupSelectionTrigger() {
    const btn = document.getElementById('explainBtn');
    if (!btn) return;

    document.addEventListener('mouseup', (e) => {
        if (e.target.closest('#explainBtn') || e.target.closest('#chatPanel')) return;
        setTimeout(() => {
            const sel = window.getSelection();
            const text = sel ? sel.toString().trim() : '';
            if (!text || text.length < 2 || text.length > 300) {
                btn.hidden = true;
                return;
            }
            const anchor = sel.anchorNode?.parentElement;
            const inAnswer = anchor?.closest('.answer-content, .ai-result-content, .question-text, .search-result-question');
            if (!inAnswer) {
                btn.hidden = true;
                return;
            }
            btn.dataset.term = text;
            const container = anchor.closest('.answer-content, .ai-result-content') || anchor.closest('.question-text');
            btn.dataset.context = container ? container.innerText.slice(0, 2000) : '';
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            btn.style.top = `${Math.min(window.innerHeight - 60, rect.bottom + 8)}px`;
            btn.style.left = `${Math.max(12, Math.min(window.innerWidth - 200, rect.left + rect.width / 2 - 100))}px`;
            btn.hidden = false;
        }, 10);
    });

    document.addEventListener('mousedown', (e) => {
        if (e.target.closest('#explainBtn')) return;
        btn.hidden = true;
    });

    btn.addEventListener('click', () => {
        const term = btn.dataset.term || '';
        const context = btn.dataset.context || '';
        btn.hidden = true;
        openChatPanel();
        const prompt = context
            ? `Объясни: "${term}".\n\nКонтекст (откуда выделено):\n${context}`
            : `Объясни: "${term}"`;
        sendChatMessage(prompt, { displayAs: `Объясни: "${term}"` });
    });
}

function setupChatPanel() {
    const toggle = document.getElementById('chatToggle');
    const panel = document.getElementById('chatPanel');
    const closeBtn = document.getElementById('chatClose');
    const backdrop = document.getElementById('chatBackdrop');
    const form = document.getElementById('chatForm');
    const input = document.getElementById('chatInput');
    if (!panel || !form || !input) return;

    toggle?.addEventListener('click', openChatPanel);
    closeBtn?.addEventListener('click', closeChatPanel);
    backdrop?.addEventListener('click', closeChatPanel);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.classList.contains('open')) closeChatPanel();
    });

    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form.requestSubmit();
        }
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text || chatBusy) return;
        input.value = '';
        input.style.height = 'auto';
        sendChatMessage(text);
    });
}

function openChatPanel() {
    const panel = document.getElementById('chatPanel');
    const backdrop = document.getElementById('chatBackdrop');
    const fab = document.getElementById('chatToggle');
    if (!panel) return;
    panel.classList.add('open');
    if (backdrop) { backdrop.hidden = false; requestAnimationFrame(() => backdrop.classList.add('open')); }
    fab?.classList.add('hidden');
    setTimeout(() => document.getElementById('chatInput')?.focus(), 250);
}

function closeChatPanel() {
    const panel = document.getElementById('chatPanel');
    const backdrop = document.getElementById('chatBackdrop');
    const fab = document.getElementById('chatToggle');
    if (!panel) return;
    panel.classList.remove('open');
    backdrop?.classList.remove('open');
    fab?.classList.remove('hidden');
    // Очищаем историю при закрытии
    chatHistory = [];
    const messages = document.getElementById('chatMessages');
    if (messages) {
        messages.innerHTML = `
            <div class="chat-hint">
                <p>Задавай вопросы по материалу билетов или любым фармакологическим терминам. Можно выделить текст в ответе — появится кнопка «Спросить у помощника».</p>
                <p class="chat-hint-note">История сбросится когда закроешь окно.</p>
            </div>`;
    }
    setTimeout(() => { if (backdrop) backdrop.hidden = true; }, 300);
}

function appendChatMessage(role, content, opts = {}) {
    const messages = document.getElementById('chatMessages');
    if (!messages) return null;
    // Убираем hint при первом сообщении
    messages.querySelector('.chat-hint')?.remove();
    const el = document.createElement('div');
    el.className = `chat-msg ${role}`;
    if (role === 'user') {
        el.textContent = opts.displayAs || content;
    } else if (role === 'assistant') {
        el.innerHTML = renderMarkdown(content);
    } else if (role === 'typing') {
        el.className = 'chat-msg assistant';
        el.innerHTML = '<div class="chat-typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
    } else if (role === 'error') {
        el.className = 'chat-msg assistant error';
        el.textContent = content;
    }
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
}

async function sendChatMessage(text, opts = {}) {
    if (chatBusy) return;
    chatBusy = true;

    appendChatMessage('user', text, opts);
    chatHistory.push({ role: 'user', content: text });

    const apiKey = ensureOpenRouterKey();
    if (!apiKey) {
        appendChatMessage('error', 'Без OpenRouter API key чат не работает. Получить ключ: https://openrouter.ai/keys');
        chatHistory.pop();
        chatBusy = false;
        return;
    }

    const typingEl = appendChatMessage('typing', '');
    const sendBtn = document.querySelector('.chat-send');
    if (sendBtn) sendBtn.disabled = true;

    try {
        const response = await fetch(getOpenRouterEndpoint(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getOpenRouterAuthHeaders(apiKey),
            },
            body: JSON.stringify({
                model: CHAT_MODEL,
                messages: [
                    { role: 'system', content: CHAT_SYSTEM },
                    ...chatHistory,
                ],
                temperature: 0.3,
            }),
        });

        if (!response.ok) {
            if ([400, 401, 403].includes(response.status)) {
                localStorage.removeItem(OPENROUTER_API_KEY_STORAGE_KEY);
            }
            const errText = await response.text().catch(() => '');
            throw new Error(`OpenRouter ${response.status}: ${errText.slice(0, 120)}`);
        }

        const data = await response.json();
        const reply = data?.choices?.[0]?.message?.content?.trim();
        if (!reply) throw new Error('Пустой ответ от модели');

        typingEl?.remove();
        appendChatMessage('assistant', reply);
        chatHistory.push({ role: 'assistant', content: reply });
    } catch (err) {
        console.error('Chat error:', err);
        typingEl?.remove();
        appendChatMessage('error', `Не удалось получить ответ: ${err.message}`);
        chatHistory.pop();
    } finally {
        chatBusy = false;
        if (sendBtn) sendBtn.disabled = false;
    }
}

function updateTimerDisplay() {
    const display = document.getElementById('timerDisplay');
    if (!display) return;

    const hours = Math.floor(timerSeconds / 3600);
    const minutes = Math.floor((timerSeconds % 3600) / 60);
    const seconds = timerSeconds % 60;

    if (hours > 0) {
        display.textContent = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else {
        display.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}
