# Dezen Admin

The staff website for Shopping, DezenFoods and DezenExpress. It talks only to the backend's `/api/v1/admin/*` routes (see `docs/ADMIN_API.md` in `dezenmart-backend`). The backend enforces every permission; this site only hides what a person can't use.

## Run it

```bash
npm install
cp .env.example .env   # set VITE_API_URL to the backend, including /api/v1
npm run dev            # http://localhost:5173
```

Port 5173 is on the backend's allowed list for Google sign-in in development. In production, set `DEZEN_ADMIN_FRONTEND_URL` on the backend to this site's address (for example `https://admin.dezenmart.com`).

## Signing in

1. Continue with Google (the same Dezenmart account; it must have staff access).
2. The first time, scan the QR code with an authenticator app and enter its code. Then enter the next code to sign in.
3. Sessions last 8 hours and are kept for the browser tab only.

The first owner is created on the backend with `scripts/grant-staff.ts`; after that, owners give access from the Staff page.

## What's here

| Page | Needs | What it does |
| --- | --- | --- |
| Home | any | Counts of what is waiting: vendors and riders to review, open disputes, failed payments |
| DezenFoods | support on food | Vendors (approve, reject, suspend), orders (retry a failed payment), disputes (refund buyer or pay vendor) |
| DezenExpress | support on express | Riders waiting for review; approve or reject |
| Users | full personal details on platform | Customer records; every view is logged |
| Staff | manage staff | Give, change and remove access; reset a lost authenticator |
| Activity log | manage staff | Every change, refused attempt and personal-details view |

Refunds, payouts, dispute rulings and staff changes ask for a fresh authenticator code. A refund ruling also asks the operator to type the amount.

## Stack

React 19, Vite, TypeScript, Redux Toolkit Query, React Router, Tailwind CSS 4. Shared colours live in the `@theme` block in `src/index.css`; shared pieces are in `src/components`.

## Deploy

Netlify, from `netlify.toml`: `npm run build`, publish `dist`. The site sends `noindex` and refuses to be framed.
