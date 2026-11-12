# Espresso Diary

Ein gemeinsames Tagebuch für Espressobezüge. Die Web-App läuft auf Handy, Tablet und Desktop. Nach dem ersten Online-Aufruf eines Raums lassen sich dort auch ohne Internet neue Bezüge speichern.

## Lokal starten

Voraussetzungen sind Node.js 24 und pnpm 11.

1. Mit `pnpm install --frozen-lockfile` die Abhängigkeiten installieren.
2. Ein Supabase-Projekt in einer EU-Region anlegen und die SQL-Migrationen unter `supabase/migrations` in der Dateireihenfolge ausführen. Für ein bereits verknüpftes Projekt geht das über `supabase db push`.
3. In Google Auth Platform einen OAuth-Client vom Typ **Web application** erstellen. Als Redirect-URI `https://<projekt-ref>.supabase.co/auth/v1/callback` eintragen. Client-ID und Client-Secret in Supabase unter **Authentication → Sign In / Providers → Google** hinterlegen. Unter **URL Configuration** die lokale App-Adresse `http://127.0.0.1:5173/` als Site URL oder Redirect URL eintragen. Im Google-Testmodus müssen die Konten der Tester in Google Auth Platform freigegeben sein. [Google-Anmeldung in Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
4. `.env.example` nach `.env.local` kopieren und Projekt-URL und veröffentlichbaren Schlüssel eintragen. Mit `pnpm dev` starten.
5. Für die lokale Bildsuche `BRAVE_SEARCH_KEY=<dein API-Schlüssel>` in `.dev.vars` eintragen. `pnpm dev` bedient die Bildsuche direkt und verwendet die Supabase-Verbindung aus `.env.local`.

## Veröffentlichen

1. Ein Cloudflare-Konto mit Wrangler verbinden. `SUPABASE_URL` und `SUPABASE_PUBLISHABLE_KEY` als Worker-Variablen einrichten. Dieselben Werte als `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` beim Build bereitstellen.
2. Für die Bildsuche einen Brave-Search-Tarif mit Speicherrechten verwenden. Den Schlüssel mit `pnpm exec wrangler secret put BRAVE_SEARCH_KEY` als Worker-Secret hinterlegen. Die Bildsuche schlägt Vorschaubilder mit Quelle vor und speichert die gewählte Bildadresse. Bei externen Bildern hängen Verfügbarkeit und Anzeige von der Quelle ab. Eigene Fotos werden im privaten Supabase-Bucket gespeichert.
3. `pnpm deploy` ausführen und die HTTPS-Adresse in Supabase als Site URL eintragen. Anschließend mit zwei Google-Konten Anmeldung, Raumlink, Raumpasswort und Synchronisierung prüfen. Der Raumlink wird aus der jeweils geöffneten App-Adresse erzeugt.

Auf Android kann die App über das Browser-Menü installiert werden. In Safari auf dem iPhone erfolgt die Installation über **Teilen → Zum Home-Bildschirm**. Für Offline-Tests den Raum zuerst online in der installierten App öffnen. Die Synchronisierung startet bei geöffneter App, sobald wieder Internet verfügbar ist.

## Tests

`pnpm test` prüft Mahlgrad, GaggiMate-Dateien und die Datenbankregeln mit einer eingebetteten PostgreSQL-Instanz. `pnpm build` prüft TypeScript und baut die App samt Service Worker.

Der Browsertest verwendet zwei getrennte Browser-Sitzungen und einen lokalen API-Testserver. Zuerst `pnpm exec playwright install chromium` ausführen, dann `pnpm test:browser`. Mit `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` kann ein vorhandener Chromium-Browser verwendet werden. Für den abschließenden Gerätetest im Flugmodus einen Bezug erfassen, die App neu öffnen und nach dem Wiederverbinden den zweiten Browser prüfen.

## Mobile Erfassung und Bohnen

Die Startseite führt zu einem neuen Bezug, Verlauf und Bohnen. Der Bezug wird in fünf Schritten erfasst: Bohne, Mahlgrad, Dosis, Profil, Output und Dauer. Die letzten eigenen Werte inklusive noch nicht synchronisierter Bezüge werden vorausgewählt. Einstellräder reagieren auf horizontales Wischen, Pfeiltasten und Plus/Minus; exakte Eingaben sind zusätzlich aufklappbar. Mühle, Sieb, Temperatur und Import sind weiterhin erreichbar.

Für die Bohnenverwaltung auch `supabase/migrations/202611110003_beans.sql` auf der bestehenden Supabase-Datenbank ausführen. Sie ergänzt die raumgebundene Bohnenliste und den Bezug zur Kaffeesorte; bestehende Bezüge bleiben erhalten. Alle Raummitglieder dürfen Bohnen hinzufügen und bearbeiten. Bereits geladene Bohnen stehen bei Offline-Bezügen zur Auswahl; das Anlegen einer neuen Bohne braucht eine Verbindung.

Bohnenfotos benötigen zusätzlich `supabase/migrations/202611110004_bean_photos.sql`. Der private Bucket `bean-photos` erlaubt Raummitgliedern Uploads und Zugriff auf Fotos ihres Raums. Beim Anlegen oder Bearbeiten einer Bohne können JPG-, PNG- oder WebP-Fotos bis 5 MB ausgewählt, ersetzt und entfernt werden. Geladene Bilder werden zusammen mit den Raumdaten für die Offline-Anzeige gespeichert.

Optionale Sternebewertungen benötigen `supabase/migrations/202611120001_shot_ratings.sql`. Eigene synchronisierte Bezüge lassen sich online direkt auf Startseite und im Verlauf mit 1–5 Sternen bewerten; eine entfernte Bewertung bleibt `NULL`. Die bestehenden Autorenrechte gelten weiter.

## Auf einem anderen PC weiterarbeiten

Git, Node.js 24 und pnpm 11 installieren. Danach in PowerShell:

```powershell
git clone https://github.com/Duffed/espresso-shared-diary.git
cd espresso-shared-diary
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
```

Die Werte in `.env.local` vom bisherigen PC übernehmen oder im bestehenden Supabase-Projekt nachsehen. Es werden `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` benötigt. Die vorhandene Datenbank weiterverwenden; bereits ausgeführte Migrationen nicht erneut ausführen. `.env.local` und `.dev.vars` sind absichtlich nicht auf GitHub. Für lokale Bildsuche zusätzlich `.dev.vars` sicher vom bisherigen PC übernehmen; ohne diesen Schlüssel funktionieren die übrigen App-Funktionen weiter.

```powershell
pnpm dev --host 127.0.0.1
```

Die ausgegebene lokale Adresse öffnen. Sie muss als zusätzliche Redirect URL in Supabase erlaubt sein; die Site URL bleibt die öffentliche Cloudflare-Adresse. Den Projektordner in Codex oder dem Editor öffnen. Der bisherige Chat ist für die Weiterentwicklung nicht erforderlich: Code und README liegen im Repository.

Vor Arbeitsbeginn `git pull --ff-only` ausführen. Nach Änderungen:

```powershell
pnpm test
pnpm build
git add .
git commit -m "Beschreibung der Änderung"
git push origin main
```

Ein GitHub-Push allein veröffentlicht die App nicht. Zum Veröffentlichen auf einem neuen PC einmal `pnpm exec wrangler login` mit dem bisherigen Cloudflare-Konto ausführen, danach `pnpm deploy`. Die bestehenden Worker-Variablen und Secrets bleiben erhalten.

Die PWA-Icons werden aus der mitgelieferten Instrument-Serif-Schrift erzeugt: `node scripts/generate-icons.mjs`. Dafür Chromium mit `pnpm exec playwright install chromium` installieren oder `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` auf einen vorhandenen Browser setzen.
