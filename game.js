(function () {
  'use strict';

  // ---------------------------------------------------------------- constants
  var W = 900, H = 560;
  var PADDLE_W = 14, PADDLE_H = 96, PADDLE_MARGIN = 30;
  var BALL = 12;
  var BASE_SPEED = 380;
  var MAX_SPEED = 940;
  var SPEEDUP = 1.045;
  var MAX_ANGLE = Math.PI * 0.385;
  var HUMAN_SPEED = 640;
  var STEP = 1 / 120;
  var FONT = 'ui-monospace,"Cascadia Mono","Segoe UI Mono","Roboto Mono","Courier New",monospace';

  var C = {
    p1: '#22e6ff',
    p2: '#ff3d9a',
    ball: '#fff6c9',
    line: 'rgba(150,180,255,0.30)'
  };

  var DIFF = {
    easy:   { label: 'EASY',   speed: 300, error: 66, react: 0.30, predict: false },
    normal: { label: 'NORMAL', speed: 435, error: 30, react: 0.16, predict: true },
    insane: { label: 'INSANE', speed: 625, error: 11, react: 0.07, predict: true }
  };

  var S = { MENU: 'menu', SERVE: 'serve', PLAY: 'play', PAUSE: 'pause', OVER: 'over' };
  var LS_KEY = 'neonpong.v1';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------- dom
  function $(id) { return document.getElementById(id); }
  var canvas = $('game');
  var ctx = canvas.getContext('2d');
  var ovMenu = $('ovMenu'), ovPause = $('ovPause'), ovOver = $('ovOver');
  var chipMode = $('chipMode'), fieldDiff = $('fieldDiff');
  var btnSound = $('btnSound'), btnPause = $('btnPause');

  // ------------------------------------------------------------------- state
  var settings = { mode: '1p', diff: 'normal', winScore: 7, muted: false };

  var state = S.MENU;
  var prevState = S.PLAY;
  var countdown = 0;
  var lastCount = 0;
  var serveDir = 1;
  var shake = 0;
  var flash = 0;
  var flashColor = C.p1;
  var rally = 0;
  var particles = [];
  var stats = { hits: 0, bestRally: 0, topSpeed: 0 };

  var keys = Object.create(null);
  var pointer = { active: false, y: H / 2, side: 'left', time: -1e9 };

  function makePaddle(side, color) {
    return {
      side: side,
      color: color,
      x: side === 'left' ? PADDLE_MARGIN : W - PADDLE_MARGIN - PADDLE_W,
      y: H / 2 - PADDLE_H / 2,
      w: PADDLE_W, h: PADDLE_H,
      vy: 0, flash: 0, score: 0,
      aiTimer: 0, aiTarget: H / 2, aiErr: 0
    };
  }

  var left = makePaddle('left', C.p1);
  var right = makePaddle('right', C.p2);

  var ball = {
    x: W / 2 - BALL / 2, y: H / 2 - BALL / 2, w: BALL, h: BALL,
    vx: 0, vy: 0, speed: BASE_SPEED, trail: []
  };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function names() {
    if (settings.mode === '1p') return { l: 'YOU', r: 'CPU' };
    if (settings.mode === 'cpu') return { l: 'CPU 1', r: 'CPU 2' };
    return { l: 'P1', r: 'P2' };
  }

  // -------------------------------------------------------------- persistence
  function loadSettings() {
    try {
      var raw = window.localStorage.getItem(LS_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o.mode === '1p' || o.mode === '2p' || o.mode === 'cpu') settings.mode = o.mode;
      if (DIFF[o.diff]) settings.diff = o.diff;
      if (o.winScore === 5 || o.winScore === 7 || o.winScore === 11) settings.winScore = o.winScore;
      settings.muted = !!o.muted;
    } catch (e) { /* storage unavailable (private mode / file://) */ }
  }
  function saveSettings() {
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  // -------------------------------------------------------------------- audio
  var Sound = (function () {
    var ac = null, master = null, noiseBuf = null;

    function ensure() {
      if (ac) return ac;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.30;
      master.connect(ac.destination);
      return ac;
    }

    function tone(freq, dur, type, vol, slideTo) {
      if (settings.muted) return;
      var c = ensure();
      if (!c) return;
      if (c.state === 'suspended') c.resume();
      var t = c.currentTime;
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol == null ? 0.45 : vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.03);
    }

    function noise(dur, vol) {
      if (settings.muted) return;
      var c = ensure();
      if (!c) return;
      if (!noiseBuf) {
        noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      }
      var t = c.currentTime;
      var src = c.createBufferSource();
      src.buffer = noiseBuf;
      var f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.8;
      var g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t); src.stop(t + dur + 0.02);
    }

    return {
      unlock: function () { var c = ensure(); if (c && c.state === 'suspended') c.resume(); },
      paddle: function () { tone(520, 0.07, 'square', 0.42); },
      wall: function () { tone(300, 0.055, 'square', 0.26); },
      count: function (hi) { tone(hi ? 880 : 440, 0.09, 'triangle', 0.35); },
      score: function () { tone(190, 0.34, 'sawtooth', 0.34, 62); noise(0.22, 0.20); },
      win: function () {
        var seq = [523, 659, 784, 1047];
        for (var i = 0; i < seq.length; i++) {
          (function (f, d) { window.setTimeout(function () { tone(f, 0.17, 'square', 0.4); }, d); })(seq[i], i * 115);
        }
      },
      ui: function () { tone(700, 0.035, 'triangle', 0.22); }
    };
  })();

  // ---------------------------------------------------------------- particles
  function burst(x, y, color, count, speed, spread) {
    if (reduceMotion) count = Math.min(count, 6);
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = speed * (0.25 + Math.random() * 0.95);
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s * (spread || 1),
        vy: Math.sin(a) * s,
        t: 0, life: 0.3 + Math.random() * 0.5,
        size: 1.4 + Math.random() * 2.6,
        color: color
      });
    }
    if (particles.length > 460) particles.splice(0, particles.length - 460);
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.t += dt;
      if (p.t >= p.life) { particles.splice(i, 1); continue; }
      var drag = 1 - 2.4 * dt;
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  // ---------------------------------------------------------------------- AI
  function predictY(targetX) {
    var r = ball.h / 2;
    var cx = ball.x + r, cy = ball.y + r;
    if (Math.abs(ball.vx) < 1e-6) return cy;
    var t = (targetX - cx) / ball.vx;
    if (t < 0) return cy;
    var ny = cy + ball.vy * t;
    var range = H - 2 * r;
    var p = (ny - r) % (2 * range);
    if (p < 0) p += 2 * range;
    if (p > range) p = 2 * range - p;
    return p + r;
  }

  function updateAI(pad, dt, level) {
    var d = DIFF[level] || DIFF.normal;
    var toward = pad.side === 'right' ? ball.vx > 0 : ball.vx < 0;
    var faceX = pad.side === 'right' ? pad.x : pad.x + pad.w;

    pad.aiTimer -= dt;
    if (pad.aiTimer <= 0) {
      pad.aiTimer = d.react;
      pad.aiErr = (Math.random() * 2 - 1) * d.error;
      pad.aiTarget = (toward && d.predict) ? predictY(faceX) : (ball.y + ball.h / 2);
    }

    var target;
    if (toward) {
      target = pad.aiTarget + pad.aiErr;
    } else {
      target = H / 2 + (ball.y + ball.h / 2 - H / 2) * 0.22;
    }

    var center = pad.y + pad.h / 2;
    var delta = target - center;
    var dead = toward ? 4 : 26;
    var move = 0;
    if (Math.abs(delta) > dead) {
      move = (delta > 0 ? 1 : -1) * Math.min(Math.abs(delta), d.speed * dt);
    }
    pad.y += move;
    pad.vy = move / dt;
    pad.y = clamp(pad.y, 0, H - pad.h);
  }

  // ------------------------------------------------------------------- input
  function updateHuman(pad, dt) {
    var up, down;
    if (pad.side === 'left') {
      up = keys.KeyW || (settings.mode === '1p' && keys.ArrowUp);
      down = keys.KeyS || (settings.mode === '1p' && keys.ArrowDown);
    } else {
      up = keys.ArrowUp;
      down = keys.ArrowDown;
    }

    var dir = (down ? 1 : 0) - (up ? 1 : 0);
    if (dir !== 0) {
      pad.vy = dir * HUMAN_SPEED;
      pad.y += pad.vy * dt;
      pointer.active = false;
    } else {
      var canPointer = pointer.active &&
        (performance.now() - pointer.time < 2500) &&
        (settings.mode === '1p' ? pad.side === 'left' : pointer.side === pad.side);
      if (canPointer) {
        var target = clamp(pointer.y - pad.h / 2, 0, H - pad.h);
        var maxStep = 2400 * dt;
        var move = clamp(target - pad.y, -maxStep, maxStep);
        pad.y += move;
        pad.vy = move / dt;
      } else {
        pad.vy *= 0.86;
        if (Math.abs(pad.vy) < 4) pad.vy = 0;
      }
    }
    pad.y = clamp(pad.y, 0, H - pad.h);
  }

  function updatePaddles(dt) {
    var demo = (state === S.MENU);
    if (demo) {
      updateAI(left, dt, 'normal');
      updateAI(right, dt, 'normal');
      return;
    }
    if (settings.mode === 'cpu') {
      updateAI(left, dt, settings.diff);
      updateAI(right, dt, settings.diff);
    } else if (settings.mode === '1p') {
      updateHuman(left, dt);
      updateAI(right, dt, settings.diff);
    } else {
      updateHuman(left, dt);
      updateHuman(right, dt);
    }
  }

  // ------------------------------------------------------------------ physics
  function hitPaddle(pad) {
    var toward = pad.side === 'left' ? ball.vx < 0 : ball.vx > 0;
    if (!toward) return;
    if (ball.x + ball.w < pad.x || ball.x > pad.x + pad.w) return;
    if (ball.y + ball.h < pad.y || ball.y > pad.y + pad.h) return;

    var rel = clamp(((ball.y + ball.h / 2) - (pad.y + pad.h / 2)) / (pad.h / 2 + ball.h / 2), -1, 1);
    var angle = rel * MAX_ANGLE + clamp(pad.vy / 1500, -0.17, 0.17);
    angle = clamp(angle, -MAX_ANGLE * 1.08, MAX_ANGLE * 1.08);

    ball.speed = Math.min(ball.speed * SPEEDUP + 7, state === S.MENU ? BASE_SPEED * 1.3 : MAX_SPEED);
    var dir = pad.side === 'left' ? 1 : -1;
    ball.vx = Math.cos(angle) * ball.speed * dir;
    ball.vy = Math.sin(angle) * ball.speed;
    ball.x = pad.side === 'left' ? pad.x + pad.w : pad.x - ball.w;

    pad.flash = 1;
    rally++;
    stats.hits++;
    if (rally > stats.bestRally) stats.bestRally = rally;
    if (ball.speed > stats.topSpeed) stats.topSpeed = ball.speed;

    var hx = pad.side === 'left' ? pad.x + pad.w : pad.x;
    burst(hx, ball.y + ball.h / 2, pad.color, 14, 230, 0.7);
    shake = Math.max(shake, reduceMotion ? 0 : 3.2);
    if (state === S.PLAY) Sound.paddle();
  }

  function updateBall(dt) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    ball.trail.push(ball.x + ball.w / 2, ball.y + ball.h / 2);
    if (ball.trail.length > 34) ball.trail.splice(0, ball.trail.length - 34);

    if (ball.y < 0) {
      ball.y = 0;
      ball.vy = Math.abs(ball.vy);
      wallFx(ball.x + ball.w / 2, 0);
    } else if (ball.y + ball.h > H) {
      ball.y = H - ball.h;
      ball.vy = -Math.abs(ball.vy);
      wallFx(ball.x + ball.w / 2, H);
    }

    hitPaddle(left);
    hitPaddle(right);

    if (ball.x + ball.w < -24) {
      point(right);
    } else if (ball.x > W + 24) {
      point(left);
    }
  }

  function wallFx(x, y) {
    burst(x, y, 'rgba(180,210,255,0.95)', 7, 150, 1.6);
    if (state === S.PLAY) Sound.wall();
  }

  function point(winner) {
    var demo = (state === S.MENU);
    var ex = winner.side === 'left' ? W : 0;
    burst(ex, clamp(ball.y + ball.h / 2, 10, H - 10), winner.color, 40, 330, 0.9);
    shake = reduceMotion ? 0 : 13;
    flash = 0.55;
    flashColor = winner.color;
    serveDir = winner.side === 'left' ? -1 : 1;

    if (demo) {
      resetBall();
      launch();
      return;
    }

    winner.score++;
    Sound.score();
    rally = 0;

    if (winner.score >= settings.winScore) {
      endMatch(winner);
      return;
    }
    resetBall();
    countdown = 1.95;
    lastCount = 0;
    state = S.SERVE;
  }

  function resetBall() {
    ball.x = W / 2 - BALL / 2;
    ball.y = H / 2 - BALL / 2;
    ball.vx = 0; ball.vy = 0;
    ball.speed = BASE_SPEED;
    ball.trail.length = 0;
  }

  function launch() {
    var a = (Math.random() * 0.5 - 0.25);
    ball.speed = BASE_SPEED;
    ball.vx = Math.cos(a) * BASE_SPEED * serveDir;
    ball.vy = Math.sin(a) * BASE_SPEED;
    rally = 0;
  }

  // ------------------------------------------------------------- flow control
  // A clicked menu button keeps focus; leaving it focused would make Space
  // re-trigger that button instead of pausing/serving during play.
  function blurActive() {
    var a = document.activeElement;
    if (a && a.tagName === 'BUTTON' && typeof a.blur === 'function') a.blur();
  }

  function startMatch() {
    blurActive();
    left.score = 0; right.score = 0;
    stats = { hits: 0, bestRally: 0, topSpeed: 0 };
    rally = 0;
    particles.length = 0;
    left.y = right.y = H / 2 - PADDLE_H / 2;
    left.vy = right.vy = 0;
    serveDir = Math.random() < 0.5 ? 1 : -1;
    resetBall();
    countdown = 2.6;
    lastCount = 0;
    shake = 0; flash = 0;
    hide(ovMenu); hide(ovPause); hide(ovOver);
    state = S.SERVE;
    Sound.unlock();
    updateChip();
  }

  function endMatch(winner) {
    state = S.OVER;
    var n = names();
    var leftWon = winner.side === 'left';
    var label = leftWon ? n.l : n.r;
    var tag = leftWon ? 'player one takes the match' : 'match complete';
    if (settings.mode === '1p') label = leftWon ? 'YOU WIN' : 'CPU WINS';
    else if (settings.mode === 'cpu') { label += ' WINS'; tag = 'machine vs machine'; }
    var title = $('overTitle');
    title.textContent = label;
    title.className = 'title sm ' + (leftWon ? 'p1' : 'p2');
    $('overTag').textContent = tag;
    $('overScore').innerHTML = left.score + ' &mdash; ' + right.score;
    $('stHits').textContent = stats.hits;
    $('stRally').textContent = stats.bestRally;
    $('stSpeed').textContent = Math.round(stats.topSpeed);
    resetBall();
    show(ovOver);
    Sound.win();
  }

  function pause() {
    if (state !== S.PLAY && state !== S.SERVE) return;
    prevState = state;
    state = S.PAUSE;
    var n = names();
    $('pScoreL').textContent = left.score;
    $('pScoreR').textContent = right.score;
    $('pNameL').textContent = n.l;
    $('pNameR').textContent = n.r;
    show(ovPause);
  }

  function resume() {
    if (state !== S.PAUSE) return;
    blurActive();
    state = prevState;
    hide(ovPause);
  }

  function toMenu() {
    blurActive();
    state = S.MENU;
    left.score = right.score = 0;
    particles.length = 0;
    left.y = right.y = H / 2 - PADDLE_H / 2;
    serveDir = Math.random() < 0.5 ? 1 : -1;
    resetBall();
    launch();
    hide(ovPause); hide(ovOver); show(ovMenu);
    updateChip();
  }

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function updateChip() {
    var to = 'FIRST TO ' + settings.winScore;
    if (settings.mode === '1p') {
      chipMode.textContent = '1P · ' + DIFF[settings.diff].label + ' · ' + to;
    } else if (settings.mode === 'cpu') {
      chipMode.textContent = 'CPU vs CPU · ' + DIFF[settings.diff].label + ' · ' + to;
    } else {
      chipMode.textContent = '2P LOCAL · ' + to;
    }
    fieldDiff.classList.toggle('hidden', settings.mode === '2p');
    btnSound.setAttribute('aria-pressed', settings.muted ? 'false' : 'true');
    btnSound.setAttribute('aria-label', settings.muted ? 'Unmute sound' : 'Mute sound');
  }

  // ------------------------------------------------------------------- update
  function update(dt) {
    updateParticles(dt);
    if (shake > 0) { shake *= Math.pow(0.0016, dt); if (shake < 0.15) shake = 0; }
    if (flash > 0) { flash -= dt * 1.7; if (flash < 0) flash = 0; }
    left.flash = Math.max(0, left.flash - dt * 4);
    right.flash = Math.max(0, right.flash - dt * 4);

    if (state === S.PAUSE || state === S.OVER) return;

    updatePaddles(dt);

    if (state === S.SERVE) {
      countdown -= dt;
      var n = Math.min(3, Math.ceil(countdown / 0.65));
      if (n > 0 && n !== lastCount) {
        lastCount = n;
        Sound.count(n === 1);
      }
      if (countdown <= 0) {
        launch();
        state = S.PLAY;
      }
    }

    if (state === S.PLAY || state === S.MENU) updateBall(dt);
  }

  // ------------------------------------------------------------------- render
  var bg = null;
  function buildBackground() {
    var dpr = dprNow();
    bg = document.createElement('canvas');
    bg.width = canvas.width;
    bg.height = canvas.height;
    var b = bg.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);

    var g = b.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#070a1c');
    g.addColorStop(0.5, '#0a0f2b');
    g.addColorStop(1, '#140826');
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);

    var rg = b.createRadialGradient(W * 0.14, H * 0.5, 10, W * 0.14, H * 0.5, 330);
    rg.addColorStop(0, 'rgba(34,230,255,0.15)');
    rg.addColorStop(1, 'rgba(34,230,255,0)');
    b.fillStyle = rg; b.fillRect(0, 0, W, H);

    rg = b.createRadialGradient(W * 0.86, H * 0.5, 10, W * 0.86, H * 0.5, 330);
    rg.addColorStop(0, 'rgba(255,61,154,0.14)');
    rg.addColorStop(1, 'rgba(255,61,154,0)');
    b.fillStyle = rg; b.fillRect(0, 0, W, H);

    b.strokeStyle = 'rgba(120,150,255,0.07)';
    b.lineWidth = 1;
    var x, y;
    for (x = 0; x <= W; x += 45) { b.beginPath(); b.moveTo(x + 0.5, 0); b.lineTo(x + 0.5, H); b.stroke(); }
    for (y = 0; y <= H; y += 45) { b.beginPath(); b.moveTo(0, y + 0.5); b.lineTo(W, y + 0.5); b.stroke(); }
  }

  function dprNow() { return Math.min(window.devicePixelRatio || 1, 2); }

  function resize() {
    var dpr = dprNow();
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    buildBackground();
  }

  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCourt() {
    // side goal bars
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var gl = ctx.createLinearGradient(0, 0, 26, 0);
    gl.addColorStop(0, 'rgba(34,230,255,0.30)');
    gl.addColorStop(1, 'rgba(34,230,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, 26, H);
    var gr = ctx.createLinearGradient(W, 0, W - 26, 0);
    gr.addColorStop(0, 'rgba(255,61,154,0.30)');
    gr.addColorStop(1, 'rgba(255,61,154,0)');
    ctx.fillStyle = gr; ctx.fillRect(W - 26, 0, 26, H);
    ctx.restore();

    // center line
    ctx.save();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(150,180,255,0.6)';
    ctx.shadowBlur = 10;
    ctx.setLineDash([14, 16]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 6);
    ctx.lineTo(W / 2, H - 6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 58, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // border frame
    ctx.save();
    ctx.strokeStyle = 'rgba(140,170,255,0.22)';
    ctx.lineWidth = 2;
    rr(5, 5, W - 10, H - 10, 10);
    ctx.stroke();
    ctx.restore();
  }

  function drawScores() {
    if (state === S.MENU) return;
    var n = names();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    ctx.font = '700 96px ' + FONT;
    ctx.shadowBlur = 30;

    ctx.shadowColor = C.p1;
    ctx.fillStyle = 'rgba(230,250,255,0.94)';
    ctx.fillText(String(left.score), W * 0.31, 26);

    ctx.shadowColor = C.p2;
    ctx.fillStyle = 'rgba(255,235,245,0.94)';
    ctx.fillText(String(right.score), W * 0.69, 26);

    ctx.shadowBlur = 0;
    ctx.font = '700 13px ' + FONT;
    ctx.fillStyle = 'rgba(34,230,255,0.75)';
    ctx.fillText(spaced(n.l), W * 0.31, 132);
    ctx.fillStyle = 'rgba(255,61,154,0.75)';
    ctx.fillText(spaced(n.r), W * 0.69, 132);

    if (rally > 3 && state === S.PLAY) {
      ctx.font = '700 12px ' + FONT;
      ctx.fillStyle = 'rgba(255,211,92,0.85)';
      ctx.fillText(spaced('RALLY ' + rally), W / 2, 22);
    }
    ctx.restore();
  }

  function spaced(s) { return s.split('').join(' '); }

  function drawPaddle(p) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 24 + p.flash * 30;
    ctx.fillStyle = p.color;
    rr(p.x, p.y, p.w, p.h, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.55 + p.flash * 0.45) + ')';
    rr(p.x + p.w * 0.32, p.y + 4, p.w * 0.36, p.h - 8, 3);
    ctx.fill();
    ctx.restore();
  }

  function drawTrail() {
    if (ball.trail.length < 4) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var n = ball.trail.length / 2;
    for (var i = 0; i < n; i++) {
      var f = i / n;
      var x = ball.trail[i * 2], y = ball.trail[i * 2 + 1];
      ctx.globalAlpha = f * f * 0.42;
      ctx.fillStyle = C.ball;
      var s = BALL * (0.25 + f * 0.7);
      rr(x - s / 2, y - s / 2, s, s, s / 3);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBall() {
    var pulse = (state === S.SERVE || state === S.MENU)
      ? 1 + Math.sin(performance.now() / 220) * 0.16
      : 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = C.ball;
    ctx.shadowBlur = 26 * pulse;
    ctx.fillStyle = '#fffdf2';
    var s = BALL * pulse;
    rr(ball.x + (BALL - s) / 2, ball.y + (BALL - s) / 2, s, s, 3);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    if (!particles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = 1 - p.t / p.life;
      ctx.globalAlpha = a * a;
      ctx.fillStyle = p.color;
      var s = p.size * (0.4 + a);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();
  }

  function drawCountdown() {
    if (state !== S.SERVE) return;
    var n = Math.min(3, Math.ceil(countdown / 0.65));
    var label = n > 0 ? String(n) : 'GO';
    var frac = countdown / 0.65 - Math.floor(countdown / 0.65);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = clamp(0.35 + frac, 0, 1);
    ctx.shadowColor = 'rgba(255,211,92,0.9)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#fff3cf';
    ctx.font = '700 ' + (66 + (1 - frac) * 16) + 'px ' + FONT;
    ctx.fillText(label, W / 2, H / 2 - 4);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.6;
    ctx.font = '700 12px ' + FONT;
    ctx.fillStyle = 'rgba(200,215,255,0.8)';
    ctx.fillText(spaced('SPACE TO SKIP'), W / 2, H / 2 + 56);
    ctx.restore();
  }

  function render() {
    ctx.setTransform(dprNow(), 0, 0, dprNow(), 0, 0);
    if (bg) ctx.drawImage(bg, 0, 0, W, H);
    else { ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, W, H); }

    ctx.save();
    if (shake > 0.2) {
      ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
    }
    drawCourt();
    drawScores();
    drawTrail();
    drawParticles();
    drawPaddle(left);
    drawPaddle(right);
    drawBall();
    drawCountdown();
    ctx.restore();

    if (flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = flash * 0.28;
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    if (state === S.MENU) {
      ctx.save();
      ctx.fillStyle = 'rgba(4,5,13,0.45)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // --------------------------------------------------------------------- loop
  var last = performance.now();
  var acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    var guard = 0;
    while (acc >= STEP && guard++ < 240) { update(STEP); acc -= STEP; }
    if (guard >= 240) acc = 0;
    render();
  }

  // --------------------------------------------------------------------- wire
  function bindSeg(el, apply) {
    el.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-val]');
      if (!btn || !el.contains(btn)) return;
      var buttons = el.querySelectorAll('button[data-val]');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute('aria-pressed', buttons[i] === btn ? 'true' : 'false');
      }
      apply(btn.dataset.val);
      Sound.unlock();
      Sound.ui();
      saveSettings();
      updateChip();
    });
  }

  function syncSeg(el, val) {
    var buttons = el.querySelectorAll('button[data-val]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', buttons[i].dataset.val === String(val) ? 'true' : 'false');
    }
  }

  bindSeg($('segMode'), function (v) { settings.mode = v; });
  bindSeg($('segDiff'), function (v) { settings.diff = v; });
  bindSeg($('segScore'), function (v) { settings.winScore = parseInt(v, 10); });

  $('btnStart').addEventListener('click', function () { Sound.unlock(); Sound.ui(); startMatch(); });
  $('btnResume').addEventListener('click', function () { Sound.ui(); resume(); });
  $('btnRestart').addEventListener('click', function () { Sound.ui(); startMatch(); });
  $('btnQuit').addEventListener('click', function () { Sound.ui(); toMenu(); });
  $('btnAgain').addEventListener('click', function () { Sound.ui(); startMatch(); });
  $('btnAgainMenu').addEventListener('click', function () { Sound.ui(); toMenu(); });

  btnPause.addEventListener('click', function () {
    Sound.ui();
    if (state === S.PAUSE) resume(); else pause();
  });

  btnSound.addEventListener('click', function () {
    settings.muted = !settings.muted;
    saveSettings();
    updateChip();
    if (!settings.muted) { Sound.unlock(); Sound.ui(); }
  });

  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var code = e.code;
    var onButton = document.activeElement && document.activeElement.tagName === 'BUTTON';

    if (onButton && (code === 'Space' || code === 'Enter')) return;
    if (code === 'Space' || code === 'ArrowUp' || code === 'ArrowDown') e.preventDefault();

    keys[code] = true;
    Sound.unlock();

    if (code === 'Space') {
      if (state === S.MENU) startMatch();
      else if (state === S.SERVE) { countdown = 0; }
      else if (state === S.PLAY) pause();
      else if (state === S.PAUSE) resume();
      else if (state === S.OVER) startMatch();
    } else if (code === 'Escape' || code === 'KeyP') {
      if (state === S.PAUSE) resume();
      else if (state === S.PLAY || state === S.SERVE) pause();
      else if (state === S.OVER) toMenu();
    } else if (code === 'KeyR') {
      if (state !== S.MENU) startMatch();
    } else if (code === 'KeyM') {
      settings.muted = !settings.muted;
      saveSettings();
      updateChip();
      if (!settings.muted) Sound.ui();
    }
  });

  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = Object.create(null); });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && (state === S.PLAY || state === S.SERVE)) pause();
  });

  function pointerPos(e) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * W,
      y: (e.clientY - r.top) / r.height * H
    };
  }

  canvas.addEventListener('pointermove', function (e) {
    var p = pointerPos(e);
    pointer.active = true;
    pointer.y = p.y;
    pointer.side = p.x < W / 2 ? 'left' : 'right';
    pointer.time = performance.now();
  });

  canvas.addEventListener('pointerdown', function (e) {
    var p = pointerPos(e);
    pointer.active = true;
    pointer.y = p.y;
    pointer.side = p.x < W / 2 ? 'left' : 'right';
    pointer.time = performance.now();
    Sound.unlock();
    if (state === S.SERVE) countdown = 0;
  });

  canvas.addEventListener('pointerleave', function () { pointer.active = false; });

  var rzTimer = 0;
  window.addEventListener('resize', function () {
    window.clearTimeout(rzTimer);
    rzTimer = window.setTimeout(resize, 120);
  });

  // --------------------------------------------------------------------- boot
  loadSettings();
  syncSeg($('segMode'), settings.mode);
  syncSeg($('segDiff'), settings.diff);
  syncSeg($('segScore'), settings.winScore);
  updateChip();
  resize();
  resetBall();
  ball.vx = BASE_SPEED * 0.8;
  ball.vy = BASE_SPEED * 0.35;
  requestAnimationFrame(frame);
})();
