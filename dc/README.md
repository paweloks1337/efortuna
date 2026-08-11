# Typer Bot — weryfikacja kuponów (Discord + Google Sheets)

## 1. Discord — utworzenie bota
1. https://discord.com/developers/applications → **New Application**.
2. Zakładka **Bot** → **Reset Token** → skopiuj do `DISCORD_TOKEN`.
3. W tej samej zakładce włącz intent **Server Members Intent**.
4. Zakładka **OAuth2 → URL Generator**: zaznacz `bot` + `applications.commands`,
   uprawnienia: `Send Messages`, `Embed Links`, `Read Message History`, `Use Slash Commands`.
   Otwórz wygenerowany link i dodaj bota na serwer.
5. `DISCORD_CLIENT_ID` = Application ID (zakładka General Information).
6. `DISCORD_GUILD_ID` = ID Twojego serwera (włącz tryb developera w Discordzie,
   PPM na serwer → Kopiuj ID).
7. `ADMIN_ROLE_ID` = ID roli, która ma prawo klikać Zatwierdź/Odrzuć/Korekta.

## 2. Google Sheets — konto serwisowe
1. https://console.cloud.google.com → nowy projekt → **APIs & Services → Library**
   → włącz **Google Sheets API**.
2. **APIs & Services → Credentials → Create Credentials → Service Account**.
3. Po utworzeniu: wejdź w konto serwisowe → **Keys → Add Key → JSON** → pobierz plik.
   Z pliku weź `client_email` → `GOOGLE_CLIENT_EMAIL` i `private_key` → `GOOGLE_PRIVATE_KEY`.
4. Utwórz nowy arkusz Google Sheets. Skopiuj ID z URL
   (`docs.google.com/spreadsheets/d/TEN_FRAGMENT/edit`) → `GOOGLE_SHEET_ID`.
5. **Udostępnij arkusz** dla adresu z `client_email` z uprawnieniem **Edytor** —
   to najczęściej pomijany krok, bez niego bot dostanie błąd 403.

Bot sam utworzy zakładkę „Kupony” z nagłówkami przy pierwszym starcie.

## 3. Instalacja i start
```bash
npm install
cp .env.example .env   # uzupełnij wartościami z kroków 1 i 2
npm run deploy-commands
npm start
```

## 4. Użycie
- `/dodajkupon link:<link> punkty:<liczba>` — dowolny użytkownik zgłasza kupon.
- Bot publikuje embed z przyciskami **Zatwierdź / Odrzuć / Korekta** —
  widoczne dla wszystkich, ale klikalne tylko dla roli z `ADMIN_ROLE_ID`.
- **Odrzuć** → lista gotowych powodów + opcja własnego tekstu (modal).
- **Korekta** → modal z nową liczbą punktów, stara wartość widoczna przekreślona.
- Po każdej decyzji zgłaszający dostaje DM, a wiersz w Google Sheets aktualizuje się od razu.
- `/ranking` — top 15 wg sumy punktów z zaakceptowanych kuponów.

## Uwagi produkcyjne
- Google Sheets API ma limit ~60 zapisów/min na projekt — przy bardzo dużym ruchu
  rozważ migrację na Supabase (masz już ten stack w innych projektach); struktura
  kodu w `sheets.js` jest wydzielona specjalnie po to, by dało się ją podmienić
  bez zmian w `index.js`.
- ID kuponu liczone jest jako `max(ID w arkuszu) + 1` — przy równoczesnych zgłoszeniach
  w bardzo krótkim odstępie czasu teoretycznie możliwa kolizja; przy realnym ruchu
  community warto to zabezpieczyć licznikiem w osobnej komórce (Meta tab).
- Hosting: Railway / Render / dowolny VPS z Node 18+, proces musi działać ciągle
  (`npm start`, np. pod `pm2`).
