# NEON PONG

A retro-arcade Pong game in pure HTML, CSS and JavaScript. No dependencies, no
build step, no assets — three files and a canvas.

**Play it:** enable GitHub Pages (Settings → Pages → *Deploy from a branch* →
`main` / `/ (root)`), then open <https://demerest.github.io/ping-pong/>.

## Run locally

```bash
git clone git@github.com:demerest/ping-pong.git
cd ping-pong
start index.html      # Windows
# open index.html     # macOS
# xdg-open index.html # Linux
```

Opening the file straight from disk works: the game uses no ES modules, no
`fetch` and no external fonts or libraries, so there is nothing for `file://`
to block. Any modern browser with canvas 2D and WebAudio will do.

## Controls

| Action | Keys |
| --- | --- |
| Left paddle (P1 / you) | `W` `S`, or `↑` `↓`, or mouse / touch |
| Right paddle (P2) | `↑` `↓` — 2P mode only |
| Serve / pause | `Space` |
| Pause + menu | `Esc` or `P` |
| Restart match | `R` |
| Mute | `M` |

In 1P mode both key pairs drive your paddle. On touch devices, dragging the
left half of the court moves the left paddle and the right half moves the right
one — except in 1P mode, where dragging anywhere moves your paddle. Keyboard
input takes over from the pointer as soon as you press a move key.

## Modes

- **1P vs CPU** — you take the left side. Three difficulties:

  | CPU | Paddle speed | Aim error | Reaction | Predicts bounces |
  | --- | --- | --- | --- | --- |
  | Easy | 300 px/s | ±66 px | 0.30 s | no |
  | Normal | 435 px/s | ±30 px | 0.16 s | yes |
  | Insane | 625 px/s | ±11 px | 0.07 s | yes |

  On Normal and Insane the CPU simulates the ball's path including wall
  reflections to know where it will arrive, then deliberately misses by its aim
  error. It re-plans only every *reaction* interval, so a fast angle change
  can wrong-foot it. Beating Insane is mostly about steep, late angle changes.

  Both weaknesses are small enough that a predicting CPU could otherwise return
  everything forever — a CPU vs CPU match would never score. So **rally
  pressure** kicks in: past 6 hits, every further hit adds 8 px to the aim error
  and 6% to the reaction interval (capped at +160 px and 4×). Once the error
  exceeds the 54 px hit tolerance — half the paddle plus half the ball — a miss
  becomes inevitable. The error has to be additive in absolute pixels: scaling
  each difficulty's base error multiplicatively never lifts Insane's ±11 px
  clear of that tolerance, which is exactly why Insane used to rally forever.
  Measured average rally length in CPU vs CPU: **~2 hits on Easy, ~15 on
  Normal, ~22 on Insane**.

  In 1P the same rule is a comeback mechanic — keep the rally alive long enough
  and the CPU starts to tire.

- **2P local** — two players, one keyboard.

- **CPU vs CPU** — the attract-mode demo promoted to a full match. Two AIs play
  each other to the target score; the difficulty you pick drives *both* sides,
  so an Easy mirror plays out very differently from an Insane one. Neither
  paddle takes human input — the pointer and move keys are ignored — but
  `Space` still skips the serve countdown, `Esc` pauses and `R` restarts. The
  winner is announced as `CPU 1` or `CPU 2`, left and right respectively.

Play to 5, 7 or 11 points. Mode, difficulty, target score and mute state are
remembered between visits via `localStorage`.

## How the ball behaves

- Speed ramps from **380 px/s** to a cap of **1100 px/s**, gaining 4.5% + 7 px/s
  on every paddle hit, so rallies escalate.
- Exit angle is set by *where* the ball strikes the paddle: the centre returns
  it flat, the tips return it at up to ~69°. Paddle velocity at the moment of
  contact adds up to ~10° of extra spin.
- The horizontal component never drops below ~26% of total speed, so the ball
  cannot stall into an endless vertical bounce.
- The ball is served toward whoever just conceded the point.

Physics run on a **fixed 120 Hz timestep** with an accumulator, independent of
the display's refresh rate. At the top speed the ball moves about 9 px per step,
well inside the 26 px span over which a paddle hit is detected (14 px paddle +
12 px ball), which is what makes tunnelling impossible. Raising the cap much
past ~3000 px/s would break that invariant.

## Extras

Attract-mode CPU-vs-CPU demo behind the main menu (always Normal and it keeps no
score — distinct from the selectable **CPU vs CPU** mode) · particle bursts on
hits, wall bounces and points · ball trail · screen shake and a colour flash when
a point is scored · synthesized WebAudio sound effects (no audio files) ·
end-of-match stats (total hits, best rally, top ball speed) · auto-pause when
the tab loses focus.

The CRT styling — scanlines, vignette, flicker — is CSS layered over the canvas.
`prefers-reduced-motion` is honoured: shake and particles are cut back in the
engine and the flicker and panel animations are disabled in CSS.

## Tests

```bash
test\run.cmd          # Windows
```

No Node, no build step: the script builds a throwaway copy of `index.html` in
`%TEMP%`, loads the real `game.js` into it plus `test/cpu-vs-cpu.js`, and runs it
in headless Chrome (Edge as a fallback). It drives the game through DOM events
only, then plays a **real match to 5 at each of the three difficulties** and
asserts on the result overlay — mode wiring, chip text, difficulty-field
visibility, `localStorage` persistence, that *both* paddles are AI-driven, and
that no rally runs away. 23 assertions per difficulty; exit code 0 means all
passed. Allow a few minutes.

All three difficulties matter. The endless-rally defect only reproduced on
Normal and Insane — an Easy-only suite passed 20/20 while CPU vs CPU matches
could never finish, because Easy's ±66 px aim error already exceeded the hit
tolerance. The `no endless rally` check is the regression fence for it.

Two harness details worth knowing before editing it:

- It shims `requestAnimationFrame` onto `setTimeout`, because Chrome's
  `--virtual-time-budget` fast-forwards timers but never fires rAF — without the
  shim the game loop stalls and every match silently times out.
- The three runs go in parallel with separate browser profiles. Virtual time is
  deterministic and independent of wall time, so parallelism changes how long
  the suite takes, not what it concludes. Profiles are wiped first because the
  suite asserts on the default settings seen at load.

## Files

| File | Role |
| --- | --- |
| `index.html` | Cabinet shell, canvas, menu / pause / game-over overlays |
| `style.css` | CRT neon styling, overlays, responsive `aspect-ratio` stage |
| `game.js` | Game loop, physics, CPU AI, particles, audio, input, UI wiring |
| `test/` | Headless-Chrome suite for the CPU vs CPU mode |

The canvas keeps a fixed 900×560 logical coordinate space and is scaled by CSS,
with the backing store sized to the device pixel ratio (capped at 2×) so it
stays sharp on high-DPI screens.
