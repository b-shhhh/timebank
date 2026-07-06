# TimeBank — Community Skill-Exchange Platform

A time-bank / skill-exchange web app: members trade hours of help (tutoring,
repairs, design, whatever they're good at) using time-credits instead of
money. One hour given equals one hour earned, regardless of skill — the
whole point is access, not market pricing.

Built as a secure-by-design coursework reference implementation:
Node.js/Express + Prisma backend, React (Vite) frontend.

## Quick start

### Backend
```bash
cd backend
npm install
cp .env.example .env
# generate secrets and paste them into .env:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"   # JWT_ACCESS_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"   # JWT_REFRESH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # MFA_ENCRYPTION_KEY

npx prisma migrate dev --name init
node prisma/seed.js     # creates demo admin/mediator/member accounts (see console output)
npm run dev              # http://localhost:4000
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env     # defaults to http://localhost:4000/api
npm run dev               # http://localhost:5173
```

### Tests
```bash
cd backend
npm test
```

## Why this idea (Section 1: overview)

Traditional bartering doesn't scale past a small trusted circle, and cash
payment excludes people who have time and skill but not money. TimeBank lets
a community trade help directly: an hour of Spanish tutoring is worth the
same as an hour of bike repair. It needs real security engineering — user
accounts, a live "currency," a way to resolve disagreements — while staying
small enough to build and pentest properly in a coursework timeframe.

## Where each rubric requirement lives (Sections 2–3)

| Requirement | Implementation |
|---|---|
| Registration/login | `backend/src/controllers/auth.controller.js`, `routes/auth.routes.js` |
| MFA (TOTP + backup codes) | `utils/totp.js`, `controllers/mfa.controller.js` |
| Brute-force protection | `middleware/rateLimiter.js` (IP throttling), account lockout in `auth.controller.js`, CAPTCHA stub in `utils/captcha.js` |
| Password policy | `utils/password.js` — length/complexity/reuse/expiry/strength feedback |
| RBAC | `middleware/auth.js` (`requireRole`, `requireOwnershipOrRole`), roles: MEMBER / MEDIATOR / ADMIN |
| Session management | `utils/jwt.js` + `Session` model — short-lived JWT access token, rotating opaque refresh token in httpOnly/secure/SameSite cookie, server-side revocation |
| IDOR / mass-assignment defence | `controllers/profile.controller.js` (explicit field allow-list), `requireOwnershipOrRole` on booking routes |
| Transaction integrity | `controllers/transaction.controller.js` `completeBooking` — Prisma `$transaction`, in-transaction balance re-check (TOCTOU-safe), append-only `LedgerEntry` |
| Dispute resolution / rollback | `controllers/dispute.controller.js` — atomic credit reversal |
| Activity logging | `utils/logger.js` (`recordActivity`), `ActivityLog` model, secret redaction |
| Data export (privacy) | `GET /api/profiles/me/export` |
| Encryption at rest | `utils/crypto.js` — AES-256-GCM for MFA secrets; bcrypt for passwords/backup codes |
| Security headers / CORS / HPP | `src/index.js` |

## What's a stub vs. production-ready

This is a coursework reference implementation, not a production deployment.
Two things are intentionally stubbed so it runs without external accounts:

- **CAPTCHA** (`utils/captcha.js`): accepts a fixed dev token; wire to
  hCaptcha/Turnstile/reCAPTCHA `siteverify` for production.
- **Email verification / password reset**: registration returns a success
  message but doesn't send real email; add an SMTP provider (e.g. SES,
  Postmark) and a signed, single-use, time-limited token for production.

Everything else (hashing, MFA, RBAC, session handling, transaction
integrity, logging) is real, working logic, not a mock.

## Suggested pentest angles (Section 4/5 of the report)

The codebase is written defensively, but a good internal pentest should
still try (and document before/after fixes for at least two):

- IDOR: can a MEMBER fetch/modify another user's booking or profile by
  guessing/iterating IDs?
- Mass assignment: does `PATCH /api/profiles/me` ignore unexpected fields
  like `role` or `timeCredits`, or does a bypass exist?
- Privilege escalation: can a MEMBER hit `/api/disputes` or `/api/admin/*`
  directly with a valid-but-wrong-role token?
- Race condition: two concurrent `POST /api/bookings/:id/complete` calls
  against the same low-balance account — does the in-transaction re-check
  actually prevent double-spend?
- Session fixation/replay: does refresh token rotation actually invalidate
  the old token, or can it be replayed?
- Rate limiting bypass: can lockout be sidestepped by varying IP/headers?

## Production hardening notes

Switch `datasource.provider` in `prisma/schema.prisma` from `sqlite` to
`postgresql` and set a real `DATABASE_URL`; put the app behind HTTPS/TLS
so `secure` cookies and HSTS take effect; move the CAPTCHA and email stubs
to real providers; consider a WAF/managed rate-limiter in front of the
rate limits already in the app.
