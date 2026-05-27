# Hoodz-Customs

Landing page for Hoodz Customs with a real AI mechanic chat backend.

## Run locally

1. Export your OpenAI API key in the shell:
	`export OPENAI_API_KEY=your_key_here`
2. Optional: choose a model:
	`export OPENAI_MODEL=gpt-4.1-mini`
3. Start the site and API together:
	`npm start`
4. Open `http://localhost:4173`

The chat frontend posts to `/api/chat`, and the Node server serves both the static files and the backend API.

## Backend behavior

- Conversation memory is stored in SQLite at `data/chat.sqlite` per session ID and expires after 30 minutes by default.
- Rate limiting is enabled for `/api/chat` with a default window of 8 requests per 60 seconds per session/IP pair.
- Request logs are written as JSON lines to `logs/requests.log` and rotated by size.
- `GET /api/admin/health` reports database, logging, rate-limit, and optional session health. By default it is restricted to localhost unless `ADMIN_API_TOKEN` is set.
- Owner login and dashboard are available at `/owner-login.html` and `/owner-dashboard.html`.
- Owner credentials are validated through `/api/admin/login`, and auth is stored in an HttpOnly cookie.
- Owner dashboard data is served by `/api/admin/dashboard`, including email links and ARI portal launch URL.

Optional environment variables:

- `CHAT_SESSION_TTL_MS`
- `CHAT_SESSION_MESSAGES`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX_REQUESTS`
- `LOG_MAX_BYTES`
- `LOG_MAX_FILES`
- `ADMIN_API_TOKEN`
- `OWNER_USERNAME`
- `OWNER_PASSWORD`
- `OWNER_EMAIL_URL`
- `OWNER_ARI_URL`
- `OWNER_SESSION_TTL_MS`
