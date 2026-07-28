/* ASKbot – n8n-Chat-Widget (Bubble unten rechts).
   Wird als <script type="module"> eingebunden.
   Auf projekt-check.html bewusst NICHT geladen, damit dort nur die
   große Chat-Oberfläche sichtbar ist. */
import { createChat } from 'https://cdn.jsdelivr.net/npm/@n8n/chat/dist/chat.bundle.es.js';

createChat({
    webhookUrl: 'https://n8n-test.askconnect.de/webhook/8a9e1387-0bca-4937-9662-e82929c01c42/chat',
    webhookConfig: { method: 'POST', headers: {} },
    target: '#n8n-chat',
    mode: 'window',
    chatInputKey: 'chatInput',
    chatSessionKey: 'sessionId',
    loadPreviousSession: true,
    metadata: {},
    showWelcomeScreen: false,
    defaultLanguage: 'en',
    initialMessages: [
        'Guten Tag! Ich bin ASKbot – stellen Sie mir Ihre Fragen. 👋',
        /* Transparenzhinweis nach Art. 13 DSGVO – siehe datenschutz.html, Abschnitt 4.
           Bot-Nachrichten werden als Markdown gerendert, der Link funktioniert also.
           Der i18n-Eintrag "footer" wäre hier wirkungslos: er erscheint nur auf dem
           Welcome-Screen (per showWelcomeScreen: false deaktiviert) und ohne Links. */
        'Kurzer Hinweis: Ich bin ein KI-Assistent und kann Fehler machen. Ihre Nachrichten werden zur Beantwortung verarbeitet – bitte geben Sie keine sensiblen Daten ein. Mehr dazu im [Datenschutzhinweis](/datenschutz.html).'
    ],
    i18n: {
        en: {
            title: 'ASK CONNECT',
            subtitle: 'Starten Sie einen Chat. Wir sind rund um die Uhr für Sie da.',
            footer: '',
            getStarted: 'New Conversation',
            inputPlaceholder: 'Stellen Sie Ihre Frage…'
        }
    },
    enableStreaming: false
});
