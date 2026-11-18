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

Die Startseite führt zu einem neuen Bezug, Verlauf und Bohnen. Der Bezug wird in fünf Schritten erfasst: Bohne, Dosis, Mahlgrad, Profil, Output und Dauer. Der Profilschritt bietet auch ohne vorhandene Profile „Ohne Profil“ und das Anlegen eines gemeinsamen Profils an. Dosis, Output und Dauer werden aus dem letzten eigenen Bezug übernommen. Der Mahlgrad stammt aus dem letzten Bezug derselben Bohne und Mühle im Raum, unabhängig vom Autor; lokale ausstehende Bezüge werden berücksichtigt. Mahlgrad, Dosis und Temperatur verwenden runde Einstellräder. Output, Laufzeit und konkrete Mahlgradempfehlungen verwenden vertikale Zahlenräder: Hochziehen erhöht den Wert, Herunterziehen verringert ihn; horizontales Ziehen ändert nichts. Pfeiltasten, Schaltflächen und aufklappbare direkte Eingaben bleiben verfügbar. Mühle, Sieb, Temperatur und Import sind weiterhin erreichbar.

Die Profilverwaltung benötigt `supabase/migrations/202611120002_profile_management.sql`. Alle Raummitglieder können aktive Profile am linken Griff per Drag & Drop sortieren (auch per Touch; mit Tastatur über Pfeil hoch/runter); die Reihenfolge gilt auch im Bezugsformular und wird für den Raum gespeichert. Archivierte Profile stehen in einer zunächst geschlossenen Klappliste. Nur unbenutzte Profile lassen sich löschen. Die Datenbank merkt sich ab dieser Migration die Verwendung dauerhaft, auch wenn ein Bezug später geändert oder gelöscht wird; vorhandene Bezüge einschließlich soft-gelöschter Bezüge werden beim Einrichten berücksichtigt.

Die Reihenfolge ist Bohne → Kaffeemenge → Mahlgrad → Profil → Ergebnis. Beim Wischen folgt der Inhalt dem Finger; beim Loslassen gleitet er heraus und der nächste Schritt aus der passenden Richtung hinein. Kurze oder abgebrochene Gesten federn zurück. Bei aktivierter reduzierter Bewegung bleiben die Übergänge ohne Animation. Zwischen den fünf Bezugsschritten lässt sich horizontal wischen: nach links zum nächsten, nach rechts zum vorherigen Schritt. Vertikales Scrollen und Gesten auf Einstellrädern oder Eingabefeldern wechseln den Schritt nicht. Am ersten und letzten Schritt endet die Navigation; Wischen speichert oder verwirft keinen Bezug. Die Browser-Zurück-Navigation führt durch Ansichten und Bezugsformulare. Beim Neuladen bleiben die aktuelle Ansicht und ein offener Bezugsentwurf einschließlich Schritt erhalten. Entwürfe werden nur in der Browser-Sitzung gespeichert und beim Abbrechen oder erfolgreichen Speichern entfernt.

Kopfzeile und Seitenüberschrift bleiben beim Scrollen sichtbar. Nur überlaufende Inhalte scrollen; die fünf Erfassungsschritte nutzen die verfügbare Bildschirmhöhe mit dauerhaft erreichbaren Weiter-/Zurück-Schaltflächen. Auch im Verlauf ist „Neuer Bezug“ dauerhaft erreichbar.

Unter **Einstellungen → Einstellräder** lässt sich die Empfindlichkeit einstellen, auch offline und ohne Adminrechte. Für Dosis und Solltemperatur gilt die Änderung pro Umdrehung; für Output und Laufzeit pro vertikalem Zug über 240 CSS-Pixel. Standard sind 20 g pro Umdrehung für Dosis, 5 g pro Zug für Output, 15 s pro Zug für Laufzeit und 20 °C pro Umdrehung für Temperatur. Vertikales Ziehen ist gegenüber der ersten Version viermal feiner, auch mit bereits gespeicherten Geräteeinstellungen; die Auswahl zeigt die entsprechend reduzierten Werte. Das Zahlenrad für die konkrete Mahlgradempfehlung nutzt 5 Schritte der Mühlenskala pro Zug. Output und Laufzeit verwenden standardmäßig ganze Gramm und Sekunden. Die Geräteoption „Nachkommastellen für Output und Laufzeit“ aktiviert Schritte von 0,1 g und 0,1 s für Zahlenräder, Schaltflächen, Pfeiltasten und direkte Eingabe. Neue Bezüge, Entwürfe und importierte Ergebniswerte werden an diese Einstellung angepasst; bereits gespeicherte Messwerte behalten beim Bearbeiten ihre Genauigkeit, bis der Wert geändert wird. Dosis und Temperatur bleiben auf 0,1 genau. Die Einstellung wird auf diesem Gerät gespeichert. Die Mühle verwendet weiterhin ihre eigene Skala.

