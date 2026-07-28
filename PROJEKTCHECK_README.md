# Projekt-Check – README

Der Projekt-Check ist eine **eigene Seite** (`projekt-check.html`) mit einer
ChatGPT-artigen Chat-Oberfläche. Besucher beschreiben ihr Vorhaben, chatten mit
einem KI-Assistenten (n8n) und übergeben das Ergebnis anschließend an das
bestehende Kontaktformular.

---

## Einrichtung

### 1. Webhook-URL konfigurieren
In `assets/js/projekt-check.js` ganz oben im Block `CONFIG` eintragen:

```js
webhookUrl: 'https://n8n-dev.askconnect.de/webhook/abc123-def456',
```

Die URL ist bereits eingetragen. Zeigt der Chat trotzdem das Fehlerbanner, liegt
es fast immer am Webhook-Node: Steht **Respond** nicht auf „Using 'Respond to
Webhook' Node", antwortet n8n mit einem leeren Body – die Konsole (F12) nennt
dann die genaue Ursache.

### 2. Texte anpassen (optional)
Ebenfalls in `CONFIG`: Begrüßung (`greeting`), die vier Vorschlagskarten
(`suggestions`) und der Fehlertext (`errorText`).

---

## Webhook-Vertrag

### Request (POST an `webhookUrl`)
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "messages": [
    { "role": "user", "content": "Ich möchte einen Chatbot für mein Hotel." },
    { "role": "assistant", "content": "Klingt spannend! ..." },
    { "role": "user", "content": "Ja, für Buchungsanfragen." }
  ],
  "meta": {}
}
```

### Response (Gespräch läuft)
```json
{ "reply": "Das klingt nach einem tollen Projekt!", "done": false }
```

### Response (Gespräch abgeschlossen → Übergabe ans Formular)
```json
{
  "reply": "Perfekt, ich habe alles zusammengefasst.",
  "done": true,
  "prefill": {
    "name": "Max Mustermann",
    "email": "max@hotel.de",
    "company": "Hotel Beispiel",
    "message": "Hotel-Chatbot für Buchungsanfragen, 24/7 Gästekommunikation"
  }
}
```

Sobald `done: true` oder ein `prefill`-Objekt zurückkommt, erscheint in der
Kopfzeile des Chats der Button **„📩 Anfrage absenden"**.

Antworten des Assistenten dürfen einfaches Markdown enthalten: `**fett**`,
`` `code` ``, Aufzählungen (`- …`) und Leerzeilen als Absätze. Alles andere wird
escaped – es gelangt kein fremdes HTML ins DOM.

---

## Übergabe an das Kontaktformular

1. Klick auf **„Anfrage absenden"** legt `{ transcript, prefill }` unter dem
   Schlüssel `askconnect_projektcheck` im `sessionStorage` ab.
2. Weiterleitung auf `kontakt.html?from=projekt-check`.
3. `assets/js/kontakt.js` liest den Eintrag, füllt die Felder vor, schreibt den
   Verlauf ins versteckte Feld `#input_chat_history` und **löscht den
   sessionStorage-Eintrag wieder**.
4. Der Besucher klickt regulär auf „Nachricht senden".

Prefill-Felder: `name` → `#input_name`, `email` → `#input_email`,
`company` → `#input_company`, `message` → `#input_text` (alle optional).

---

## Kontaktformular-Anbindung

Unverändert der bestehende Weg (konfiguriert in `assets/js/kontakt.js`):

- Endpoint: `POST https://n8n-dev.askconnect.de/webhook/d5ff5476-bdea-48c7-b5ac-4711f0ca2798`
- JSON-Body: `{ name, email, company, description, chat_history }`

Es gibt **keinen zweiten Versandweg**.

---

## Abgrenzung zum ASKbot-Widget

| | Projekt-Check | ASKbot (Bubble unten rechts) |
|---|---|---|
| Datei | `assets/js/projekt-check.js` | `assets/js/askbot-widget.js` |
| Darstellung | eigene Seite, ganzseitig | schwebendes Fenster |
| Technik | eigenes Vanilla JS | `@n8n/chat` von jsDelivr |
| Wo aktiv | nur `projekt-check.html` | alle Seiten **außer** `projekt-check.html` |

---

## Architektur

```
Besucher → [Projekt-Check Seite] → POST an n8n-Webhook (KI-Logik)
                                  ← JSON { reply, done, prefill }
          → sessionStorage → [kontakt.html] → POST an bestehenden Webhook
                                              (mit prefill + Chatverlauf)
```

- **Keine Secrets im Frontend** – die KI-API-Keys liegen serverseitig in n8n
- **Keine Build-Abhängigkeiten** – reines Vanilla JS
- **Widget austauschbar** – nur die Webhook-URL ändern
