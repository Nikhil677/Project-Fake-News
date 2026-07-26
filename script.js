
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
        const gaugeProgress = document.getElementById('gaugeProgress');
        const gaugePercentText = document.getElementById('gaugePercentText');
        const verdictBadge = document.getElementById('verdictBadge');
        const verdictDescription = document.getElementById('verdictDescription');
        const analyzeAnotherBtn = document.getElementById('analyzeAnotherBtn');
        const gaugeContainer = document.getElementById('gaugeContainer');
        const modeBtns = document.querySelectorAll('.mode-btn');
        const weightsToggle = document.getElementById('weightsToggle');
        const weightsPanel = document.getElementById('weightsPanel');
        const analysisOutput = document.getElementById('analysisOutput');
        const summaryVerdict = document.getElementById('summaryVerdict');
        const summaryConfidence = document.getElementById('summaryConfidence');
        const summarySource = document.getElementById('summarySource');

        // ────────── State ──────────
        let activeTab = 'text';
        let isAnalyzing = false;
        let countUpAnimationId = null;
        let currentResultPercentage = null;
        let currentMode = 'ai';
        let lastAnalysis = null;
        const API_BASE_URL = 'http://127.0.0.1:8000';

        // ────────── Tab Switching ──────────
        function switchTab(tabName) {
            if (isAnalyzing) return;

            activeTab = tabName;
            tabBtns.forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.tab === tabName) {
                    btn.classList.add('active');
                }
            });

            textInput.style.display = 'none';
            urlInput.style.display = 'none';
            youtubeInput.style.display = 'none';

            if (tabName === 'text') {
                textInput.style.display = 'block';
                inputHint.querySelector('span').textContent = 'Enter at least 50 characters for accurate analysis';
            } else if (tabName === 'url') {
                urlInput.style.display = 'block';
                inputHint.querySelector('span').textContent = 'Paste a complete URL (https://...) of the news article';
            } else if (tabName === 'youtube') {
                youtubeInput.style.display = 'block';
                inputHint.querySelector('span').textContent = 'Supported formats: youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/...';
            }

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

        function getActiveInput() {
            if (activeTab === 'text') return textInput;
            if (activeTab === 'url') return urlInput;
            if (activeTab === 'youtube') return youtubeInput;
            return textInput;
        }

        function showError(message) {
            errorMsgText.textContent = message;
            errorMsg.classList.add('visible');
            const activeInput = getActiveInput();
            activeInput.classList.add('error');
            setTimeout(() => activeInput.classList.remove('error'), 600);
        }

        function clearError() {
            errorMsg.classList.remove('visible');
            errorMsgText.textContent = '';
            textInput.classList.remove('error');
            urlInput.classList.remove('error');
            youtubeInput.classList.remove('error');
        }

        function isValidYouTubeUrl(url) {
            const ytRegex = /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)[\w\-]{11}([?&][^\s]*)?$/i;
            return ytRegex.test(url.trim());
        }

        function isValidArticleUrl(url) {
            const trimmed = url.trim();
            try {
                const urlObj = new URL(trimmed);
                return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
            } catch {
                return false;
            }
        }

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
                    showError('Please enter a valid YouTube URL (e.g., https://www.youtube.com/watch?v=... or https://youtu.be/...)');
                    return false;
                }
            }

            return true;
        }

        function resetResults() {
            if (countUpAnimationId) {
                cancelAnimationFrame(countUpAnimationId);
                countUpAnimationId = null;
            }
            currentResultPercentage = null;
            lastAnalysis = null;
            weightsPanel.innerHTML = '';
            weightsPanel.classList.remove('visible');
            analysisOutput.innerHTML = '';
            summaryVerdict.textContent = 'Waiting for analysis...';
            summaryConfidence.textContent = 'Confidence: --';
            summarySource.textContent = 'Source: --';
            resultsSection.classList.remove('visible');

            gaugeProgress.style.transition = 'none';
            gaugeProgress.style.strokeDashoffset = '503';
            gaugeProgress.style.stroke = 'rgba(255,255,255,0.08)';
            void gaugeProgress.offsetWidth;
            gaugeProgress.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), stroke 0.5s ease';
            gaugePercentText.innerHTML = '0<span class="percent-sign">%</span>';
            gaugePercentText.style.color = '#e8e8f0';
            verdictBadge.className = 'verdict-badge';
            verdictBadge.textContent = 'Analyzing...';
            verdictBadge.style.opacity = '0';
            verdictDescription.textContent = '';
            gaugeContainer.style.filter = 'none';
        }

        function escapeHtml(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function getModePayload(mode) {
            if (!lastAnalysis) return null;
            const aiScore = Number(lastAnalysis.aiResult?.fakeness_percentage ?? 50);
            const mlScore = Number(lastAnalysis.mlResult?.fakePercentage ?? 50);
            const combinedScore = Math.round((aiScore * 0.65 + mlScore * 0.35));

            if (mode === 'ml') {
                return {
                    percentage: mlScore,
                    title: 'ML Output',
                    summary: lastAnalysis.mlResult?.summary || 'ML model output is ready for integration.',
                    confidence: lastAnalysis.mlResult?.confidence || 0.74,
                    source: 'ML placeholder response',
                    description: 'The ML model output is currently wired as a placeholder and can be swapped with your friend’s real endpoint later.'
                };
            }

            if (mode === 'combined') {
                return {
                    percentage: combinedScore,
                    title: 'ML + AI',
                    summary: 'Combined view using an AI/ML blended score.',
                    confidence: Math.round((Number(lastAnalysis.aiResult?.ai_analysis?.confidence || 0.75) + Number(lastAnalysis.mlResult?.confidence || 0.74)) * 50) / 100,
                    source: 'AI + ML blend',
                    description: 'This view combines the AI verdict score with the ML placeholder score to preview how the final dashboard can look.'
                };
            }

            return {
                percentage: aiScore,
                title: 'AI Output',
                summary: lastAnalysis.aiResult?.ai_analysis?.summary || lastAnalysis.aiResult?.summary || 'AI summary is unavailable.',
                confidence: lastAnalysis.aiResult?.ai_analysis?.confidence || 0.8,
                source: lastAnalysis.aiResult?.ai_analysis?.factors?.source_credibility?.rating || 'Unknown',
                description: lastAnalysis.aiResult?.ai_analysis?.summary || 'The AI analysis response from the FastAPI backend.'
            };
        }

        function displayResults(percentage, modeData) {
            currentResultPercentage = percentage;
            const roundedPercentage = Math.round(percentage);
            resultsSection.classList.add('visible');
            resultsSection.style.animation = 'none';
            void resultsSection.offsetWidth;
            resultsSection.style.animation = 'fadeSlideUp 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';

            let category, verdictClass, glowColor, strokeColor, description;
            if (percentage < 35) {
                category = 'Likely Real';
                verdictClass = 'verdict-real';
                strokeColor = '#10B981';
                glowColor = 'rgba(16, 185, 129, 0.45)';
                description = 'The content appears mostly credible and shows fewer warning signs.';
            } else if (percentage < 65) {
                category = 'Potentially Misleading';
                verdictClass = 'verdict-suspicious';
                strokeColor = '#F59E0B';
                glowColor = 'rgba(245, 158, 11, 0.45)';
                description = 'The signals are mixed. It would be smart to cross-check this article with trusted sources.';
            } else {
                category = 'Likely Fake';
                verdictClass = 'verdict-fake';
                strokeColor = '#EF4444';
                glowColor = 'rgba(239, 68, 68, 0.45)';
                description = 'This content shows several strong disinformation indicators and should be treated cautiously.';
            }

            gaugeProgress.style.stroke = strokeColor;
            const circumference = 503;
            const targetOffset = circumference - (circumference * percentage / 100);
            gaugeProgress.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), stroke 0.5s ease';
            gaugeProgress.style.strokeDashoffset = targetOffset;
            gaugeContainer.style.filter = `drop-shadow(0 0 22px ${glowColor})`;
            gaugeContainer.style.transition = 'filter 0.6s ease';
            animateCountUp(roundedPercentage, strokeColor);

            verdictBadge.className = 'verdict-badge ' + verdictClass;
            verdictBadge.textContent = category;
            verdictBadge.style.opacity = '1';
            verdictBadge.style.transition = 'opacity 0.4s ease';
            verdictDescription.innerHTML = `${description}<br><strong>${modeData.title}</strong> — ${escapeHtml(modeData.summary)}`;

            summaryVerdict.textContent = `${modeData.title}: ${category}`;
            summaryConfidence.textContent = `Confidence: ${Math.round(Number(modeData.confidence || 0) * 100)}%`;
            summarySource.textContent = `Source: ${escapeHtml(modeData.source || 'Unknown')}`;
        }

        function animateCountUp(targetNumber, color) {
            if (countUpAnimationId) {
                cancelAnimationFrame(countUpAnimationId);
                countUpAnimationId = null;
            }
            const duration = 1600;
            const startTime = performance.now();
            const startValue = 0;

            function update(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1.0);
                const easedProgress = 1 - Math.pow(1 - progress, 3);
                const currentValue = Math.round(startValue + (targetNumber - startValue) * easedProgress);
                gaugePercentText.innerHTML = `${currentValue}<span class="percent-sign">%</span>`;
                gaugePercentText.style.color = color;
                gaugePercentText.style.transition = 'color 0.5s ease';

                if (progress < 1.0) {
                    countUpAnimationId = requestAnimationFrame(update);
                } else {
                    gaugePercentText.innerHTML = `${targetNumber}<span class="percent-sign">%</span>`;
                    gaugePercentText.style.color = color;
                    countUpAnimationId = null;
                }
            }
            countUpAnimationId = requestAnimationFrame(update);
        }

        function renderAnalysisPanel(mode) {
            if (!lastAnalysis) return;
            const aiAnalysis = lastAnalysis.aiResult?.ai_analysis || {};
            const factors = aiAnalysis.factors || {};
            const weights = lastAnalysis.aiResult?.weights_used || {};
            const mlDetails = lastAnalysis.mlResult || {};

            const featureList = Array.isArray(mlDetails.features) && mlDetails.features.length
                ? mlDetails.features.map(item => `<li>${escapeHtml(item)}</li>`).join('')
                : '<li>ML feature list will be added once your friend uploads the model.</li>';

            const factorMarkup = Object.entries(factors).map(([name, value]) => {
                const summaryText = typeof value === 'object'
                    ? value.explanation || value.reason || value.issue || value.status || JSON.stringify(value)
                    : value;
                return `<div class="factor-card">
                    <strong>${escapeHtml(name.replace(/_/g, ' '))}</strong>
                    <span>${escapeHtml(String(summaryText))}</span>
                </div>`;
            }).join('');

            analysisOutput.innerHTML = `
                <div class="detail-section">
                    <h4>Overview</h4>
                    <p><strong>Verdict:</strong> ${escapeHtml(aiAnalysis.verdict || 'Unverified')}</p>
                    <p><strong>Summary:</strong> ${escapeHtml(aiAnalysis.summary || 'No summary available.')}</p>
                    <p><strong>Confidence:</strong> ${Math.round(Number(aiAnalysis.confidence || 0) * 100)}%</p>
                </div>
                <div class="detail-section">
                    <h4>Factor breakdown</h4>
                    <div class="factor-grid">${factorMarkup}</div>
                </div>
                <div class="detail-section">
                    <h4>ML placeholder</h4>
                    <p><strong>ML score:</strong> ${Number(mlDetails.fakePercentage || 0).toFixed(1)}%</p>
                    <ul>${featureList}</ul>
                </div>
            `;

            weightsPanel.innerHTML = `
                <p>Weights used by the AI calculation:</p>
                <div class="weights-grid">
                    ${Object.entries(weights).map(([name, value]) => `<div class="weight-row"><span>${escapeHtml(name.replace(/_/g, ' '))}</span><span>${Number(value).toFixed(3)}</span></div>`).join('')}
                </div>
            `;
        }

        function setActiveMode(mode) {
            currentMode = mode;
            modeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
            if (lastAnalysis) {
                const modeData = getModePayload(mode);
                displayResults(modeData.percentage, modeData);
                renderAnalysisPanel(mode);
            }
        }

        async function analyzeWithBackend(type, content) {
            const payload = activeTab === 'text' ? { content } : activeTab === 'url' ? { url: content } : { content };
            const response = await fetch(`${API_BASE_URL}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'The backend returned an error.');
            }
            return response.json();
        }

        async function analyzeWithMLModel(type, content) {
            const delay = 900 + Math.random() * 800;
            await new Promise(resolve => setTimeout(resolve, delay));
            const hash = content.length * 7 + (type === 'youtube' ? 13 : type === 'url' ? 7 : 1);
            const pseudoRandom = ((hash * 9301 + 49297) % 233280) / 233280;
            const fakePercentage = Math.round((pseudoRandom * 78 + 10) * 10) / 10;
            return {
                fakePercentage: Math.min(98, Math.max(2, fakePercentage)),
                confidence: 0.74,
                summary: 'ML placeholder response is ready for your friend’s model file.',
                features: ['Text features', 'URL features', 'Pattern signals']
            };
        }

        async function handleSubmit() {
            if (isAnalyzing) return;
            if (!validateInput()) return;

            resetResults();
            clearError();

            isAnalyzing = true;
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            submitBtn.querySelector('.btn-text').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';

            const activeInput = getActiveInput();
            const content = activeInput.value.trim();

            try {
                const aiResult = await analyzeWithBackend(activeTab, content);
                const mlResult = await analyzeWithMLModel(activeTab, content);

                lastAnalysis = { aiResult, mlResult };
                setActiveMode(currentMode);
            } catch (error) {
                console.error('Analysis error:', error);
                showError(error.message || 'An error occurred during analysis. Please try again later.');
                resetResults();
            } finally {
                isAnalyzing = false;
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
                submitBtn.querySelector('.btn-text').innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Analyze News';
            }
        }

        submitBtn.addEventListener('click', handleSubmit);

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
        textInput.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
            }
        });

        analyzeAnotherBtn.addEventListener('click', () => {
            resetResults();
            const activeInput = getActiveInput();
            activeInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            activeInput.focus();
        });

        [textInput, urlInput, youtubeInput].forEach(input => {
            input.addEventListener('input', () => {
                if (errorMsg.classList.contains('visible')) {
                    clearError();
                }
                if (currentResultPercentage !== null && !isAnalyzing) {
                    resetResults();
                }
            });
        });

        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => setActiveMode(btn.dataset.mode));
        });

        weightsToggle.addEventListener('click', () => {
            weightsPanel.classList.toggle('visible');
        });

        function init() {
            switchTab('text');
            textInput.focus();
            resetResults();
        }

        init();

        console.log('%c🛡️ VeritasAI - Fake News Detector %cReady',
            'font-size: 1.2em; font-weight: bold; color: #6C63FF;',
            'color: #a0a0c0;');
        console.log('%c📌 AI results now call the FastAPI backend and the ML response is ready for later integration.',
            'color: #F59E0B;');
    })();