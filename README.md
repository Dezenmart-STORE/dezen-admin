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

A small "Sample data" tag in the menu says the data is not real.

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

## Working faster and safer

- **Claims:** "Take this" on a record tells everyone you are handling it. Their money actions are refused until you let it go, or until they take it over, which is logged.
- **Second approval:** payments above the threshold (₦100,000 by default, set in Fees and fares) wait on the Approvals page. A different person approves them through the same money ritual. Nobody can approve their own request.
- **Keyboard:** press `?` for the shortcuts.
  - `/` searches.
  - `j` and `k` move through rows, and Enter opens one.
  - `g` then a letter jumps to a page.
  - `b` goes back.
  - No shortcut moves money.
- **Phone app:** add it to the home screen from the browser menu.
  - The app shell still opens when you're offline.
  - Money actions are refused while offline, and nothing is queued to send later.
  - "Turn on alerts" in the menu notifies you when an urgent queue grows while the admin is open. Alerts while it is closed need backend push (see the checklist).
- **Accessibility:**
  - Every text colour meets 4.5:1 contrast in both themes.
  - There is a skip link and visible focus, and status is never shown by colour alone.
  - Arrow keys work in filter chips.
  - Reduced motion is respected.

## Design: "Four around one"

The Dezenmart mark is four shapes around one centre; the four services are the shapes and the admin is the centre. The mark is the system: a petal (rounded on three corners) means a person is needed, a circle means settled, a ring means on its way. Home opens on the mark itself, lit per service that needs someone. Every money action is the same ritual (type the amount, reason, code; the button names action, amount and person) and ends in a receipt where the petal closes into a circle. Primitives live in `src/components/brand.tsx`, tokens in `src/index.css`.

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
