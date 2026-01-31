# Ping Pong - Free Online Game

A polished HTML5 Canvas ping pong game designed for Poki publishing. Play against AI with smooth controls and beautiful visuals.

## Features

- **First to 10 wins** scoring system
- **3-second countdown** before each round
- **Difficulty levels**: Easy, Normal, Hard
- **Volume control** slider in menu and pause screen
- **Mute toggle** button during gameplay
- **Pause with ESC** key or pause button
- **Responsive design** for desktop and mobile
- **Touch controls** for mobile devices
- **Smooth paddle physics** with spin mechanics

## How to Play

- **Desktop**: Move mouse to control your paddle (left side)
- **Mobile**: Touch and drag to move paddle
- **ESC**: Pause / Resume game
- First player to reach 10 points wins!

## Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Move Paddle | Mouse Y | Touch Y |
| Pause | ESC / Button | Button |
| Mute | 🔊 Button | 🔊 Button |

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
├── index.html      # Main HTML with overlay screens
├── css/
│   └── style.css   # Poki-quality styling
├── js/
│   └── game.js     # Game logic, AI, physics
└── README.md
```

## Tech Stack

- HTML5 Canvas
- Vanilla JavaScript
- CSS3 with Google Fonts
- Web Audio API for sound effects
- No external dependencies

## Poki Publishing

This game is designed for Poki platform:
- Fullscreen responsive canvas
- Touch-friendly controls
- No ads or external resources
- Static file deployment ready

## License

MIT License
