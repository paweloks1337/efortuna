const { google } = require("googleapis");

// Nazwa zakładki (tab) w arkuszu, na której trzymamy wszystkie kupony.
// Kolumny: A=ID | B=DiscordID | C=Nick | D=Link | E=PunktyZadeklarowane
//          F=PunktyKoncowe | G=Status | H=Powod | I=Data
const SHEET_TAB = "Kupony";
const RANGE_ALL = `${SHEET_TAB}!A2:I`;

let sheetsClient = null;

async function getClient() {
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

/**
 * Upewnia się, że zakładka "Kupony" istnieje i ma nagłówki.
 * Wywołaj raz przy starcie bota.
 */
async function ensureSheetReady() {
  const sheets = await getClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets.some((s) => s.properties.title === SHEET_TAB);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_TAB } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_TAB}!A1:I1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["ID", "DiscordID", "Nick", "Link", "PunktyZadeklarowane", "PunktyKoncowe", "Status", "Powod", "Data"]],
      },
    });
  }
}

/**
 * Zwraca kolejne wolne ID kuponu (licząc od 1842, jak w Waszym systemie).
 */
async function getNextTicketId() {
  const rows = await getAllRows();
  if (rows.length === 0) return 1842;
  const maxId = Math.max(...rows.map((r) => parseInt(r[0], 10) || 0));
  return maxId + 1;
}

async function getAllRows() {
  const sheets = await getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: RANGE_ALL,
  });
  return res.data.values || [];
}

/**
 * Dopisuje nowy wiersz kuponu (status OCZEKUJE).
 */
async function addTicket({ id, discordId, nick, link, points, date }) {
  const sheets = await getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: RANGE_ALL,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[id, discordId, nick, link, points, points, "OCZEKUJE", "", date]],
    },
  });
}

/**
 * Znajduje numer wiersza (1-indexed w arkuszu) po ID kuponu.
 */
async function findRowIndexById(id) {
  const rows = await getAllRows();
  const idx = rows.findIndex((r) => parseInt(r[0], 10) === id);
  if (idx === -1) return null;
  return { rowNumber: idx + 2, row: rows[idx] }; // +2: nagłówek + indeks 0-based
}

async function getTicket(id) {
  const found = await findRowIndexById(id);
  if (!found) return null;
  const [rId, discordId, nick, link, declared, final, status, reason, date] = found.row;
  return {
    id: parseInt(rId, 10),
    discordId,
    nick,
    link,
    declaredPoints: parseInt(declared, 10),
    finalPoints: parseInt(final, 10),
    status,
    reason: reason || null,
    date,
    rowNumber: found.rowNumber,
  };
}

async function updateCell(rowNumber, column, value) {
  const sheets = await getClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_TAB}!${column}${rowNumber}:${column}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[value]] },
  });
}

async function approveTicket(id) {
  const t = await getTicket(id);
  if (!t) return null;
  await updateCell(t.rowNumber, "G", "ZAAKCEPTOWANY");
  return t;
}

async function rejectTicket(id, reason) {
  const t = await getTicket(id);
  if (!t) return null;
  await updateCell(t.rowNumber, "G", "ODRZUCONY");
  await updateCell(t.rowNumber, "H", reason);
  return t;
}

async function correctTicketPoints(id, newPoints) {
  const t = await getTicket(id);
  if (!t) return null;
  await updateCell(t.rowNumber, "F", newPoints);
  return t;
}

/**
 * Sumuje punkty zaakceptowanych kuponów per Nick — do /ranking.
 */
async function getRanking() {
  const rows = await getAllRows();
  const totals = {};
  for (const r of rows) {
    const [, , nick, , , final, status] = r;
    if (status !== "ZAAKCEPTOWANY") continue;
    totals[nick] = (totals[nick] || 0) + (parseInt(final, 10) || 0);
  }
  return Object.entries(totals)
    .map(([nick, points]) => ({ nick, points }))
    .sort((a, b) => b.points - a.points);
}

module.exports = {
  ensureSheetReady,
  getNextTicketId,
  addTicket,
  getTicket,
  approveTicket,
  rejectTicket,
  correctTicketPoints,
  getRanking,
};
