import express from "express";
import session from "express-session";
import fetch from "node-fetch";
import sqlite3 from "sqlite3";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config();

const app = express();
const db = new sqlite3.Database("./db.sqlite");

// --- Middlewares ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "defaultsecret",
  resave: false,
  saveUninitialized: false,
}));

// Serwowanie statycznych plików (CSS, JS jeśli dodasz)
app.use(express.static(path.join(process.cwd(), "public")));

// --- DATABASE ---
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT,
    avatar TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player1 TEXT,
    player2 TEXT,
    format TEXT,
    status TEXT,
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

// Root
app.get("/", (req,res)=>{
  res.send("Główna strona serwisu");
});

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

    // Save user to session
    req.session.user = {
      id: userJson.id,
      username: userJson.username,
      avatar: userJson.avatar
    };

    // Save user to DB
    db.run(`INSERT OR REPLACE INTO users (id, username, avatar) VALUES (?, ?, ?)`,
      [userJson.id, userJson.username, userJson.avatar]
    );

    res.redirect("/test");
  } catch(e) {
    console.error(e);
    res.send("Error logging in");
  }
});

// --- TEST PAGE / Panel z zakładkami ---
app.get("/test", (req,res)=>{
  const user = req.session.user || null;
  const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(",") : [];

  const htmlPath = path.join(process.cwd(), "test.html");
  let html = fs.readFileSync(htmlPath, "utf-8");

  // Wstrzykujemy dane użytkownika i adminów do JS w test.html
  html = html.replace("const user = window.USER || null;", `const user = ${JSON.stringify(user)};`);
  html = html.replace("const adminIds = window.ADMIN_IDS || [];", `const adminIds = ${JSON.stringify(adminIds)};`);

  res.send(html);
});

// --- Endpoint dodawania meczu (Admin) ---
app.post("/test/admin/add-match", (req,res)=>{
  const user = req.session.user;
  const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(",") : [];
  if(!user || !adminIds.includes(user.id)) return res.send("Brak dostępu");

  const { player1, player2, format, status } = req.body;
  db.run(`INSERT INTO matches (player1, player2, format, status) VALUES (?, ?, ?, ?)`,
    [player1, player2, format, status || "upcoming"],
    (err)=> {
      if(err) return res.send("Błąd dodawania meczu");
      res.redirect("/test");
    });
});

// --- Endpoint typowania meczu ---
app.post("/test/bet", (req,res)=>{
  const user = req.session.user;
  if(!user) return res.send("Nie jesteś zalogowany");

  const { match_id, bet_value } = req.body;
  db.run(`INSERT OR REPLACE INTO bets (match_id, user_id, bet_value) VALUES (?, ?, ?)`,
    [match_id, user.id, bet_value],
    (err)=>{
      if(err) return res.send("Błąd zapisu typowania");
      res.redirect("/test");
    });
});

// --- Endpoint ranking ---
app.get("/test/ranking", (req,res)=>{
  db.all(`
    SELECT users.username, COUNT(bets.id) as points
    FROM users
    LEFT JOIN bets ON users.id = bets.user_id
    GROUP BY users.id
    ORDER BY points DESC
  `, (err, rows)=>{
    if(err) return res.send("Błąd pobierania rankingu");
    res.json(rows);
  });
});

// --- Start server ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
