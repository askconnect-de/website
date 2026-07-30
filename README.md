# askconnect.de – Website

Statische Website der ASK CONNECT GbR. Kein Build-Schritt, kein Framework –
reines HTML, CSS und Vanilla JS. Deployment über GitHub Pages.

## Struktur

```
index.html            Startseite: Hero, Services, Über uns, Wegweiser
vorteile.html         Vorteile von KI-Agenten / RAG-Chatbots
ablauf.html           Prozess in 6 Schritten
faq.html              Häufige Fragen (Filter + Akkordeon)
projekt-check.html    Chat-Oberfläche des KI-Assistenten
kontakt.html          Kontaktformular
impressum.html        Impressum
datenschutz.html      Datenschutzerklärung – SIEHE WARNUNG UNTEN
404.html              Fehlerseite (nutzt absolute Pfade!)

assets/css/style.css          gesamtes Styling aller Seiten
assets/js/main.js             Navigation, Burger-Menü, FAQ, Animationen
assets/js/projekt-check.js    Chat-Logik + Konfiguration (Webhook-URL!)
assets/js/kontakt.js          Formularversand + Übernahme aus dem Chat
assets/js/askbot-widget.js    n8n-Chat-Bubble (alle Seiten außer Projekt-Check)

logo-icon.png   Robot-Symbol für Navigation und Favicon
logo2.png       vollständiges Logo inkl. Schriftzug
CNAME           Custom Domain für GitHub Pages
robots.txt, sitemap.xml
```

## ⚠️ Offener Punkt: Rechtstexte

`datenschutz.html` und `impressum.html` wurden nach bestem Wissen erstellt, sind
aber **nicht anwaltlich geprüft**. Vor allem in der Datenschutzerklärung müssen
noch ergänzt bzw. bestätigt werden:

- welches Sprachmodell hinter den Chat-Assistenten steht und wo es betrieben wird
  (Abschnitt 4 nennt bisher nur n8n)
- ob Gesprächsverläufe gespeichert werden – und wenn ja, wie lange
- Auftragsverarbeitungsverträge mit allen eingesetzten Dienstleistern

Da die Website DSGVO-Konformität als Verkaufsargument führt, sollte das vor der
ersten Kundenakquise geklärt sein.

## Icons

Alle Icons sind **Inline-SVGs** aus [Lucide](https://lucide.dev) (ISC-Lizenz) –
keine Icon-Fonts, kein CDN, keine Emojis. Ein neues Icon holt man sich auf
lucide.dev, kopiert den SVG-Code und passt ihn an das Schema an:

```html
<div class="feature-icon">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <!-- Pfade von lucide.dev -->
    </svg>
</div>
```

Wichtig: **kein** `width`/`height` am `<svg>` (kommt aus dem CSS) und
`stroke="currentColor"`, damit das Icon die Farbe des Containers erbt –
Cyan in den Service-Karten, Weiß in den Vorteils-Kreisen.

Ausnahme: In der Chat-Oberfläche (`projekt-check.html`) sind bewusst Emojis
im Einsatz (Avatare, Sende-Pfeil) – dort sind sie Konvention.

## Diktierfunktion (Projekt-Check)

Die Spracheingabe liegt in [assets/js/dictation.js](assets/js/dictation.js),
die Tests dazu in [tests/dictation.test.js](tests/dictation.test.js):

```bash
node tests/dictation.test.js
```

**Bevor jemand daran etwas „vereinfacht":** Man darf die Transkripte aus
`event.results` nicht einfach aneinanderhängen. Desktop-Chrome liefert
disjunkte Segmente, Android und iOS dagegen kumulative – jeder Eintrag
wiederholt den kompletten bisherigen Satz. Aneinanderhängen ergibt dort
„jedes Wort fünfmal hintereinander". Deshalb `appendSmart`, `containsSeq`
und `collapseRuns`. Die Tests decken beide Semantiken ab.

Zum Prüfen am Gerät: `projekt-check.html#micdebug` öffnen – dann erscheint
unten ein Protokoll aller Ereignisse samt Build-Kennung. Mobile Browser
cachen HTML hartnäckig; beim Testen die URL mit `?v=2`, `?v=3` … aufrufen,
sonst debuggt man eine alte Fassung.

Die Web Speech API braucht **HTTPS**; einzige Ausnahme ist `localhost`. Über
`http://` auf einer IP-Adresse im WLAN gibt der Browser das Mikrofon nicht
frei – ein Test vom Handy aus über die Laptop-IP funktioniert deshalb nicht.

## Neue Seite anlegen

1. Eine bestehende Unterseite kopieren (z. B. `vorteile.html`).
2. `<title>`, `<meta name="description">`, `<link rel="canonical">` anpassen.
3. Den Inhalt zwischen `<main>` und `</main>` ersetzen.
4. Den neuen Link in **beiden** Navigationen ergänzen (`.nav-links` und
   `.mobile-nav-links`) – und im Footer sowie in `sitemap.xml`.

Der aktive Menüpunkt wird automatisch markiert (`main.js` vergleicht den
Dateinamen), es ist keine zusätzliche Klasse im HTML nötig.

## Lokal ansehen

```bash
python -m http.server 8000
# → http://localhost:8000
```

Bitte nicht per Doppelklick öffnen (`file://`) – relative Pfade und der
Chat-Fetch funktionieren dann nicht zuverlässig.

## Deployment (GitHub Pages)

Der Workflow `.github/workflows/static.yml` lädt bei jedem Push auf `master`
das komplette Repository nach GitHub Pages hoch. Es ist nichts weiter zu tun:

```bash
git add -A
git commit -m "Website überarbeitet"
git push
```

Nach ein bis zwei Minuten ist die Änderung unter https://www.askconnect.de live.

**Wichtig:**

- Die Datei `CNAME` (Inhalt: `www.askconnect.de`) muss im Repository-Root
  liegen – ohne sie fällt die Seite auf `askconnect-de.github.io` zurück.
- GitHub Pages liefert `kontakt.html` auch unter `/kontakt` aus. Intern
  verlinken wir bewusst mit `.html`, damit die Seiten auch lokal funktionieren.
- `404.html` verwendet absolute Pfade (`/index.html`), weil sie unter beliebigen
  URLs ausgeliefert wird. Beim Kopieren dieser Datei daran denken.
- Bei Strato ist nur die Domain-Weiterleitung bzw. der DNS-Eintrag auf GitHub
  Pages hinterlegt – dort muss für Änderungen an der Website nichts angepasst
  werden.

## Konfigurierbare Endpunkte

| Was | Datei |
|---|---|
| Projekt-Check-Webhook | `assets/js/projekt-check.js` → `CONFIG.webhookUrl` |
| Kontaktformular-Webhook | `assets/js/kontakt.js` → `WEBHOOK_URL` |
| ASKbot-Bubble-Webhook | `assets/js/askbot-widget.js` → `webhookUrl` |

Details zum Projekt-Check: siehe [PROJEKTCHECK_README.md](PROJEKTCHECK_README.md).
