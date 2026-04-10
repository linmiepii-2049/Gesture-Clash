# Gesture Game

An interactive real-time battle game that combines gesture recognition and voice commands. Players compete round by round using hand signs and spoken triggers, while the system instantly judges outcomes and updates scores for a fast, intuitive, and immersive experience.

## Features

- Real-time gesture-based rounds
- Voice-trigger interaction flow
- Automatic winner and score updates
- Rule-focused test cases for key game logic
- One-command production deployment with Vercel

## Project Structure

- `index.html`: main game entry page
- `*.test.js`: rule and behavior tests for game logic
- `.vercelignore`: deployment ignore rules for Vercel

## Run Locally

This project is currently a static site entry with test files.

```bash
python3 -m http.server 5500
```

Open `http://localhost:5500` in your browser.

## Testing

Current tests are organized as standalone `*.test.js` files in the project root.

Suggested command patterns (depending on your selected test runner):

```bash
# Node built-in test runner
node --test
```

```bash
# Or run a single test file
node --test player-registration-guard.test.js
```

## Deploy to Vercel

```bash
vercel --prod --yes
```

After deployment, Vercel provides:

- A production alias URL
- A deployment-specific URL
- An inspector URL for build and deployment details

## Notes

- Keep `.env` and `.env.*` out of version control.
- Keep `.env.example` for public configuration references.
- Store temporary logs and build outputs outside tracked files.