Eigene synchronisierte Bezüge können online auf Startseite und im Verlauf nach links weggewischt oder über das **Mülleimer-Symbol** entfernt werden. **Rückgängig** bleibt acht Sekunden verfügbar, auch beim Wechsel zwischen den Ansichten. Erst danach wird die Löschung mit Versionsprüfung gespeichert. Bei Fehlern erscheint der Bezug wieder; beim Neuladen, Abmelden oder Verlassen des Raums innerhalb der acht Sekunden wird die noch ausstehende Löschung verworfen. Fremde Bezüge bleiben geschützt.

Das Farbschema wird vor dem Laden der App angewendet und setzt auch Browserfarbe, Seitenhintergrund und den unteren Sicherheitsabstand. Das Manifest lässt `theme_color` ausdrücklich weg, damit Android/Bare für die Systemnavigation seine eigene Designvorgabe verwenden kann. Eine manuell abweichende App-Darstellung kann deshalb von der Systemleiste abweichen. Bereits installierte Apps müssen die geänderten Manifestdaten erst übernehmen. Der PWA-Startbildschirm behält seinen dunklen Hintergrund. Die Android-Systemleiste muss zusätzlich auf einem echten Gerät geprüft werden; der Browsertest deckt die Farbangaben und den App-Rand ab.

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

## Raumrechte und Bezugsfeedback

Die Migration `supabase/migrations/202611130001_shared_profiles_shot_feedback.sql` muss vor der neuen App-Version eingespielt werden. Sie ergänzt bestehende Daten, ohne Bezüge zu löschen. Historische freie Profilnamen werden als gemeinsame Raumprofile ergänzt; archivierte Profile bleiben archiviert.

Unter **Einstellungen → Mitglieder** können Admins weitere Mitglieder zum Admin ernennen. Ein Entziehen von Adminrechten ist nicht vorgesehen. Alle Raummitglieder können unter **Bezugsprofile** Profile anlegen, sortieren, archivieren, reaktivieren und deren Flow-based-Option ändern. Nur nie verwendete Profile lassen sich endgültig löschen. Gleichnamige Profile werden beim Anlegen wiederverwendet; archivierte Profile müssen zuerst reaktiviert werden. Profilverwaltung braucht Internet, die Auswahl geladener Profile funktioniert offline.

Im letzten Bezugsschritt stehen eine optionale Notiz (bis 2.000 Zeichen), bei Flow-based-Profilen der optionale Maximaldruck (0–30 bar) und eine Empfehlung für den nächsten Mahlgrad zur Verfügung. Empfehlungen können „Gröber“, „Feiner“ oder ein konkreter Skalenwert sein. Die Angaben bleiben in Entwürfen, Offline-Bezügen und im Verlauf erhalten. Der Flow-based-Status wird am Bezug gespeichert, sodass spätere Profiländerungen historische Angaben nicht verändern.

Mahlgrad und Empfehlung gelten gemeinsam für Raum, Bohne und Mühle. Vorausgewählt wird der letzte tatsächlich verwendete gültige Mahlgrad; ohne passenden Vorwert beginnt die Skala am Minimum. Eine Empfehlung ersetzt diesen Wert nicht. Ein konkretes Ziel erhält eine zweite Markierung am Mahlgrad-Rad. „Gröber“ zeigt zusätzlich einen gebogenen Pfeil Richtung höherer Zahlen (Plus), „Feiner“ Richtung niedrigerer Zahlen (Minus). Beide Richtungspfeile sind am Mahlgrad des Bezugs mit der Empfehlung verankert und bleiben beim Verstellen stehen. Die Empfehlungsauswahl besteht aus vier Radio-Optionen; bei „Konkreter Wert“ erscheint ein vertikales Zahlenrad mit dem aktuellen Mahlgrad als Startwert. Die Empfehlung stammt ausschließlich aus dem neuesten passenden Bezug und verschwindet beim nächsten Bezug ohne neue Empfehlung. Maßgeblich sind Bezugszeitpunkt und bei Gleichstand die Bezugs-ID. Fehlgeschlagene und gelöschte Bezüge werden nicht berücksichtigt. Offline ist nur der zuletzt geladene Raumstand plus die lokale Warteschlange verfügbar.

