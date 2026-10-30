// Assertion suite for the CPU vs CPU mode.
//
// Difficulty comes from the URL hash: #easy | #normal | #insane (default easy).
// test\run.cmd runs all three, because the endless-rally defect this suite
// guards against only reproduces on Normal and Insane - Easy always conceded,
// so an Easy-only suite passed while the game was broken.
//
// Loaded after the real game.js inside a disposable copy of index.html (see
// build-harness.ps1); drives the game through DOM events only, like a player.
(function () {
  'use strict';

  var LABELS = { easy: 'EASY', normal: 'NORMAL', insane: 'INSANE' };
  // bestRally is the longest exchange of the whole match, so these floors are
  // well under the measured maxima (easy ~9, normal ~20, insane ~27) and well
  // over what an idle left paddle could produce. A rally of this length is only
  // possible if both paddles track the ball, which is what proves the left one
  // is AI driven.
  var MIN_RALLY = { easy: 2, normal: 5, insane: 8 };
  // Ceiling before we call a rally endless. Measured maxima are ~9/~20/~27; the
  // pre-fix behaviour was one unbroken 254-hit rally that never scored.
  var MAX_RALLY = 60;
  // Virtual ms allowed for a match to 5 at each difficulty.
  var DEADLINE = { easy: 180000, normal: 360000, insane: 460000 };
  var SPEED_FLOOR = 380, SPEED_CEIL = 1100;

  var diff = (location.hash || '').replace('#', '') || 'easy';
  if (!LABELS[diff]) diff = 'easy';

  var log = [], pass = 0, fail = 0;

  function check(name, cond, extra) {
    if (cond) { pass++; log.push('PASS ' + name); }
    else { fail++; log.push('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
  }
  function $(id) { return document.getElementById(id); }
  function click(el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  function seg(id, val) {
    return document.querySelector('#' + id + ' button[data-val="' + val + '"]');
  }
  function hidden(el) { return el.classList.contains('hidden'); }

  function report() {
    var pre = document.createElement('pre');
    pre.id = 'testout';
    pre.textContent = '[' + diff + ']\n' + log.join('\n') +
                      '\nSUMMARY pass=' + pass + ' fail=' + fail;
    document.body.appendChild(pre);
  }

  // mute first so WebAudio never has to spin up a real device
  click($('btnSound'));

  var modeBtns = document.querySelectorAll('#segMode button[data-val]');
  check('menu has 3 modes', modeBtns.length === 3, 'got ' + modeBtns.length);
  check('third mode is cpu', !!seg('segMode', 'cpu'));
  check('cpu button label', seg('segMode', 'cpu').textContent.trim() === 'CPU vs CPU',
    seg('segMode', 'cpu').textContent);

  click(seg('segMode', 'cpu'));
  check('cpu button pressed', seg('segMode', 'cpu').getAttribute('aria-pressed') === 'true');
  check('1p button released', seg('segMode', '1p').getAttribute('aria-pressed') === 'false');

  var chip = $('chipMode').textContent;
  check('chip shows CPU vs CPU', chip.indexOf('CPU vs CPU') === 0, chip);
  check('chip shows difficulty', chip.indexOf('NORMAL') > 0, chip);
  check('difficulty field stays visible in cpu mode', !hidden($('fieldDiff')));

  click(seg('segMode', '2p'));
  check('difficulty field hidden in 2p mode', hidden($('fieldDiff')));
  check('2p chip', $('chipMode').textContent.indexOf('2P LOCAL') === 0, $('chipMode').textContent);

  click(seg('segMode', 'cpu'));
  click(seg('segDiff', diff));
  click(seg('segScore', '5'));
  chip = $('chipMode').textContent;
  check('chip reflects ' + diff + ' + first to 5',
    chip.indexOf('CPU vs CPU · ' + LABELS[diff] + ' · FIRST TO 5') === 0, chip);

  var saved = null;
  try { saved = JSON.parse(window.localStorage.getItem('neonpong.v1')); } catch (e) {}
  check('mode persisted as cpu', saved && saved.mode === 'cpu', JSON.stringify(saved));
  check('difficulty persisted', saved && saved.diff === diff, JSON.stringify(saved));

  click($('btnStart'));
  check('menu hidden after start', hidden($('ovMenu')));

  // Let a whole match play itself out, then inspect the result overlay.
  var deadline = DEADLINE[diff], waited = 0;
  var rafCount = 0;
  (function tick() { rafCount++; window.requestAnimationFrame(tick); })();
  var timer = window.setInterval(function () {
    waited += 500;
    if (!hidden($('ovOver'))) {
      window.clearInterval(timer);
      var title = $('overTitle').textContent;
      var score = $('overScore').textContent;
      var nums = score.split('—').map(function (s) { return parseInt(s.trim(), 10); });
      var best = parseInt($('stRally').textContent, 10);
      var hits = parseInt($('stHits').textContent, 10);
      var top = parseInt($('stSpeed').textContent, 10);

      check('game over title names a CPU', /^CPU [12] WINS$/.test(title), title);
      check('game over tag', $('overTag').textContent === 'machine vs machine',
        $('overTag').textContent);
      check('final score parsed', nums.length === 2 && !isNaN(nums[0]) && !isNaN(nums[1]), score);
      check('match played to 5', Math.max(nums[0], nums[1]) === 5, score);
      check('title colour matches winner side',
        $('overTitle').className === 'title sm ' + (nums[0] > nums[1] ? 'p1' : 'p2'),
        $('overTitle').className);
      check('left paddle is AI driven (rally floor)', best >= MIN_RALLY[diff],
        'bestRally=' + best + ' < ' + MIN_RALLY[diff]);
      check('no endless rally', best <= MAX_RALLY, 'bestRally=' + best + ' > ' + MAX_RALLY);
      // Not a fixed floor: an Easy match can legitimately finish in ~12 hits.
      // What must hold is that the counters are wired to the right quantities.
      check('hit counter covers the best rally', hits >= best, 'hits=' + hits + ' best=' + best);
      check('ball speed ramped within cap', top >= SPEED_FLOOR && top <= SPEED_CEIL,
        'topSpeed=' + top);
      report();
      return;
    }
    if (waited >= deadline) {
      window.clearInterval(timer);
      check('match finished within budget', false,
            'waited ' + waited + 'ms, rafCount=' + rafCount);
      report();
    }
  }, 500);
})();
