# Synchronisierung zwischen beiden PCs

Dieses Repository wird auf mehreren PCs bearbeitet. Für jede Änderungsaufgabe gilt:

1. Vor dem Bearbeiten `git status` und den aktuellen Branch prüfen. Vorhandene lokale Änderungen sichern und bei der Zusammenführung erhalten.
2. Den Remote-Stand abrufen und den aktuellen Branch mit `git pull --ff-only` aktualisieren. Bei auseinanderlaufenden Historien die Änderungen ohne Verlust zusammenführen; keinen Force-Push und keinen verwerfenden Reset verwenden.
3. Auf dem aktualisierten Stand arbeiten. Neue Designs, Funktionen und sonstige Änderungen vom anderen PC erhalten, sofern der Nutzer ihre Änderung nicht ausdrücklich verlangt.
4. Nach Abschluss passende Prüfungen ausführen, den Diff kontrollieren und alle zur Aufgabe gehörenden Änderungen committen und auf den zugehörigen Remote-Branch pushen. Vom Nutzer verlangte getrennte Commits beibehalten. Zugangsdaten, lokale Umgebungsdateien und generierte Build-/Testdateien bleiben ausgeschlossen.
5. Wird der Push wegen neuer Remote-Commits abgelehnt, diese abrufen, integrieren, betroffene Prüfungen wiederholen und erneut pushen. Abschließend bestätigen, dass lokale Commits und Remote-Branch übereinstimmen; verbleibende lokale Änderungen ausdrücklich benennen.
6. Bei einem angeforderten Deployment den zusammengeführten, geprüften und gepushten Stand bauen und veröffentlichen. Falls die Live-Version zusätzliche, nicht im Repository vorhandene Änderungen enthält, diese vor dem Deployment sichern und ihre Quelle klären.

Commit und Push gehören zum Abschluss der Aufgabe und benötigen keine erneute Rückfrage. Falls Synchronisierung oder Push scheitern, den offenen Stand klar melden, statt die Aufgabe als synchronisiert abzuschließen.
