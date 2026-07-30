/* Tests für die Diktier-Textlogik.
   Ausführen:  node tests/dictation.test.js

   Die Tests füttern `handleResult` mit nachgebauten Ereignissen und decken
   beide Engine-Semantiken ab: disjunkte Segmente (Desktop-Chrome) und
   kumulative Einträge (Android/iOS). */
'use strict';

var D = require('../assets/js/dictation.js');

var passed = 0;
var failed = 0;

function check(name, actual, expected) {
    if (actual === expected) {
        passed++;
        console.log('  ok   ' + name);
    } else {
        failed++;
        console.log('  FAIL ' + name);
        console.log('       erwartet: "' + expected + '"');
        console.log('       erhalten: "' + actual + '"');
    }
}

function group(name) {
    console.log('\n' + name);
}

/* Baut ein SpeechRecognitionEvent nach.
   entries: [[text, isFinal], ...] */
function makeEvent(entries, resultIndex) {
    var results = entries.map(function (e) {
        return { 0: { transcript: e[0] }, isFinal: !!e[1], length: 1 };
    });
    results.length = entries.length;
    return { resultIndex: resultIndex === undefined ? 0 : resultIndex, results: results };
}

/* ══════════════════ Bausteine ══════════════════ */

group('appendSmart');

check('haengt disjunkten Text an',
    D.appendSmart('das Telefon', 'klingelt staendig'),
    'das Telefon klingelt staendig');

check('ueberspringt Ueberlappung',
    D.appendSmart('das Telefon klingelt', 'Telefon klingelt staendig'),
    'das Telefon klingelt staendig');

check('kumulativer Eintrag wird nicht verdoppelt',
    D.appendSmart('das Telefon klingelt', 'das Telefon klingelt staendig'),
    'das Telefon klingelt staendig');

check('ist idempotent (10x dieselbe Eingabe)', (function () {
    var acc = 'ich bin den ganzen Tag beim Kunden';
    for (var i = 0; i < 10; i++) acc = D.appendSmart(acc, 'den ganzen Tag beim Kunden');
    return acc;
}()), 'ich bin den ganzen Tag beim Kunden');

check('ignoriert Satzzeichen und Grossschreibung beim Vergleich',
    D.appendSmart('Das Telefon klingelt.', 'telefon klingelt staendig'),
    'Das Telefon klingelt. staendig');

check('leerer Zusatz aendert nichts',
    D.appendSmart('das Telefon', ''),
    'das Telefon');

check('leerer Anfang uebernimmt den Zusatz',
    D.appendSmart('', 'das Telefon'),
    'das Telefon');

group('containsSeq');

check('findet enthaltene Wortfolge',
    String(D.containsSeq('ich bin den ganzen Tag beim Kunden', 'den ganzen Tag')),
    'true');

check('erkennt nicht enthaltene Folge',
    String(D.containsSeq('ich bin beim Kunden', 'im Buero')),
    'false');

check('nicht zusammenhaengende Woerter zaehlen nicht',
    String(D.containsSeq('ich bin beim Kunden', 'ich Kunden')),
    'false');

group('collapseRuns');

check('jedes Wort sechsfach -> sauberer Satz',
    D.collapseRuns('das das das das das das Telefon Telefon Telefon Telefon Telefon Telefon klingelt klingelt klingelt klingelt klingelt klingelt'),
    'das Telefon klingelt');

check('wiederholte Wortgruppe wird eingedampft',
    D.collapseRuns('wie geht es wie geht es wie geht es'),
    'wie geht es');

check('normaler Satz bleibt unveraendert',
    D.collapseRuns('ich rufe den Kunden an und der Kunde ruft mich an'),
    'ich rufe den Kunden an und der Kunde ruft mich an');

check('doppeltes Einzelwort bleibt stehen (Schwelle ist 3)',
    D.collapseRuns('das ist sehr sehr wichtig'),
    'das ist sehr sehr wichtig');

check('wiederkehrendes Wort ohne direkte Folge bleibt',
    D.collapseRuns('Termine und Rueckrufe und Termine und Angebote'),
    'Termine und Rueckrufe und Termine und Angebote');

/* ══════════════════ Ereignisverarbeitung ══════════════════ */

group('Desktop-Semantik (disjunkte Segmente)');

