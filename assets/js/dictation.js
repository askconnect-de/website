/* ASK CONNECT – Diktierfunktion (Web Speech API)
   ============================================================================
   Der klassische Fehler bei dieser Schnittstelle: über `event.results` laufen
   und alle Transkripte aneinanderhängen. Das geht NUR in Desktop-Chrome gut.

     Desktop-Chrome  liefert DISJUNKTE Segmente  → aneinanderhängen ist richtig
     Android / iOS   liefern KUMULATIVE Einträge → jeder Eintrag wiederholt den
                     kompletten bisherigen Satz. Aneinanderhängen ergibt dann
                     "jedes Wort fünf- bis sechsmal hintereinander".

   Deshalb wird hier nichts blind angehängt: `appendSmart` überspringt die
   größte Wort-Überlappung, `containsSeq` filtert bereits bekannte
   Zwischenergebnisse, `collapseRuns` ist das letzte Netz. Alle drei sind
   idempotent – dieselbe Eingabe mehrfach verarbeitet ändert nichts.

   Mobile Engines ignorieren außerdem `continuous` und beenden nach jeder
   Sprechpause; der Lebenszyklus startet deshalb selbstständig neu.

   HINWEIS ZUM DATENSCHUTZ: In Chrome läuft die Erkennung über einen Server von
   Google, in Safari über Apple. Die Aufnahme verlässt also das Gerät. Hier
   sollten keine vertraulichen Inhalte diktiert werden – der Hinweis steht auch
   sichtbar unter dem Eingabefeld und in der Datenschutzerklärung.

   TECHNISCH: Die Schnittstelle braucht HTTPS. Einzige Ausnahme ist localhost –
   über http:// auf einer IP-Adresse gibt der Browser das Mikrofon nicht frei.
   ========================================================================== */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ASKDictation = api;
}(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    var BUILD = '2026-07-30.1';

    /* ───────────────── Wort-Werkzeuge ───────────────── */

    function words(text) {
        var t = String(text == null ? '' : text).trim();
        return t ? t.split(/\s+/) : [];
    }

    /* Vergleichsform: Groß-/Kleinschreibung und Satzzeichen sind für die
       Überlappungserkennung egal, die Ausgabe bleibt aber im Original. */
    function normWord(word) {
        return String(word)
            .toLowerCase()
            .replace(/[.,;:!?…"'„“”‚‘’()\[\]{}–—-]/g, '');
    }

    function normList(list) {
        return list.map(normWord);
    }

    function seqEqual(a, aStart, b, bStart, length) {
        for (var i = 0; i < length; i++) {
            if (a[aStart + i] !== b[bStart + i]) return false;
        }
        return true;
    }

    /* Hängt `text` an `acc` an und überspringt dabei die größte Wortfolge, die
       am Ende von `acc` und am Anfang von `text` übereinstimmt.
       appendSmart(x, x) === x – deshalb ist mehrfaches Zustellen harmlos. */
    function appendSmart(acc, text) {
        var accWords = words(acc);
        var newWords = words(text);
        if (!newWords.length) return accWords.join(' ');
        if (!accWords.length) return newWords.join(' ');

        var accNorm = normList(accWords);
        var newNorm = normList(newWords);
        var max = Math.min(accNorm.length, newNorm.length);
        var overlap = 0;

        for (var k = max; k > 0; k--) {
            if (seqEqual(accNorm, accNorm.length - k, newNorm, 0, k)) {
                overlap = k;
                break;
            }
        }

        var rest = newWords.slice(overlap);
        if (!rest.length) return accWords.join(' ');
        return accWords.concat(rest).join(' ');
    }

    /* Steckt `needle` als zusammenhängende Wortfolge in `haystack`? */
    function containsSeq(haystack, needle) {
        var hay = normList(words(haystack));
        var need = normList(words(needle));
        if (!need.length) return true;
        if (need.length > hay.length) return false;

        for (var i = 0; i + need.length <= hay.length; i++) {
            if (seqEqual(hay, i, need, 0, need.length)) return true;
        }
        return false;
    }

    /* Letztes Netz gegen Wiederholungen, die schon INNERHALB eines Transkripts
       stecken. Zwei Durchgänge, Reihenfolge ist wichtig: erst Einzelwörter,
       sonst würde "das das das das" als Zweiergruppe zu "das das" eingedampft.

       Schwellen bewusst unterschiedlich:
         Einzelwort   ab 3 Wiederholungen  ("sehr sehr gut" bleibt erhalten)
         Wortgruppe   ab 2 Wiederholungen  (2–5 Wörter)
       Nur DIREKT aufeinanderfolgende Läufe werden angefasst – ein Wort, das im
       Satz mehrfach vorkommt, bleibt dadurch unangetastet. */
    function collapseRuns(text) {
        var list = words(text);
        if (list.length < 2) return list.join(' ');

        /* Durchgang 1: Einzelwörter ab drei Wiederholungen */
        var pass1 = [];
        var i = 0;
        while (i < list.length) {
            var norm = normWord(list[i]);
            var runs = 1;
            while (i + runs < list.length && norm !== '' && normWord(list[i + runs]) === norm) runs++;
            pass1.push(list[i]);
            i += (runs >= 3) ? runs : 1;
        }

        /* Durchgang 2: Wortgruppen von 5 bis 2 Wörtern ab zwei Wiederholungen */
        var normPass1 = normList(pass1);
        var out = [];
        i = 0;
        while (i < pass1.length) {
            var matched = false;

            for (var size = 5; size >= 2; size--) {
                if (i + size * 2 > pass1.length) continue;

                var reps = 1;
                while (i + (reps + 1) * size <= pass1.length &&
                       seqEqual(normPass1, i, normPass1, i + reps * size, size)) {
                    reps++;
                }

                if (reps >= 2) {
                    for (var j = 0; j < size; j++) out.push(pass1[i + j]);
                    i += reps * size;
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                out.push(pass1[i]);
                i++;
            }
        }

        return out.join(' ');
    }

    /* ───────────────── Zustandsmaschine ─────────────────
       Bewusst ohne DOM, damit die Ereignisverarbeitung testbar bleibt. */

    function createTranscriber(base) {
        var committed = '';        // alle final erkannten Wörter, über Neustarts hinweg
        var lastFinalIndex = -1;   // letzter final verarbeiteter Index DIESER Sitzung
        var baseText = String(base == null ? '' : base).trim();

        function compose(interim) {
            var shown = committed;

            /* Zwischenergebnis nur zeigen, wenn es nicht ohnehin schon
               vollständig in den finalen Wörtern steckt. */
            if (interim && !containsSeq(committed, interim)) {
                shown = appendSmart(committed, interim);
            }

            var cleaned = collapseRuns(shown);

            /* Vorhandener Feldinhalt läuft NIE durch die Filter – der Nutzer
               hat ihn selbst getippt, da wird nichts eingedampft. */
            if (!baseText) return cleaned;
            if (!cleaned) return baseText;
            return baseText + ' ' + cleaned;
        }

        return {
            /* Eine neue Erkennungssitzung beginnt: Indizes zählen wieder ab 0,
               der bereits erkannte Text bleibt aber bestehen. */
            sessionStart: function () {
                lastFinalIndex = -1;
            },

            handleResult: function (event) {
                var results = event && event.results ? event.results : [];
                var length = results.length;

                for (var i = 0; i < length; i++) {
                    var entry = results[i];
                    if (!entry || !entry.isFinal) continue;
                    if (i <= lastFinalIndex) continue;   // schon verarbeitet
                    committed = appendSmart(committed, entry[0] && entry[0].transcript);
                    lastFinalIndex = i;
                }

                /* Nur das jüngste Zwischenergebnis, und nur wenn es NACH dem
                   letzten finalen Eintrag liegt – ältere sind überholt. */
                var interim = '';
                for (var k = length - 1; k >= 0; k--) {
                    if (results[k] && !results[k].isFinal) {
                        if (k > lastFinalIndex) interim = results[k][0] && results[k][0].transcript;
                        break;
                    }
                }

                return compose(interim || '');
            },

            text: function () { return compose(''); },
            committed: function () { return committed; },
            setBase: function (value) { baseText = String(value == null ? '' : value).trim(); },
            reset: function (newBase) {
                committed = '';
                lastFinalIndex = -1;
                baseText = String(newBase == null ? '' : newBase).trim();
            }
        };
    }

    /* ───────────────── Anbindung an die Oberfläche ───────────────── */

    function attach(options) {
        options = options || {};
        var input = options.input;
        var button = options.button;
        var onUpdate = options.onUpdate || function () {};
        var lang = options.lang || 'de-DE';

        var Recognition = (typeof window !== 'undefined') &&
            (window.SpeechRecognition || window.webkitSpeechRecognition);

        if (!Recognition || !input || !button) return null;

        var recognition = new Recognition();
        recognition.lang = lang;
        recognition.continuous = true;      // von mobilen Engines ignoriert
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        var transcriber = createTranscriber('');
        var wantListening = false;          // Wunsch des Nutzers, nicht Zustand der Engine
        var restartTimes = [];              // Zeitstempel der letzten Neustarts
        var lastPointerType = '';
        var debug = createDebugPanel();

        var RESTART_DELAY = 150;            // sofortiges start() wirft InvalidStateError
        var RESTART_MAX = 20;               // pro Zeitfenster
        var RESTART_WINDOW = 10000;

        button.hidden = false;
        if (options.hint) options.hint.hidden = false;

        function paint(text) {
            input.value = text;
            onUpdate(text);
        }

        function setActive(active) {
            button.classList.toggle('recording', active);
            button.setAttribute('aria-pressed', String(active));
            button.setAttribute('aria-label', active ? 'Diktieren beenden' : 'Diktieren starten');
        }

        function mayRestart() {
            var now = Date.now();
            restartTimes = restartTimes.filter(function (t) { return now - t < RESTART_WINDOW; });
            if (restartTimes.length >= RESTART_MAX) return false;
            restartTimes.push(now);
            return true;
        }

        function start() {
            if (wantListening) return;
            wantListening = true;
            restartTimes = [];
            transcriber.reset(input.value);
            setActive(true);
            try {
                recognition.start();
            } catch (err) {
                debug.log('start() fehlgeschlagen: ' + err);
            }
        }

        function stop() {
            if (!wantListening) return;
            wantListening = false;
            setActive(false);
            try {
                recognition.stop();
            } catch (err) {
                debug.log('stop() fehlgeschlagen: ' + err);
            }
        }

        recognition.addEventListener('start', function () {
            transcriber.sessionStart();
            debug.log('onstart');
        });

        recognition.addEventListener('result', function (event) {
            debug.logResult(event);
            paint(transcriber.handleResult(event));
        });

        recognition.addEventListener('end', function () {
            debug.log('onend (wantListening=' + wantListening + ')');
            if (!wantListening) {
                setActive(false);
                return;
            }
            if (!mayRestart()) {
                debug.log('Neustart-Grenze erreicht – Diktat beendet');
                wantListening = false;
                setActive(false);
                return;
            }
            setTimeout(function () {
                if (!wantListening) return;
                try {
                    recognition.start();
                } catch (err) {
                    debug.log('Neustart fehlgeschlagen: ' + err);
                }
            }, RESTART_DELAY);
        });

        recognition.addEventListener('error', function (event) {
            var code = event && event.error;
            debug.log('onerror: ' + code);

            /* Diese beiden sind normal: die Engine hat nur eine Pause erkannt.
               `end` startet gleich von selbst neu. */
            if (code === 'no-speech' || code === 'aborted') return;

            if (code === 'not-allowed' || code === 'service-not-allowed') {
                button.title = 'Mikrofonzugriff wurde blockiert – bitte in den Browsereinstellungen erlauben.';
            }
            wantListening = false;
            setActive(false);
        });

        /* Bedienung: auf dem Touchscreen gedrückt halten, mit der Maus umschalten. */
        button.addEventListener('pointerdown', function (event) {
            lastPointerType = event.pointerType || 'mouse';
            if (lastPointerType !== 'touch' && lastPointerType !== 'pen') return;

            event.preventDefault();          // verhindert den nachgelagerten Geister-Klick
            try {
                button.setPointerCapture(event.pointerId);
            } catch (err) { /* ältere Browser */ }
            start();
        });

        function releasePointer(event) {
            if (lastPointerType !== 'touch' && lastPointerType !== 'pen') return;
            try {
                button.releasePointerCapture(event.pointerId);
            } catch (err) { /* bereits freigegeben */ }
            stop();
        }

        button.addEventListener('pointerup', releasePointer);
        button.addEventListener('pointercancel', releasePointer);

        button.addEventListener('click', function (event) {
            /* Beim Tippen hat pointerdown/-up bereits alles erledigt. */
            if (lastPointerType === 'touch' || lastPointerType === 'pen') {
                event.preventDefault();
                return;
            }
            if (wantListening) stop();
            else start();
        });

        return {
            stop: stop,
            isListening: function () { return wantListening; },
            build: BUILD
        };
    }

    /* ───────────────── Debug-Panel (#micdebug in der URL) ───────────────── */

    function createDebugPanel() {
        var silent = { log: function () {}, logResult: function () {} };
        if (typeof document === 'undefined') return silent;
        if (String(location.hash || '').indexOf('micdebug') === -1) return silent;

        var box = document.createElement('div');
        box.className = 'mic-debug';
        box.innerHTML = '<strong>Diktat-Debug &middot; Build ' + BUILD + '</strong><div class="mic-debug-log"></div>';
        document.body.appendChild(box);
        var log = box.querySelector('.mic-debug-log');

        function write(line) {
            var row = document.createElement('div');
            row.textContent = new Date().toLocaleTimeString() + '  ' + line;
            log.insertBefore(row, log.firstChild);
            while (log.childNodes.length > 60) log.removeChild(log.lastChild);
        }

        return {
            log: write,
            logResult: function (event) {
                var results = event.results || [];
                write('onresult  resultIndex=' + event.resultIndex + '  length=' + results.length);
                for (var i = 0; i < results.length; i++) {
                    write('   [' + i + '] ' + (results[i].isFinal ? 'FINAL  ' : 'interim') +
                          '  "' + (results[i][0] ? results[i][0].transcript : '') + '"');
                }
            }
        };
    }

    return {
        BUILD: BUILD,
        words: words,
        normWord: normWord,
        appendSmart: appendSmart,
        containsSeq: containsSeq,
        collapseRuns: collapseRuns,
        createTranscriber: createTranscriber,
        attach: attach
    };
}));
