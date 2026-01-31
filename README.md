# Ping Pong - Free Online Game

HTML5 Canvas ping pong game. Play vs AI or 2 Player local. Customize difficulty, colors, and sound.

## Features

- **Game Modes**: vs AI (Mouse) / 2 Player (Keyboard)
- **First to 10 wins**
- **3-second countdown** before each round
- **Settings Panel**: Difficulty, Background, Paddle colors, Sound
- **Background colors**: 7 presets (빨주노초파남보) + custom picker
- **Paddle colors**: P1/P2 presets + custom picker
- **Pointer Lock**: vs AI mode - mouse stays in game area (ESC to pause)
- **Pause with ESC** during gameplay
- **Touch controls** for mobile (vs AI mode)
- **Responsive design** for desktop and mobile
- **Paddle physics** with spin and speed effects

## How to Play

- **vs AI**: Move mouse to control paddle (left side). First to 10 wins!
- **2 Player**: P1 uses W/S, P2 uses ↑/↓ arrows.
- **ESC**: Pause / Resume
- **Settings**: Open from start screen or pause screen

## Controls

| Mode | P1 (Left) | P2 (Right) |
|------|-----------|------------|
| vs AI | Mouse Y | AI |
| 2 Player | W / S | ↑ / ↓ |

## Settings

| Option | Description |
|--------|-------------|
| Difficulty | Easy, Normal, Hard (AI speed & reaction) |
| Background | Red, Orange, Yellow, Green, Blue, Indigo, Violet + Custom |
| Left Paddle | 6 presets + Custom color |
| Right Paddle | 6 presets + Custom color |
| Sound | Volume slider |

## Running Locally

```bash
npx serve .
# or
python -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

## Project Structure

```
pingpong/
├── index.html      # Main HTML, overlays, settings panel
├── css/
│   └── style.css   # Styling
├── js/
│   └── game.js     # Game logic, AI, physics, colors
└── README.md
```

## Tech Stack

- HTML5 Canvas
- Vanilla JavaScript
- CSS3, Google Fonts
- Web Audio API for sound
- No external dependencies

## License

MIT License
