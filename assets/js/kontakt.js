/* ASK CONNECT – Kontaktformular
   Sendet an den bestehenden n8n-Webhook und übernimmt optional
   Prefill + Chatverlauf aus dem Projekt-Check. */
(function () {
    'use strict';

    var WEBHOOK_URL = 'https://n8n-dev.askconnect.de/webhook/d5ff5476-bdea-48c7-b5ac-4711f0ca2798';
    var STORAGE_KEY = 'askconnect_projektcheck';

    var form = document.querySelector('.contact-form');
    if (!form) return;

    var nameField = document.getElementById('input_name');
    var emailField = document.getElementById('input_email');
    var companyField = document.getElementById('input_company');
    var textField = document.getElementById('input_text');
    var historyField = document.getElementById('input_chat_history');
    var note = document.getElementById('formNote');
    var button = form.querySelector('button[type="submit"]');
    var defaultLabel = button.textContent;

    /* ---------- Übernahme aus dem Projekt-Check ---------- */
    (function applyProjektCheck() {
        var raw;
        try {
            raw = sessionStorage.getItem(STORAGE_KEY);
        } catch (e) {
            return;
        }
        if (!raw) return;

        var data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            return;
        }

        /* Name, E-Mail und Betrieb werden bewusst NICHT vorbefüllt – diese
           Angaben sollen den Chat-Assistenten nie erreichen. Sie trägt der
           Besucher hier selbst ein. */
        if (data.ticket) {
            textField.value = 'Projekt-Check-ID: ' + data.ticket;
            if (note) {
                note.textContent = '✓ Ihre Projekt-Check-ID ' + data.ticket + ' wurde übernommen. '
                    + 'Damit ordnen wir Ihr Gespräch zu – ergänzen Sie bitte nur noch Name und E-Mail.';
            }
        } else if (data.lastMessage || data.transcript) {
            /* Notnagel: Der Workflow hat keine ID vergeben. Dann geht die
               Zusammenfassung mit, damit die Anfrage nicht inhaltslos ankommt. */
            textField.value = data.lastMessage || data.transcript;
            historyField.value = data.transcript || '';
            if (note) {
                note.textContent = '✓ Ihr Projekt-Check wurde übernommen. '
                    + 'Bitte ergänzen Sie noch Name und E-Mail.';
            }
        }

        if (note && note.textContent) note.classList.add('show');

        try {
            sessionStorage.removeItem(STORAGE_KEY);
        } catch (e) { /* ignorieren */ }
    })();

    /* ---------- Validierung ----------
       Das Formular trägt `novalidate`, damit wir eigene Meldungen im Stil der
       Seite zeigen können statt der Browser-Sprechblasen. Deshalb muss hier
       auch tatsächlich geprüft werden – sonst ginge alles Leere durch. */
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

    function fieldError(field) {
        var value = field.value.trim();

        if (field.hasAttribute('required') && !value) {
            if (field === nameField) return 'Bitte geben Sie Ihren Namen an.';
            if (field === emailField) return 'Bitte geben Sie Ihre E-Mail-Adresse an.';
            if (field === textField) return 'Bitte beschreiben Sie kurz Ihr Anliegen.';
            return 'Bitte füllen Sie dieses Feld aus.';
        }
        if (field === emailField && value && !EMAIL_RE.test(value)) {
            return 'Diese E-Mail-Adresse sieht nicht vollständig aus.';
        }
        if (field === textField && value && value.length < 10) {
            return 'Ein, zwei Sätze mehr helfen uns weiter.';
        }
        return '';
    }

    function showNote(text, isError) {
        if (!note) return;
        note.textContent = text;
        note.classList.toggle('error', !!isError);
        note.classList.add('show');
    }

    function validate() {
        var firstBad = null;
        var message = '';

        [nameField, emailField, textField].forEach(function (field) {
            var error = fieldError(field);
            field.classList.toggle('invalid', !!error);
            if (error && !firstBad) {
                firstBad = field;
                message = error;
            }
        });

        if (firstBad) {
            showNote(message, true);
            firstBad.focus();
            return false;
        }
        return true;
    }

    /* Beim Verlassen prüfen, beim Tippen die Markierung wieder wegnehmen. */
    [nameField, emailField, companyField, textField].forEach(function (field) {
        field.addEventListener('blur', function () {
            field.classList.toggle('invalid', !!fieldError(field));
        });
        field.addEventListener('input', function () {
            field.classList.remove('invalid');
        });
    });

    /* ---------- Absenden ---------- */
    function resetButton(delay) {
        setTimeout(function () {
            button.textContent = defaultLabel;
            button.style.background = '';
            button.disabled = false;
        }, delay);
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        /* Leere oder unvollständige Angaben gehen gar nicht erst raus. */
        if (!validate()) return;

        button.textContent = 'Wird gesendet…';
        button.style.background = 'linear-gradient(45deg, #28a745, #20c997)';
        button.disabled = true;

        fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: nameField.value,
                email: emailField.value,
                company: companyField.value,
                description: textField.value,
                chat_history: historyField.value || ''
            })
        })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                button.textContent = 'Gesendet! ✓';
                form.reset();
                historyField.value = '';
                showNote('✓ Vielen Dank! Wir melden uns in der Regel innerhalb von 24 Stunden.', false);
                resetButton(2500);
            })
            .catch(function (err) {
                console.error('[Kontakt] Fehler beim Senden:', err);
                button.textContent = 'Ein Fehler ist aufgetreten';
                button.style.background = 'linear-gradient(45deg, #ffc1c1, #ff7a7a)';
                showNote('Das Senden hat nicht geklappt. Schreiben Sie uns gerne direkt an info@askconnect.de.', true);
                resetButton(3000);
            });
    });
})();