Als spätere Erweiterungen kommen Ziel-Flow, Zieldruck und Präinfusionsdauer infrage; diese Felder sind noch nicht enthalten.

### Verbrauch und leere Bohnen

Unter **Bohnen → Verbrauch** zeigt die Statistik die erfasste Dosis nach Bohne und Person. Farbige gestapelte Balken vergleichen die Bohnenmengen und zeigen die Anteile pro Person. Die Zeitraumwahl umfasst Gesamt, 30 Tage und 7 Tage (jeweils inklusive heute); Verlaufsfilter verändern diese Statistik nicht. Alle gespeicherten Bezüge zählen rückwirkend; fehlende Kaffeemengen werden separat genannt. Noch ausstehende lokale Bezüge zählen mit, fehlgeschlagene und gelöschte nicht. Änderungen und Löschungen aktualisieren die Summen.

Alle Raummitglieder können Bohnen archivieren und unter **Archivierte Bohnen** wieder aktivieren. Archivierte Bohnen werden für neue Bezüge nicht mehr vorausgewählt; bestehende Entwürfe und bearbeitete Bezüge behalten ihre Zuordnung. Verlauf und Verbrauch bleiben erhalten. Dafür ist keine zusätzliche Migration nötig: Die vorhandene Bohnenmigration enthält bereits Archivstatus und Raumrechte.

Bezugsprofile stehen in kompakten Zeilen mit vertikal zentriertem Ziehgriff, Namen, Flow-based-Schalter und Archivsymbol. Das Formular für ein neues Profil ist aufklappbar. Im Verlauf wird ein angegebener Maximaldruck mit Manometer-Symbol und bar angezeigt; ein separater Flow-based-Text entfällt. Alle Mahlgradempfehlungspfeile haben kräftigere, abgerundete Konturen.

### Packungen und Restbestand

Pro Bohne und Raum gibt es höchstens eine aktive Packung. Beim Anlegen einer Bohne kann optional direkt die erste Packung erfasst werden; beides wird atomar gespeichert. Bestehende Bohnen erhalten über **Neue Packung** eine Packungsmenge (250 g, 500 g, 1 kg oder eigene Menge) und einen Öffnungszeitpunkt. Alte Bezüge werden nur bei rückdatierten Packungen und nach ausdrücklicher Bestätigung zugeordnet.

Neue Bezüge werden beim Speichern anhand von Bohne und Bezugszeitpunkt einer Packung zugeordnet. Die Zuordnung wird am Bezug gespeichert und bei Bearbeitung beibehalten; bei einem Bohnenwechsel wird sie neu bestimmt. Das funktioniert auch für verspätet synchronisierte Offline-Bezüge. Ein inzwischen überholter lokaler Packungsstand wird bei der Synchronisierung anhand der Öffnungsintervalle aufgelöst. Fehlgeschlagene und gelöschte Bezüge zählen nicht zum Bestand. Autorenrechte bleiben unverändert.

Beim Öffnen der nächsten Packung kann die bisherige ohne Übernahme abgeschlossen, der berechnete Rest übernommen oder als entsorgt dokumentiert werden. Übernahmen sind feste, zum Wechsel protokollierte Mengen: Spätere Korrekturen an alten Bezügen ändern die alte Packung, nicht rückwirkend den bereits übergebenen Bestand. Mit **Bestand korrigieren** wird ein nachgewogener Rest samt Grund erfasst. Fehlende oder verspätete Bezüge, Mahlverluste und Korrekturen können die Schätzung beeinflussen; bei rechnerisch leerem Bestand bleiben Bezüge möglich. Die Schätzung verbleibender Bezüge verwendet die durchschnittliche erfasste Dosis der aktuellen Packung.

Packungswechsel und Bestandskorrekturen benötigen eine Verbindung. Auf dem Gerät noch ausstehende Bezüge derselben Bohne müssen zuvor synchronisiert werden. Wiederholte Requests erzeugen keine zweite Packung/Korrektur; konkurrierende Packungswechsel werden über den erwarteten aktiven Packungsstand abgesichert. Unter **Bohnen → Verbrauch → Packung** sind aktive und abgeschlossene Packungen samt Übergaben und Bestandskorrekturen einzeln einsehbar.