(function () {
    var t = D.createTranscriber('');
    t.sessionStart();
    t.handleResult(makeEvent([['ich bin Elektriker', true]], 0));
    t.handleResult(makeEvent([['ich bin Elektriker', true], ['und den ganzen Tag', true]], 1));
    var out = t.handleResult(makeEvent([
        ['ich bin Elektriker', true],
        ['und den ganzen Tag', true],
        ['auf der Baustelle', false]
    ], 2));

    check('letzter Eintrag interim',
        out,
        'ich bin Elektriker und den ganzen Tag auf der Baustelle');
}());

group('Mobile Semantik (kumulative Eintraege)');

(function () {
    var t = D.createTranscriber('');
    t.sessionStart();
    t.handleResult(makeEvent([['ich bin', true]], 0));
    t.handleResult(makeEvent([['ich bin', true], ['ich bin Elektriker', true]], 1));
    var out = t.handleResult(makeEvent([
        ['ich bin', true],
        ['ich bin Elektriker', true],
        ['ich bin Elektriker und verpasse Anrufe', true]
    ], 2));

    check('jeder Eintrag wiederholt den Satz -> kein Wortsalat',
        out,
        'ich bin Elektriker und verpasse Anrufe');
}());

group('Auto-Neustart nach Sprechpause');

(function () {
    var t = D.createTranscriber('');
    t.sessionStart();
    t.handleResult(makeEvent([['das Telefon klingelt', true]], 0));

    /* Engine beendet sich, wir starten neu: results beginnt wieder bei 0 */
    t.sessionStart();
    var out = t.handleResult(makeEvent([['staendig waehrend der Arbeit', true]], 0));

    check('Text der ersten Sitzung bleibt erhalten',
        out,
        'das Telefon klingelt staendig waehrend der Arbeit');
}());

(function () {
    var t = D.createTranscriber('');
    t.sessionStart();
    t.handleResult(makeEvent([['das Telefon klingelt', true]], 0));

    /* Manche Engines wiederholen nach dem Neustart den letzten Satz */
    t.sessionStart();
    var out = t.handleResult(makeEvent([['das Telefon klingelt staendig', true]], 0));

    check('Wiederholung nach Neustart wird nicht verdoppelt',
        out,
        'das Telefon klingelt staendig');
}());

group('Mehrfachzustellung');

(function () {
    var t = D.createTranscriber('');
    t.sessionStart();
    var event = makeEvent([['ich brauche einen Assistenten', true]], 0);

    var out = '';
    for (var i = 0; i < 5; i++) out = t.handleResult(event);

    check('dasselbe finale Ergebnis 5x -> Text bleibt gleich',
        out,
        'ich brauche einen Assistenten');
}());

group('Transkript mit interner Wiederholung');

(function () {
    var t = D.createTranscriber('');
    t.sessionStart();
    var out = t.handleResult(makeEvent([
        ['das das das das das das Telefon Telefon Telefon Telefon Telefon Telefon klingelt klingelt klingelt klingelt klingelt klingelt', true]
    ], 0));

    check('jedes Wort 6x im selben Transkript -> sauberer Satz',
        out,
        'das Telefon klingelt');
}());

group('Vorhandener Feldinhalt');

(function () {
    var t = D.createTranscriber('Guten Tag,');
    t.sessionStart();
    var out = t.handleResult(makeEvent([['ich habe eine Frage', true]], 0));

    check('getippter Text bleibt vorne stehen',
        out,
        'Guten Tag, ich habe eine Frage');
}());

(function () {
    /* Der getippte Text darf NICHT durch collapseRuns laufen */
    var t = D.createTranscriber('Ja ja ja ja ja');
    t.sessionStart();
    var out = t.handleResult(makeEvent([['gut', true]], 0));

    check('getippter Text wird nicht eingedampft',
        out,
        'Ja ja ja ja ja gut');
}());

group('Veraltete Zwischenergebnisse');

(function () {
    var t = D.createTranscriber('');
    t.sessionStart();
    /* Interim an Index 0, danach wird 0 final und 1 kommt dazu */
    t.handleResult(makeEvent([['das Telefon', false]], 0));
    var out = t.handleResult(makeEvent([
        ['das Telefon klingelt', true],
        ['staendig', false]
    ], 0));

    check('ueberholtes Interim wird nicht mitgeschleppt',
        out,
        'das Telefon klingelt staendig');
}());

/* ══════════════════ Ergebnis ══════════════════ */

console.log('\n' + '='.repeat(46));
console.log(passed + ' bestanden, ' + failed + ' fehlgeschlagen');
console.log('='.repeat(46));

process.exit(failed === 0 ? 0 : 1);
