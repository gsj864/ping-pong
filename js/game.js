/**
 * Ping Pong - Poki Quality Edition
 * First to 10, paddle speed → ball speed, spin, fullscreen
 * Poki SDK: Commercial Break, Rewarded Break
 */
(function () {
  'use strict';

  // ===== Poki SDK Wrapper (no-op when SDK not loaded) =====
  var Poki = {
    ok: false,
    init: function () {
      if (typeof PokiSDK === 'undefined') return Promise.resolve();
      return PokiSDK.init().then(function () { Poki.ok = true; }).catch(function () {});
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
  const WIN_SCORE = 10;
  const PADDLE_W = 14;
  const PADDLE_H_RATIO = 0.18;
  const BALL_R = 15;
  const BALL_SPEED_BASE = 0.012;
  const BALL_SPEED_MAX = 0.024;
  const PADDLE_SPEED_INFLUENCE = 0.6;
  const SPIN_STRENGTH = 1.0;
  const NET_DASH = 12;
  const COUNTDOWN_SECONDS = 3;
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

  const AI_SETTINGS = {
    easy: { delay: 170, speed: 0.25, error: 0.17, ballSpeed: 0.57 },
    normal: { delay: 120, speed: 0.33, error: 0.12, ballSpeed: 0.6 },
    hard: { delay: 100, speed: 0.36, error: 0.10, ballSpeed: 0.66 }
  };

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

  const playBtn = document.getElementById('play-btn');
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
  let W, H, paddleH, leftX, rightX;
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

  let sfxVolume = 0.5;
  let musicVolume = 0.5;
  let soundMuted = false;
  let difficulty = 'normal';
  let backgroundColor = '#2e7d32';
  let paddleLeftColor = '#29b6f6';
  let paddleRightColor = '#ff7043';
  let twoPlayerMode = false;
  let settingsOpenedFrom = 'start';
  const keys = { p1Up: false, p1Down: false, p2Up: false, p2Down: false };
  let touchP1Y = null;
  let touchP2Y = null;
  const touchMap = {};

  // ===== Resize =====
  function resize() {
    W = canvas.width = container.clientWidth;
    H = canvas.height = container.clientHeight;
    paddleH = H * PADDLE_H_RATIO;
    leftX = PADDLE_W + 20;
    rightX = W - PADDLE_W - 20;
  }

  // ===== Utility =====
  function randDir() { return Math.random() > 0.5 ? 1 : -1; }

  function serve(dir) {
    ball.x = 0.5;
    ball.y = 0.5;
    if (dir === undefined) dir = randDir();
    const mult = twoPlayerMode ? 0.75 : AI_SETTINGS[difficulty].ballSpeed;
    ball.vx = BALL_SPEED_BASE * mult * dir;
    ball.vy = 0;
    playerY = aiY = 0.5;
    prevPlayerY = playerY;
    aiReactionT = 0;
  }

  // ===== Countdown =====
  function startCountdown(callback) {
    countdownActive = true;
    countdownValue = COUNTDOWN_SECONDS;
    countdownTimer = 0;
    countdownNum.textContent = countdownValue;
    countdownScreen.classList.remove('hidden');
    sound('countdown');

    const countdownLoop = function () {
      countdownTimer++;
      if (countdownTimer >= 60) { // ~1 second at 60fps
        countdownTimer = 0;
        countdownValue--;
        if (countdownValue > 0) {
          countdownNum.textContent = countdownValue;
          sound('countdown');
          requestAnimationFrame(countdownLoop);
        } else {
          countdownNum.textContent = 'GO!';
          sound('go');
          setTimeout(function () {
            countdownScreen.classList.add('hidden');
            countdownActive = false;
            if (gameMenuBtn) gameMenuBtn.classList.remove('hidden');
            callback();
          }, 400);
        }
      } else {
        requestAnimationFrame(countdownLoop);
      }
    };
    requestAnimationFrame(countdownLoop);
  }

  // ===== Game Flow =====
  function startGame() {
    twoPlayerMode = document.querySelector('.mode-btn.active').dataset.mode === '2p';
    keys.p1Up = keys.p1Down = keys.p2Up = keys.p2Down = false;
    touchP1Y = touchP2Y = null;
    Object.keys(touchMap).forEach(function (k) { delete touchMap[k]; });
    scoreLeft = 0;
    scoreRight = 0;
    updateScoreUI();
    startScreen.classList.add('hidden');
    endScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    gameRunning = true;
    isPaused = false;
    resize();
    serve();
    if (!twoPlayerMode) canvas.requestPointerLock();

    startCountdown(function () {
      lastTime = performance.now();
      loop(lastTime);
    });
    bgm.start();
  }

  function showMenu() {
    Poki.gameplayStop();
    if (document.pointerLockElement) document.exitPointerLock();
    gameRunning = false;
    isPaused = false;
    countdownActive = false;
    if (animId) cancelAnimationFrame(animId);
    animId = 0;
    startScreen.classList.remove('hidden');
    endScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    countdownScreen.classList.add('hidden');
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
    bgm.pause();
  }

  function resumeGame() {
    if (!isPaused) return;
    isPaused = false;
    Poki.gameplayStart();
    pauseScreen.classList.add('hidden');
    if (gameMenuBtn) gameMenuBtn.classList.remove('hidden');
    lastTime = performance.now();
    if (!twoPlayerMode) canvas.requestPointerLock();
    bgm.resume();
  }

  function endGame(result) {
    Poki.gameplayStop();
    bgm.stop();
    if (document.pointerLockElement) document.exitPointerLock();
    if (gameMenuBtn) gameMenuBtn.classList.add('hidden');
    gameRunning = false;
    if (animId) cancelAnimationFrame(animId);
    animId = 0;
    endScreen.classList.remove('hidden');
    const isWin = result === true || result === 'p1';
    endScreen.classList.toggle('win', isWin);
    endScreen.classList.toggle('lose', !isWin);
    if (result === 'p1') endTitle.textContent = 'P1 WINS!';
    else if (result === 'p2') endTitle.textContent = 'P2 WINS!';
    else endTitle.textContent = result ? 'YOU WIN!' : 'YOU LOSE';
    endScoreEl.textContent = scoreLeft + ' - ' + scoreRight;
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
    serve(1);
    if (!twoPlayerMode) canvas.requestPointerLock();
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

  // ===== Collision =====
  function paddleTop(y) { return (y - PADDLE_H_RATIO / 2) * H; }
  function paddleBottom(y) { return (y + PADDLE_H_RATIO / 2) * H; }

  function clampBallSpeed(ballSpeedMult) {
    const maxSpeed = BALL_SPEED_MAX * ballSpeedMult;
    const s = Math.hypot(ball.vx, ball.vy);
    if (s > maxSpeed) {
      ball.vx = (ball.vx / s) * maxSpeed;
      ball.vy = (ball.vy / s) * maxSpeed;
    }
  }

  function hitPaddle(isLeft, paddleY, paddleVelY) {
    const px = isLeft ? leftX : rightX;
    const bx = ball.x * W;
    const by = ball.y * H;
    const r = BALL_R;
    const pw = PADDLE_W;
    const ph = paddleH;
    const top = paddleTop(paddleY);
    const bottom = paddleBottom(paddleY);

    const ballSpeedMult = twoPlayerMode ? 0.75 : AI_SETTINGS[difficulty].ballSpeed;
    const maxSpeed = BALL_SPEED_MAX * ballSpeedMult;

    if (isLeft && ball.vx < 0 && bx - r <= px + pw && bx + r >= px - pw && by >= top - r && by <= bottom + r) {
      const hitNorm = (by - top) / ph - 0.5;
      ball.x = (px + pw + r) / W;
      const baseSpeed = Math.min(maxSpeed, Math.hypot(ball.vx, ball.vy) * 1.08);
      ball.vx = baseSpeed;
      ball.vy = hitNorm * SPIN_STRENGTH * baseSpeed + paddleVelY * PADDLE_SPEED_INFLUENCE;
      clampBallSpeed(ballSpeedMult);
      sound('paddle');
      return true;
    }
    if (!isLeft && ball.vx > 0 && bx + r >= px - pw && bx - r <= px + pw && by >= top - r && by <= bottom + r) {
      const hitNorm = (by - top) / ph - 0.5;
      ball.x = (px - pw - r) / W;
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
    const aiSettings = AI_SETTINGS[difficulty];

    if (serveDelay > 0) {
      serveDelay -= dt;
      if (serveDelay <= 0) {
        serve();
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
      playerY += (pointerY - playerY) * 0.35;
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
    const by = ball.y * H;
    const r = BALL_R;
    if (by - r <= 0) {
      ball.y = r / H;
      ball.vy = Math.abs(ball.vy);
      sound('wall');
    }
    if (by + r >= H) {
      ball.y = (H - r) / H;
      ball.vy = -Math.abs(ball.vy);
      sound('wall');
    }

    // Paddle collision
    hitPaddle(true, playerY, playerVelY);
    hitPaddle(false, aiY, aiVelY);

    // Score
    const bx = ball.x * W;
    if (bx + r < 0) {
      scoreRight++;
      updateScoreUI();
      sound('score');
      if (scoreRight >= WIN_SCORE) endGame(twoPlayerMode ? 'p2' : false);
      else serveDelay = 800;
    }
    if (bx - r > W) {
      scoreLeft++;
      updateScoreUI();
      sound('score');
      if (scoreLeft >= WIN_SCORE) endGame(twoPlayerMode ? 'p1' : true);
      else serveDelay = 800;
    }
  }

  // ===== Draw =====
  function draw() {
    const c1 = darkenHex(backgroundColor, 0.15);
    const c2 = backgroundColor;
    const c3 = darkenHex(backgroundColor, 0.2);
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, c1);
    bgGrad.addColorStop(0.5, c2);
    bgGrad.addColorStop(1, c3);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, W - 20, H - 20);

    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.setLineDash([NET_DASH, NET_DASH]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2, 10);
    ctx.lineTo(W / 2, H - 10);
    ctx.stroke();
    ctx.setLineDash([]);

    const py = playerY * H;
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

    const ay = aiY * H;
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
    const bx = ball.x * W;
    const ballY = ball.y * H;
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
    ctx.arc(bx - ball.vx * W * 2, ballY - ball.vy * H * 2, BALL_R * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // ===== Loop =====
  function loop(now) {
    const dt = now - lastTime;
    lastTime = now;
    update(dt);
    draw();
    animId = requestAnimationFrame(loop);
  }

  // ===== Input =====
  function setPointer(clientY) {
    const rect = canvas.getBoundingClientRect();
    pointerY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  }

  document.addEventListener('mousemove', function (e) {
    if (!gameRunning || isPaused || twoPlayerMode) return;
    if (document.pointerLockElement === canvas) {
      pointerY += e.movementY / H;
      pointerY = Math.max(0, Math.min(1, pointerY));
    } else {
      setPointer(e.clientY);
    }
  });

  function getTouchY(clientY) {
    const rect = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  }

  function getTouchSide(clientX) {
    const rect = canvas.getBoundingClientRect();
    return clientX - rect.left < rect.width / 2 ? 'p1' : 'p2';
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
      playNote(melody[idx], 'square', 0.045, 0.12);
      playNote(bass[idx], 'triangle', 0.06, 0.15);
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
        gainNode.gain.setValueAtTime(Math.max(0, musicVolume * 0.5), ac.currentTime);
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
      gainNode.gain.setValueAtTime(soundMuted || musicVolume <= 0 ? 0 : musicVolume * 0.5, ac.currentTime);
    }

    function pause() {
      if (gainNode && ac) gainNode.gain.setValueAtTime(0, ac.currentTime);
    }

    function resume() {
      if (gainNode && ac && !soundMuted && musicVolume > 0) gainNode.gain.setValueAtTime(musicVolume * 0.5, ac.currentTime);
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
      const vol = 0.08 * sfxVolume;

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
        case 'click':
          o.frequency.setValueAtTime(800, t);
          o.frequency.setValueAtTime(600, t + 0.03);
          g.gain.setValueAtTime(vol * 0.7, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          o.start(t);
          o.stop(t + 0.06);
          return;
      }
    } catch (_) {}
  }

  function setSfxVolume(val) {
    sfxVolume = Math.max(0, Math.min(1, val));
    if (sfxSlider) sfxSlider.value = sfxVolume * 100;
  }

  function setMusicVolume(val) {
    musicVolume = Math.max(0, Math.min(1, val));
    if (musicSlider) musicSlider.value = musicVolume * 100;
    bgm.setGain();
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
    Poki.commercialBreak(doPauseForAd).then(function () {
      doResumeAfterAd();
      Poki.gameplayStart();
      startGame();
    });
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

  // ===== Events =====
  playBtn.addEventListener('click', doPlayWithBreak);
  replayBtn.addEventListener('click', doReplayWithBreak);
  if (rewardedBtn) rewardedBtn.addEventListener('click', doRewardedRematch);
  resumeBtn.addEventListener('click', resumeGame);
  menuBtnPause.addEventListener('click', showMenu);
  if (gameMenuBtn) gameMenuBtn.addEventListener('click', pauseGame);
  menuBtnEnd.addEventListener('click', showMenu);

  if (settingsBtn) {
    settingsBtn.addEventListener('click', function () {
      settingsOpenedFrom = 'start';
      const dg = document.getElementById('difficulty-group');
      if (dg) dg.style.display = twoPlayerMode ? 'none' : 'flex';
      settingsPanel.classList.remove('hidden');
    });
  }
  if (settingsBtnPause) {
    settingsBtnPause.addEventListener('click', function () {
      settingsOpenedFrom = 'pause';
      pauseScreen.classList.add('hidden');
      const dg = document.getElementById('difficulty-group');
      if (dg) dg.style.display = twoPlayerMode ? 'none' : 'flex';
      settingsPanel.classList.remove('hidden');
    });
  }
  if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener('click', function () {
      settingsPanel.classList.add('hidden');
      if (settingsOpenedFrom === 'pause') {
        pauseScreen.classList.remove('hidden');
      }
    });
  }

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

  modeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      modeBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      twoPlayerMode = btn.dataset.mode === '2p';
      controlsHint.innerHTML = twoPlayerMode
        ? 'P1: Left touch | P2: Right touch<br>Desktop: W/S, ↑/↓ | First to 10 wins!'
        : 'Move your mouse to control the paddle.<br>First to 10 wins!';
      var dg = document.getElementById('difficulty-group');
      var dgMain = document.getElementById('difficulty-group-main');
      if (dg) dg.style.display = twoPlayerMode ? 'none' : 'flex';
      if (dgMain) dgMain.style.display = twoPlayerMode ? 'none' : 'flex';
    });
  });

  document.querySelectorAll('.color-preset[data-target="bg"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.color-preset[data-target="bg"]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      backgroundColor = btn.dataset.color || '#2e7d32';
      document.getElementById('bg-color-custom').value = backgroundColor;
    });
  });

  document.getElementById('bg-color-custom').addEventListener('input', function () {
    backgroundColor = this.value;
    document.querySelectorAll('.color-preset[data-target="bg"]').forEach(function (b) { b.classList.remove('active'); });
  });

  document.querySelectorAll('.color-preset[data-target="p1"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.color-preset[data-target="p1"]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      paddleLeftColor = btn.dataset.color || '#29b6f6';
      document.getElementById('p1-color-custom').value = paddleLeftColor;
    });
  });

  document.getElementById('p1-color-custom').addEventListener('input', function () {
    paddleLeftColor = this.value;
    document.querySelectorAll('.color-preset[data-target="p1"]').forEach(function (b) { b.classList.remove('active'); });
  });

  document.querySelectorAll('.color-preset[data-target="p2"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.color-preset[data-target="p2"]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      paddleRightColor = btn.dataset.color || '#ff7043';
      document.getElementById('p2-color-custom').value = paddleRightColor;
    });
  });

  document.getElementById('p2-color-custom').addEventListener('input', function () {
    paddleRightColor = this.value;
    document.querySelectorAll('.color-preset[data-target="p2"]').forEach(function (b) { b.classList.remove('active'); });
  });

  function syncDifficultyButtons(selectedDiff) {
    document.querySelectorAll('.diff-btn').forEach(function (b) {
      if (b.dataset.difficulty === selectedDiff) b.classList.add('active');
      else b.classList.remove('active');
    });
  }

  document.querySelectorAll('.diff-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      difficulty = btn.dataset.difficulty;
      syncDifficultyButtons(difficulty);
    });
  });

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

  window.addEventListener('resize', function () {
    resize();
    if (!gameRunning && !countdownActive) draw();
  });

  // ===== Init =====
  container.addEventListener('click', function (e) {
    if (e.target.closest('button')) sound('click');
  });

  Poki.init().then(function () {
    Poki.gameLoadingFinished();
    resize();
    draw();
  });
})();
