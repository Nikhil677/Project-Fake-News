
    (function() {
        // ────────── DOM Elements ──────────
        const tabSelector = document.getElementById('tabSelector');
        const tabBtns = tabSelector.querySelectorAll('.tab-btn');
        const textInput = document.getElementById('textInput');
        const urlInput = document.getElementById('urlInput');
        const youtubeInput = document.getElementById('youtubeInput');
        const inputHint = document.getElementById('inputHint');
        const errorMsg = document.getElementById('errorMsg');
        const errorMsgText = document.getElementById('errorMsgText');
        const submitBtn = document.getElementById('submitBtn');
        const resultsSection = document.getElementById('resultsSection');
        const resultsInner = document.getElementById('resultsInner');
        const gaugeProgress = document.getElementById('gaugeProgress');
        const gaugePercentText = document.getElementById('gaugePercentText');
        const verdictBadge = document.getElementById('verdictBadge');
        const verdictDescription = document.getElementById('verdictDescription');
        const analyzeAnotherBtn = document.getElementById('analyzeAnotherBtn');
        const gaugeContainer = document.getElementById('gaugeContainer');

        // ────────── State ──────────
        let activeTab = 'text';
        let isAnalyzing = false;
        let countUpAnimationId = null;
        let currentResultPercentage = null;

        // ────────── Tab Switching ──────────
        function switchTab(tabName) {
            if (isAnalyzing) return; // Prevent switching during analysis

            activeTab = tabName;

            // Update tab button styles
            tabBtns.forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.tab === tabName) {
                    btn.classList.add('active');
                }
            });

            // Hide all inputs
            textInput.style.display = 'none';
            urlInput.style.display = 'none';
            youtubeInput.style.display = 'none';

            // Show relevant input
            if (tabName === 'text') {
                textInput.style.display = 'block';
                inputHint.querySelector('span').textContent = 'Enter at least 50 characters for accurate analysis';
            } else if (tabName === 'url') {
                urlInput.style.display = 'block';
                inputHint.querySelector('span').textContent = 'Paste a complete URL (https://...) of the news article';
            } else if (tabName === 'youtube') {
                youtubeInput.style.display = 'block';
                inputHint.querySelector('span').textContent =
                    'Supported formats: youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/...';
            }

            // Clear errors and reset results when switching tabs
            clearError();
            resetResults();
        }

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                if (tabName !== activeTab && !isAnalyzing) {
                    switchTab(tabName);
                }
            });
        });

        // ────────── Get Active Input Element ──────────
        function getActiveInput() {
            if (activeTab === 'text') return textInput;
            if (activeTab === 'url') return urlInput;
            if (activeTab === 'youtube') return youtubeInput;
            return textInput;
        }

        // ────────── Error Handling ──────────
        function showError(message) {
            errorMsgText.textContent = message;
            errorMsg.classList.add('visible');
            const activeInput = getActiveInput();
            activeInput.classList.add('error');
            // Remove error styling after animation
            setTimeout(() => {
                activeInput.classList.remove('error');
            }, 600);
        }

        function clearError() {
            errorMsg.classList.remove('visible');
            errorMsgText.textContent = '';
            textInput.classList.remove('error');
            urlInput.classList.remove('error');
            youtubeInput.classList.remove('error');
        }

        // ────────── YouTube URL Validation ──────────
        function isValidYouTubeUrl(url) {
            const ytRegex =
                /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)[\w\-]{11}([?&][^\s]*)?$/i;
            return ytRegex.test(url.trim());
        }

        // ────────── Article URL Validation ──────────
        function isValidArticleUrl(url) {
            const trimmed = url.trim();
            try {
                const urlObj = new URL(trimmed);
                return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
            } catch {
                return false;
            }
        }

        // ────────── Input Validation ──────────
        function validateInput() {
            clearError();
            const activeInput = getActiveInput();
            const value = activeInput.value.trim();

            if (!value) {
                if (activeTab === 'text') {
                    showError('Please enter some text to analyze.');
                } else if (activeTab === 'url') {
                    showError('Please enter a news article URL.');
                } else {
                    showError('Please enter a YouTube video URL.');
                }
                return false;
            }

            if (activeTab === 'text') {
                if (value.length < 50) {
                    showError(`Please enter at least 50 characters. You've entered ${value.length} character(s).`);
                    return false;
                }
            } else if (activeTab === 'url') {
                if (!isValidArticleUrl(value)) {
                    showError('Please enter a valid URL starting with http:// or https://');
                    return false;
                }
            } else if (activeTab === 'youtube') {
                if (!isValidYouTubeUrl(value)) {
                    showError(
                        'Please enter a valid YouTube URL (e.g., https://www.youtube.com/watch?v=... or https://youtu.be/...)');
                    return false;
                }
            }

            return true;
        }

        // ────────── Reset Results ──────────
        function resetResults() {
            // Cancel any ongoing count-up animation
            if (countUpAnimationId) {
                cancelAnimationFrame(countUpAnimationId);
                countUpAnimationId = null;
            }
            currentResultPercentage = null;

            // Hide results section
            resultsSection.classList.remove('visible');

            // Reset gauge
            gaugeProgress.style.transition = 'none';
            gaugeProgress.style.strokeDashoffset = '503';
            gaugeProgress.style.stroke = 'rgba(255,255,255,0.08)';
            // Force reflow
            void gaugeProgress.offsetWidth;
            gaugeProgress.style.transition =
                'stroke-dashoffset 1.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), stroke 0.5s ease';

            // Reset text
            gaugePercentText.innerHTML = '0<span class="percent-sign">%</span>';
            gaugePercentText.style.color = '#e8e8f0';

            // Reset verdict badge
            verdictBadge.className = 'verdict-badge';
            verdictBadge.textContent = '';
            verdictBadge.style.opacity = '0';

            // Reset description
            verdictDescription.textContent = '';

            // Reset glow on gauge container
            gaugeContainer.style.filter = 'none';
        }

        // ────────── Display Results ──────────
        function displayResults(percentage) {
            currentResultPercentage = percentage;
            const roundedPercentage = Math.round(percentage);

            // Show results section
            resultsSection.classList.add('visible');
            // Re-trigger animation
            resultsSection.style.animation = 'none';
            void resultsSection.offsetWidth;
            resultsSection.style.animation = 'fadeSlideUp 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';

            // Determine category
            let category, verdictClass, glowColor, strokeColor, description;

            if (percentage < 35) {
                category = 'Likely Real';
                verdictClass = 'verdict-real';
                strokeColor = '#10B981';
                glowColor = 'rgba(16, 185, 129, 0.45)';
                description =
                    'Our AI model indicates this content is <strong>likely authentic</strong>. It shows strong signals of credible reporting with minimal indicators of misinformation.';
            } else if (percentage < 65) {
                category = 'Potentially Misleading';
                verdictClass = 'verdict-suspicious';
                strokeColor = '#F59E0B';
                glowColor = 'rgba(245, 158, 11, 0.45)';
                description =
                    'This content shows <strong>mixed signals</strong>. Some elements appear credible while others raise concerns. We recommend cross-referencing with trusted sources.';
            } else {
                category = 'Likely Fake';
                verdictClass = 'verdict-fake';
                strokeColor = '#EF4444';
                glowColor = 'rgba(239, 68, 68, 0.45)';
                description =
                    'Our AI model flags this as <strong>likely fake or highly misleading</strong>. It exhibits multiple patterns commonly associated with disinformation and fabricated content.';
            }

            // Update gauge stroke color
            gaugeProgress.style.stroke = strokeColor;

            // Calculate dashoffset: circumference ≈ 503, offset = 503 - (503 * percentage/100)
            const circumference = 503;
            const targetOffset = circumference - (circumference * percentage / 100);

            // Animate gauge
            gaugeProgress.style.transition =
                'stroke-dashoffset 1.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), stroke 0.5s ease';
            gaugeProgress.style.strokeDashoffset = targetOffset;

            // Add glow to gauge container
            gaugeContainer.style.filter = `drop-shadow(0 0 22px ${glowColor})`;
            gaugeContainer.style.transition = 'filter 0.6s ease';

            // Animate percentage number counting up
            animateCountUp(roundedPercentage, strokeColor);

            // Update verdict badge
            verdictBadge.className = 'verdict-badge ' + verdictClass;
            verdictBadge.textContent = category;
            verdictBadge.style.opacity = '1';
            verdictBadge.style.transition = 'opacity 0.4s ease';

            // Update description
            verdictDescription.innerHTML = description;
        }

        // ────────── Count-Up Animation ──────────
        function animateCountUp(targetNumber, color) {
            // Cancel any previous animation
            if (countUpAnimationId) {
                cancelAnimationFrame(countUpAnimationId);
                countUpAnimationId = null;
            }

            const duration = 1600; // milliseconds
            const startTime = performance.now();
            const startValue = 0;

            function update(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1.0);

                // Ease-out cubic
                const easedProgress = 1 - Math.pow(1 - progress, 3);
                const currentValue = Math.round(startValue + (targetNumber - startValue) * easedProgress);

                gaugePercentText.innerHTML = `${currentValue}<span class="percent-sign">%</span>`;
                gaugePercentText.style.color = color;
                gaugePercentText.style.transition = 'color 0.5s ease';

                if (progress < 1.0) {
                    countUpAnimationId = requestAnimationFrame(update);
                } else {
                    // Ensure final value is exact
                    gaugePercentText.innerHTML = `${targetNumber}<span class="percent-sign">%</span>`;
                    gaugePercentText.style.color = color;
                    countUpAnimationId = null;
                }
            }

            countUpAnimationId = requestAnimationFrame(update);
        }

        // ────────── Simulated ML Model API Call ──────────
        /**
         * Simulates sending data to a trained ML model and receiving a prediction.
         * 🔧 REPLACE THIS FUNCTION with a real fetch() call to your backend API.
         *
         * Expected real API contract:
         *   POST /api/analyze
         *   Body: { type: 'text'|'url'|'youtube', content: string }
         *   Response: { fakePercentage: number (0-100), category: string, ... }
         */
        async function analyzeWithMLModel(type, content) {
            // ── Simulate network delay (1.5 - 3 seconds) ──
            const delay = 1500 + Math.random() * 1500;
            await new Promise(resolve => setTimeout(resolve, delay));

            // ── Simulate ML model response ──
            // In a real app, this would be: const response = await fetch('/api/analyze', { ... });
            // const data = await response.json();
            // return data.fakePercentage;

            // Generate a pseudo-random but somewhat varied percentage for demo purposes
            const hash = content.length * 7 + (type === 'youtube' ? 13 : type === 'url' ? 7 : 1);
            const pseudoRandom = ((hash * 9301 + 49297) % 233280) / 233280;
            const fakePercentage = Math.round((pseudoRandom * 80 + 8) * 10) / 10; // Range ~8% to ~88%

            return {
                fakePercentage: Math.min(98, Math.max(2, fakePercentage)), // Clamp between 2-98%
                // Additional fields a real API might return:
                // confidence: data.confidence,
                // category: data.category,
                // details: data.details
            };
        }

        // ────────── Handle Submit ──────────
        async function handleSubmit() {
            if (isAnalyzing) return;

            // Validate input
            if (!validateInput()) return;

            // Clear previous results
            resetResults();
            clearError();

            // Set analyzing state
            isAnalyzing = true;
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            submitBtn.querySelector('.btn-text').innerHTML =
                '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';

            const activeInput = getActiveInput();
            const content = activeInput.value.trim();

            try {
                // 🔧 Call the ML model (simulated here — replace with real API endpoint)
                const result = await analyzeWithMLModel(activeTab, content);

                // Display results
                displayResults(result.fakePercentage);
            } catch (error) {
                console.error('Analysis error:', error);
                showError('An error occurred during analysis. Please try again later.');
                resetResults();
            } finally {
                // Reset button state
                isAnalyzing = false;
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
                submitBtn.querySelector('.btn-text').innerHTML =
                    '<i class="fa-solid fa-magnifying-glass"></i> Analyze News';
            }
        }

        // ────────── Event Listeners ──────────
        submitBtn.addEventListener('click', handleSubmit);

        // Allow Enter key to submit (only for URL inputs; textarea needs Shift+Enter for newline)
        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
            }
        });
        youtubeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
            }
        });
        // For textarea: Ctrl+Enter or Cmd+Enter to submit
        textInput.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
            }
        });

        // Analyze Another button
        analyzeAnotherBtn.addEventListener('click', () => {
            resetResults();
            // Scroll to input
            const activeInput = getActiveInput();
            activeInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            activeInput.focus();
        });

        // Clear error on input change
        [textInput, urlInput, youtubeInput].forEach(input => {
            input.addEventListener('input', () => {
                if (errorMsg.classList.contains('visible')) {
                    clearError();
                }
                // If user starts typing new content, hide old results
                if (currentResultPercentage !== null && !isAnalyzing) {
                    resetResults();
                }
            });
        });

        // ────────── Initialize ──────────
        function init() {
            // Set initial tab state
            switchTab('text');
            // Focus text input on load
            textInput.focus();
            // Ensure results are hidden
            resetResults();
        }

        init();

        console.log('%c🛡️ VeritasAI - Fake News Detector %cReady',
            'font-size: 1.2em; font-weight: bold; color: #6C63FF;',
            'color: #a0a0c0;');
        console.log('%c📌 Connect your ML model by replacing the analyzeWithMLModel() function.',
            'color: #F59E0B;');
        console.log('%c   Look for the 🔧 comments in the JavaScript section.',
            'color: #a0a0c0;');
    })();