**Einrichtung:** Vor Veröffentlichung dieser App-Version `supabase/migrations/202611140001_bean_packages.sql` vollständig im Supabase SQL Editor ausführen. Die Migration ist additiv und setzt die bisherigen Migrationen voraus. Ohne sie bleibt der bisherige Bezugsablauf kompatibel; Packungsfunktionen erscheinen erst nach Einrichtung und Neuladen. Die Migration wurde mit PGlite inklusive Raumisolation, Gastrechten, Zuordnung, Übernahme, Korrektur, Wiederholungen und historischen Änderungen geprüft.

**Packungen bearbeiten:** Auf der Bohnenkarte und unter **Verbrauch → Packung** gibt es **Packung bearbeiten**, auch für abgeschlossene Packungen. Änderbar sind ursprüngliche Füllmenge und Öffnungszeitpunkt. Mengenänderungen berechnen den Restbestand neu; Bezugszuordnungen, Bestandskorrekturen und dokumentierte Restübernahmen bleiben erhalten. Beim Verschieben einer Packungsgrenze wird das Ende der vorherigen Packung mitverschoben. Überschneidungen mit deren Bezügen oder dem eigenen Packungsende sowie konkurrierende Änderungen werden serverseitig abgewiesen. Zuerst die zusätzliche Migration `supabase/migrations/202611140002_edit_bean_packages.sql` ausführen, dann die App veröffentlichen.

Die Bohnenkarten verwenden kompakte, beschriftete Symbolschaltflächen: Stift zum Bearbeiten und Archivbox zum Archivieren/Reaktivieren sowie den Textbutton **+ Packung**. In der Listenansicht stehen die Aktionen neben dem Namen. Packungsbearbeitung und Bestandskorrektur befinden sich im **…**-Menü neben dem Restbestand; zugängliche Namen und Tooltips bleiben erhalten.


**Rückdatierte Packungen:** Bei einem Öffnungszeitpunkt vor dem aktuellen Zeitpunkt (mehr als eine Minute) verlangt das Formular ausdrücklich Ja oder Nein zur Einbeziehung bisheriger Bezüge. Die Vorschau nennt Anzahl und Menge der Bezüge dieser Bohne ab Öffnung bis heute, raumweit. Bei Ja werden unzugeordnete Bezüge und passende Bezüge der bisherigen aktiven Packung atomar der neuen Packung zugeordnet; abgeschlossene ältere Packungen und gelöschte Bezüge bleiben unberührt. Autoren, Messwerte und Gesamtverbrauch ändern sich nicht. Eine Restübernahme wird vor Abzug der in die neue Packung verschobenen Bezüge berechnet. Bei Nein bleiben die bisherigen Zuordnungen erhalten. Enthält die bisherige Packung spätere Bestandskorrekturen, wird eine rückwirkende Übernahme zur Prüfung abgewiesen. Migration: `supabase/migrations/202611140003_package_history.sql` vor der App-Veröffentlichung ausführen.

In den Bezugsprofilen ist **Flow-based** ein ganzer Toggle-Button mit `aria-pressed`, ohne sichtbares Auswahlfeld. Der Ziehgriff ist transparent und mittig ausgerichtet.

**Bestehende Packungen nachträglich zuordnen und löschen:** Beim Öffnen von **Packung bearbeiten** erscheint die Ja/Nein-Frage immer, auch ohne Datumsänderung. Bei Ja werden bisher unzugeordnete, nicht gelöschte Bezüge dieser Bohne innerhalb des Packungszeitraums aufgenommen. Bereits anderen Packungen zugeordnete Bezüge bleiben unverändert; bei abgeschlossenen Packungen endet der Zeitraum am Packungsende.

**Packung löschen** ist im **…**-Menü der Bohnenkarte und in der Packungsstatistik verfügbar. Nach Bestätigung werden Packung und ihre Bestandskorrekturen entfernt, sämtliche Bezüge bleiben ohne Packungszuordnung erhalten. Übernommene Restmengen werden beim Vorgänger als abgeschlossen ohne Übernahme markiert; an den unmittelbaren Nachfolger übergebene Restmengen werden dort entfernt. Ältere Packungen werden nicht automatisch reaktiviert. Wiederholte Löschrequests sind unschädlich; Offline-Bezüge mit inzwischen gelöschter Packungs-ID werden anhand der verbleibenden Zeitintervalle zugeordnet oder ohne Packung gespeichert. Es gelten weiterhin Raum- und Autorenrechte.

