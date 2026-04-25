# CS2 Typer 🎯
### Esports Prediction Platform for CS2

> Predict match outcomes, earn points, compete on the global leaderboard.

---

## 📁 Project Structure

```
cs2-typer/
├── backend/                  # Node.js + Express API
│   ├── db/
│   │   └── supabase.js       # Supabase admin client
│   ├── middleware/
│   │   └── auth.js           # JWT auth + admin guard
│   ├── routes/
│   │   ├── matches.js        # GET /api/matches
│   │   ├── bets.js           # POST/GET /api/bets
│   │   ├── bonus.js          # POST /api/bonus/answer
│   │   ├── ranking.js        # GET /api/ranking
│   │   ├── users.js          # GET/PATCH /api/users/me
│   │   └── admin.js          # Admin-only routes
│   ├── server.js             # Express entry point
│   ├── .env.example
│   └── package.json
│
├── frontend/                 # React + Tailwind SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.jsx        # Navbar + footer wrapper
│   │   │   ├── MatchCard.jsx     # Match preview card
│   │   │   ├── BetForm.jsx       # Prediction form
│   │   │   └── BonusQuestions.jsx
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── MatchesPage.jsx
│   │   │   ├── MatchDetailPage.jsx
│   │   │   ├── RankingPage.jsx
│   │   │   ├── ProfilePage.jsx
│   │   │   └── AdminPage.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx   # Google OAuth + profile state
│   │   ├── lib/
│   │   │   ├── supabase.js       # Supabase browser client
│   │   │   └── api.js            # Authenticated fetch wrapper
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css            # Tailwind + custom tokens
│   ├── .env.example
│   ├── index.html
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── package.json
│
├── supabase_schema.sql        # Full DB schema + RLS
└── README.md
```

---

## 🚀 Setup Guide

### Step 1 — Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and create a free project.
2. Note your **Project URL** and **API keys** from: `Project Settings → API`
   - `SUPABASE_URL` — Project URL
   - `SUPABASE_ANON_KEY` — `anon` public key (frontend)
   - `SUPABASE_SERVICE_ROLE_KEY` — `service_role` secret key (backend only, never expose)

### Step 2 — Run the Database Schema

1. Open Supabase Dashboard → **SQL Editor**
2. Paste the contents of `supabase_schema.sql`
3. Click **Run**

This creates all tables, indexes, RLS policies, and the `increment_user_points` function.

### Step 3 — Enable Google OAuth

1. Supabase Dashboard → **Authentication → Providers → Google**
2. Enable Google and note the **Callback URL** shown (e.g. `https://xxx.supabase.co/auth/v1/callback`)
3. Go to [Google Cloud Console](https://console.cloud.google.com):
   - Create a project (or use existing)
   - Enable **Google Identity API**
   - Go to **Credentials → Create OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: paste the Supabase callback URL
4. Copy the **Client ID** and **Client Secret** back to Supabase Google provider settings
5. Add your frontend URL (`http://localhost:5173`) to **Site URL** under Supabase Auth settings

### Step 4 — Backend Setup

```bash
cd backend
cp .env.example .env
```

Edit `.env`:
```env
PORT=4000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_EMAILS=you@gmail.com
FRONTEND_URL=http://localhost:5173
```

Install and run:
```bash
npm install
npm run dev
```

### Step 5 — Frontend Setup

```bash
cd frontend
cp .env.example .env
```

Edit `.env`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:4000
VITE_ADMIN_EMAILS=you@gmail.com
```

Install and run:
```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## 🔑 Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `PORT` | Express server port (default: 4000) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS — keep secret!) |
| `ADMIN_EMAILS` | Comma-separated admin email addresses |
| `FRONTEND_URL` | Frontend origin for CORS |

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon/public key |
| `VITE_API_URL` | Backend API URL |
| `VITE_ADMIN_EMAILS` | Comma-separated admin emails (for nav visibility) |

---

## 📡 API Endpoints

### Public
| Method | Path | Description |
|---|---|---|
| GET | `/api/matches` | List all matches |
| GET | `/api/matches/:id` | Single match with bonus questions |
| GET | `/api/ranking` | Global leaderboard |

### Authenticated
| Method | Path | Description |
|---|---|---|
| GET | `/api/users/me` | Own profile |
| PATCH | `/api/users/me` | Update username |
| GET | `/api/bets/my` | My bet history |
| POST | `/api/bets` | Place/update a bet |
| GET | `/api/bets/match/:id` | My bet for a specific match |
| GET | `/api/bonus/my` | My bonus answers |
| POST | `/api/bonus/answer` | Submit a bonus answer |

### Admin only (email must be in `ADMIN_EMAILS`)
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/matches` | List all matches |
| POST | `/api/admin/matches` | Create a match |
| PATCH | `/api/admin/matches/:id` | Update result/score/status |
| POST | `/api/admin/matches/:id/settle` | Settle match & award points |
| POST | `/api/admin/bonus` | Add bonus question |
| GET | `/api/admin/stats` | Platform stats |

---

## 🏆 Scoring System

| Event | Points |
|---|---|
| Correct winner prediction | **+1** |
| Exact score prediction | **+3** (replaces winner point) |
| Correct bonus answer | **+2** |

### Tie-breaking
1. More exact score predictions → ranks higher
2. If still tied → earlier correct prediction wins

---

## 🔒 Security Notes

- The **service role key** bypasses RLS — never expose it to the frontend or commit it to git.
- The backend validates betting windows server-side (`start_time` check).
- Admin routes are protected by email allowlist — change `ADMIN_EMAILS` to your address.
- Settlement is **idempotent**: the `settled` flag on matches prevents double-scoring.
- Rate limiting: 200 requests per 15 minutes per IP.
- Input validation on all POST/PATCH endpoints.

---

## 🚢 Deployment

### Backend (e.g. Railway, Render, Fly.io)
1. Deploy the `backend/` folder
2. Set all env vars in the platform dashboard
3. Update `FRONTEND_URL` to your production frontend URL

### Frontend (e.g. Vercel, Netlify)
1. Deploy the `frontend/` folder
2. Set `VITE_*` environment variables
3. Update Supabase **Site URL** to your production domain
4. Add production URL to Google OAuth authorized origins

---

## 🛠 Development Tips

- Use `npm run dev` in both `backend/` and `frontend/` simultaneously
- The Vite dev server proxies `/api/*` to `localhost:4000` automatically
- To test admin features, add your Google account's email to `ADMIN_EMAILS`
- To create test matches quickly, use the Admin panel or the Supabase table editor
