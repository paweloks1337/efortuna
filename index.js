import express from "express";
import session from "express-session";
import fetch from "node-fetch";
import sqlite3 from "sqlite3";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const db = new sqlite3.Database("./db.sqlite");

/* ================= MIDDLEWARE ================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, "public")));

/* ================= HELPERS ================= */
function isAdmin(req) {
  return (
    req.session.user &&
    process.env.ADMIN_IDS.split(",").includes(req.session.user.id)
  );
}

/* ================= DATABASE ================= */
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT,
    avatar TEXT,
    points INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player1 TEXT,
    player2 TEXT,
    format TEXT,
    start_time INTEGER,
    status TEXT DEFAULT 'upcoming',
    result TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER,
    user_id TEXT,
    bet_value TEXT,
    UNIQUE(match_id, user_id)
  )`);
});

/* ================= ROUTES ================= */

// Root
app.get("/", (req, res) => res.redirect("/test"));

// ================= DISCORD LOGIN =================
app.get("/test/login", (req, res) => {
  const redirectUri = encodeURIComponent(process.env.REDIRECT_URI);
  res.redirect(
    `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=identify`
  );
});

app.get("/test/callback", async (req, res) => {
  if (!req.query.code) return res.send("No code");

  const data = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    grant_type: "authorization_code",
    code: req.query.code,
    redirect_uri: process.env.REDIRECT_URI
  });

  const token = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: data
  }).then(r => r.json());

  const user = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` }
  }).then(r => r.json());

  req.session.user = {
    id: user.id,
    username: user.username,
    avatar: user.avatar
  };

  db.run(
    `INSERT OR IGNORE INTO users (id, username, avatar) VALUES (?, ?, ?)`,
    [user.id, user.username, user.avatar]
  );

  res.redirect("/test");
});

// ================= LOGOUT =================
app.post("/test/logout", (req, res) => {
  req.session.destroy(() => res.sendStatus(200));
});

// ================= FRONT =================
app.get("/test", (req, res) => {
  res.sendFile(path.join(__dirname, "public/test.html"));
});

// ================= API =================

// ---- MATCHES (with lock + timer)
app.get("/test/matches", (req, res) => {
  const now = Date.now();

  db.all(
    `SELECT *,
     CASE WHEN start_time <= ? THEN 1 ELSE 0 END AS locked
     FROM matches
     WHERE status='upcoming'`,
    [now],
    (err, rows) => res.json(rows || [])
  );
});

// ---- USER HISTORY (ALL ROUNDS)
app.get("/test/history", (req, res) => {
  if (!req.session.user) return res.json([]);

  db.all(
    `SELECT m.id, m.player1, m.player2, m.result, b.bet_value
     FROM bets b
     JOIN matches m ON b.match_id = m.id
     WHERE b.user_id = ?
     ORDER BY m.start_time DESC`,
    [req.session.user.id],
    (err, rows) => res.json(rows || [])
  );
});

// ---- RANKING
app.get("/test/ranking", (req, res) => {
  db.all(
    `SELECT username, points FROM users ORDER BY points DESC`,
    (err, rows) => res.json(rows || [])
  );
});

// ---- SUBMIT BET
app.post("/test/bet", (req, res) => {
  if (!req.session.user) return res.sendStatus(401);

  db.run(
    `INSERT OR REPLACE INTO bets (match_id, user_id, bet_value)
     VALUES (?, ?, ?)`,
    [req.body.match_id, req.session.user.id, req.body.bet_value],
    err => err ? res.sendStatus(500) : res.sendStatus(200)
  );
});

/* ================= ADMIN ================= */

// ---- ADD MATCH
app.post("/test/admin/add-match", (req, res) => {
  if (!isAdmin(req)) return res.sendStatus(403);

  const { player1, player2, format, start_time } = req.body;

  db.run(
    `INSERT INTO matches (player1, player2, format, start_time)
     VALUES (?, ?, ?, ?)`,
    [player1, player2, format, start_time],
    err => err ? res.sendStatus(500) : res.sendStatus(200)
  );
});

// ---- EDIT MATCH
app.post("/test/admin/edit-match", (req, res) => {
  if (!isAdmin(req)) return res.sendStatus(403);

  const { id, player1, player2, format, start_time } = req.body;

  db.run(
    `UPDATE matches
     SET player1=?, player2=?, format=?, start_time=?
     WHERE id=?`,
    [player1, player2, format, start_time, id],
    err => err ? res.sendStatus(500) : res.sendStatus(200)
  );
});

// ---- SET RESULT (ADD POINTS)
app.post("/test/admin/set-result", (req, res) => {
  if (!isAdmin(req)) return res.sendStatus(403);

  const { match_id, result } = req.body;

  db.serialize(() => {
    db.run(
      `UPDATE matches SET result=?, status='finished' WHERE id=?`,
      [result, match_id]
    );

    db.all(
      `SELECT user_id FROM bets WHERE match_id=? AND bet_value=?`,
      [match_id, result],
      (err, rows) => {
        rows.forEach(r => {
          db.run(
            `UPDATE users SET points = points + 1 WHERE id=?`,
            [r.user_id]
          );
        });
        res.sendStatus(200);
      }
    );
  });
});

// ---- UNDO RESULT (ROLLBACK POINTS)
app.post("/test/admin/undo-result", (req, res) => {
  if (!isAdmin(req)) return res.sendStatus(403);

  const { match_id } = req.body;

  db.serialize(() => {
    db.get(
      `SELECT result FROM matches WHERE id=?`,
      [match_id],
      (err, match) => {
        if (!match || !match.result) return res.sendStatus(400);

        db.all(
          `SELECT user_id FROM bets WHERE match_id=? AND bet_value=?`,
          [match_id, match.result],
          (err, rows) => {
            rows.forEach(r => {
              db.run(
                `UPDATE users SET points = points - 1 WHERE id=?`,
                [r.user_id]
              );
            });

            db.run(
              `UPDATE matches SET result=NULL, status='upcoming' WHERE id=?`,
              [match_id],
              () => res.sendStatus(200)
            );
          }
        );
      }
    );
  });
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
