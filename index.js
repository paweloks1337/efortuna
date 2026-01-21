// index.js
import express from "express";
import session from "express-session";
import fetch from "node-fetch";
import sqlite3 from "sqlite3";
import dotenv from "dotenv";

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

// Optional redirect root (usuń jeśli root zajęty)
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
  if(!code) return res.send("No code provided"); // pojawia się, jeśli login nie przesłał code

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

// Main test page
app.get("/test", (req,res)=>{
  const user = req.session.user;
  let html = `<h1>Discord Typing Test</h1>`;
  if(user){
    html += `<p>Logged in as <strong>${user.username}</strong> <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" width="50"/></p>`;
    
    const isAdmin = process.env.ADMIN_IDS?.split(",").includes(user.id);
    if(isAdmin){
      html += `<p>You are admin!</p>`;
    }

    html += `
      <form method="POST" action="/test/bet">
        <input type="text" name="match_id" placeholder="Match ID" required />
        <input type="text" name="bet_value" placeholder="Bet (3-1, TAK/NIE, etc)" required />
        <button type="submit">Submit Bet</button>
      </form>
    `;
  } else {
    html += `<a href="/test/login">Login with Discord</a>`;
  }
  res.send(html);
});

// Submit bet
app.post("/test/bet", (req,res)=>{
  const user = req.session.user;
  if(!user) return res.send("Not logged in");

  const { match_id, bet_value } = req.body;
  db.run(`INSERT OR REPLACE INTO bets (match_id, user_id, bet_value) VALUES (?, ?, ?)`,
    [match_id, user.id, bet_value],
    (err)=>{
      if(err) return res.send("Error saving bet");
      res.redirect("/test");
    }
  );
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
