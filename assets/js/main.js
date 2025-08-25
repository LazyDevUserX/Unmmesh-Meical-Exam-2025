/**
 * Main JavaScript file for the Exam Platform.
 * This file contains all the client-side logic for the application,
 * including homepage, exam, and results page functionality.
 * It uses a simple routing mechanism based on the page URL.
 *
 * Author: Jules
 * Version: 1.0.0
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize page-specific logic based on the presence of key elements.
    // This is more robust than checking URL paths.
    if (document.getElementById('exam-list')) {
        initHomepage();
    } else if (document.getElementById('exam-container')) {
        initExamPage();
    } else if (document.getElementById('results-container')) {
        initResultsPage();
    }
});

// --- UTILITY FUNCTIONS ---

/**
 * Fetches JSON data from a given URL.
 * @param {string} url - The URL to fetch JSON from.
 * @returns {Promise<object|null>} - The JSON data or null if an error occurs.
 */
async function fetchJSON(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Failed to fetch JSON from ${url}:`, error);
        return null;
    }
}

// --- HOMEPAGE LOGIC ---

/**
 * Initializes the homepage functionality: fetching exams, rendering cards, and setting up filters.
 */
async function initHomepage() {
    const examListContainer = document.getElementById('exam-list');
    const loadingMessage = document.getElementById('loading-exams');
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('filter-category');
    const difficultyFilter = document.getElementById('filter-difficulty');
    const noResultsMessage = document.getElementById('no-results');

    if (!examListContainer) return;

    let allExams = [];

    const examList = await fetchJSON('exam-list.json');

    if (!examList) {
        loadingMessage.textContent = 'Error: Could not load the list of exams.';
        return;
    }

    // Fetch metadata for all exams in parallel
    const metadataPromises = examList.map(exam =>
        fetchJSON(`_exams/${exam.id}/metadata.json`).then(meta => (meta ? { ...meta, id: exam.id } : null))
    );
    allExams = (await Promise.all(metadataPromises)).filter(Boolean); // Filter out any nulls from failed fetches

    if (allExams.length > 0) {
        loadingMessage.style.display = 'none';
        populateFilters(allExams);
        renderExams(allExams);
    } else {
        loadingMessage.textContent = 'No exams found.';
    }

    // Add event listeners for live filtering
    [searchInput, categoryFilter, difficultyFilter].forEach(el => {
        el.addEventListener('input', handleFilterChange);
        el.addEventListener('change', handleFilterChange);
    });

    function populateFilters(exams) {
        const categories = [...new Set(exams.map(exam => exam.category))];
        const difficulties = [...new Set(exams.map(exam => exam.difficulty))];

        categories.forEach(cat => categoryFilter.appendChild(new Option(cat, cat)));
        difficulties.forEach(diff => difficultyFilter.appendChild(new Option(diff, diff)));
    }

    function handleFilterChange() {
        const searchTerm = searchInput.value.toLowerCase();
        const selectedCategory = categoryFilter.value;
        const selectedDifficulty = difficultyFilter.value;

        const filteredExams = allExams.filter(exam => {
            const matchesSearch = exam.title.toLowerCase().includes(searchTerm) || exam.description.toLowerCase().includes(searchTerm);
            const matchesCategory = !selectedCategory || exam.category === selectedCategory;
            const matchesDifficulty = !selectedDifficulty || exam.difficulty === selectedDifficulty;
            return matchesSearch && matchesCategory && matchesDifficulty;
        });
        renderExams(filteredExams);
    }

    function renderExams(exams) {
        examListContainer.innerHTML = '';
        noResultsMessage.classList.toggle('hidden', exams.length > 0);

        exams.forEach(exam => {
            const card = document.createElement('a');
            card.href = `exam.html?exam=${exam.id}`;
            card.className = 'exam-card';
            card.innerHTML = `
                <div class="exam-card-body">
                    <h3 class="exam-card-title">${exam.title}</h3>
                    <p class="exam-card-desc">${exam.description}</p>
                </div>
                <div class="exam-card-footer">
                    <div class="exam-tags">
                        ${exam.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                    <span class="difficulty-badge difficulty-${exam.difficulty}">${exam.difficulty}</span>
                </div>
            `;
            examListContainer.appendChild(card);
        });
    }
}


// --- EXAM PAGE LOGIC ---

/**
 * Initializes the exam page, loading exam data, handling progress, and managing the exam flow.
 */
async function initExamPage() {
    const params = new URLSearchParams(window.location.search);
    const examId = params.get('exam');

    if (!examId) {
        document.body.innerHTML = '<h1>Error: No exam specified.</h1><a href="index.html">Go back</a>';
        return;
    }

    // DOM Elements
    const loadingDiv = document.getElementById('exam-loading');
    const contentDiv = document.getElementById('exam-content');
    const titleEl = document.getElementById('exam-title');
    const timerEl = document.getElementById('timer');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const questionTextEl = document.getElementById('question-text');
    const optionsListEl = document.getElementById('options-list');
    const flagBtn = document.getElementById('flag-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const submitBtn = document.getElementById('submit-btn');

    let examState = {};
    let timerInterval;

    const [metadata, data] = await Promise.all([
        fetchJSON(`_exams/${examId}/metadata.json`),
        fetchJSON(`_exams/${examId}/questions.json`)
    ]);

    if (!metadata || !data) {
        document.body.innerHTML = '<h1>Error: Could not load exam data.</h1><a href="index.html">Go back</a>';
        return;
    }

    // Load progress or start new exam
    loadProgress();

    function startNewExam() {
        examState = {
            examId,
            questions: data.questions,
            totalQuestions: data.questions.length,
            currentQuestionIndex: 0,
            userAnswers: new Array(data.questions.length).fill(null),
            flaggedQuestions: [],
            startTime: Date.now(),
            timeRemaining: metadata.duration * 60,
        };
        titleEl.textContent = metadata.title;
        loadingDiv.classList.add('hidden');
        contentDiv.classList.remove('hidden');
        renderQuestion();
        startTimer();
    }

    function renderQuestion() {
        const question = examState.questions[examState.currentQuestionIndex];
        questionTextEl.textContent = `${examState.currentQuestionIndex + 1}. ${question.question}`;
        optionsListEl.innerHTML = '';

        const questionType = question.type === 'multiple-answer' ? 'checkbox' : 'radio';
        optionsListEl.setAttribute('role', questionType === 'radio' ? 'radiogroup' : 'group');

        question.options.forEach((option, index) => {
            const li = document.createElement('li');
            const inputId = `q${examState.currentQuestionIndex}-o${index}`;
            const input = document.createElement('input');
            input.type = questionType;
            input.name = `q${examState.currentQuestionIndex}`;
            input.id = inputId;
            input.value = index;
            input.className = 'sr-only';

            const label = document.createElement('label');
            label.htmlFor = inputId;
            label.textContent = option;

            // Restore previous selection
            const currentAnswer = examState.userAnswers[examState.currentQuestionIndex];
            if (currentAnswer !== null) {
                if (questionType === 'checkbox') {
                    if (currentAnswer.includes(index)) input.checked = true;
                } else {
                    if (currentAnswer === index) input.checked = true;
                }
            }

            input.addEventListener('change', handleAnswerSelection);
            li.appendChild(input);
            li.appendChild(label);
            optionsListEl.appendChild(li);
        });

        updateProgress();
        updateNavButtons();
        saveProgress();
    }

    function handleAnswerSelection() {
        const selectedInputs = optionsListEl.querySelectorAll('input:checked');
        const questionType = examState.questions[examState.currentQuestionIndex].type;
        if (questionType === 'multiple-answer') {
            examState.userAnswers[examState.currentQuestionIndex] = Array.from(selectedInputs).map(i => parseInt(i.value));
        } else {
            examState.userAnswers[examState.currentQuestionIndex] = selectedInputs.length ? parseInt(selectedInputs[0].value) : null;
        }
        saveProgress();
    }

    function updateProgress() {
        const percent = ((examState.currentQuestionIndex + 1) / examState.totalQuestions) * 100;
        progressBar.style.width = `${percent}%`;
        progressText.textContent = `Question ${examState.currentQuestionIndex + 1} of ${examState.totalQuestions}`;
    }

    function updateNavButtons() {
        prevBtn.disabled = examState.currentQuestionIndex === 0;
        nextBtn.classList.toggle('hidden', examState.currentQuestionIndex === examState.totalQuestions - 1);
        submitBtn.classList.toggle('hidden', examState.currentQuestionIndex !== examState.totalQuestions - 1);
        flagBtn.textContent = examState.flaggedQuestions.includes(examState.currentQuestionIndex) ? 'Unflag' : 'Flag for Review';
    }

    function startTimer() {
        timerInterval = setInterval(() => {
            examState.timeRemaining--;
            const minutes = Math.floor(examState.timeRemaining / 60);
            const seconds = examState.timeRemaining % 60;
            timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            if (examState.timeRemaining <= 0) {
                submitExam();
            }
        }, 1000);
    }

    function saveProgress() {
        localStorage.setItem(`exam-progress-${examId}`, JSON.stringify(examState));
    }

    function loadProgress() {
        const savedState = localStorage.getItem(`exam-progress-${examId}`);
        if (savedState) {
            if (confirm('You have saved progress for this exam. Would you like to resume?')) {
                examState = JSON.parse(savedState);
                titleEl.textContent = metadata.title;
                loadingDiv.classList.add('hidden');
                contentDiv.classList.remove('hidden');
                renderQuestion();
                startTimer();
            } else {
                localStorage.removeItem(`exam-progress-${examId}`);
                startNewExam();
            }
        } else {
            startNewExam();
        }
    }

    function submitExam() {
        clearInterval(timerInterval);
        const result = {
            examId,
            userAnswers: examState.userAnswers,
            timeTaken: (metadata.duration * 60) - examState.timeRemaining,
        };
        localStorage.setItem(`exam-result-${examId}`, JSON.stringify(result));
        localStorage.removeItem(`exam-progress-${examId}`);
        window.location.href = `results.html?exam=${examId}`;
    }

    // Event Listeners
    prevBtn.addEventListener('click', () => { if (examState.currentQuestionIndex > 0) { examState.currentQuestionIndex--; renderQuestion(); } });
    nextBtn.addEventListener('click', () => { if (examState.currentQuestionIndex < examState.totalQuestions - 1) { examState.currentQuestionIndex++; renderQuestion(); } });
    submitBtn.addEventListener('click', () => { if(confirm('Are you sure you want to submit your exam?')) submitExam(); });
    flagBtn.addEventListener('click', () => {
        const index = examState.flaggedQuestions.indexOf(examState.currentQuestionIndex);
        if (index > -1) {
            examState.flaggedQuestions.splice(index, 1);
        } else {
            examState.flaggedQuestions.push(examState.currentQuestionIndex);
        }
        updateNavButtons();
    });
}


// --- RESULTS PAGE LOGIC ---

/**
 * Initializes the results page, calculating scores and rendering the detailed breakdown.
 */
async function initResultsPage() {
    const params = new URLSearchParams(window.location.search);
    const examId = params.get('exam');

    // DOM Elements
    const loadingDiv = document.getElementById('results-loading');
    const errorDiv = document.getElementById('results-error');
    const contentDiv = document.getElementById('results-content');

    if (!examId) {
        loadingDiv.classList.add('hidden');
        errorDiv.classList.remove('hidden');
        return;
    }

    const resultData = JSON.parse(localStorage.getItem(`exam-result-${examId}`));
    if (!resultData) {
        loadingDiv.classList.add('hidden');
        errorDiv.classList.remove('hidden');
        return;
    }

    const [metadata, questionsData] = await Promise.all([
        fetchJSON(`_exams/${examId}/metadata.json`),
        fetchJSON(`_exams/${examId}/questions.json`)
    ]);

    if (!metadata || !questionsData) {
        loadingDiv.classList.add('hidden');
        errorDiv.classList.remove('hidden');
        errorDiv.querySelector('h2').textContent = 'Error: Could not load exam data for results.';
        return;
    }

    const { questions } = questionsData;
    let score = 0;
    let totalPoints = 0;

    const reviewContainer = document.getElementById('results-breakdown');
    reviewContainer.innerHTML = '<h2>Answer Review</h2>'; // Clear and add header

    questions.forEach((q, index) => {
        const userAnswer = resultData.userAnswers[index];
        let isCorrect = false;
        totalPoints += q.points || 1;

        if (q.type === 'multiple-answer') {
            const correctSet = new Set(q.correctAnswers);
            const answerSet = new Set(userAnswer);
            isCorrect = correctSet.size === answerSet.size && [...correctSet].every(item => answerSet.has(item));
        } else {
            isCorrect = userAnswer === q.correctAnswer;
        }

        if (isCorrect) {
            score += q.points || 1;
        }

        // Render review question
        const reviewEl = document.createElement('div');
        reviewEl.className = `review-question ${isCorrect ? 'correct' : 'incorrect'}`;

        let optionsHtml = q.options.map((opt, i) => {
            let optClass = '';
            const isCorrectAnswer = q.type === 'multiple-answer' ? q.correctAnswers.includes(i) : q.correctAnswer === i;
            const isUserAnswer = q.type === 'multiple-answer' ? (userAnswer || []).includes(i) : userAnswer === i;

            if (isCorrectAnswer) optClass = 'option-correct';
            if (isUserAnswer && !isCorrectAnswer) optClass = 'option-user-incorrect';

            return `<li class="${optClass}"><label>${opt}</label></li>`;
        }).join('');

        reviewEl.innerHTML = `
            <p><strong>${index + 1}. ${q.question}</strong></p>
            <ul class="options-list">${optionsHtml}</ul>
            <div class="explanation"><strong>Explanation:</strong> ${q.explanation}</div>
        `;
        reviewContainer.appendChild(reviewEl);
    });

    const finalPercentage = totalPoints > 0 ? (score / totalPoints) * 100 : 0;
    const passed = finalPercentage >= metadata.passingScore;

    document.getElementById('results-exam-title').textContent = `${metadata.title} - Results`;
    document.getElementById('score-display').textContent = `${finalPercentage.toFixed(1)}%`;
    const statusEl = document.getElementById('pass-fail-status');
    statusEl.textContent = passed ? 'Passed' : 'Failed';
    statusEl.className = `pass-fail-status status-${passed ? 'pass' : 'fail'}`;

    loadingDiv.classList.add('hidden');
    contentDiv.classList.remove('hidden');

    document.getElementById('print-results-btn').addEventListener('click', () => window.print());

    // Clean up the result from local storage after displaying
    // localStorage.removeItem(`exam-result-${examId}`);
}
