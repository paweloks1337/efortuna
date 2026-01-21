import express from "express";
import session from "express-session";
import fetch from "node-fetch";
import sqlite3 from "sqlite3";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const db = new sqlite3.Database("./db.sqlite");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

// --- DB ---
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT, avatar TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS matches (id INTEGER PRIMARY KEY AUTOINCREMENT, player1 TEXT, player2 TEXT, format TEXT, status TEXT, result TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS bets (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id INTEGER, user_id TEXT, bet_value TEXT, UNIQUE(match_id, user_id))`);
});

// --- OAuth ---
app.get("/test/login", (req, res) => {
  const url = `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&response_type=code&scope=identify&redirect_uri=${process.env.REDIRECT_URI}`;
  res.redirect(url);
});

app.get("/test/callback", async (req, res) => {
  const code = req.query.code;
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.REDIRECT_URI,
    }),
  });
  const token = await tokenRes.json();
  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const user = await userRes.json();
  db.run(`INSERT OR IGNORE INTO users VALUES (?,?,?)`, [user.id, user.username, user.avatar]);
  req.session.user = user;
  res.redirect("/test");
});

// --- Helpers ---
const requireLogin = (req,res,next) => { if(!req.session.user) return res.status(401).send("Zaloguj się"); next(); }
const requireAdmin = (req,res,next) => { if(!process.env.ADMIN_IDS.split(",").includes(req.session.user.id)) return res.status(403).send("Brak dostępu"); next(); }

// --- API ---
app.get("/test/api/matches", (req,res) => db.all(`SELECT * FROM matches`, (err,rows)=>res.json(rows)));
app.post("/test/api/matches", requireLogin, requireAdmin, (req,res)=>{
  const {player1,player2,format} = req.body;
  db.run(`INSERT INTO matches (player1,player2,format,status) VALUES (?,?,?, 'open')`, [player1,player2,format], ()=>res.send("OK"));
});
app.post("/test/api/bet", requireLogin, (req,res)=>{
  const {match_id, bet_value} = req.body;
  db.run(`INSERT OR REPLACE INTO bets (match_id,user_id,bet_value) VALUES (?,?,?)`, [match_id, req.session.user.id, bet_value], err=>{
    if(err) return res.status(400).send("Błąd"); res.send("Zapisano");
  });
});

// --- Frontend ---
app.get("/test", (req,res)=>{
  res.send(`
<html>
<body>
${req.session.user ? `<p>Zalogowany jako ${req.session.user.username}</p>` : `<a href="/test/login">Login Discord</a>`}
<div id="matches"></div>
<script>
fetch('/test/api/matches').then(r=>r.json()).then(matches=>{
  const div = document.getElementById('matches');
  matches.forEach((m,i)=>{
    div.innerHTML += \`
      <div>
        <b>\${m.player1} vs \${m.player2}</b>
        <select onchange="bet(\${i}, this.value)">
          <option value="">--typ--</option>
          \${m.format==='BO3'?'<option>2-0</option><option>2-1</option>':'<option>3-0</option><option>3-1</option><option>3-2</option>'}
          <option>TAK</option><option>NIE</option>
        </select>
      </div>
    \`;
  });
});
function bet(id,val){
  fetch('/test/api/bet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({match_id:id, bet_value:val})});
}
</script>
</body>
</html>
`);
});

app.listen(3000,()=>console.log("Server running on port 3000"));
