# Doomsday Radio Archiv

Statische Weboberfläche für Bücher, Hörbücher und Audiofragmente aus dem
Doomsday-Radio-Universum. Der Katalog wird aus `books.json` geladen und im
Browser mit EPUB-Ansicht, Hörbuch-Player und Hintergrundmusik dargestellt.

## Lokal starten

Die Anwendung verwendet `fetch()` und muss deshalb über einen lokalen
Webserver geöffnet werden:

```bash
python -m http.server 8000
```

Anschließend ist das Archiv unter <http://localhost:8000> erreichbar.

## Inhalte pflegen

- `books.json` enthält den sichtbaren Katalog und die Verweise auf Medien.
- `books/` enthält EPUB-Dateien.
- `audio/` enthält Hörbücher, Fragmente und Hintergrundmusik.
- `vendor/jszip.min.js` stellt die ZIP-Verarbeitung für EPUB-Dateien bereit.

Neue Inhalte sollten zuerst im Katalog eingetragen und danach über den lokalen
Server geprüft werden. Bei Änderungen an Dateinamen müssen die Pfade in
`books.json` mit angepasst werden.

## Projektstruktur

```text
index.html    Einstiegspunkt der Web-App
script.js     Katalog, EPUB-Ansicht und Audiosteuerung
style.css     Darstellung
books.json    Medienkatalog
books/        EPUB-Bestand
audio/        Audiobestand
vendor/       lokal eingebundene Browser-Abhängigkeiten
```

Das Repository enthält derzeit keine eigene Deployment-Automation.
