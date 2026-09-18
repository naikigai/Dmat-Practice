/**
 * dMAT Practice — Latin Squares subtest logic.
 * No backend: all state lives in memory + sessionStorage (survives an
 * accidental refresh within the same tab, cleared when the tab closes).
 */

(function () {
  "use strict";

  const TOTAL_SECONDS = 25 * 60;
  const QUESTION_SECONDS = 75; // 25 min / 20 questions — proxy per-question budget only
  const STORAGE_KEY = "dmat-latin-squares-state-v2";
  const QUESTIONS = LATIN_SQUARES_DATA;

  const els = {
    timerDisplay: document.getElementById("timerDisplay"),
    timerBox: document.getElementById("timerBox"),
    questionTimer: document.getElementById("questionTimer"),
    questionTimerDisplay: document.getElementById("questionTimerDisplay"),
    endSubtestBtn: document.getElementById("endSubtestBtn"),
    toggleInstructions: document.getElementById("toggleInstructions"),
    instructionsIconBtn: document.getElementById("instructionsIconBtn"),
    instructionsPanel: document.getElementById("instructionsPanel"),
    fontButtons: document.querySelectorAll(".font-size-group button"),
    questionIndicator: document.getElementById("questionIndicator"),
    latinGrid: document.getElementById("latinGrid"),
    answerColumn: document.getElementById("answerColumn"),
    questionPills: document.getElementById("questionPills"),
    saveBackBtn: document.getElementById("saveBackBtn"),
    saveForwardBtn: document.getElementById("saveForwardBtn"),
    confirmModal: document.getElementById("confirmModal"),
    cancelEndBtn: document.getElementById("cancelEndBtn"),
    confirmEndBtn: document.getElementById("confirmEndBtn"),
    resultsModal: document.getElementById("resultsModal"),
    resultsHeading: document.getElementById("resultsHeading"),
    resultsSubheading: document.getElementById("resultsSubheading"),
    scoreCorrect: document.getElementById("scoreCorrect"),
    scoreAnswered: document.getElementById("scoreAnswered"),
    scoreTime: document.getElementById("scoreTime"),
    reviewBtn: document.getElementById("reviewBtn"),
  };

  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.answers) && parsed.answers.length === QUESTIONS.length) {
          if (
            !Array.isArray(parsed.questionTimeRemaining) ||
            parsed.questionTimeRemaining.length !== QUESTIONS.length
          ) {
            parsed.questionTimeRemaining = new Array(QUESTIONS.length).fill(QUESTION_SECONDS);
          }
          return parsed;
        }
      }
    } catch (e) {
      // ignore corrupted storage
    }
    return {
      answers: new Array(QUESTIONS.length).fill(null),
      current: 0,
      secondsRemaining: TOTAL_SECONDS,
      finished: false,
      questionTimeRemaining: new Array(QUESTIONS.length).fill(QUESTION_SECONDS),
    };
  }

  const state = loadState();

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // storage unavailable — practice still works, just won't persist
    }
  }

  function formatTime(totalSeconds) {
    const m = Math.max(0, Math.floor(totalSeconds / 60));
    const s = Math.max(0, totalSeconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function renderTimer() {
    els.timerDisplay.textContent = formatTime(state.secondsRemaining);
    els.timerBox.classList.toggle("low-time", state.secondsRemaining <= 60);
  }

  let timerInterval = null;

  function startTimer() {
    if (timerInterval || state.finished) return;
    timerInterval = setInterval(() => {
      state.secondsRemaining -= 1;
      if (state.secondsRemaining <= 0) {
        state.secondsRemaining = 0;
        renderTimer();
        finishSubtest({ auto: true });
        return;
      }
      renderTimer();
      saveState();
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // ---------- Per-question proxy timer (75s each, practice aid only) ----------
  // Starts the first time a question is opened, only ticks while that
  // question is the active one, pauses on navigation, and resumes from
  // wherever it left off if the user comes back. Purely informational: it
  // never affects answers, scoring, or the main 25-minute timer.
  let questionTimerInterval = null;

  function renderQuestionTimer() {
    const remaining = state.questionTimeRemaining[state.current];
    els.questionTimerDisplay.textContent = formatTime(remaining);
    els.questionTimer.classList.toggle("warn", remaining > 0 && remaining <= 15);
    els.questionTimer.classList.toggle("expired", remaining <= 0);
  }

  function startQuestionTimer() {
    if (questionTimerInterval || state.finished) return;
    if (state.questionTimeRemaining[state.current] <= 0) {
      renderQuestionTimer();
      return;
    }
    const activeIndex = state.current;
    questionTimerInterval = setInterval(() => {
      state.questionTimeRemaining[activeIndex] -= 1;
      if (state.questionTimeRemaining[activeIndex] <= 0) {
        state.questionTimeRemaining[activeIndex] = 0;
        stopQuestionTimer();
        renderQuestionTimer();
        renderPills();
        saveState();
        return;
      }
      renderQuestionTimer();
      saveState();
    }, 1000);
  }

  function stopQuestionTimer() {
    if (questionTimerInterval) {
      clearInterval(questionTimerInterval);
      questionTimerInterval = null;
    }
  }

  function renderQuestionIndicator() {
    els.questionIndicator.textContent = `Question ${state.current + 1} of ${QUESTIONS.length}`;
  }

  function renderGrid() {
    const puzzle = QUESTIONS[state.current];
    els.latinGrid.innerHTML = "";
    puzzle.grid.forEach((row) => {
      row.forEach((cell) => {
        const div = document.createElement("div");
        div.className = "latin-cell";
        if (cell === "?") {
          div.classList.add("question");
          div.textContent = "?";
        } else if (cell) {
          div.textContent = cell;
        } else {
          div.textContent = "";
        }
        els.latinGrid.appendChild(div);
      });
    });
  }

  function renderAnswerColumn() {
    const puzzle = QUESTIONS[state.current];
    const selected = state.answers[state.current];
    els.answerColumn.innerHTML = "";
    puzzle.options.forEach((letter) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "answer-option";
      btn.textContent = letter;
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", String(letter === selected));

      if (state.finished) {
        if (letter === puzzle.answer) {
          btn.classList.add("correct");
        } else if (letter === selected) {
          btn.classList.add("incorrect");
        }
        btn.disabled = true;
      } else {
        if (letter === selected) {
          btn.classList.add("selected");
        }
        btn.addEventListener("click", () => selectAnswer(letter));
      }

      els.answerColumn.appendChild(btn);
    });
  }

  function selectAnswer(letter) {
    if (state.finished) return;
    state.answers[state.current] = letter;
    saveState();
    renderAnswerColumn();
    renderPills();
  }

  function renderPills() {
    els.questionPills.innerHTML = "";
    QUESTIONS.forEach((q, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill";
      btn.textContent = String(i + 1);
      btn.title = `Question ${i + 1}`;
      if (i === state.current) btn.classList.add("current");
      if (!state.answers[i]) btn.classList.add("unanswered");
      if (state.questionTimeRemaining[i] <= 0) {
        btn.classList.add("time-up");
        btn.title = `Question ${i + 1} — practice timer ran out`;
      }
      btn.addEventListener("click", () => goTo(i));
      els.questionPills.appendChild(btn);
    });
  }

  function renderFooterNav() {
    els.saveBackBtn.disabled = state.current === 0;
    els.saveBackBtn.style.visibility = state.current === 0 ? "hidden" : "visible";

    const isLast = state.current === QUESTIONS.length - 1;
    els.saveForwardBtn.textContent = isLast ? "Finish subtest" : "Save and forward →";
  }

  function renderAll() {
    renderTimer();
    renderQuestionTimer();
    renderQuestionIndicator();
    renderGrid();
    renderAnswerColumn();
    renderPills();
    renderFooterNav();
  }

  function goTo(index) {
    if (index < 0 || index >= QUESTIONS.length) return;
    stopQuestionTimer();
    state.current = index;
    saveState();
    renderQuestionIndicator();
    renderGrid();
    renderAnswerColumn();
    renderPills();
    renderQuestionTimer();
    startQuestionTimer();
    renderFooterNav();
  }

  els.saveBackBtn.addEventListener("click", () => goTo(state.current - 1));
  els.saveForwardBtn.addEventListener("click", () => {
    if (state.current === QUESTIONS.length - 1) {
      openConfirmModal();
    } else {
      goTo(state.current + 1);
    }
  });

  // ---------- Instructions toggle ----------
  function setInstructionsVisible(visible) {
    els.instructionsPanel.classList.toggle("hidden", !visible);
    els.toggleInstructions.setAttribute("aria-expanded", String(visible));
    els.toggleInstructions.textContent = visible ? "▴" : "▾";
  }

  els.toggleInstructions.addEventListener("click", () => {
    const isHidden = els.instructionsPanel.classList.contains("hidden");
    setInstructionsVisible(isHidden);
  });

  els.instructionsIconBtn.addEventListener("click", () => {
    const isHidden = els.instructionsPanel.classList.contains("hidden");
    setInstructionsVisible(isHidden);
  });

  // ---------- Font size ----------
  function applyFontSize(size) {
    const scaleMap = { small: 0.88, medium: 1, large: 1.18 };
    document.documentElement.style.setProperty("--font-scale", scaleMap[size] || 1);
    els.fontButtons.forEach((b) => b.classList.toggle("active", b.dataset.size === size));
    try {
      localStorage.setItem("dmat-font-size", size);
    } catch (e) {
      /* ignore */
    }
  }

  els.fontButtons.forEach((btn) => {
    btn.addEventListener("click", () => applyFontSize(btn.dataset.size));
  });

  (function restoreFontSize() {
    try {
      const saved = localStorage.getItem("dmat-font-size");
      if (saved) applyFontSize(saved);
    } catch (e) {
      /* ignore */
    }
  })();

  // ---------- End subtest / results ----------
  function openConfirmModal() {
    if (state.finished) return;
    els.confirmModal.classList.remove("hidden");
  }

  function closeConfirmModal() {
    els.confirmModal.classList.add("hidden");
  }

  els.endSubtestBtn.addEventListener("click", openConfirmModal);
  els.cancelEndBtn.addEventListener("click", closeConfirmModal);
  els.confirmEndBtn.addEventListener("click", () => {
    closeConfirmModal();
    finishSubtest({ auto: false });
  });

  function showResultsModal(auto) {
    const total = QUESTIONS.length;
    const answered = state.answers.filter((a) => a !== null).length;
    const correct = QUESTIONS.reduce(
      (acc, q, i) => acc + (state.answers[i] === q.answer ? 1 : 0),
      0
    );
    const timeUsed = TOTAL_SECONDS - state.secondsRemaining;

    els.resultsHeading.textContent = auto ? "Time's up!" : "Subtest complete";
    els.resultsSubheading.textContent = `Here's how you did on Latin Squares (${total} questions).`;
    els.scoreCorrect.textContent = `${correct}/${total}`;
    els.scoreAnswered.textContent = `${answered}/${total}`;
    els.scoreTime.textContent = formatTime(timeUsed);

    els.resultsModal.classList.remove("hidden");
    renderAnswerColumn();
  }

  function finishSubtest({ auto }) {
    if (state.finished) return;
    stopTimer();
    stopQuestionTimer();
    state.finished = true;
    saveState();
    showResultsModal(auto);
  }

  els.reviewBtn.addEventListener("click", () => {
    els.resultsModal.classList.add("hidden");
    goTo(0);
  });

  // ---------- Init ----------
  renderAll();
  if (state.finished) {
    // Re-open results summary if the page was reloaded after finishing.
    showResultsModal(false);
  } else {
    startTimer();
    startQuestionTimer();
  }

  window.addEventListener("beforeunload", saveState);
})();
