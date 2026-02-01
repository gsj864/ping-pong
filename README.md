# Edge Ping Pong

HTML5 Canvas ping pong game. Play 1 Player vs AI, 2 Player local, Endless, or Challenge mode. Poki SDK integration for ads. Responsive 16:9 letterbox.

## Features

- **Game Modes**
  - **1 Player (Click)**: Left click = paddle up, Right click = paddle down. First to 5 wins.
  - **2 Player**: P1 W/S, P2 ↑/↓. Ball speed: Slow / Normal / Fast.
  - **Endless**: No score limit. Change difficulty and ball speed when paused.
  - **Challenge**: 20 stages (Beginner, Intermediate, Advanced). Rally, survival, precision, time limit, etc.
- **Challenge fail**: Watch ad to continue or give up. Varied fail/continue messages.
- **First to 5** (or challenge-specific win score)
- **Countdown** (0.5s per number) before each round
- **Settings**: Difficulty, Background, P1/P2 paddle colors, SFX/Music volume
- **Ball speed** (2P / Endless): Slow, Normal, Fast
- **Background**: 7 presets + custom picker
- **Paddles**: 6 presets + custom per side
- **Pause (ESC)**: Resume, difficulty (Endless), back to menu
- **Touch**: 1P click; 2P left/right half for P1/P2
- **Responsive**: 16:9 letterbox, scales to viewport
- **Poki SDK**: Commercial break, Rewarded break (undo point / challenge continue), gameplay events

## How to Play

- **1 Player**: Left click = up, Right click = down. First to 5 wins.
- **2 Player**: P1 W/S, P2 ↑/↓. First to 5. Set ball speed on start screen.
- **Endless**: No limit. Pause to change difficulty or ball speed.
- **Challenge**: Pick a stage → PLAY. Fail = option to watch ad to continue or give up.
- **ESC**: Pause / Resume

## Controls

| Mode        | P1 (Left)        | P2 (Right)   |
|------------|------------------|--------------|
| 1 Player   | Left / Right click | CPU        |
| 2 Player   | W / S           | ↑ / ↓        |

Touch: 1P uses left/right tap for up/down. 2P: left half = P1, right half = P2.

## Settings

| Option     | Description |
|-----------|-------------|
| Difficulty | Easy, Normal, Hard (AI) |
| Background | Presets + custom |
| Left / Right Paddle | Presets + custom |
| Ball Speed | Slow / Normal / Fast (2P, Endless only) |
| Sound      | SFX & Music sliders |

## Challenge Mode

- **20 stages** in 3 tiers: Beginner (1–6), Intermediate (7–14), Advanced (15–20).
- Types: First point, Safe win, Rally, Survivor, Precision (center hits), Time limit, No Mercy, Perfect Game, Speed, etc.
- Progress saved in `localStorage`. Unlock next tier by clearing previous.
- **On fail**: “Watch Ad – Continue” or “Give Up”. On continue, game resumes (or timer reset for time-limit stages).

## Running Locally

```bash
npx serve .
# or
python -m http.server 8080
```

Open `http://localhost:8080`. Poki SDK is not loaded on localhost; ads are no-ops.

## Project Structure

```
edge ping pong/
├── index.html       # Main HTML, overlays, settings, challenge UI
├── css/
│   └── style.css    # Layout, overlays, responsive
├── js/
│   ├── game.js      # Game logic, physics, Poki wrapper, resize/letterbox
│   └── challenges.js # Challenge definitions, tier, unlock, check
├── fonts/           # Poppins, Russo One (woff2)
└── README.md
```

## Tech Stack

- HTML5 Canvas
- Vanilla JavaScript
- CSS3, local fonts (Poppins, Russo One)
- Web Audio API for sound
- Poki SDK v2 (optional; loaded only when not localhost)
- No npm dependencies

## License

MIT License