Vor Veröffentlichung dieser Ergänzung **zusätzlich** `supabase/migrations/202611140004_edit_history_delete_packages.sql` vollständig ausführen.

Unter **Einstellungen → Darstellung** stehen die Designs **Klassisch** (Standard) und **Glas** parallel zur Verfügung. Glas ergänzt schwebende Navigation, offene Einstellräder mit mittigem Messwert, abstrakten Glas-Lichtbögen, farbigem Skalenring und leuchtendem Griffpunkt sowie weichgezeichnete Hintergründe in Rosé, Flieder und Pfirsich. Auf Desktop sind Kopf- und Seitenleiste als getrennte, abgerundete Glasflächen gestaltet. Beide Designs unterstützen Hell, Dunkel und Automatisch. Die Designwahl wird pro Gerät gespeichert und schon vor dem App-Start angewendet, auch offline.

Im Glas-Design folgen dezente Lichtreflexe der Maus auf allen aktiven Buttons, einschließlich Navigation und Symbolbuttons. Einstellräder und reine Kartenflächen bleiben ohne diesen Hovereffekt. Bei Touchbedienung und reduzierter Bewegung ist er deaktiviert.

Die Glas-Lichtbögen drehen sich dezent mit dem runden Einstellrad, während der Messwert mittig ausgerichtet bleibt. Die vertikalen Zahlenwalzen rollen beim Ziehen und bei Tastenbedienung dreidimensional. Bei reduzierter Bewegung entfallen diese Animationen.

Ein Klick auf einen Bezug öffnet eine kompakte Übersicht als modales Popup mit Bohnenbild, Messwert-Icons und weichgezeichnetem Hintergrund. Im Glas-Design ist die Oberfläche transparent mit Lichtkanten; Öffnen und Schließen werden sanft animiert (außer bei reduzierter Bewegung). Escape, der Schließen-Button und ein Klick außerhalb schließen es; der Tastaturfokus kehrt zurück. Die Zahlenwalzen folgen beim Ziehen kontinuierlich dem Finger, ohne Animationen pro Zahlenwechsel; erst beim Loslassen rasten sie auf den nächsten gültigen Wert ein.

Seiten scrollen am äußeren App-Rand. Im Bezugsablauf scrollt die äußere Formularkarte; Felder, Bohnen- und Siebauswahl erzeugen keine eigenen Scrollbereiche. Die Aktionsleiste bleibt erreichbar. Das dunkle Glas-Design nutzt einen fast schwarzen Grundton, gedämpfte Akzente und dezente Lichtkanten.

Der Zustand von „Weitere Angaben & Import“ wird pro Nutzer auf dem jeweiligen Gerät gespeichert und bei neuen Bezügen sowie nach dem Neuladen wiederhergestellt. Ohne gespeicherte Auswahl ist der Bereich eingeklappt.

Die mobile Installationshilfe erklärt das Hinzufügen zum Homescreen für iOS/iPadOS und Android. In unterstützten Browsern bietet sie den nativen Installationsdialog an. Standalone-Start, `appinstalled` oder „Bereits installiert“ blenden den Hinweis dauerhaft auf diesem Gerät/Browser aus. Eine bestehende Installation lässt sich aus einem normalen Browserfenster nicht browserübergreifend zuverlässig erkennen. Während eines Bezugs bleibt der Hinweis ausgeblendet.

**Retro 98** ist das dritte, unabhängige Design unter Einstellungen → Darstellung. Der interne Schlüssel `orbit` bleibt für bestehende Einstellungen erhalten. Die eigene Startseite verwendet Retro-Fenster, eine blaue Titelleiste, Arbeitsplatz-Verknüpfungen und eine Desktop-Taskleiste. Hell, Dunkel und Automatisch sowie Offline-Nutzung werden unterstützt.

Ab 1024 px verwenden alle drei Designs eine vertikale Schrittleiste im Bezugsformular. Retro 98 zeigt nummerierte Schritte, plastische Buttons und Instrumente im Desktop-Stil. Mobil bleibt die Schrittnavigation horizontal. Animationen respektieren reduzierte Bewegung.

