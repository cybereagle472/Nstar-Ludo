# Nstar Ludo

A mobile-first Ludo game made with **HTML, CSS, and JavaScript**, recreated from the published screens and assets of [LudoVerse](https://github.com/jamalihassan0307/LudoVerse). The app supports offline pass-and-play and adds a small private-room server for online games.

> **Important reference limitation:** the linked repository at commit `03bac98854734d09218e89b7d61d252b8b01fa77` contains an Android APK, screenshots, and assets, but not the Flutter source code described in its README. This is a new implementation based on those references, not a code-for-code port; exact behavior and 100% parity cannot be verified. The upstream repository also had **no license file** when inspected. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) before redistributing its assets.

## Start playing

Requirements: **Node.js 18 or newer**. There are no production npm dependencies and no build step.

```bash
npm start
```

Open `http://localhost:4173` on the same computer. To play online with someone else, deploy the Node server to a reachable HTTPS host and share the resulting room link. The server binds to `0.0.0.0` and uses `PORT` if supplied:

```bash
PORT=8080 npm start
```

Do not open `index.html` directly as a `file://` URL: browsers restrict JavaScript modules and service workers there. A simple static web server can serve the offline game, but **online rooms require the included Node server**.

### Offline use

Visit the app once on HTTPS or localhost so its service worker can cache the app shell, board, dice, fonts, and sounds. After that, pass-and-play can be reloaded without a network connection on browsers that support service workers. It can also be installed as a progressive web app using the browser's install/add-to-home-screen option. Online rooms and account sign-in still require a connection.

## What's implemented

- **2, 3, and 4 players** on one device, with the same red/yellow/blue/green board layout as the reference.
- Four pawns per player; roll a six to enter, capture opposing pawns on unsafe squares, safe starting and star squares, exact rolls into home, and three consecutive sixes forfeiting the turn.
- A six is saved and grants another roll. Multiple saved dice can be used in a chosen order; the move dialog disables dice that cannot move the selected pawn. Legal pawns are highlighted.
- First-, second-, and third-place tracking for larger games. Once all but one player finish, the remaining player receives the last place. Dice history, winner screen, rule guide, onboarding tour, exit confirmation, and an auto-saved local game are included.
- Responsive mobile, tablet, and desktop screens; keyboard-accessible buttons and dialogs; reduced-motion support.
- Guest profile editing; device-local games played, wins, and win rate. In pass-and-play, the local profile is **red**; in online games it is the assigned color. A game is counted when it starts, and a win is counted for first place.
- Sound effects, an optional synthesized background tune, vibration where supported, browser turn notifications where permission is granted, and system/light/dark themes. Settings persist on the device.
- **Online private rooms (beta):** 2–4 people can create/join a room by code or invite link. The included server validates turns and rolls the dice server-side, broadcasts changes, and allows a browser tab to reconnect while its session and room remain available.
- Email/password and Google sign-in **integration code**, ready to configure with your own Firebase project (see below). Guest play does not require an account.

The Friends and global Leaderboard screens deliberately retain the reference's **Coming Soon** state. The upstream screenshots also show Online Mode as coming soon, although its README makes inconsistent claims; the private rooms here are an added feature, not a copy of an existing online backend.

## Configure account sign-in (optional)

1. Create your own Firebase project and register a **web app**.
2. In Firebase Authentication, enable the **Email/Password** and **Google** providers, and add your deployed domain to the authorized domains.
3. Fill in `apiKey`, `authDomain`, `projectId`, and `appId` in `firebase-config.js` using your Firebase web configuration.
4. Serve the app on localhost or HTTPS. Sign-in loads the official Firebase JavaScript SDK from `gstatic.com`, so it requires network access.

Until configured, sign-in buttons are disabled and the screen explains why. Do not reuse another project's Firebase configuration. Configure appropriate Firebase security rules and restrictions for your own deployment. The sign-in integration has not been verified against a real Firebase project in this workspace, and game statistics remain **device-local**, not cloud-synchronized.

## Room-server limitations

The room service is a lightweight demonstration, not a production backend. Rooms and session tokens live **in server memory**, disappear on restart, and expire after two hours of inactivity. A tab can reconnect while its session remains in `sessionStorage`; closing the tab may end that ability. If a player leaves a started game permanently, their seat is not replaced by a bot. There is no durable database, account-based authorization, abuse prevention/rate limiting, matchmaking, or production monitoring. Use HTTPS and add those protections before a public launch. Share room codes only with people you trust.

## Testing

```bash
npm test
```

This runs the dependency-free rules and room-server tests with Node's built-in test runner.

For the optional real-browser smoke test, install Playwright and its browser locally first:

```bash
npm install --no-save playwright@1.55.0
npx playwright install chromium
npm run test:browser
```

The browser test exercises mobile play, saved dice, settings, the tour, offline reload, and room synchronization. Set `CHROMIUM_PATH` if you need to use an existing Chromium executable.

## Known remaining work / differences

- Exact original feature/animation parity cannot be established without the original Flutter sources and backend configuration. The reference mentions “shortcuts” but does not document their rules; this version implements the documented safe squares, not an invented shortcut rule.
- Friends, global leaderboards, chat, achievements, cloud statistics, and durable multiplayer are not implemented. Friends and Leaderboard are placeholders, as in the reference screenshots.
- Firebase authentication requires a project and a real end-to-end verification. The original project's credentials are not included.
- The language selector saves the same English/Spanish/French/Hindi preference choices shown by the original app, but the interface is currently **English only**; translations remain to be written.
- Browser vibration, notifications, audio, installation, and offline caching depend on device/browser support and permissions. The app's welcome tour is available from **How to play**, rather than forcing a first-run login.
- If working from the downloadable archive, publishing it as a new GitHub repository requires the owner to create a remote and push it, for example:

  ```bash
  git remote add origin https://github.com/YOUR-ACCOUNT/Nstar-Ludo.git
  git push -u origin main
  ```

## Project layout

```text
index.html              App shell and inline SVG icons
styles.css              Responsive styles and themes
app.js                  Screens, controls, local storage, and room client
engine.js               Shared game rules and board coordinates
server.js               Node static server and in-memory room API
firebase-config.js      Optional Firebase web configuration
auth.js                 Optional Firebase authentication adapter
sw.js                   Offline app-shell cache
assets/                 Board/dice/sounds, brand icons, and bundled font
tests/                  Rule, room-server, and optional browser tests
```

The original Nstar Ludo source code in this repository is released under the MIT terms in [LICENSE](LICENSE). Those terms **do not grant rights to the upstream third-party assets**; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## GitHub Pages preview

The workflow at `.github/workflows/deploy-pages.yml` tests the project and deploys the static app on pushes to `main`. In the GitHub repository settings, select **Pages → Build and deployment → Source: GitHub Actions** if it is not already enabled. The workflow publishes only the browser app and required assets, not the Node room server or Git metadata.

A GitHub Pages preview supports pass-and-play, local statistics, settings, and offline use after the first visit. **Private online rooms do not run on GitHub Pages** because it cannot execute the Node server. Firebase sign-in remains disabled until a Firebase web app is configured. Confirm the upstream asset rights described in `THIRD_PARTY_NOTICES.md` before making the repository or site public.
