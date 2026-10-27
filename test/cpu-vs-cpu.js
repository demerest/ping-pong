// Assertion suite for the CPU vs CPU mode. Loaded after the real game.js inside
// a disposable copy of index.html (see build-harness.ps1); drives the game purely
// through DOM events, exactly like a player would.
(function () {
  'use strict';
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
    pre.textContent = log.join('\n') + '\nSUMMARY pass=' + pass + ' fail=' + fail;
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
  click(seg('segDiff', 'easy'));   // biggest aim error -> shortest match
  click(seg('segScore', '5'));
  chip = $('chipMode').textContent;
  check('chip reflects easy + first to 5',
    chip.indexOf('CPU vs CPU · EASY · FIRST TO 5') === 0, chip);

  var saved = null;
  try { saved = JSON.parse(window.localStorage.getItem('neonpong.v1')); } catch (e) {}
  check('mode persisted as cpu', saved && saved.mode === 'cpu', JSON.stringify(saved));

  click($('btnStart'));
  check('menu hidden after start', hidden($('ovMenu')));

  // Now let a whole match play itself out and inspect the result overlay.
  var deadline = 100000, waited = 0;
  var rafCount = 0;
  (function tick() { rafCount++; window.requestAnimationFrame(tick); })();
  var timer = window.setInterval(function () {
    waited += 500;
    if (!hidden($('ovOver'))) {
      window.clearInterval(timer);
      var title = $('overTitle').textContent;
      var score = $('overScore').textContent;
      var nums = score.split('—').map(function (s) { return parseInt(s.trim(), 10); });
      check('game over title names a CPU', /^CPU [12] WINS$/.test(title), title);
      check('game over tag', $('overTag').textContent === 'machine vs machine',
        $('overTag').textContent);
      check('final score parsed', nums.length === 2 && !isNaN(nums[0]) && !isNaN(nums[1]), score);
      check('match played to 5', Math.max(nums[0], nums[1]) === 5, score);
      // If the left paddle were still human-driven it would never return a serve
      // and the match would end 5-0, so a point either side proves both are AI.
      check('both CPUs scored (left paddle is AI driven)',
        Math.min(nums[0], nums[1]) >= 1, score);
      check('title colour matches winner side',
        $('overTitle').className === 'title sm ' + (nums[0] > nums[1] ? 'p1' : 'p2'),
        $('overTitle').className);
      check('stats recorded hits', parseInt($('stHits').textContent, 10) > 5,
        $('stHits').textContent);
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