Unter Einstellungen → Bedienung lässt sich die persönliche **Schnellauswahl** aktivieren (standardmäßig aus). Dann führt die Auswahl einer Bohne oder eines vorhandenen Profils direkt zum nächsten Schritt, einschließlich „Ohne Profil“. Sonst bestätigt man mit „Weiter“. Die Einstellung wird pro Nutzer auf diesem Gerät gespeichert und funktioniert auch offline; andere Nutzer und Räumeinstellungen werden nicht verändert.

Unbenutzte Bohnen: Migration `202611140005_delete_unused_beans.sql` ausführen. In der Bohnenliste nach links wischen zum Löschen (mit Bestätigung), nach rechts zum Archivieren bzw. Reaktivieren. Mit Tastatur: Karte fokussieren, Entf bzw. Pfeil rechts. Bohnen mit Bezügen oder Packungen bleiben durch Fremdschlüssel geschützt.

Bewertungen sind ausschließlich in der Bezugsübersicht bearbeitbar; im Verlauf bleiben sie schreibgeschützt. Eigene synchronisierte Bezüge erlauben dort auch das Speichern einer Mahlgradempfehlung. Das klassische Design verwendet Material-3-Expressive-inspirierte Farben, Flächen und Formen; Glas und Retro 98 bleiben eigenständig.

Material-Design: bewegte gewellte Dial-Form, federnde Navigation und Startkarte. Bewegung reduzieren wird respektiert. Optional Material You mit vom Browser freigegebener System-Akzentfarbe (keine garantierte Android-Wallpaper-Palette) oder eigener Farbe, lokal gespeichert. Empfehlungen in Shot-Details speichern automatisch; konkrete Werte nach kurzer Einstellpause.

Material-Farben: Standard wieder warmes Braun (hell und dunkel). Die optionale persönliche Farbauswahl bietet Mokka, Lavendel, Ozean, Salbei, Rose und Honig als mehrfarbige Paletten mit Auswahlhaken. Bereits gespeicherte individuelle Farben bleiben als zusätzliche Palette erhalten.

Kaffeemenge wird vertikal eingestellt und mit einem kontinuierlich gefüllten Sieb visualisiert (Skala bis 40 g). Persönliche Paletten färben auch Hintergrund, Karten, Text- und Trennfarben passend ein.

Kaffeemengen-Bereich: Einstellungen → Kaffeemengen → Kaffeemenge · Bereich, Standard 7–25 g. Grenzen werden lokal gespeichert und müssen in 0,1-g-Schritten zwischen 0,1 und 100 g liegen. Neue Vorwerte werden auf den Bereich begrenzt; historische Werte und Entwürfe außerhalb bleiben erhalten und erweitern die Skala für diesen Bezug.

Kaffeemengen-Presets unter dem Sieb: 7, 14, 19 und 25 g als Vorschläge. Eigene Werte unter Einstellungen → Kaffeemengen → Vordefinierte Kaffeemengen hinzufügen, entfernen oder einzeln aktivieren/deaktivieren (maximal 12, 0,1-g-Schritte). Speicherung pro Nutzer auf dem aktuellen Gerät; außerhalb der Mengengrenzen liegende Presets bleiben sichtbar, aber deaktiviert.

Mengen-Presets wechseln bei aktiver Schnellauswahl direkt zum Mahlgrad. Ein kurzes Tippen auf die Zahl in der Siebmitte (oder Enter am fokussierten Mengenregler) führt unabhängig davon weiter; Ziehen bleibt reine Mengenänderung. Direkte Eingabe als Button in derselben horizontalen Preset-Reihe.

Einstellungen: Darstellung, Bedienung und Kaffeemengen sind wie die Setup-Bereiche standardmäßig eingeklappt. Bedienung enthält Schnellauswahl, Dezimalstellen und Regler-Empfindlichkeit; Kaffeemengen enthält Grenzen und Presets. Die vorgeschlagenen Siebfotos werden in der Auswahl per SVG entlang ihrer Kontur freigestellt, ohne die Originaldateien zu verändern.

Retro 98 ersetzt das bisherige Orbit-Design (gespeicherte Auswahl bleibt erhalten): Desktop-Fenster, Taskleiste, helle und dunkle Ansicht. Kaffeemengen werden in 0,5-g-Schritten eingestellt. Transparente Sieb-SVGs ersetzen die eingebauten PNGs; bereits gespeicherte Originalbilder werden per Inhalts-Hash bei der Anzeige erkannt. Eigene Bilder und historische Messwerte bleiben erhalten.
