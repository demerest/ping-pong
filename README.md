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

- **2P local** — two players, one keyboard.

Play to 5, 7 or 11 points. Mode, difficulty, target score and mute state are
remembered between visits via `localStorage`.

## How the ball behaves

- Speed ramps from **380 px/s** to a cap of **940 px/s**, gaining 4.5% + 7 px/s
  on every paddle hit, so rallies escalate.
- Exit angle is set by *where* the ball strikes the paddle: the centre returns
  it flat, the tips return it at up to ~69°. Paddle velocity at the moment of
  contact adds up to ~10° of extra spin.
- The horizontal component never drops below ~26% of total speed, so the ball
  cannot stall into an endless vertical bounce.
- The ball is served toward whoever just conceded the point.

Physics run on a **fixed 120 Hz timestep** with an accumulator, independent of
the display's refresh rate. At the top speed the ball moves under 8 px per step
against a 14 px paddle, which is what makes tunnelling impossible.

## Extras

Attract-mode CPU-vs-CPU demo behind the main menu · particle bursts on hits,
wall bounces and points · ball trail · screen shake and a colour flash when a
point is scored · synthesized WebAudio sound effects (no audio files) ·
end-of-match stats (total hits, best rally, top ball speed) · auto-pause when
the tab loses focus.

The CRT styling — scanlines, vignette, flicker — is CSS layered over the canvas.
`prefers-reduced-motion` is honoured: shake and particles are cut back in the
engine and the flicker and panel animations are disabled in CSS.

## Files

| File | Role |
| --- | --- |
| `index.html` | Cabinet shell, canvas, menu / pause / game-over overlays |
| `style.css` | CRT neon styling, overlays, responsive `aspect-ratio` stage |
| `game.js` | Game loop, physics, CPU AI, particles, audio, input, UI wiring |

The canvas keeps a fixed 900×560 logical coordinate space and is scaled by CSS,
with the backing store sized to the device pixel ratio (capped at 2×) so it
stays sharp on high-DPI screens.
