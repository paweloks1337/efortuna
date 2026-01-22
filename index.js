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

// --- Middlewares ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "defaultsecret",
  resave: false,
  saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, "public")));

// --- DATABASE ---
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

// --- ROUTES ---

// Root redirect
app.get("/", (req,res)=>res.redirect("/test"));

// Login Discord
app.get("/test/login", (req,res)=>{
  const clientId = process.env.CLIENT_ID;
  const redirectUri = encodeURIComponent(process.env.REDIRECT_URI);
  const scope = encodeURIComponent("identify");
  res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`);
});

// Discord callback
app.get("/test/callback", async (req,res)=>{
  const code = req.query.code;
  if(!code) return res.send("No code provided");

  const data = new URLSearchParams();
  data.append("client_id", process.env.CLIENT_ID);
  data.append("client_secret", process.env.CLIENT_SECRET);
  data.append("grant_type", "authorization_code");
  data.append("code", code);
  data.append("redirect_uri", process.env.REDIRECT_URI);
  data.append("scope", "identify");

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      body: data,
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    const tokenJson = await tokenRes.json();

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` }
    });
    const userJson = await userRes.json();

    req.session.user = {
      id: userJson.id,
      username: userJson.username,
      avatar: userJson.avatar
    };

    db.run(`INSERT OR REPLACE INTO users (id, username, avatar) VALUES (?, ?, ?)`,
      [userJson.id, userJson.username, userJson.avatar]
    );

    res.redirect("/test");
  } catch(e){
    console.error(e);
    res.send("Error logging in");
  }
});

// Wylogowanie
app.post("/test/logout", (req,res)=>{
  req.session.destroy(err=>{
    if(err) return res.send("Błąd wylogowania");
    res.clearCookie("connect.sid");
    res.sendStatus(200);
  });
});

// Frontend test.html
app.get("/test", (req,res)=>{
  res.sendFile(path.join(__dirname,"public","test.html"));
});

// --- API dla frontendu ---

// Pobierz mecze
app.get("/test/matches", (req,res)=>{
  db.all(`SELECT * FROM matches WHERE status='upcoming'`, (err, rows)=>{
    if(err) return res.json([]);
    res.json(rows);
  });
});

// Historia użytkownika
app.get("/test/history", (req,res)=>{
  const user = req.session.user;
  if(!user) return res.json([]);
  db.all(`
    SELECT m.player1 || ' vs ' || m.player2 as match, b.bet_value, m.result
    FROM bets b
    JOIN matches m ON b.match_id = m.id
    WHERE b.user_id=?
  `, [user.id], (err, rows)=>{
    if(err) return res.json([]);
    res.json(rows);
  });
});

// Ranking
app.get("/test/ranking", (req,res)=>{
  db.all(`SELECT username, points FROM users ORDER BY points DESC`, (err, rows)=>{
    if(err) return res.json([]);
    res.json(rows);
  });
});

// Typowanie
app.post("/test/bet", (req,res)=>{
  const user = req.session.user;
  if(!user) return res.send("Not logged in");

  const { match_id, bet_value } = req.body;
  db.run(`INSERT OR REPLACE INTO bets (match_id, user_id, bet_value) VALUES (?, ?, ?)`,
    [match_id, user.id, bet_value],
    (err)=>{
      if(err) return res.send("Error saving bet");
      res.sendStatus(200);
    });
});

// Admin dodawanie meczu
app.post("/test/admin/add-match", (req,res)=>{
  const user = req.session.user;
  if(!user || !process.env.ADMIN_IDS.split(",").includes(user.id)) return res.sendStatus(403);

  const { player1, player2, format } = req.body;
  db.run(`INSERT INTO matches (player1, player2, format) VALUES (?, ?, ?)`,
    [player1, player2, format],
    (err)=> err ? res.send("Error") : res.sendStatus(200)
  );
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
