# Dezen Admin

The staff website for Shopping, DezenFoods and DezenExpress.

The UI is complete and runs on **built-in sample data** until the backend endpoints exist. Everything the backend must build is in [docs/BACKEND_CHECKLIST.md](docs/BACKEND_CHECKLIST.md).

## Run it

```bash
npm install
npm run dev   # http://localhost:5173
```

With sample data (the default):
- There is no Google step. On the sign-in page, choose a role under **Preview as** to see what that person sees.
- Any 6-digit code works, and `000000` shows the wrong-code message.
- Changes last until the page is reloaded.

A yellow bar on every page says the data is not real.

## Connect the real backend

When the backend checklist is done:

```bash
VITE_API_URL=https://<backend>/api/v1
VITE_USE_SAMPLE_DATA=false
```

Production builds must set `VITE_USE_SAMPLE_DATA=false`.

## Pages

| Area | Pages |
| --- | --- |
| Home | What is waiting, money first; search across everything |
| DezenFoods | Orders (with full history), disputes, vendors |
| DezenExpress | Trips (with refunds), rider withdrawals, riders (with wallet corrections), delivery companies |
| Shopping | Orders, disputes (rulings wait for an owner), products (hide, show, sponsor), sellers |
| Money | Payments, payment notices from the payment companies, daily balance check |
| Dezenmart | People (masked, with a logged “show full details”), fees and fares, staff, activity log |

**Access:**
- Each person sees only what their access covers. The backend is what enforces it.
- Refunds, payouts, rulings, wallet corrections, fee changes and staff changes ask for a fresh authenticator code.
- Refunds and hand payments also ask the operator to type the amount.

## How it is built

- **Stack:** React 19, Vite, TypeScript, Redux Toolkit Query, React Router and Tailwind CSS 4.
- **The API contract:**
  - `src/store/types.ts` defines every shape the backend returns.
  - `src/store/api.ts` defines every call.
- **Sample backend:** `src/mocks/` answers those calls in the browser, applying the same permission, code and activity-log rules the real backend must.
- **Shared pieces:**
  - Colours are in the `@theme` block in `src/index.css`.
  - Components are in `src/components`.

## Deploy

Netlify, from `netlify.toml`. The site sends `noindex` and refuses to be framed.
