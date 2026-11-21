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

The backend developer starts with [docs/HANDOVER.md](docs/HANDOVER.md): the order of work, how to go live one area at a time, and when an area is done.

**One area at a time,** while the rest stays on sample data:

```bash
VITE_API_URL=https://<backend>/api/v1
VITE_LIVE_AREAS=approvals,claims,food
```

**Contract tests** check every endpoint returns what the screens expect. By default they run on the sample backend; point them at the real one to check it (read-only):

```bash
npm run test:contract
```

```bash
CONTRACT_API_URL=https://<backend>/api/v1 CONTRACT_TOKEN=<staff session token> npm run test:contract
```

**Everything live,** when the backend checklist is done:

```bash
VITE_API_URL=https://<backend>/api/v1
VITE_USE_SAMPLE_DATA=false
```

Production builds must set `VITE_USE_SAMPLE_DATA=false`.

## Pages

| Area | Pages |
| --- | --- |
| Home | Your shift: the one person to help next ("Take it"), the rest grouped by approve, pay, rule and review, the living mark (each shape grows with what its service owes; a red halo means someone is past our promise), and who was settled today |
| DezenFoods | Orders (with full history), disputes (split rulings), vendors (each a case with photos and checks) |
| DezenExpress | Trips (with refunds), rider withdrawals (grouped by what unsticks each one), riders and delivery companies (cases with photos and checks), wallet corrections |
| Shopping | Orders, disputes (rulings wait for an owner), products (open on Reported, with buyers' words; To review lists listings nobody has looked over; each listing opens for a closer look with five checks, then is kept, hidden until fixed, or removed for good with a notice to the seller. Every way back on sale goes through the checks; a seller's edit or fix sends it back to To review; removing a scam holds its paid orders as disputes for refunds; each decision keeps the listing as it was judged), sellers. Amounts in naira, coin amount as small print |
| Money | Payments, payment notices (problems first), daily balance check (gap first, a streak of matching days) |
| Dezenmart | People (where they stand first; masked details with a logged “show full details”), fees and fares (with a live preview), staff (owners protected), activity log (names, every action) |

**Every queue opens like Home:** a sentence about people and our promise ("2 riders have waited past our 2‑day promise to start earning"), the one person to take next, then the list, oldest first, with how long each has waited and who has it. The whole row opens the record.

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
  - Dark only, like the other Dezenmart sites, whatever the device is set to.
  - Every text colour meets 4.5:1 contrast.
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
