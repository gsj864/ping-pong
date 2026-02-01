/**
 * Ping Pong - Poki Quality Edition
 * First to 5, paddle speed → ball speed, spin, fullscreen
 * Poki SDK: Commercial Break, Rewarded Break
 */
(function () {
  'use strict';

  // ===== Poki SDK Wrapper (no-op when SDK not loaded) =====
  var Poki = {
    ok: false,
    init: function () {
      if (typeof PokiSDK === 'undefined') return Promise.resolve();
      return PokiSDK.init().then(function () { Poki.ok = true; }).catch(function () { Poki.ok = false; });
    },
    gameLoadingFinished: function () {
      if (Poki.ok && PokiSDK.gameLoadingFinished) PokiSDK.gameLoadingFinished();
    },
    gameplayStart: function () {
      if (Poki.ok && PokiSDK.gameplayStart) PokiSDK.gameplayStart();
    },
    gameplayStop: function () {
      if (Poki.ok && PokiSDK.gameplayStop) PokiSDK.gameplayStop();
    },
    commercialBreak: function (onPause) {
      if (!Poki.ok || !PokiSDK.commercialBreak) return Promise.resolve();
      return PokiSDK.commercialBreak(typeof onPause === 'function' ? onPause : function () {});
    },
    rewardedBreak: function (opts) {
      if (!Poki.ok || !PokiSDK.rewardedBreak) return Promise.resolve(false);
      if (typeof opts === 'function') opts = { onStart: opts };
      var p = PokiSDK.rewardedBreak(opts || {});
      return p && typeof p.then === 'function' ? p.then(function (s) { return !!s; }) : Promise.resolve(false);
    }
  };

  // ===== Constants =====
  const WIN_SCORE = 5;
  function getWinScore() { return challengeMode ? challengeWinScore : WIN_SCORE; }
  const PADDLE_W = 14;
  const PADDLE_H_RATIO = 0.18;
  const BALL_R = 15;
  const BALL_SPEED_BASE = 0.012;
  const BALL_SPEED_MAX = 0.024;
  const PADDLE_SPEED_INFLUENCE = 0.6;
  const SPIN_STRENGTH = 1.0;
  const NET_DASH = 12;
  const COUNTDOWN_SECONDS = 3;
  const COUNTDOWN_INTERVAL_MS = 500;
  const PADDLE_KEYBOARD_SPEED = 0.018;

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  function darkenHex(hex, amt) {
    const { r, g, b } = hexToRgb(hex);
    return '#' + [r, g, b].map(function (v) {
      return Math.max(0, Math.min(255, Math.round(v * (1 - amt)))).toString(16).padStart(2, '0');
    }).join('');
  }

  function lightenHex(hex, amt) {
    const { r, g, b } = hexToRgb(hex);
    return '#' + [r, g, b].map(function (v) {
      return Math.max(0, Math.min(255, Math.round(v + (255 - v) * amt))).toString(16).padStart(2, '0');
    }).join('');
  }

  // 공 속도: 랠리 최소 20초 이상 이어지도록 전 난이도 느리게. 이지 0.34, 노멀/하드 0.4
  const BALL_SPEED_1P = 0.4;
  const BALL_SPEED_EASY = 0.34;
  const AI_SETTINGS = {
    easy: { delay: 170, speed: 0.26, error: 0.16, ballSpeed: BALL_SPEED_EASY },
    normal: { delay: 170, speed: 0.26, error: 0.16, ballSpeed: BALL_SPEED_1P },
    hard: { delay: 110, speed: 0.30, error: 0.12, ballSpeed: BALL_SPEED_1P }
  };
  // 이지 20초, 노멀 30초, 하드 40초부터 난이도 완화
  const RELAX_AFTER_SEC = { easy: 20, normal: 30, hard: 40 };
  const RELAX_BLEND_SEC = 60;
  const RELAX_MULT = { delay: 1.25, speed: 0.88, error: 1.2 };
  const RELAX_MULT_EASY = { delay: 1.12, speed: 0.94, error: 1.1 };

  /** 랠리/생존/정확도 챌린지: 상대(AI)가 실점하면 안 되므로 AI가 무조건 받아치게 설정 */
  var CHALLENGE_IDS_AI_NEVER_MISS = [3, 4, 7, 9, 12, 15, 16, 20];
  var CHALLENGE_RALLY_TARGET = { 3: 5, 7: 20, 15: 20, 20: 50 };
  var CHALLENGE_SURVIVAL_TARGET = { 4: 20, 9: 30, 16: 50 };
  var CHALLENGE_CENTER_HIT_TARGET = { 12: 10 };
  var CHALLENGE_TIME_LIMIT = { 6: 30 };

  function getEffectiveAiSettings() {
    var base = AI_SETTINGS[difficulty];
    if (challengeMode && currentChallengeId && CHALLENGE_IDS_AI_NEVER_MISS.indexOf(currentChallengeId) >= 0) {
      return { delay: 40, speed: 0.45, error: 0, ballSpeed: base.ballSpeed };
    }
    var sec = gameElapsedMs / 1000;
    var threshold = RELAX_AFTER_SEC[difficulty];
    if (sec < threshold) return base;
    var t = Math.min(1, (sec - threshold) / RELAX_BLEND_SEC);
    var mult = difficulty === 'easy' ? RELAX_MULT_EASY : RELAX_MULT;
    return {
      delay: base.delay * (1 + (mult.delay - 1) * t),
      speed: base.speed * (1 + (mult.speed - 1) * t),
      error: base.error * (1 + (mult.error - 1) * t),
      ballSpeed: base.ballSpeed
    };
  }

  // ===== DOM Elements =====
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const container = document.getElementById('game-container');

  const startScreen = document.getElementById('start-screen');
  const pauseScreen = document.getElementById('pause-screen');
  const endScreen = document.getElementById('end-screen');
  const countdownScreen = document.getElementById('countdown-screen');
  const countdownNum = document.getElementById('countdown-num');

  const scoreLeftEl = document.getElementById('score-left');
  const scoreRightEl = document.getElementById('score-right');
  const endTitle = document.getElementById('end-title');
  const endScoreEl = document.getElementById('end-score');
  const endSubtitleEl = document.getElementById('end-subtitle');

  const playBtn = document.getElementById('play-btn');
  const challengeBtn = document.getElementById('challenge-btn');
  const challengeBackBtn = document.getElementById('challenge-back-btn');
  const challengeRetryBtn = document.getElementById('challenge-retry-btn');
  const challengeResultBackBtn = document.getElementById('challenge-result-back-btn');
  const gameMenuBtn = document.getElementById('game-menu-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsBtnPause = document.getElementById('settings-btn-pause');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsCloseBtn = document.getElementById('settings-close-btn');
  const resumeBtn = document.getElementById('resume-btn');
  const replayBtn = document.getElementById('replay-btn');
  const menuBtnPause = document.getElementById('menu-btn-pause');
  const menuBtnEnd = document.getElementById('menu-btn-end');
  const rewardedBtn = document.getElementById('rewarded-btn');

  const sfxSlider = document.getElementById('sfx-slider');
  const musicSlider = document.getElementById('music-slider');
  const diffBtns = document.querySelectorAll('.diff-btn');
  const modeBtns = document.querySelectorAll('.mode-btn');
  const controlsHint = document.getElementById('controls-hint');

  // ===== State =====
  const GAME_ASPECT = 16 / 9;
  let W, H, gameW, gameH, offsetX, offsetY, paddleH, leftX, rightX;
  let scoreLeft = 0, scoreRight = 0;
  let gameRunning = false;
  let isPaused = false;
  let animId = 0;
  let lastTime = 0;
  let serveDelay = 0;
  let countdownActive = false;
  let countdownValue = 0;
  let countdownTimer = 0;

  let playerY = 0.5, playerVelY = 0, prevPlayerY = 0.5;
  let aiY = 0.5, aiVelY = 0, aiTargetY = 0.5, aiReactionT = 0, prevAiY = 0.5;
  let ball = { x: 0.5, y: 0.5, vx: 0, vy: 0 };
  let pointerY = 0.5;
  let mouseLeftDown = false, mouseRightDown = false;
  let gameElapsedMs = 0;

  let sfxVolume = 0.5;
  let musicVolume = 0.5;
  let soundMuted = false;
  let difficulty = 'normal';
  let backgroundColor = '#2e7d32';
  let paddleLeftColor = '#29b6f6';
  let paddleRightColor = '#ff7043';
  let twoPlayerMode = false;
  let endlessMode = false;
  let ballSpeedMultiplier = 0.75;
  let challengeMode = false;
  let currentChallengeId = null;
  let challengeWinScore = 5;
  let currentRallyCount = 0;
  let maxRallyCount = 0;
  let survivalStartMs = 0;
  let currentSurvivalMs = 0;
  let maxSurvivalTimeSec = 0;
  let matchStartMs = 0;
  let centerHitCount = 0;
  let ballSpeedLevel = 0;
  let was02 = false;
  let challengeMatchWins = 0;
  let challengeMatchLosses = 0;
  let endlessHitCount = 0;
  let completedChallengeIds = [];
  let selectedChallengeId = null;
  let settingsOpenedFrom = 'start';
  const keys = { p1Up: false, p1Down: false, p2Up: false, p2Down: false };
  let touchP1Y = null;
  let touchP2Y = null;
  const touchMap = {};

  // ===== Resize (letterbox: keep 16:9 game area, scale to fit) =====
  function resize() {
    var cw = container.clientWidth || window.innerWidth || 640;
    var ch = container.clientHeight || window.innerHeight || 360;
    W = canvas.width = cw;
    H = canvas.height = ch;
    if (W / H > GAME_ASPECT) {
      gameH = H;
      gameW = H * GAME_ASPECT;
    } else {
      gameW = W;
      gameH = W / GAME_ASPECT;
    }
    offsetX = (W - gameW) / 2;
    offsetY = (H - gameH) / 2;
    if (gameW <= 0 || gameH <= 0) {
      gameW = W;
      gameH = H;
      offsetX = 0;
      offsetY = 0;
    }
    paddleH = gameH * PADDLE_H_RATIO;
    leftX = PADDLE_W + 20;
    rightX = gameW - PADDLE_W - 20;
  }

  // ===== Utility =====
  function randDir() { return Math.random() > 0.5 ? 1 : -1; }

  function serve(dir) {
    ball.x = 0.5;
    ball.y = 0.5;
    if (dir === undefined) dir = -1;
    var mult = twoPlayerMode ? ballSpeedMultiplier : AI_SETTINGS[difficulty].ballSpeed;
    if (challengeMode && ballSpeedLevel > 0) mult *= (1 + ballSpeedLevel * 0.1);
    if (challengeMode && currentChallengeId === 11) mult *= 1.3;
    ball.vx = BALL_SPEED_BASE * mult * dir;
    ball.vy = 0;
    playerY = aiY = 0.5;
    prevPlayerY = playerY;
    aiReactionT = 0;
  }

  // ===== Countdown (숫자당 1초, 시간 기준) =====
  var countdownStartTime = 0;
  function startCountdown(callback) {
    countdownActive = true;
    countdownValue = COUNTDOWN_SECONDS;
    countdownStartTime = performance.now();
    countdownNum.textContent = countdownValue;
    countdownScreen.classList.remove('hidden');
    sound('countdown');

    const countdownLoop = function () {
      var elapsedMs = performance.now() - countdownStartTime;
      var secIndex = Math.floor(elapsedMs / COUNTDOWN_INTERVAL_MS);
      if (secIndex >= COUNTDOWN_SECONDS) {
        countdownNum.textContent = 'GO!';
        sound('go');
        setTimeout(function () {
          countdownScreen.classList.add('hidden');
          countdownActive = false;
          if (gameMenuBtn) gameMenuBtn.classList.remove('hidden');
          callback();
        }, 400);
        return;
      }
      var nextVal = COUNTDOWN_SECONDS - secIndex;
      if (nextVal !== countdownValue && nextVal >= 1) {
        countdownValue = nextVal;
        countdownNum.textContent = countdownValue;
        sound('countdown');
      }
      requestAnimationFrame(countdownLoop);
    };
    requestAnimationFrame(countdownLoop);
  }

  // ===== Game Flow =====
  function startGame() {
    var modeEl = document.querySelector('.mode-btn.active');
    var mode = modeEl && modeEl.getAttribute ? modeEl.getAttribute('data-mode') : 'vsai';
    twoPlayerMode = mode === '2p';
    endlessMode = mode === 'endless';
    if (!challengeMode) {
      currentChallengeId = null;
      challengeWinScore = WIN_SCORE;
    }
    keys.p1Up = keys.p1Down = keys.p2Up = keys.p2Down = false;
    touchP1Y = touchP2Y = null;
    Object.keys(touchMap).forEach(function (k) { delete touchMap[k]; });
    scoreLeft = 0;
    scoreRight = 0;
    gameElapsedMs = 0;
    currentRallyCount = 0;
    maxRallyCount = 0;
    currentSurvivalMs = 0;
    maxSurvivalTimeSec = 0;
    centerHitCount = 0;
    ballSpeedLevel = 0;
    was02 = false;
    endlessHitCount = 0;
    matchStartMs = performance.now();
    if (challengeMode && currentChallengeId === 20) survivalStartMs = performance.now();
    else survivalStartMs = matchStartMs;
    updateScoreUI();
    startScreen.classList.add('hidden');
    endScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    if (typeof document !== 'undefined') {
      var cr = document.getElementById('challenge-result-screen');
      if (cr) cr.classList.add('hidden');
    }
    gameRunning = true;
    isPaused = false;
    resize();
    serve(-1);
    if (!twoPlayerMode) { mouseLeftDown = false; mouseRightDown = false; }

    startCountdown(function () {
      lastTime = performance.now();
      loop(lastTime);
    });
    bgm.start();
  }

  function startChallengeGame(challengeId) {
    if (typeof window === 'undefined' || !window.ChallengeMode) return;
    var c = window.ChallengeMode.getChallenge(challengeId);
    if (!c) return;
    challengeMode = true;
    currentChallengeId = challengeId;
    difficulty = c.stageDifficulty || 'normal';
    challengeWinScore = c.winScore || 5;
    twoPlayerMode = false;
    endlessMode = false;
    syncDifficultyButtons(difficulty);
    keys.p1Up = keys.p1Down = keys.p2Up = keys.p2Down = false;
    touchP1Y = touchP2Y = null;
    Object.keys(touchMap).forEach(function (k) { delete touchMap[k]; });
    scoreLeft = 0;
    scoreRight = 0;
    was02 = false;
    if (challengeId === 10) {
      scoreLeft = 0;
      scoreRight = 2;
      was02 = true;
    }
    gameElapsedMs = 0;
    currentRallyCount = 0;
    maxRallyCount = 0;
    currentSurvivalMs = 0;
    maxSurvivalTimeSec = 0;
    centerHitCount = 0;
    ballSpeedLevel = 0;
    endlessHitCount = 0;
    matchStartMs = performance.now();
    survivalStartMs = matchStartMs;
    updateScoreUI();
    startScreen.classList.add('hidden');
    var cs = document.getElementById('challenge-screen');
    if (cs) cs.classList.add('hidden');
    endScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    var cr = document.getElementById('challenge-result-screen');
    var cc = document.getElementById('challenge-continue-screen');
    if (cr) cr.classList.add('hidden');
    if (cc) cc.classList.add('hidden');
    gameRunning = true;
    isPaused = false;
    resize();
    serve(-1);
    mouseLeftDown = false;
    mouseRightDown = false;
    startCountdown(function () {
      lastTime = performance.now();
      loop(lastTime);
    });
    bgm.start();
    if (gameMenuBtn) gameMenuBtn.classList.remove('hidden');
  }

  function showMenu() {
    Poki.gameplayStop();
    if (document.pointerLockElement) document.exitPointerLock();
    gameRunning = false;
    isPaused = false;
    countdownActive = false;
    challengeMode = false;
    currentChallengeId = null;
    if (animId) cancelAnimationFrame(animId);
    animId = 0;
    startScreen.classList.remove('hidden');
    endScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    countdownScreen.classList.add('hidden');
    var cs = document.getElementById('challenge-screen');
    var cr = document.getElementById('challenge-result-screen');
    var cc = document.getElementById('challenge-continue-screen');
    if (cs) cs.classList.add('hidden');
    if (cr) cr.classList.add('hidden');
    if (cc) cc.classList.add('hidden');
    if (gameMenuBtn) gameMenuBtn.classList.add('hidden');
    bgm.stop();
  }

  function pauseGame() {
    if (!gameRunning || isPaused || countdownActive) return;
    Poki.gameplayStop();
    if (document.pointerLockElement) document.exitPointerLock();
    isPaused = true;
    if (gameMenuBtn) gameMenuBtn.classList.add('hidden');
    pauseScreen.classList.remove('hidden');
    var pauseGoal = document.getElementById('pause-challenge-goal');
    if (pauseGoal) {
      if (challengeMode && currentChallengeId && typeof window.ChallengeMode !== 'undefined') {
        var ch = window.ChallengeMode.getChallenge(currentChallengeId);
        if (ch && ch.description) {
          pauseGoal.textContent = '🎯 ' + ch.description;
          pauseGoal.style.display = 'block';
        } else {
          pauseGoal.style.display = 'none';
        }
      } else {
        pauseGoal.style.display = 'none';
      }
    }
    var pauseDiff = document.getElementById('pause-difficulty-group');
    if (pauseDiff) {
      pauseDiff.style.display = endlessMode ? 'flex' : 'none';
      if (endlessMode) syncDifficultyButtons(difficulty);
    }
    var pauseBallSpeed = document.getElementById('pause-ball-speed-group');
    if (pauseBallSpeed) pauseBallSpeed.style.display = 'none';
    bgm.pause();
  }

  function resumeGame() {
    if (!isPaused) return;
    isPaused = false;
    Poki.gameplayStart();
    pauseScreen.classList.add('hidden');
    if (gameMenuBtn) gameMenuBtn.classList.remove('hidden');
    lastTime = performance.now();
    if (!twoPlayerMode) { mouseLeftDown = false; mouseRightDown = false; }
    bgm.resume();
  }

  function buildChallengeState(isWin) {
    var matchTimeSec = (performance.now() - matchStartMs) / 1000;
    return {
      playerScore: scoreLeft,
      aiScore: scoreRight,
      win: isWin,
      maxRallyCount: maxRallyCount,
      survivalTimeSec: maxSurvivalTimeSec,
      matchTimeSec: matchTimeSec,
      difficulty: difficulty,
      centerHitCount: centerHitCount,
      ballSpeedLevel: ballSpeedLevel,
      comebackFrom02: was02,
      rallyDropCount: scoreRight,
      matchWins: challengeMatchWins,
      endlessHitCount: endlessHitCount
    };
  }

  function endChallengeGame(success) {
    Poki.gameplayStop();
    bgm.stop();
    if (document.pointerLockElement) document.exitPointerLock();
    if (gameMenuBtn) gameMenuBtn.classList.add('hidden');
    gameRunning = false;
    if (animId) cancelAnimationFrame(animId);
    animId = 0;
    var state = buildChallengeState(success);
    var passed = typeof window !== 'undefined' && window.ChallengeMode && window.ChallengeMode.checkComplete(currentChallengeId, state);
    if (passed && completedChallengeIds.indexOf(currentChallengeId) === -1) {
      completedChallengeIds.push(currentChallengeId);
      try { localStorage.setItem(CHALLENGES_KEY, JSON.stringify(completedChallengeIds)); } catch (e) {}
    }
    var resultTitle = document.getElementById('challenge-result-title');
    var resultMsg = document.getElementById('challenge-result-msg');
    if (resultTitle) resultTitle.textContent = passed ? 'CHALLENGE CLEAR!' : 'FAILED';
    if (resultTitle) resultTitle.style.color = passed ? '#4fc3f7' : '#ff7043';
    if (resultMsg) {
      if (passed) resultMsg.textContent = 'Stage cleared!';
      else {
        var failMsgs = [
          'Try again.',
          'So close! Give it another shot.',
          "You've got this! One more try.",
          'Almost there! Don\'t give up.',
          'Next time is yours!',
          'Keep going! You can do it.',
          'That was close! Try again.',
          'Just a little more!',
          'Better luck next time!',
          'Stay focused and try again.',
          'One more attempt!',
          'You can clear this!'
        ];
        resultMsg.textContent = failMsgs[Math.floor(Math.random() * failMsgs.length)];
      }
    }
    sound(passed ? 'challengeClear' : 'challengeFail');
    var cr = document.getElementById('challenge-result-screen');
    if (cr) cr.classList.remove('hidden');
  }

  function showChallengeContinueOffer() {
    isPaused = true;
    if (gameMenuBtn) gameMenuBtn.classList.add('hidden');
    if (bgm && typeof bgm.pause === 'function') bgm.pause();
    Poki.gameplayStop();
    var continueMsgs = [
      'Watch an ad to continue the challenge.',
      'One more chance! Watch an ad to keep going.',
      'Don\'t give up! Watch an ad to continue.',
      'Watch an ad for another shot at this stage.',
      'Keep trying! Watch an ad to resume.',
      'Almost had it! Watch an ad to continue.',
      'Watch an ad to get back in the game.',
      'One more try? Watch an ad to continue.'
    ];
    var msgEl = document.getElementById('challenge-continue-msg');
    if (msgEl) msgEl.textContent = continueMsgs[Math.floor(Math.random() * continueMsgs.length)];
    var cc = document.getElementById('challenge-continue-screen');
    if (cc) cc.classList.remove('hidden');
  }

  function resumeChallengeAfterAd() {
    var cc = document.getElementById('challenge-continue-screen');
    if (cc) cc.classList.add('hidden');
    isPaused = false;
    if (gameMenuBtn) gameMenuBtn.classList.remove('hidden');
    if (bgm && typeof bgm.resume === 'function') bgm.resume();
    else if (bgm && typeof bgm.start === 'function') bgm.start();
    Poki.gameplayStart();
    serveDelay = 0;
    if (currentChallengeId === 6) matchStartMs = performance.now();
    serve(-1);
    lastTime = performance.now();
  }

  function endGame(result) {
    var isWin = result === true || result === 'p1';
    if (challengeMode && currentChallengeId !== null) {
      var state = buildChallengeState(isWin);
      var passed = typeof window !== 'undefined' && window.ChallengeMode && window.ChallengeMode.checkComplete(currentChallengeId, state);
      endChallengeGame(passed);
      return;
    }
    Poki.gameplayStop();
    bgm.stop();
    if (document.pointerLockElement) document.exitPointerLock();
    if (gameMenuBtn) gameMenuBtn.classList.add('hidden');
    gameRunning = false;
    if (animId) cancelAnimationFrame(animId);
    animId = 0;
    endScreen.classList.remove('hidden');
    endScreen.classList.toggle('win', isWin);
    endScreen.classList.toggle('lose', !isWin);
    if (result === 'p1') endTitle.textContent = 'P1 WINS!';
    else if (result === 'p2') endTitle.textContent = 'P2 WINS!';
    else endTitle.textContent = result ? 'YOU WIN!' : 'YOU LOSE';
    endScoreEl.textContent = scoreLeft + ' - ' + scoreRight;
    // "Almost Win" 메시지: 1P 패배 시 내 점수에 따라 (3점 이상=거의 다왔다, 2점 이하=할 수 있다)
    if (endSubtitleEl) {
      if (!isWin && !twoPlayerMode) {
        var soCloseMsgs = [
          'So close! One more?',
          'Almost there! Try again?',
          'So close! You almost had it!',
          'Just a little more! One more try?',
          'That was close! Again?'
        ];
        var youGotThisMsgs = [
          "You've got this! Try again.",
          "You can do it! Give it another shot.",
          "Don't give up! You've got this.",
          "Next time is yours! Try again.",
          "Keep going! You've got what it takes."
        ];
        if (scoreLeft >= 3) {
          endSubtitleEl.textContent = soCloseMsgs[Math.floor(Math.random() * soCloseMsgs.length)];
          endSubtitleEl.style.display = '';
        } else {
          endSubtitleEl.textContent = youGotThisMsgs[Math.floor(Math.random() * youGotThisMsgs.length)];
          endSubtitleEl.style.display = '';
        }
      } else {
        endSubtitleEl.textContent = '';
        endSubtitleEl.style.display = 'none';
      }
    }
    sound(isWin ? 'win' : 'lose');
    var showRewarded = !isWin && !twoPlayerMode && rewardedBtn && scoreRight > 0;
    if (rewardedBtn) {
      rewardedBtn.classList.toggle('hidden', !showRewarded);
    }
  }

  function reviveAndContinue() {
    if (scoreRight <= 0) return;
    scoreRight--;
    updateScoreUI();
    endScreen.classList.add('hidden');
    if (rewardedBtn) rewardedBtn.classList.add('hidden');
    gameRunning = true;
    isPaused = false;
    serveDelay = 0;
    resize();
    serve(-1);
    if (!twoPlayerMode) { mouseLeftDown = false; mouseRightDown = false; }
    startCountdown(function () {
      lastTime = performance.now();
      loop(lastTime);
    });
    if (gameMenuBtn) gameMenuBtn.classList.remove('hidden');
    bgm.start();
  }

  function updateScoreUI() {
    scoreLeftEl.textContent = scoreLeft;
    scoreRightEl.textContent = scoreRight;
  }

  function updateChallengeHUD() {
    var el = document.getElementById('challenge-hud');
    var textEl = document.getElementById('challenge-hud-text');
    if (!el || !textEl) return;
    if (!challengeMode || !currentChallengeId) {
      el.classList.add('hidden');
      return;
    }
    var rallyTarget = CHALLENGE_RALLY_TARGET[currentChallengeId];
    var survivalTarget = CHALLENGE_SURVIVAL_TARGET[currentChallengeId];
    if (rallyTarget !== undefined) {
      el.classList.remove('hidden');
      textEl.textContent = 'Rally: ' + currentRallyCount + ' / ' + rallyTarget;
      return;
    }
    if (survivalTarget !== undefined) {
      el.classList.remove('hidden');
      var currentSec = Math.floor(currentSurvivalMs / 1000);
      var left = Math.max(0, survivalTarget - currentSec);
      textEl.textContent = 'Survive: ' + currentSec + ' / ' + survivalTarget + ' sec (' + left + 's left)';
      return;
    }
    var centerHitTarget = CHALLENGE_CENTER_HIT_TARGET[currentChallengeId];
    if (centerHitTarget !== undefined) {
      el.classList.remove('hidden');
      textEl.textContent = 'Center: ' + centerHitCount + ' / ' + centerHitTarget;
      return;
    }
    var timeLimit = CHALLENGE_TIME_LIMIT[currentChallengeId];
    if (timeLimit !== undefined) {
      el.classList.remove('hidden');
      var matchTimeSec = (performance.now() - matchStartMs) / 1000;
      var timeLeft = Math.max(0, Math.ceil(timeLimit - matchTimeSec));
      textEl.textContent = 'Time: ' + timeLeft + 's left (1 point to win)';
      return;
    }
    el.classList.add('hidden');
  }

  // ===== Collision =====
  function paddleTop(y) { return (y - PADDLE_H_RATIO / 2) * gameH; }
  function paddleBottom(y) { return (y + PADDLE_H_RATIO / 2) * gameH; }

  function clampBallSpeed(ballSpeedMult) {
    const maxSpeed = BALL_SPEED_MAX * ballSpeedMult;
    const s = Math.hypot(ball.vx, ball.vy);
    if (s > maxSpeed) {
      ball.vx = (ball.vx / s) * maxSpeed;
      ball.vy = (ball.vy / s) * maxSpeed;
    }
  }

  var lastPlayerHitNorm = null;
  function hitPaddle(isLeft, paddleY, paddleVelY) {
    const px = isLeft ? leftX : rightX;
    const bx = ball.x * gameW;
    const by = ball.y * gameH;
    const r = BALL_R;
    const pw = PADDLE_W;
    const ph = paddleH;
    const top = paddleTop(paddleY);
    const bottom = paddleBottom(paddleY);

    var ballSpeedMult = twoPlayerMode ? ballSpeedMultiplier : AI_SETTINGS[difficulty].ballSpeed;
    if (challengeMode && ballSpeedLevel > 0) ballSpeedMult *= (1 + ballSpeedLevel * 0.1);
    if (challengeMode && currentChallengeId === 11) ballSpeedMult *= 1.3;
    if (challengeMode && currentChallengeId === 18) ballSpeedMult *= 1.5;
    const maxSpeed = BALL_SPEED_MAX * ballSpeedMult;

    if (isLeft && ball.vx < 0 && bx - r <= px + pw && bx + r >= px - pw && by >= top - r && by <= bottom + r) {
      const hitNorm = (by - top) / ph - 0.5;
      lastPlayerHitNorm = hitNorm;
      ball.x = (px + pw + r) / gameW;
      const baseSpeed = Math.min(maxSpeed, Math.hypot(ball.vx, ball.vy) * 1.08);
      ball.vx = baseSpeed;
      ball.vy = hitNorm * SPIN_STRENGTH * baseSpeed + paddleVelY * PADDLE_SPEED_INFLUENCE;
      clampBallSpeed(ballSpeedMult);
      sound('paddle');
      return true;
    }
    if (!isLeft && ball.vx > 0 && bx + r >= px - pw && bx - r <= px + pw && by >= top - r && by <= bottom + r) {
      const hitNorm = (by - top) / ph - 0.5;
      lastPlayerHitNorm = null;
      ball.x = (px - pw - r) / gameW;
      const baseSpeed = Math.min(maxSpeed, Math.hypot(ball.vx, ball.vy) * 1.08);
      ball.vx = -baseSpeed;
      ball.vy = hitNorm * SPIN_STRENGTH * baseSpeed + paddleVelY * PADDLE_SPEED_INFLUENCE;
      clampBallSpeed(ballSpeedMult);
      sound('paddle');
      return true;
    }
    return false;
  }

  // ===== Update =====
  function update(dt) {
    if (!gameRunning || isPaused || countdownActive) return;

    const dtNorm = Math.min(dt, 40) / 16;
    if (!twoPlayerMode) gameElapsedMs += dt;
    if (challengeMode) {
      updateChallengeHUD();
      var timeLimitSec = CHALLENGE_TIME_LIMIT[currentChallengeId];
      if (timeLimitSec !== undefined) {
        var matchTimeSecNow = (performance.now() - matchStartMs) / 1000;
        if (matchTimeSecNow >= timeLimitSec && scoreLeft < 1) {
          showChallengeContinueOffer();
          return;
        }
      }
    }
    const aiSettings = getEffectiveAiSettings();

    if (serveDelay > 0) {
      serveDelay -= dt;
      if (serveDelay <= 0) {
        serve(-1);
        startCountdown(function () {
          lastTime = performance.now();
        });
      }
      return;
    }

    prevPlayerY = playerY;
    if (twoPlayerMode) {
      if (touchP1Y !== null) {
        playerY += (touchP1Y - playerY) * 0.4;
      } else {
        if (keys.p1Up) playerY -= PADDLE_KEYBOARD_SPEED * dtNorm;
        if (keys.p1Down) playerY += PADDLE_KEYBOARD_SPEED * dtNorm;
      }
    } else {
      if (mouseLeftDown) playerY -= PADDLE_KEYBOARD_SPEED * dtNorm;
      if (mouseRightDown) playerY += PADDLE_KEYBOARD_SPEED * dtNorm;
    }
    playerY = Math.max(0.12, Math.min(0.88, playerY));
    playerVelY = (playerY - prevPlayerY) / dtNorm;

    // Player 2 / AI (right paddle)
    prevAiY = aiY;
    if (twoPlayerMode) {
      if (touchP2Y !== null) {
        aiY += (touchP2Y - aiY) * 0.4;
      } else {
        if (keys.p2Up) aiY -= PADDLE_KEYBOARD_SPEED * dtNorm;
        if (keys.p2Down) aiY += PADDLE_KEYBOARD_SPEED * dtNorm;
      }
      aiY = Math.max(0.12, Math.min(0.88, aiY));
      aiVelY = (aiY - prevAiY) / dtNorm;
    } else {
      if (ball.vx > 0) {
        aiReactionT += dt;
        if (aiReactionT >= aiSettings.delay) {
          aiTargetY = ball.y + (Math.random() - 0.5) * 2 * aiSettings.error;
          aiReactionT = 0;
        }
      } else {
        aiReactionT = 0;
      }
      const aiDiff = aiTargetY - aiY;
      const aiMove = aiSettings.speed * dtNorm * 0.18;
      aiY += Math.abs(aiDiff) <= aiMove ? aiDiff : (aiDiff > 0 ? aiMove : -aiMove);
      aiY = Math.max(0.12, Math.min(0.88, aiY));
      aiVelY = 0;
    }

    // Ball
    ball.x += ball.vx * dtNorm;
    ball.y += ball.vy * dtNorm;

    // Wall collision
    const by = ball.y * gameH;
    const r = BALL_R;
    if (by - r <= 0) {
      ball.y = r / gameH;
      ball.vy = Math.abs(ball.vy);
      sound('wall');
    }
    if (by + r >= gameH) {
      ball.y = (gameH - r) / gameH;
      ball.vy = -Math.abs(ball.vy);
      sound('wall');
    }

    // Paddle collision
    hitPaddle(true, playerY, playerVelY);
    hitPaddle(false, aiY, aiVelY);

    if (lastPlayerHitNorm !== null) {
      currentRallyCount++;
      if (currentRallyCount > maxRallyCount) maxRallyCount = currentRallyCount;
      if (Math.abs(lastPlayerHitNorm) < 0.2) centerHitCount++;
      if (endlessMode) endlessHitCount++;
      var rallyTarget = CHALLENGE_RALLY_TARGET[currentChallengeId];
      if (challengeMode && rallyTarget !== undefined && currentRallyCount >= rallyTarget) {
        endChallengeGame(true);
        return;
      }
      var centerHitTarget = CHALLENGE_CENTER_HIT_TARGET[currentChallengeId];
      if (challengeMode && centerHitTarget !== undefined && centerHitCount >= centerHitTarget) {
        endChallengeGame(true);
        return;
      }
      lastPlayerHitNorm = null;
    }
    if (!twoPlayerMode) {
      currentSurvivalMs += dt;
      var survSec = currentSurvivalMs / 1000;
      if (survSec > maxSurvivalTimeSec) maxSurvivalTimeSec = survSec;
      var survivalTarget = CHALLENGE_SURVIVAL_TARGET[currentChallengeId];
      if (challengeMode && survivalTarget !== undefined && maxSurvivalTimeSec >= survivalTarget) {
        endChallengeGame(true);
        return;
      }
      ballSpeedLevel = Math.min(3, Math.floor(gameElapsedMs / 15000));
    }
    if (scoreRight >= 2 && scoreLeft === 0) was02 = true;

    // Score
    const bx = ball.x * gameW;
    if (bx + r < 0) {
      var isCh8Fail = challengeMode && currentChallengeId === 8;
      var isCh17Fail = challengeMode && currentChallengeId === 17 && scoreRight + 1 >= 3;
      var isRallyOrSurvival = challengeMode && currentChallengeId && (CHALLENGE_RALLY_TARGET[currentChallengeId] !== undefined || CHALLENGE_SURVIVAL_TARGET[currentChallengeId] !== undefined || CHALLENGE_CENTER_HIT_TARGET[currentChallengeId] !== undefined);
      var isGameOverFail = challengeMode && scoreRight + 1 >= getWinScore();
      var isContinuableFail = isCh8Fail || isCh17Fail || isRallyOrSurvival || isGameOverFail;
      if (isContinuableFail) {
        showChallengeContinueOffer();
        return;
      }
      scoreRight++;
      currentRallyCount = 0;
      currentSurvivalMs = 0;
      updateScoreUI();
      sound('score');
      var isCh20 = challengeMode && currentChallengeId === 20;
      if (!isCh20 && !endlessMode && scoreRight >= getWinScore()) endGame(twoPlayerMode ? 'p2' : false);
      else serveDelay = 800;
    }
    if (bx - r > gameW) {
      scoreLeft++;
      currentRallyCount = 0;
      updateScoreUI();
      sound('score');
      var isCh20 = challengeMode && currentChallengeId === 20;
      if (!isCh20 && !endlessMode && scoreLeft >= getWinScore()) endGame(twoPlayerMode ? 'p1' : true);
      else serveDelay = 800;
    }
  }

  // ===== Draw =====
  function draw() {
    const c1 = darkenHex(backgroundColor, 0.15);
    const c2 = backgroundColor;
    const c3 = darkenHex(backgroundColor, 0.2);
    ctx.fillStyle = c3;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    const bgGrad = ctx.createLinearGradient(0, 0, gameW, gameH);
    bgGrad.addColorStop(0, c1);
    bgGrad.addColorStop(0.5, c2);
    bgGrad.addColorStop(1, c3);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, gameW, gameH);

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, gameW - 20, gameH - 20);

    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.setLineDash([NET_DASH, NET_DASH]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(gameW / 2, 10);
    ctx.lineTo(gameW / 2, gameH - 10);
    ctx.stroke();
    ctx.setLineDash([]);

    const py = playerY * gameH;
    const paddleGrad1 = ctx.createLinearGradient(leftX - PADDLE_W, 0, leftX + PADDLE_W, 0);
    paddleGrad1.addColorStop(0, lightenHex(paddleLeftColor, 0.2));
    paddleGrad1.addColorStop(1, darkenHex(paddleLeftColor, 0.15));
    ctx.fillStyle = paddleGrad1;
    ctx.beginPath();
    ctx.roundRect(leftX - PADDLE_W / 2, py - paddleH / 2, PADDLE_W, paddleH, 4);
    ctx.fill();
    ctx.shadowColor = paddleLeftColor + '80';
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;

    const ay = aiY * gameH;
    const paddleGrad2 = ctx.createLinearGradient(rightX - PADDLE_W, 0, rightX + PADDLE_W, 0);
    paddleGrad2.addColorStop(0, lightenHex(paddleRightColor, 0.15));
    paddleGrad2.addColorStop(1, darkenHex(paddleRightColor, 0.2));
    ctx.fillStyle = paddleGrad2;
    ctx.beginPath();
    ctx.roundRect(rightX - PADDLE_W / 2, ay - paddleH / 2, PADDLE_W, paddleH, 4);
    ctx.fill();
    ctx.shadowColor = paddleRightColor + '80';
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Ball
    const bx = ball.x * gameW;
    const ballY = ball.y * gameH;
    ctx.shadowColor = 'rgba(255,255,255,0.6)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(bx, ballY, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Ball trail effect
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(bx - ball.vx * gameW * 2, ballY - ball.vy * gameH * 2, BALL_R * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ===== Loop =====
  function loop(now) {
    const dt = now - lastTime;
    lastTime = now;
    update(dt);
    draw();
    animId = requestAnimationFrame(loop);
  }

  // ===== Input (convert client to game area 0–1) =====
  function setPointer(clientY) {
    const rect = canvas.getBoundingClientRect();
    var canvasY = (clientY - rect.top) * H / rect.height;
    pointerY = Math.max(0, Math.min(1, (canvasY - offsetY) / gameH));
  }

  document.addEventListener('mousemove', function (e) {
    if (!gameRunning || isPaused || twoPlayerMode) return;
    setPointer(e.clientY);
  });

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('mousedown', function (e) {
    if (!gameRunning || isPaused || twoPlayerMode) return;
    if (e.button === 0) mouseLeftDown = true;
    if (e.button === 2) { mouseRightDown = true; e.preventDefault(); }
  });
  document.addEventListener('mouseup', function (e) {
    if (e.button === 0) mouseLeftDown = false;
    if (e.button === 2) mouseRightDown = false;
  });

  function getTouchY(clientY) {
    const rect = canvas.getBoundingClientRect();
    var canvasY = (clientY - rect.top) * H / rect.height;
    return Math.max(0, Math.min(1, (canvasY - offsetY) / gameH));
  }

  function getTouchSide(clientX) {
    const rect = canvas.getBoundingClientRect();
    var canvasX = (clientX - rect.left) * W / rect.width;
    return canvasX < offsetX + gameW / 2 ? 'p1' : 'p2';
  }

  canvas.addEventListener('touchstart', function (e) {
    if (!gameRunning || isPaused) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const side = getTouchSide(t.clientX);
      touchMap[t.identifier] = side;
      const y = getTouchY(t.clientY);
      if (side === 'p1') touchP1Y = y;
      else touchP2Y = y;
    }
    if (!twoPlayerMode && e.touches.length) setPointer(e.touches[0].clientY);
  }, { passive: true });

  canvas.addEventListener('touchmove', function (e) {
    if (!gameRunning || isPaused) return;
    let handled = false;
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      const side = touchMap[t.identifier];
      if (side) {
        handled = true;
        const y = getTouchY(t.clientY);
        if (side === 'p1') touchP1Y = y;
        else touchP2Y = y;
      }
    }
    if (twoPlayerMode && handled) e.preventDefault();
    if (!twoPlayerMode && e.touches.length) {
      e.preventDefault();
      setPointer(e.touches[0].clientY);
    }
  }, { passive: false });

  function handleTouchEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const id = e.changedTouches[i].identifier;
      const side = touchMap[id];
      delete touchMap[id];
      if (side === 'p1' && !Object.values(touchMap).some(function (s) { return s === 'p1'; })) touchP1Y = null;
      if (side === 'p2' && !Object.values(touchMap).some(function (s) { return s === 'p2'; })) touchP2Y = null;
    }
  }

  canvas.addEventListener('touchend', handleTouchEnd, { passive: true });
  canvas.addEventListener('touchcancel', handleTouchEnd, { passive: true });

  // ===== Background Music (2nd request: upbeat arcade, melody + bass) =====
  var bgm = (function () {
    var ac = null;
    var gainNode = null;
    var intervalId = null;
    var beatIndex = 0;
    var melody = [659, 784, 988, 784, 659, 523, 659, 784, 988, 1175, 988, 784, 659, 523, 392, 523];
    var bass   = [165, 0, 196, 0, 220, 0, 196, 0, 165, 0, 196, 0, 220, 247, 220, 196];
    var beatMs = 180;

    function playNote(freq, type, vol, dur) {
      if (!ac || !gainNode || !freq || soundMuted || musicVolume <= 0) return;
      try {
        var o = ac.createOscillator();
        var g = ac.createGain();
        o.connect(g);
        g.connect(gainNode);
        o.type = type;
        o.frequency.value = freq;
        var t = ac.currentTime;
        g.gain.setValueAtTime(vol * musicVolume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.start(t);
        o.stop(t + dur);
      } catch (_) {}
    }

    function tick() {
      var idx = beatIndex % melody.length;
      playNote(melody[idx], 'square', 0.36, 0.12);
      playNote(bass[idx], 'triangle', 0.48, 0.15);
      beatIndex++;
    }

    function start() {
      try {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!ac) ac = new C();
        if (ac.state === 'suspended') ac.resume();
        if (!gainNode) {
          gainNode = ac.createGain();
          gainNode.connect(ac.destination);
          gainNode.gain.value = 0;
        }
        gainNode.gain.setValueAtTime(Math.max(0, musicVolume * 1.5), ac.currentTime);
        beatIndex = 0;
        if (intervalId) clearInterval(intervalId);
        tick();
        intervalId = setInterval(tick, beatMs);
      } catch (_) {}
    }

    function stop() {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
      if (gainNode && ac) gainNode.gain.setValueAtTime(0, ac.currentTime);
    }

    function setGain() {
      if (!gainNode || !ac) return;
      gainNode.gain.setValueAtTime(soundMuted || musicVolume <= 0 ? 0 : musicVolume * 1.5, ac.currentTime);
    }

    function pause() {
      if (gainNode && ac) gainNode.gain.setValueAtTime(0, ac.currentTime);
    }

    function resume() {
      if (gainNode && ac && !soundMuted && musicVolume > 0) gainNode.gain.setValueAtTime(musicVolume * 1.5, ac.currentTime);
    }

    return { start: start, stop: stop, setGain: setGain, pause: pause, resume: resume };
  })();

  // ===== Sound (Ping pong ball bounce) =====
  function sound(type) {
    if (soundMuted || sfxVolume === 0) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!sound.ctx) sound.ctx = new C();
      const ac = sound.ctx;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g);
      g.connect(ac.destination);
      o.type = 'sine';

      const t = ac.currentTime;
      const vol = 0.88 * sfxVolume;

      switch (type) {
        case 'paddle':
          o.frequency.setValueAtTime(1100, t);
          o.frequency.exponentialRampToValueAtTime(350, t + 0.012);
          g.gain.setValueAtTime(vol, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.028);
          o.start(t);
          o.stop(t + 0.028);
          return;
        case 'wall':
          o.frequency.setValueAtTime(850, t);
          o.frequency.exponentialRampToValueAtTime(280, t + 0.01);
          g.gain.setValueAtTime(vol, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
          o.start(t);
          o.stop(t + 0.025);
          return;
        case 'score':
          o.frequency.setValueAtTime(900, t);
          o.frequency.setValueAtTime(600, t + 0.02);
          o.frequency.setValueAtTime(750, t + 0.04);
          g.gain.setValueAtTime(vol, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          o.start(t);
          o.stop(t + 0.08);
          return;
        case 'countdown':
          o.type = 'sine';
          o.frequency.setValueAtTime(440, t);
          g.gain.setValueAtTime(vol, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          o.start(t);
          o.stop(t + 0.08);
          return;
        case 'go':
          o.type = 'sine';
          o.frequency.setValueAtTime(523, t);
          o.frequency.setValueAtTime(659, t + 0.04);
          o.frequency.setValueAtTime(784, t + 0.08);
          g.gain.setValueAtTime(vol, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          o.start(t);
          o.stop(t + 0.15);
          return;
        case 'win':
          o.type = 'sine';
          o.frequency.setValueAtTime(523, t);
          o.frequency.setValueAtTime(659, t + 0.08);
          o.frequency.setValueAtTime(784, t + 0.16);
          g.gain.setValueAtTime(vol, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
          o.start(t);
          o.stop(t + 0.35);
          return;
        case 'lose':
          o.type = 'sine';
          o.frequency.setValueAtTime(280, t);
          o.frequency.setValueAtTime(200, t + 0.12);
          g.gain.setValueAtTime(vol, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          o.start(t);
          o.stop(t + 0.18);
          return;
        case 'challengeClear':
          o.type = 'sine';
          o.frequency.setValueAtTime(523, t);
          o.frequency.setValueAtTime(659, t + 0.18);
          o.frequency.setValueAtTime(784, t + 0.36);
          o.frequency.setValueAtTime(1047, t + 0.54);
          g.gain.setValueAtTime(vol, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
          o.start(t);
          o.stop(t + 0.9);
          return;
        case 'challengeFail':
          o.type = 'sine';
          o.frequency.setValueAtTime(392, t);
          o.frequency.setValueAtTime(330, t + 0.2);
          o.frequency.setValueAtTime(262, t + 0.4);
          o.frequency.setValueAtTime(196, t + 0.6);
          g.gain.setValueAtTime(vol, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
          o.start(t);
          o.stop(t + 0.85);
          return;
        case 'click':
          o.frequency.setValueAtTime(800, t);
          o.frequency.setValueAtTime(600, t + 0.03);
          g.gain.setValueAtTime(vol, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          o.start(t);
          o.stop(t + 0.06);
          return;
      }
    } catch (_) {}
  }

  var loadingSettings = false;
  function setSfxVolume(val) {
    sfxVolume = Math.max(0, Math.min(1, val));
    if (sfxSlider) sfxSlider.value = sfxVolume * 100;
    if (!loadingSettings && typeof saveSettings === 'function') saveSettings();
  }

  function setMusicVolume(val) {
    musicVolume = Math.max(0, Math.min(1, val));
    if (musicSlider) musicSlider.value = musicVolume * 100;
    bgm.setGain();
    if (!loadingSettings && typeof saveSettings === 'function') saveSettings();
  }

  var savedSfxBeforeAd = 0.5;
  var savedMusicBeforeAd = 0.5;

  function doPauseForAd() {
    savedSfxBeforeAd = sfxVolume || 0.5;
    savedMusicBeforeAd = musicVolume || 0.5;
    soundMuted = true;
    sfxVolume = 0;
    musicVolume = 0;
    if (sfxSlider) sfxSlider.value = 0;
    if (musicSlider) musicSlider.value = 0;
    bgm.pause();
  }

  function doResumeAfterAd() {
    soundMuted = false;
    sfxVolume = savedSfxBeforeAd;
    musicVolume = savedMusicBeforeAd;
    if (sfxSlider) sfxSlider.value = Math.round(savedSfxBeforeAd * 100);
    if (musicSlider) musicSlider.value = Math.round(savedMusicBeforeAd * 100);
    bgm.resume();
  }

  function doPlayWithBreak() {
    try {
      if (typeof Poki !== 'undefined' && Poki.commercialBreak) {
        Poki.commercialBreak(doPauseForAd).then(function () {
          doResumeAfterAd();
          if (Poki.gameplayStart) Poki.gameplayStart();
          startGame();
        });
      } else {
        startGame();
      }
    } catch (err) {
      startGame();
    }
  }

  function doReplayWithBreak() {
    Poki.commercialBreak(doPauseForAd).then(function () {
      doResumeAfterAd();
      Poki.gameplayStart();
      startGame();
    });
  }

  function doRewardedRematch() {
    Poki.rewardedBreak({ onStart: doPauseForAd }).then(function (success) {
      doResumeAfterAd();
      if (success) {
        Poki.gameplayStart();
        reviveAndContinue();
      }
    });
  }

  function renderChallengeList() {
    try { var s = localStorage.getItem(CHALLENGES_KEY); if (s) completedChallengeIds = JSON.parse(s); } catch (e) {}
    selectedChallengeId = null;
    var descEl = document.getElementById('challenge-description');
    if (descEl) descEl.textContent = 'Select a stage below.';
    var playBtn = document.getElementById('challenge-play-btn');
    if (playBtn) { playBtn.disabled = true; playBtn.classList.remove('selected'); }
    var listEl = document.getElementById('challenge-list');
    if (!listEl || typeof window.ChallengeMode === 'undefined') return;
    listEl.innerHTML = '';
    listEl.className = 'challenge-list-row';
    var tiers = ['beginner', 'intermediate', 'advanced'];
    var tierLabels = { beginner: '🟢 Beginner', intermediate: '🟡 Intermediate', advanced: '🔴 Advanced' };
    tiers.forEach(function (tier) {
      var chs = window.ChallengeMode.getChallengesByTier(tier);
      var col = document.createElement('div');
      col.className = 'challenge-tier-col';
      var h3 = document.createElement('h3');
      h3.className = 'challenge-tier-title';
      h3.textContent = tierLabels[tier] || tier;
      h3.style.cssText = 'font-size:14px;margin:0 0 8px;color:rgba(255,255,255,0.9);';
      col.appendChild(h3);
      chs.forEach(function (ch) {
        var unlocked = window.ChallengeMode.isUnlocked(ch.id, completedChallengeIds);
        var done = completedChallengeIds.indexOf(ch.id) !== -1;
        var btn = document.createElement('button');
        btn.className = 'challenge-stage-btn' + (done ? ' challenge-cleared' : '');
        btn.dataset.id = ch.id;
        btn.innerHTML = '<span class="ch-num">' + ch.id + '</span> ' + ch.name + (done ? ' ✓' : '');
        btn.title = ch.description;
        btn.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 12px;margin:4px 0;border-radius:8px;border:1px solid rgba(255,255,255,0.3);color:#fff;font-size:13px;cursor:' + (unlocked ? 'pointer' : 'not-allowed') + ';opacity:' + (unlocked ? '1' : '0.6') + ';';
        btn.style.background = done ? 'rgba(46, 125, 50, 0.45)' : 'rgba(0,0,0,0.2)';
        if (unlocked) {
          btn.addEventListener('click', function () {
            selectedChallengeId = ch.id;
            if (descEl) descEl.textContent = ch.description;
            if (playBtn) { playBtn.disabled = false; }
            listEl.querySelectorAll('.challenge-stage-btn.selected').forEach(function (b) { b.classList.remove('selected'); });
            btn.classList.add('selected');
          });
        }
        col.appendChild(btn);
      });
      listEl.appendChild(col);
    });
  }

  function startSelectedChallenge() {
    if (selectedChallengeId !== null) startChallengeGame(selectedChallengeId);
  }

  // ===== Events (document.body 위임 + DOMContentLoaded로 DOM 보장) =====
  function setupButtonDelegation() {
    function findButton(el) {
      if (!el) return null;
      if (el.tagName === 'BUTTON') return el;
      if (el.closest) return el.closest('button');
      while (el && el !== document.body) {
        if (el.tagName === 'BUTTON') return el;
        el = el.parentNode;
      }
      return null;
    }
    document.body.addEventListener('click', function (e) {
      try {
        var gameContainer = document.getElementById('game-container');
        if (!gameContainer || !gameContainer.contains(e.target)) return;
        var btn = findButton(e.target);
        if (!btn) return;
        var id = btn.id;
        if (id === 'play-btn') { doPlayWithBreak(); sound('click'); return; }
      if (id === 'challenge-btn') {
        var start = document.getElementById('start-screen');
        if (start) start.classList.add('hidden');
        var cs = document.getElementById('challenge-screen');
        if (cs) { cs.classList.remove('hidden'); renderChallengeList(); }
        sound('click');
        return;
      }
      if (id === 'settings-btn') {
        settingsOpenedFrom = 'start';
        var dg = document.getElementById('difficulty-group');
        if (dg) dg.style.display = twoPlayerMode ? 'none' : 'flex';
        var panel = document.getElementById('settings-panel');
        if (panel) panel.classList.remove('hidden');
        sound('click');
        return;
      }
      if (id === 'challenge-back-btn') {
        var cs2 = document.getElementById('challenge-screen');
        if (cs2) cs2.classList.add('hidden');
        var start2 = document.getElementById('start-screen');
        if (start2) start2.classList.remove('hidden');
        sound('click');
        return;
      }
      if (id === 'challenge-play-btn') {
        startSelectedChallenge();
        sound('click');
        return;
      }
      if (id === 'challenge-retry-btn') {
        var cr = document.getElementById('challenge-result-screen');
        if (cr) cr.classList.add('hidden');
        if (currentChallengeId !== null) startChallengeGame(currentChallengeId);
        sound('click');
        return;
      }
      if (id === 'challenge-result-back-btn') {
        var cr2 = document.getElementById('challenge-result-screen');
        var cs3 = document.getElementById('challenge-screen');
        if (cr2) cr2.classList.add('hidden');
        if (cs3) { cs3.classList.remove('hidden'); renderChallengeList(); }
        sound('click');
        return;
      }
      if (id === 'challenge-continue-ad-btn') {
        var ccEl = document.getElementById('challenge-continue-screen');
        if (ccEl) ccEl.classList.add('hidden');
        Poki.rewardedBreak({ onStart: doPauseForAd }).then(function (success) {
          doResumeAfterAd();
          if (success) {
            Poki.gameplayStart();
            resumeChallengeAfterAd();
          } else if (ccEl) ccEl.classList.remove('hidden');
        });
        sound('click');
        return;
      }
      if (id === 'challenge-continue-giveup-btn') {
        var cc2 = document.getElementById('challenge-continue-screen');
        if (cc2) cc2.classList.add('hidden');
        endChallengeGame(false);
        sound('click');
        return;
      }
      if (id === 'resume-btn') { resumeGame(); sound('click'); return; }
      if (id === 'menu-btn-pause' || id === 'menu-btn-end') { showMenu(); sound('click'); return; }
      if (id === 'replay-btn') { doReplayWithBreak(); sound('click'); return; }
      if (id === 'rewarded-btn') { doRewardedRematch(); sound('click'); return; }
      if (id === 'game-menu-btn') { pauseGame(); sound('click'); return; }
      if (id === 'settings-close-btn') {
        var panel2 = document.getElementById('settings-panel');
        if (panel2) panel2.classList.add('hidden');
        if (settingsOpenedFrom === 'pause') {
          var ps = document.getElementById('pause-screen');
          if (ps) ps.classList.remove('hidden');
        }
        sound('click');
        return;
      }
      if (id === 'settings-btn-pause') {
        settingsOpenedFrom = 'pause';
        var ps2 = document.getElementById('pause-screen');
        if (ps2) ps2.classList.add('hidden');
        var dg2 = document.getElementById('difficulty-group');
        if (dg2) dg2.style.display = endlessMode ? 'flex' : 'none';
        var panel3 = document.getElementById('settings-panel');
        if (panel3) panel3.classList.remove('hidden');
        sound('click');
        return;
      }
      if (btn.classList && btn.classList.contains('mode-btn')) {
        var list = document.querySelectorAll('.mode-btn');
        for (var i = 0; i < list.length; i++) list[i].classList.remove('active');
        btn.classList.add('active');
        var mode = btn.getAttribute('data-mode');
        twoPlayerMode = mode === '2p';
        endlessMode = mode === 'endless';
        var hint = document.getElementById('controls-hint');
        if (hint) {
          if (twoPlayerMode) hint.innerHTML = 'P1: Left touch | P2: Right touch<br>Desktop: W/S, ↑/↓ | First to 5 wins!';
          else if (endlessMode) hint.innerHTML = 'Left click: Up | Right click: Down<br>No score limit! Change difficulty when paused.';
          else hint.innerHTML = 'Left click: Up | Right click: Down<br>First to 5 wins!';
        }
        var dg3 = document.getElementById('difficulty-group');
        var dgMain = document.getElementById('difficulty-group-main');
        var bsGroup = document.getElementById('ball-speed-group-main');
        if (dg3) dg3.style.display = twoPlayerMode ? 'none' : 'flex';
        if (dgMain) dgMain.style.display = twoPlayerMode ? 'none' : 'flex';
        if (bsGroup) bsGroup.style.display = twoPlayerMode ? 'flex' : 'none';
        saveSettings();
        sound('click');
        return;
      }
      if (btn.classList && btn.classList.contains('ball-speed-btn')) {
        var speedVal = parseFloat(btn.getAttribute('data-speed'));
        if (!isNaN(speedVal) && speedVal > 0) {
          ballSpeedMultiplier = speedVal;
          syncBallSpeedButtons(ballSpeedMultiplier);
          saveSettings();
        }
        sound('click');
        return;
      }
      if (btn.classList && btn.classList.contains('diff-btn')) {
        difficulty = btn.getAttribute('data-difficulty') || 'normal';
        syncDifficultyButtons(difficulty);
        saveSettings();
        sound('click');
        return;
      }
      if (btn.classList && btn.classList.contains('color-preset')) {
        var target = btn.getAttribute('data-target');
        var color = btn.getAttribute('data-color');
        if (target === 'bg' && color) {
          document.querySelectorAll('.color-preset[data-target="bg"]').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          backgroundColor = color;
          var inp = document.getElementById('bg-color-custom');
          if (inp) inp.value = backgroundColor;
        }
        if (target === 'p1' && color) {
          document.querySelectorAll('.color-preset[data-target="p1"]').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          paddleLeftColor = color;
          var inp1 = document.getElementById('p1-color-custom');
          if (inp1) inp1.value = paddleLeftColor;
        }
        if (target === 'p2' && color) {
          document.querySelectorAll('.color-preset[data-target="p2"]').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          paddleRightColor = color;
          var inp2 = document.getElementById('p2-color-custom');
          if (inp2) inp2.value = paddleRightColor;
        }
        saveSettings();
      sound('click');
      return;
    }
    sound('click');
      } catch (err) {
        try { sound('click'); } catch (_) {}
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupButtonDelegation);
  } else {
    setupButtonDelegation();
  }

  function handleButtonById(id) {
    if (id === 'play-btn') { doPlayWithBreak(); sound('click'); return; }
    if (id === 'challenge-play-btn') { startSelectedChallenge(); sound('click'); return; }
    if (id === 'challenge-btn') {
      var start = document.getElementById('start-screen');
      if (start) start.classList.add('hidden');
      var cs = document.getElementById('challenge-screen');
      if (cs) { cs.classList.remove('hidden'); renderChallengeList(); }
      sound('click');
      return;
    }
    if (id === 'settings-btn') {
      settingsOpenedFrom = 'start';
      var dg = document.getElementById('difficulty-group');
      if (dg) dg.style.display = twoPlayerMode ? 'none' : 'flex';
      var panel = document.getElementById('settings-panel');
      if (panel) panel.classList.remove('hidden');
      sound('click');
      return;
    }
    if (id === 'challenge-play-btn') {
      startSelectedChallenge();
      sound('click');
      return;
    }
    if (id === 'challenge-back-btn') {
      var cs2 = document.getElementById('challenge-screen');
      if (cs2) cs2.classList.add('hidden');
      var start2 = document.getElementById('start-screen');
      if (start2) start2.classList.remove('hidden');
      sound('click');
      return;
    }
    if (id === 'settings-close-btn') {
      var panel2 = document.getElementById('settings-panel');
      if (panel2) panel2.classList.add('hidden');
      if (settingsOpenedFrom === 'pause') {
        var ps = document.getElementById('pause-screen');
        if (ps) ps.classList.remove('hidden');
      }
      sound('click');
      return;
    }
  }
  window.edgePongClick = handleButtonById;

  if (sfxSlider) {
    sfxSlider.addEventListener('input', function () {
      setSfxVolume(this.value / 100);
    });
  }
  if (musicSlider) {
    musicSlider.addEventListener('input', function () {
      setMusicVolume(this.value / 100);
    });
  }

  var bgColorCustom = document.getElementById('bg-color-custom');
  if (bgColorCustom) bgColorCustom.addEventListener('input', function () {
    backgroundColor = this.value;
    document.querySelectorAll('.color-preset[data-target="bg"]').forEach(function (b) { b.classList.remove('active'); });
    saveSettings();
  });

  var p1ColorCustom = document.getElementById('p1-color-custom');
  if (p1ColorCustom) p1ColorCustom.addEventListener('input', function () {
    paddleLeftColor = this.value;
    document.querySelectorAll('.color-preset[data-target="p1"]').forEach(function (b) { b.classList.remove('active'); });
    saveSettings();
  });

  var p2ColorCustom = document.getElementById('p2-color-custom');
  if (p2ColorCustom) p2ColorCustom.addEventListener('input', function () {
    paddleRightColor = this.value;
    document.querySelectorAll('.color-preset[data-target="p2"]').forEach(function (b) { b.classList.remove('active'); });
    saveSettings();
  });

  function syncDifficultyButtons(selectedDiff) {
    document.querySelectorAll('.diff-btn').forEach(function (b) {
      if (b.dataset.difficulty === selectedDiff) b.classList.add('active');
      else b.classList.remove('active');
    });
  }

  function syncBallSpeedButtons(value) {
    var btns = document.querySelectorAll('.ball-speed-btn');
    btns.forEach(function (b) {
      var v = parseFloat(b.getAttribute('data-speed'));
      if (!isNaN(v) && Math.abs(v - value) < 0.01) b.classList.add('active');
      else b.classList.remove('active');
    });
  }

  var SETTINGS_KEY = 'edgePongSettings';
  var CHALLENGES_KEY = 'edgePongChallenges';

  function saveSettings() {
    try {
      var gameMode = 'vsai';
      if (twoPlayerMode) gameMode = '2p';
      else if (endlessMode) gameMode = 'endless';
      var o = {
        difficulty: difficulty,
        gameMode: gameMode,
        ballSpeedMultiplier: ballSpeedMultiplier,
        backgroundColor: backgroundColor,
        paddleLeftColor: paddleLeftColor,
        paddleRightColor: paddleRightColor,
        sfxVolume: sfxVolume,
        musicVolume: musicVolume
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(o));
    } catch (e) {}
  }

  function loadSettings() {
    loadingSettings = true;
    try {
      var s = localStorage.getItem(SETTINGS_KEY);
      if (!s) return;
      var o = JSON.parse(s);
      if (o.difficulty === 'easy' || o.difficulty === 'normal' || o.difficulty === 'hard') {
        difficulty = o.difficulty;
        syncDifficultyButtons(difficulty);
      }
      if (o.gameMode === 'vsai' || o.gameMode === '2p' || o.gameMode === 'endless') {
        twoPlayerMode = o.gameMode === '2p';
        endlessMode = o.gameMode === 'endless';
        var modeBtnsList = document.querySelectorAll('.mode-btn');
        modeBtnsList.forEach(function (b) {
          if ((b.getAttribute('data-mode') || '') === o.gameMode) b.classList.add('active');
          else b.classList.remove('active');
        });
        var hint = document.getElementById('controls-hint');
        if (hint) {
          if (twoPlayerMode) hint.innerHTML = 'P1: Left touch | P2: Right touch<br>Desktop: W/S, ↑/↓ | First to 5 wins!';
          else if (endlessMode) hint.innerHTML = 'Left click: Up | Right click: Down<br>No score limit! Change difficulty when paused.';
          else hint.innerHTML = 'Left click: Up | Right click: Down<br>First to 5 wins!';
        }
        var dg = document.getElementById('difficulty-group');
        var dgMain = document.getElementById('difficulty-group-main');
        var bsGroup = document.getElementById('ball-speed-group-main');
        if (dg) dg.style.display = twoPlayerMode ? 'none' : 'flex';
        if (dgMain) dgMain.style.display = twoPlayerMode ? 'none' : 'flex';
        if (bsGroup) bsGroup.style.display = twoPlayerMode ? 'flex' : 'none';
      }
      if (typeof o.ballSpeedMultiplier === 'number' && o.ballSpeedMultiplier >= 0.4 && o.ballSpeedMultiplier <= 1.5) {
        ballSpeedMultiplier = o.ballSpeedMultiplier;
        syncBallSpeedButtons(ballSpeedMultiplier);
      }
      if (o.backgroundColor && /^#[0-9A-Fa-f]{6}$/.test(o.backgroundColor)) {
        backgroundColor = o.backgroundColor;
        syncColorUI('bg', backgroundColor);
      }
      if (o.paddleLeftColor && /^#[0-9A-Fa-f]{6}$/.test(o.paddleLeftColor)) {
        paddleLeftColor = o.paddleLeftColor;
        syncColorUI('p1', paddleLeftColor);
      }
      if (o.paddleRightColor && /^#[0-9A-Fa-f]{6}$/.test(o.paddleRightColor)) {
        paddleRightColor = o.paddleRightColor;
        syncColorUI('p2', paddleRightColor);
      }
      if (typeof o.sfxVolume === 'number' && o.sfxVolume >= 0 && o.sfxVolume <= 1) {
        setSfxVolume(o.sfxVolume);
      }
      if (typeof o.musicVolume === 'number' && o.musicVolume >= 0 && o.musicVolume <= 1) {
        setMusicVolume(o.musicVolume);
      }
    } catch (e) {}
    finally { loadingSettings = false; }
  }

  function syncColorUI(target, color) {
    var presets = document.querySelectorAll('.color-preset[data-target="' + target + '"]');
    var customId = target === 'bg' ? 'bg-color-custom' : target === 'p1' ? 'p1-color-custom' : 'p2-color-custom';
    var customEl = document.getElementById(customId);
    var found = false;
    presets.forEach(function (b) {
      if ((b.getAttribute('data-color') || '').toLowerCase() === color.toLowerCase()) {
        b.classList.add('active');
        found = true;
      } else {
        b.classList.remove('active');
      }
    });
    if (customEl) customEl.value = color;
    if (!found) presets.forEach(function (b) { b.classList.remove('active'); });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var settingsOpen = settingsPanel && !settingsPanel.classList.contains('hidden');
      var pauseOpen = pauseScreen && !pauseScreen.classList.contains('hidden');
      if (settingsOpen || pauseOpen) {
        e.preventDefault();
        return;
      }
      if (gameRunning && !isPaused && !countdownActive) {
        pauseGame();
      } else if (isPaused) {
        resumeGame();
      }
    } else if (gameRunning && !isPaused && twoPlayerMode) {
      if (e.key === 'w' || e.key === 'W') { keys.p1Up = true; e.preventDefault(); }
      if (e.key === 's' || e.key === 'S') { keys.p1Down = true; e.preventDefault(); }
      if (e.key === 'ArrowUp') { keys.p2Up = true; e.preventDefault(); }
      if (e.key === 'ArrowDown') { keys.p2Down = true; e.preventDefault(); }
    }
  });

  document.addEventListener('keyup', function (e) {
    if (e.key === 'w' || e.key === 'W') keys.p1Up = false;
    if (e.key === 's' || e.key === 'S') keys.p1Down = false;
    if (e.key === 'ArrowUp') keys.p2Up = false;
    if (e.key === 'ArrowDown') keys.p2Down = false;
  });

  function doResize() {
    resize();
    if (!gameRunning && !countdownActive) draw();
  }

  window.addEventListener('resize', doResize);
  window.addEventListener('orientationchange', function () {
    setTimeout(doResize, 100);
  });
  if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
    window.visualViewport.addEventListener('resize', doResize);
    window.visualViewport.addEventListener('scroll', doResize);
  }

  if (typeof ResizeObserver !== 'undefined') {
    var ro = new ResizeObserver(function () { doResize(); });
    ro.observe(container);
  }
  setTimeout(doResize, 0);

  // ===== Init (Poki SDK: init then gameLoadingFinished for platform detection) =====
  function doGameInit() {
    try { var s = localStorage.getItem(CHALLENGES_KEY); if (s) completedChallengeIds = JSON.parse(s); } catch (e) {}
    loadSettings();
    if (typeof PokiSDK !== 'undefined' && PokiSDK.gameLoadingFinished) PokiSDK.gameLoadingFinished();
    if (Poki.ok && Poki.gameLoadingFinished) Poki.gameLoadingFinished();
    resize();
    draw();
  }
  if (typeof PokiSDK !== 'undefined') {
    PokiSDK.init().then(function () {
      Poki.ok = true;
      doGameInit();
    }).catch(function () {
      Poki.ok = false;
      doGameInit();
    });
  } else {
    Poki.init().then(doGameInit);
  }
})();
