# Nstar Ludo

A mobile-first Ludo game built with HTML, CSS and JavaScript. Play pass-and-play offline or invite friends to a private, real-time online room backed by Supabase.

> The [LudoVerse reference](https://github.com/jamalihassan0307/LudoVerse) contains screenshots, an APK and assets but did not include its Flutter source or a license at the inspected commit. This is a new implementation based on those references, not a verified code-for-code port. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the upstream asset-rights caveat.

## Play and run locally

- **Repository:** https://github.com/cybereagle472/Nstar-Ludo
- **GitHub Pages preview:** https://cybereagle472.github.io/Nstar-Ludo/ (available after the Pages workflow succeeds).
- **Supabase project:** [Nstar Ludo dashboard](https://supabase.com/dashboard/project/zrwpystbqoisgjsghjcz) (owner access required).

To run locally, use Node.js 18 or later:

```bash
npm start
```

Open `http://localhost:4173`. The configured Supabase backend is used for online rooms, even when the browser app itself is served statically. Guest pass-and-play works without an account; after the first online visit the service worker caches the app for offline use. Do not open the app as a `file://` URL.

The included `server.js` also retains the original development-only in-memory Node room server. To test that alternative explicitly, open `http://localhost:4173/?backend=local`. It is not the Supabase service and does not share its rooms.

## Features

- 2, 3 or 4 player games; safe squares, captures, exact home, saved sixes, selectable dice, three-six forfeits and finishing ranks.
- A mobile-first game lobby and table, original NStar board artwork and a Classic LudoVerse board option, clearer player/turn states, animated dice and pawns, sound, optional music, vibration, notifications, themes, local game saves and a PWA app shell.
- **Supabase online private rooms:** a host shares a six-character code or link. Guests can play without registering. The Edge Function rolls dice and validates turns and moves using the same game engine as the browser. Rooms and their game state are stored in Postgres; Realtime broadcasts revision notifications and presence, with a polling fallback. A tab can resume its room using its session token.
- **Account profiles and avatar storage:** email/password authentication, a private account profile and a public profile photo (JPEG, PNG or WebP, up to 2 MB). Signed-in users have server-recorded **online** games and wins. Local pass-and-play and guest statistics stay on the current device and are not included in cloud online stats.

Friends, leaderboard and chat remain future features; the language preference is stored but the UI is currently English only. Exact parity with the original cannot be established without its source and backend.

## Supabase setup and important limitations

This copy is configured for the dedicated `Nstar Ludo` project in `ap-south-1`. `supabase-config.js` contains only the **publishable** browser key, which is intentionally public and relies on database and Storage policies. Never add a service-role/secret key, access token, OAuth client secret or database password to the browser app or Git history, even in a private repository. The Edge Function reads its server-only credentials from Supabase's injected environment. Keep local secrets in ignored files and deployment secrets in the relevant provider's secret store; `.gitignore` does not remove secrets that were already committed.

The database migration is in `supabase/migrations/`:

- `nstar_profiles` and `nstar_online_stats` use row-level security so account data is readable only by its owner; online stats are written by a database trigger, not by browser clients.
- `nstar_rooms` and `nstar_rate_limits` are RLS-enabled and have no direct `anon` or `authenticated` access. Only the server function can access room data; participant session tokens are randomly generated and only their hashes are stored.
- The `nstar-avatars` bucket serves photos publicly. Only a signed-in user can upload, update or delete files in their own user-ID folder. Do not upload private photos.
- Each room has an unguessable Realtime topic. Broadcasts contain a revision only; a client must present its room token to fetch the actual state. Room codes are invitations and should be shared only with trusted players. Rooms expire after seven days of inactivity; expired rows and old rate-limit records are cleaned opportunistically when rooms are created, not on a guaranteed schedule.

**Email and Google sign-in need additional owner configuration:**

1. Email confirmation remains enabled. Supabase's built-in test mailer is restricted to the project's authorized team addresses; configure a custom SMTP provider in **Authentication → SMTP Settings** before expecting public sign-ups or password-reset emails to work. Confirm the sender/domain and test actual deliveries.
2. Google sign-in is disabled until a Google OAuth client is configured in Supabase Auth. After configuring it and the callback URL, set `googleEnabled: true` in `supabase-config.js` and redeploy the site.
3. For any additional deployment domain, add the appropriate redirect URL in Supabase Auth settings. The project is configured for this GitHub Pages site and localhost development.

Online rooms are a beta, not a completed production-security review. A basic per-address request limiter is included, but production deployments should add reliable trusted-proxy/WAF limits, CAPTCHA/abuse monitoring, scheduled retention cleanup, backups, appropriate privacy/terms policies, and independent security testing. Supabase free-plan limits and inactivity pausing also apply. A disconnected player keeps their seat; there is no bot replacement or matchmaking.

## Development and deployment

```bash
npm test
```

This runs deterministic rules, local room-server and cloud-client routing tests. The optional browser smoke tests require Playwright and Chromium:

```bash
npm install --no-save playwright@1.55.0
npx playwright install chromium
npm run test:browser
```

The browser test explicitly selects the local Node room backend. The Supabase room, Realtime, auth, profile and storage flows were also exercised against the configured project during setup; those integration tests create real cloud resources and are not part of the default test command.

GitHub Actions runs tests whenever `main` is pushed and deploys the browser-only files to GitHub Pages when the repository is public. The deployment is skipped while the repository is private unless your plan and workflow support private-repository Pages. The local development server serves an allowlist of browser files and does not expose repository metadata, backend source or test files.

The backend function is deployed separately from `supabase/functions/nstar-room/index.ts`. It imports the shared root `engine.js`, so **redeploy the function whenever the engine changes**. For example, bundle it with Deno and deploy the bundle through the Supabase CLI or dashboard:

```bash
deno bundle --minify --output /tmp/nstar-room.js supabase/functions/nstar-room/index.ts
# Deploy the bundled source as the nstar-room Edge Function with JWT verification off.
# The function validates a room session token on each protected action instead.
```

The function intentionally accepts guest requests and must have gateway JWT verification disabled; its own token checks, role restrictions and server-side game validation are essential. Do not expose room tables or remove those checks.

## Project layout

```text
index.html, styles.css, ui-refresh.css  Responsive UI and app shell
app.js, engine.js           Game screens and shared Ludo rules
supabase.js, auth.js        Cloud rooms, Realtime, profiles, storage and auth adapters
supabase-config.js          Public project URL and publishable key only
supabase/migrations/        Database schema and RLS policies
supabase/functions/         Authoritative room Edge Function source
vendor/                     Bundled Supabase browser SDK and license texts
server.js                   Optional in-memory local development room server
sw.js, assets/              Offline cache, game assets, fonts, sound and icons
tests/                      Rule, board alignment, server, client-routing and optional browser tests
tools/generate-board.py       Regenerates the original NStar board SVG
```

The original Nstar Ludo source code in this repository is released under the MIT terms in [LICENSE](LICENSE). Those terms **do not grant rights to upstream third-party assets**; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
