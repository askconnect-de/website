/* ASK CONNECT – Projekt-Check Chat (eigene Seite, ChatGPT-artige Oberfläche)
   Webhook-Vertrag siehe PROJEKTCHECK_README.md */
(function () {
    'use strict';

    /* ═══════════════ KONFIGURATION ═══════════════
       webhookUrl: Production-URL des n8n-Webhook-Nodes (Workflow muss aktiv sein). */
    var CONFIG = {
        webhookUrl: 'https://n8n-dev.askconnect.de/webhook/8c495e3d-cd49-44f5-aaf2-fd211b2085a7',
        greeting: 'Guten Tag! Beschreiben Sie kurz, wie Kundenanfragen bei Ihnen hereinkommen und was am meisten Zeit kostet – ich sage Ihnen, was sich davon automatisieren lässt.',
        suggestions: [
            { title: 'Das Telefon klingelt ständig', text: 'Ich bin den ganzen Tag beim Kunden und verpasse dauernd Anrufe.' },
            { title: 'Immer die gleichen Fragen', text: 'Kunden fragen ständig dasselbe: Preise, Termine, Anfahrt, Notdienst.' },
            { title: 'Anfragen bleiben liegen', text: 'E-Mails und Anfragen über die Website bleiben tagelang liegen, weil abends niemand mehr rangeht.' },
            { title: 'Erstmal verstehen, worum es geht', text: 'Ich weiß noch nicht genau, was mir KI in meinem Betrieb bringen soll. Können Sie das erklären?' }
        ],
        errorText: 'Unser Assistent ist gerade nicht erreichbar.'
    };

    var STORAGE_KEY = 'askconnect_projektcheck';

    /* ═══════════════ STATE ═══════════════ */
    var sessionId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : fallbackUUID();
    var messages = [];
    var isWaiting = false;
    var prefillData = null;

    /* ═══════════════ DOM ═══════════════ */
    var scroller = document.getElementById('chatScroll');
    var thread = document.getElementById('chatThread');
    var welcome = document.getElementById('chatWelcome');
    var greeting = document.getElementById('chatGreeting');
    var suggestionBox = document.getElementById('chatSuggestions');
    var input = document.getElementById('chatInput');
    var sendBtn = document.getElementById('chatSend');
    var errorBox = document.getElementById('chatError');
    var handoverBtn = document.getElementById('chatHandover');
    var resetBtn = document.getElementById('chatReset');

    if (!thread || !input) return;

    /* ═══════════════ HELFER ═══════════════ */
    function fallbackUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function scrollToBottom() {
        window.requestAnimationFrame(function () {
            scroller.scrollTop = scroller.scrollHeight;
        });
    }

    function escapeHtml(str) {
        return str.replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /* Minimales, sicheres Markdown: **fett**, `code`, Listen, Absätze.
       Der Text wird zuerst escaped – es landet kein fremdes HTML im DOM. */
    function renderText(raw) {
        var safe = escapeHtml(raw);
        safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');

        var blocks = safe.split(/\n{2,}/);
        return blocks.map(function (block) {
            var lines = block.split('\n');
            var isList = lines.every(function (l) { return /^\s*([-*•]|\d+\.)\s+/.test(l); });
            if (isList) {
                var items = lines.map(function (l) {
                    return '<li>' + l.replace(/^\s*([-*•]|\d+\.)\s+/, '') + '</li>';
                }).join('');
                return '<ul>' + items + '</ul>';
            }
            return '<p>' + lines.join('<br>') + '</p>';
        }).join('');
    }

    function hideWelcome() {
        if (welcome) welcome.style.display = 'none';
    }

    function addMessage(role, text) {
        messages.push({ role: role, content: text });

        var row = document.createElement('div');
        row.className = 'chat-row ' + (role === 'user' ? 'user' : 'bot');

        var avatar = document.createElement('div');
        avatar.className = 'chat-avatar';
        avatar.textContent = role === 'user' ? '🙋' : '🤖';

        var bubble = document.createElement('div');
        bubble.className = 'chat-bubble';

        var name = document.createElement('div');
        name.className = 'chat-name';
        name.textContent = role === 'user' ? 'Sie' : 'Projekt-Check';

        var body = document.createElement('div');
        body.className = 'chat-text';
        body.innerHTML = renderText(text);

        bubble.appendChild(name);
        bubble.appendChild(body);
        row.appendChild(avatar);
        row.appendChild(bubble);
        thread.appendChild(row);
        scrollToBottom();
    }

    function showTyping(show) {
        var el = document.getElementById('chatTypingRow');
        if (show) {
            if (!el) {
                el = document.createElement('div');
                el.className = 'chat-row bot';
                el.id = 'chatTypingRow';
                el.innerHTML =
                    '<div class="chat-avatar">🤖</div>' +
                    '<div class="chat-bubble"><div class="chat-typing">' +
                    '<div class="chat-dot"></div><div class="chat-dot"></div><div class="chat-dot"></div>' +
                    '</div></div>';
                thread.appendChild(el);
            }
            scrollToBottom();
        } else if (el) {
            el.remove();
        }
    }

    function setWaiting(waiting) {
        isWaiting = waiting;
        input.disabled = waiting;
        sendBtn.disabled = waiting || input.value.trim() === '';
    }

    /* preventScroll: sonst kann der Browser die Seite verschieben, um das
       Eingabefeld "ins Bild" zu holen – auf der Chat-Seite ist das unerwünscht. */
    function focusInput() {
        try {
            input.focus({ preventScroll: true });
        } catch (e) {
            input.focus();
        }
    }

    function autoGrow() {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    }

    /* ═══════════════ WEBHOOK ═══════════════ */
    function sendToWebhook() {
        setWaiting(true);
        showTyping(true);
        errorBox.classList.remove('show');

        fetch(CONFIG.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId, messages: messages.slice(), meta: {} })
        })
            .then(function (res) {
                if (!res.ok) throw new Error('Webhook antwortete mit HTTP ' + res.status);
                /* Erst als Text lesen: n8n liefert bei falsch gesetztem "Respond"
                   einen leeren Body, res.json() würde dann nur "Unexpected end of
                   JSON input" werfen – hier wird die Ursache benannt. */
                return res.text().then(function (raw) {
                    if (!raw.trim()) {
                        throw new Error('Webhook lieferte einen leeren Body. Im n8n-Webhook-Node ' +
                            '"Respond" auf "Using Respond to Webhook Node" stellen und dort ' +
                            '{ "reply": "…", "done": false } zurückgeben.');
                    }
                    try {
                        return JSON.parse(raw);
                    } catch (e) {
                        throw new Error('Antwort ist kein gültiges JSON: ' + raw.slice(0, 200));
                    }
                });
            })
            .then(function (data) {
                if (!data.reply && !data.done && !data.prefill) {
                    throw new Error('Antwort enthält kein Feld "reply": ' + JSON.stringify(data).slice(0, 200));
                }
                showTyping(false);
                if (data.reply) addMessage('assistant', data.reply);
                if (data.done || data.prefill) {
                    prefillData = data.prefill || {};
                    handoverBtn.hidden = false;
                }
                setWaiting(false);
                focusInput();
            })
            .catch(function (err) {
                showTyping(false);
                errorBox.classList.add('show');
                setWaiting(false);
                console.error('[Projekt-Check] Webhook-Fehler:', err);
            });
    }

    function send(text) {
        text = (text || '').trim();
        if (!text || isWaiting) return;
        hideWelcome();
        addMessage('user', text);
        input.value = '';
        autoGrow();
        sendToWebhook();
    }

    /* ═══════════════ ÜBERGABE ANS KONTAKTFORMULAR ═══════════════
       Chatverlauf + Prefill werden im sessionStorage abgelegt und von
       kontakt.html ausgelesen. */
    function buildTranscript() {
        return messages.map(function (m) {
            return (m.role === 'user' ? 'Besucher' : 'Assistent') + ': ' + m.content;
        }).join('\n');
    }

    function handover() {
        var payload = {
            transcript: buildTranscript(),
            prefill: prefillData || {}
        };
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.warn('[Projekt-Check] sessionStorage nicht verfügbar:', e);
        }
        location.href = 'kontakt.html?from=projekt-check';
    }

    /* ═══════════════ START ═══════════════ */
    if (greeting) greeting.textContent = CONFIG.greeting;

    CONFIG.suggestions.forEach(function (s) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chat-suggestion';
        btn.innerHTML = '<span class="s-title"></span><span class="s-text"></span>';
        btn.querySelector('.s-title').textContent = s.title;
        btn.querySelector('.s-text').textContent = s.text;
        btn.addEventListener('click', function () { send(s.text); });
        suggestionBox.appendChild(btn);
    });

    /* ═══════════════ EVENTS ═══════════════ */
    sendBtn.addEventListener('click', function () { send(input.value); });

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send(input.value);
        }
    });

    input.addEventListener('input', function () {
        autoGrow();
        sendBtn.disabled = input.value.trim() === '' || isWaiting;
    });

    handoverBtn.addEventListener('click', handover);

    resetBtn.addEventListener('click', function () {
        messages = [];
        prefillData = null;
        sessionId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : fallbackUUID();
        thread.innerHTML = '';
        handoverBtn.hidden = true;
        errorBox.classList.remove('show');
        if (welcome) welcome.style.display = '';
        scroller.scrollTop = 0;
        focusInput();
    });

    focusInput();
})();
