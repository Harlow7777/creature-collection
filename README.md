# Monstrum

A browser-based creature collection game. Roll for creatures, build your collection, battle opponents, evolve your roster, and customise your profile.

---

## Features

- **Roll system** — weighted random pulls (60/25/12/3 for common → legendary) with modifier support
- **Collection & showcase** — collect creatures, pin your top 3 to a public showcase slot
- **Crush mechanic** — sacrifice duplicate creatures to send XP to a chosen creature, or convert to gold
- **Turn-based battle** — fight randomly generated opponents, with crit hits and floating damage numbers
- **Pets - Unfinished** — small companions that attach to a creature and provide passive stat bonuses
- **Shop - Unfinished** — spend gold and gems on roll modifiers, type lenses, pets, and exclusive profile pics
- **Profile pics** — unlock avatars through achievements, creature captures, battle badges, or the shop
- **Dev tools tab** — in-browser controls for adjusting currency, rolls, stats, and collection during testing

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (ES Modules), HTML, CSS |
| Build tool | [Vite](https://vite.dev) |
| Backend / Auth | [Supabase](https://supabase.com) (Postgres + Row Level Security) |
| Hosting | GitHub Pages |

---

## Project Structure

```
creature-collection/
├── index.html                  # Landing / login page
├── app.html                    # Main app shell (auth-protected)
├── .env.example                # Environment variable template
│
├── js/
│   ├── auth.js                 # Supabase auth helpers (signIn, signUp, requireAuth)
│   ├── supabase.js             # Supabase client init via env vars
│   ├── pages/
│   │   ├── app.js              # Root module — state, bootstrap, all page wiring
│   │   ├── collection.js       # renderCollection, renderShowcase, statBox
│   │   ├── roll.js             # Roll page logic, weighted pulls, keep/crush handlers
│   │   ├── battle.js           # Battle engine — fighter select, attack, end-battle flow
│   │   └── devtools.js         # Dev tools page render and apply handlers
│   └── utils/
│       ├── api.js              # Supabase query helpers (getUserCreatures, persistCrush, etc.)
│       └── rarity.js           # rarityColor() utility
│
├── styles/
│   ├── app.css                 # Root CSS import file
│   ├── core/
│   │   ├── variables.css       # CSS custom properties (colours, spacing, nav width)
│   │   └── reset.css           # Box-sizing reset and base body styles
│   ├── layout/
│   │   └── app-layout.css      # .app grid, .main flex column, scrollable .pages
│   ├── sidebar/
│   │   └── sidebar.css         # Sidebar nav, user strip, currency badges
│   ├── components/
│   │   ├── buttons.css         # Button variants
│   │   ├── cards.css           # Shared card styles
│   │   ├── modal.css           # Modal overlay and panel
│   │   └── toast.css           # Toast notification
│   ├── pages/
│   │   ├── collection.css      # Collection grid, showcase slots
│   │   ├── roll.css            # Roll portal, result card
│   │   ├── battle.css          # Arena layout, fighter panels, fighter-select grid, damage floats
│   │   ├── shop.css            # Shop grid and cards
│   │   ├── profile.css         # Profile card, avatar wrap, avatar picker modal
│   │   ├── areas.css           # Areas page (placeholder)
│   │   └── devtools.css        # Dev tools page
│   └── utilities/
│       └── helpers.css         # Gold popup, XP popup, crush target picker
│
├── assets/
│   └── creatures/              # Creature sprite images (.png)
│
└── data/
    └── schema_and_seed.sql     # Full Supabase schema + seed data (run once)
```

---

## Local Development

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project with the schema applied (see below)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/Harlow7777/creature-collection.git
cd creature-collection

# 2. Install dependencies
npm install

# 3. Copy the env template and fill in your Supabase credentials
cp .env.example .env
```

Open `.env` and set your values:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

```bash
# 4. Start the dev server
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## Database Setup

Run `data/schema_and_seed.sql` in your Supabase dashboard under **SQL Editor → New Query**.

This single file:
- Creates all tables (`profiles`, `creatures`, `user_creatures`, `pets`, `modifiers`, `appearance_items`, and junction tables)
- Enables Row Level Security with per-user policies
- Seeds 32 base creatures across all four rarities, 8 evolved forms, 8 pets, 7 roll modifiers, and 6 appearance items
- Adds a trigger that auto-creates a `profiles` row on user signup

After running the seed, verify in **Table Editor** that the `creatures` table has rows before testing rolls.

> **Tip:** During development, go to **Authentication → Settings** and disable **Confirm email** so you can sign up and log in without checking your inbox. Re-enable it before going live.

## Planned Features

- **Area farming** — assign creatures to zones that passively generate gold, items, and XP over time
- **Daily roll reset** — server-side reset of `rolls_today`
- **Shop transactions** — wire buy buttons to deduct currency and write to `user_modifiers` / `user_pets`
- **Pet assignment UI** — assign owned pets to creatures directly from the collection modal