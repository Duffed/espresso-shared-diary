# Espresso Diary

Ein gemeinsames Tagebuch für Espressobezüge. Die Web-App läuft auf Handy, Tablet und Desktop. Nach dem ersten Online-Aufruf eines Raums lassen sich dort auch ohne Internet neue Bezüge speichern.

## Lokal starten

Voraussetzungen sind Node.js 24 und pnpm 11.

1. Mit `pnpm install --frozen-lockfile` die Abhängigkeiten installieren.
2. Ein Supabase-Projekt in einer EU-Region anlegen und die SQL-Migration unter `supabase/migrations` ausführen. Für ein bereits verknüpftes Projekt geht das über `supabase db push`.
3. In Supabase die Anmeldung per E-Mail aktivieren. In der Vorlage für den Magic Link den Code mit `{{ .Token }}` anzeigen. Für den Versand an normale Nutzerkonten einen eigenen SMTP-Dienst konfigurieren und die öffentliche App-URL unter **Site URL** eintragen.
4. `.env.example` nach `.env.local` kopieren und Projekt-URL und veröffentlichbaren Schlüssel eintragen. Mit `pnpm dev` starten.
5. Für die Bildsuche `.dev.vars.example` nach `.dev.vars` kopieren. Supabase-URL, veröffentlichbaren Schlüssel und Brave-Schlüssel eintragen. Anschließend `pnpm build` und `pnpm exec wrangler dev` ausführen. Der Vite-Entwicklungsserver leitet `/api` an diesen Worker weiter.

## Veröffentlichen

1. Ein Cloudflare-Konto mit Wrangler verbinden. `SUPABASE_URL` und `SUPABASE_PUBLISHABLE_KEY` als Worker-Variablen einrichten. Dieselben Werte als `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` beim Build bereitstellen.
2. Für die Bildsuche einen Brave-Search-Tarif mit Speicherrechten verwenden. Den Schlüssel mit `pnpm exec wrangler secret put BRAVE_SEARCH_KEY` als Worker-Secret hinterlegen. Die Bildsuche schlägt Vorschaubilder mit Quelle vor und speichert die gewählte Bildadresse. Bei externen Bildern hängen Verfügbarkeit und Anzeige von der Quelle ab. Eigene Fotos werden im privaten Supabase-Bucket gespeichert.
3. `pnpm deploy` ausführen. Anschließend mit zwei getrennten E-Mail-Konten Anmeldung, Einladungslink und Synchronisierung über die HTTPS-Adresse prüfen.

Auf Android kann die App über das Browser-Menü installiert werden. In Safari auf dem iPhone erfolgt die Installation über **Teilen → Zum Home-Bildschirm**. Für Offline-Tests den Raum zuerst online in der installierten App öffnen. Die Synchronisierung startet bei geöffneter App, sobald wieder Internet verfügbar ist.

## Tests

`pnpm test` prüft Mahlgrad, GaggiMate-Dateien und die Datenbankregeln mit einer eingebetteten PostgreSQL-Instanz. `pnpm build` prüft TypeScript und baut die App samt Service Worker.

Der Browsertest verwendet zwei getrennte Browser-Sitzungen und einen lokalen API-Testserver. Zuerst `pnpm exec playwright install chromium` ausführen, dann `pnpm test:browser`. Mit `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` kann ein vorhandener Chromium-Browser verwendet werden. Für den abschließenden Gerätetest im Flugmodus einen Bezug erfassen, die App neu öffnen und nach dem Wiederverbinden den zweiten Browser prüfen.
