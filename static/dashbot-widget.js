function initDashbot(options) {

const DASHBOT_BASE_URL = options.backendUrl.replace(/\/chat\/?$/, '');
const root = options.element ? document.querySelector(options.element) : document.body;

let sessionId = null;
let sessionToken = null;
let isChatOpen = false;
let userLocation = null;   // {lat, lon} or null
let locationEnabled = false;
// Reported to the backend so the agent knows WHY there are no coordinates and
// can ask the user to enable location: 'on'|'off'|'denied'|'unavailable'|'timeout'|'unsupported'
let locationStatus = 'off';
// Study mode (server-configured, learned at /session/start): a fixed place the
// Share-location button reports as the user's position instead of asking the
// browser for GPS. null = normal geolocation.
let studyLocation = null;

// ---- Language: UI strings, speech recognition + synthesis language, and
// the answer language the server instructs the agent to use. The user's last
// choice wins, then the host's `language` option, then the browser language.
// Switchable any time from the EN/DE button in the header. ----
let dbLang = null;
try { dbLang = localStorage.getItem('dashbot-lang'); } catch (e) {}
if (dbLang !== 'en' && dbLang !== 'de') {
    dbLang = (options && (options.language === 'de' || options.language === 'en')) ? options.language
           : ((navigator.language || '').toLowerCase().indexOf('de') === 0 ? 'de' : 'en');
}
function sttLang() { return dbLang === 'de' ? 'de-DE' : 'en-US'; }

const T = {
    en: {
        tooltip: 'Ask the Smart City',
        online: 'Online',
        newChat: 'New chat',
        langTitle: 'Language: English — tap for German',
        themeToDark: 'Switch to dark mode',
        themeToLight: 'Switch to light mode',
        voiceOn: 'Voice replies: on',
        voiceOff: 'Voice replies: off',
        welcomeTitle: 'Hey there!',
        welcomeText: "I'm your smart city assistant. Ask me about parking, weather, traffic, campus buildings, routes, and more.",
        qWeather: 'Current weather',      qWeatherQ: "What's the current temperature?",
        qParking: 'Parking status',       qParkingQ: 'Available parking spaces?',
        qBuilding: 'Find a building',     qBuildingQ: 'Where is the library?',
        qDirections: 'Get directions',    qDirectionsQ: 'How do I get to Uni Mensa?',
        qEvents: 'Events today',          qEventsQ: 'What events are happening in Magdeburg today?',
        qLocation: 'Share my location', qLocationStop: 'Stop sharing my location',
        youAreHere: 'You are here',
        placeholder: 'Ask about city data...',
        thinking: 'Dashbot is thinking...',
        thinkingPhrases: [
            '\uD83C\uDF10 Scanning the city...',
            '\uD83D\uDEE3\uFE0F Checking road conditions...',
            '\uD83D\uDCCF Calculating distances...',
            '\uD83D\uDCE1 Reading sensor data...',
            '\uD83C\uDFDB\uFE0F Looking over campus buildings...',
            '\uD83D\uDE97 Analyzing traffic flow...',
            '\uD83C\uDD7F\uFE0F Checking parking availability...',
            '\u26C5 Fetching weather updates...',
            '\uD83D\uDE8B Mapping transit routes...',
            '\u2699\uFE0F Querying smart city systems...',
            '\uD83E\uDDE0 Processing your request...',
            '\uD83D\uDCF6 Connecting to FIWARE sensors...',
            '\uD83D\uDE8A Checking tram schedules...',
            '\u2693 Surveying the Science Harbor...',
            '\uD83D\uDDFA\uFE0F Exploring the map...',
            '\uD83C\uDF21\uFE0F Reading temperatures...'
        ],
        pttTitle: 'Tap to talk — it sends when you stop speaking (or tap again). Holding works too.',
        pttIdle: 'Tap to talk', pttInterrupt: 'Tap to interrupt',
        pttRecording: 'Listening… release to send', pttListeningTap: 'Listening… tap when done',
        pttBusy: 'Transcribing…',
        speakBtn: 'Speak', speakBtnTitle: 'Talk to Dashbot by voice — the chat hides and only the avatar stays',
        speakExit: 'Keyboard', speakThinking: 'Thinking…',
        locOff: 'Share location', locLoading: 'Locating…', locOn: 'Location on', locError: 'No access',
        locTitleOff: 'Tap to share your location', locTitleLoading: 'Getting your position…',
        locTitleOn: 'Location is shared — tap to turn off', locTitleError: 'Location unavailable — tap to retry',
        toastLocOff: 'Location disabled', toastLocOn: 'Location enabled', toastGeoUnsupported: 'Geolocation not supported',
        toastLocErr: 'Location error', toastLocDenied: 'Location permission denied',
        toastLocUnavailable: 'Location unavailable', toastLocTimeout: 'Location request timed out',
        toastMicDenied: 'Microphone permission denied', toastVoiceFailed: 'Voice input failed',
        toastVoiceUnsupported: 'Voice input not supported in this browser', toastTranscribeFailed: 'Transcription failed',
        cStops: 'stops', cTransfer: 'transfer', cTransfers: 'transfers', cDirect: 'Direct',
        cWalkStart: 'walk start', cWalkEnd: 'walk end', cStart: 'Start', cTransferAt: 'Transfer', cArrive: 'Arrive',
        cStopsAlong: function (n) { return n + ' stop' + (n > 1 ? 's' : '') + ' along the way'; },
        cRide: function (n) { return 'ride ' + n + ' stops'; },
        route_walking: 'Walking route', route_cycling: 'Cycling route', route_driving: 'Driving route',
        cTrafficUnit: 'traffic', cTrafficClear: 'Clear traffic', cTrafficSlow: 'Slow traffic', cTrafficHeavy: 'Heavy traffic',
        cFree: 'free', cAirGood: 'Good air', cAirModerate: 'Moderate air', cAirPoor: 'Poor air',
        cDirections: 'Turn-by-turn directions', cLocation: 'Location', cShownOnMap: 'Shown on the map',
        cShowRoute: 'Show this route on the map', cShowPlace: 'Show on the map',
        sDirections: 'Directions there', sDirectionsQ: 'How do I get there?',
        sNearby: "What's nearby?", sNearbyQ: "What's around there?",
        sDirectionsTo: function (n) { return 'Directions to ' + n; },
        sDirectionsToQ: function (n) { return 'How do I get to ' + n + '?'; },
        sNearbyOf: function (n) { return 'Around ' + n; },
        sNearbyOfQ: function (n) { return "What's around " + n + '?'; },
        sParking: 'Parking nearby', sParkingQ: 'Available parking near me?',
        sWeather: 'Weather now', sWeatherQ: "What's the weather right now?",
        errNoAnswer: 'Sorry, I could not generate a response.',
        errConnect: 'Cannot connect to Dashbot. Is the backend running?',
        errGeneric: 'Sorry, something went wrong. Please try again.'
    },
    de: {
        tooltip: 'Frag die Smart City',
        online: 'Online',
        newChat: 'Neuer Chat',
        langTitle: 'Sprache: Deutsch — tippen für Englisch',
        themeToDark: 'Zum dunklen Modus wechseln',
        themeToLight: 'Zum hellen Modus wechseln',
        voiceOn: 'Sprachausgabe: an',
        voiceOff: 'Sprachausgabe: aus',
        welcomeTitle: 'Hallo!',
        welcomeText: 'Ich bin dein Smart-City-Assistent. Frag mich nach Parkplätzen, Wetter, Verkehr, Campus-Gebäuden, Routen und mehr.',
        qWeather: 'Aktuelles Wetter',     qWeatherQ: 'Wie ist das Wetter gerade?',
        qParking: 'Parkplätze',           qParkingQ: 'Wo gibt es gerade freie Parkplätze?',
        qBuilding: 'Gebäude finden',      qBuildingQ: 'Wo ist die Bibliothek?',
        qDirections: 'Weg finden',        qDirectionsQ: 'Wie komme ich zur Uni-Mensa?',
        qEvents: 'Events heute',          qEventsQ: 'Welche Veranstaltungen gibt es heute in Magdeburg?',
        qLocation: 'Standort teilen', qLocationStop: 'Standort nicht mehr teilen',
        youAreHere: 'Du bist hier',
        placeholder: 'Frag nach Stadtdaten…',
        thinking: 'Dashbot denkt nach…',
        thinkingPhrases: [
            '\uD83C\uDF10 Ich schaue in der Stadt nach…',
            '\uD83D\uDEE3\uFE0F Prüfe die Straßenlage…',
            '\uD83D\uDCCF Berechne Entfernungen…',
            '\uD83D\uDCE1 Lese Sensordaten…',
            '\uD83C\uDFDB\uFE0F Sehe mir die Campus-Gebäude an…',
            '\uD83D\uDE97 Analysiere den Verkehr…',
            '\uD83C\uDD7F\uFE0F Prüfe die Parkplätze…',
            '\u26C5 Hole Wetterdaten…',
            '\uD83D\uDE8B Plane die Verbindung…',
            '\u2699\uFE0F Frage die Smart-City-Systeme…',
            '\uD83E\uDDE0 Verarbeite deine Anfrage…',
            '\uD83D\uDCF6 Verbinde mit den FIWARE-Sensoren…',
            '\uD83D\uDE8A Prüfe die Tram-Linien…',
            '\u2693 Schaue im Wissenschaftshafen vorbei…',
            '\uD83D\uDDFA\uFE0F Erkunde die Karte…',
            '\uD83C\uDF21\uFE0F Lese Temperaturen…'
        ],
        pttTitle: 'Tippen zum Sprechen — sendet, wenn du aufhörst zu reden (oder erneut tippst). Halten geht auch.',
        pttIdle: 'Tippen zum Sprechen', pttInterrupt: 'Tippen zum Unterbrechen',
        pttRecording: 'Ich höre… loslassen zum Senden', pttListeningTap: 'Ich höre… tippe, wenn du fertig bist',
        pttBusy: 'Übertrage…',
        speakBtn: 'Sprechen', speakBtnTitle: 'Mit Dashbot sprechen — der Chat wird ausgeblendet, nur der Avatar bleibt',
        speakExit: 'Tastatur', speakThinking: 'Denke nach…',
        locOff: 'Standort teilen', locLoading: 'Suche Position…', locOn: 'Standort aktiv', locError: 'Kein Zugriff',
        locTitleOff: 'Tippen, um deinen Standort zu teilen', locTitleLoading: 'Position wird ermittelt…',
        locTitleOn: 'Standort wird geteilt — tippen zum Ausschalten', locTitleError: 'Standort nicht verfügbar — tippen zum erneuten Versuch',
        toastLocOff: 'Standort deaktiviert', toastLocOn: 'Standort aktiviert', toastGeoUnsupported: 'Standortbestimmung nicht unterstützt',
        toastLocErr: 'Standortfehler', toastLocDenied: 'Standortfreigabe verweigert',
        toastLocUnavailable: 'Standort nicht verfügbar', toastLocTimeout: 'Zeitüberschreitung bei der Standortabfrage',
        toastMicDenied: 'Mikrofonzugriff verweigert', toastVoiceFailed: 'Spracheingabe fehlgeschlagen',
        toastVoiceUnsupported: 'Spracheingabe wird in diesem Browser nicht unterstützt', toastTranscribeFailed: 'Transkription fehlgeschlagen',
        cStops: 'Haltestellen', cTransfer: 'Umstieg', cTransfers: 'Umstiege', cDirect: 'Direkt',
        cWalkStart: 'Fußweg Start', cWalkEnd: 'Fußweg Ziel', cStart: 'Start', cTransferAt: 'Umsteigen', cArrive: 'Ankunft',
        cStopsAlong: function (n) { return n + (n > 1 ? ' Haltestellen' : ' Haltestelle') + ' unterwegs'; },
        cRide: function (n) { return n + ' Haltestellen fahren'; },
        route_walking: 'Zu Fuß', route_cycling: 'Mit dem Rad', route_driving: 'Mit dem Auto',
        cTrafficUnit: 'Verkehr', cTrafficClear: 'Verkehr frei', cTrafficSlow: 'Stockender Verkehr', cTrafficHeavy: 'Starker Verkehr',
        cFree: 'frei', cAirGood: 'Gute Luft', cAirModerate: 'Mäßige Luft', cAirPoor: 'Schlechte Luft',
        cDirections: 'Wegbeschreibung', cLocation: 'Ort', cShownOnMap: 'Auf der Karte markiert',
        cShowRoute: 'Diese Route auf der Karte zeigen', cShowPlace: 'Auf der Karte zeigen',
        sDirections: 'Weg dorthin', sDirectionsQ: 'Wie komme ich dorthin?',
        sNearby: 'Was ist in der Nähe?', sNearbyQ: 'Was gibt es dort in der Nähe?',
        sDirectionsTo: function (n) { return 'Weg zu ' + n; },
        sDirectionsToQ: function (n) { return 'Wie komme ich zu ' + n + '?'; },
        sNearbyOf: function (n) { return 'Rund um ' + n; },
        sNearbyOfQ: function (n) { return 'Was gibt es rund um ' + n + '?'; },
        sParking: 'Parken in der Nähe', sParkingQ: 'Gibt es freie Parkplätze in meiner Nähe?',
        sWeather: 'Wetter jetzt', sWeatherQ: 'Wie ist das Wetter gerade?',
        errNoAnswer: 'Entschuldigung, ich konnte keine Antwort erzeugen.',
        errConnect: 'Keine Verbindung zu Dashbot. Läuft das Backend?',
        errGeneric: 'Entschuldigung, etwas ist schiefgelaufen. Bitte versuch es noch einmal.'
    }
};

function t(key) {
    const table = T[dbLang] || T.en;
    const v = table[key];
    if (v !== undefined) return v;
    return T.en[key] !== undefined ? T.en[key] : key;
}

// The welcome screen's location button is a toggle too, so its label says what
// tapping does now ("Share my location" / "Stop sharing my location") — with a
// fixed "Share" label, a second tap silently turned sharing OFF.
function locQuickLabel(on) {
    return '<span class="q-icon">&#128205;</span> ' + dbEscape(t(on ? 'qLocationStop' : 'qLocation'));
}

// Welcome screen markup in the current language (initial render, reset, and
// a language switch while it is still showing).
function welcomeMarkup() {
    function quick(icon, key) {
        return '<button class="dashbot-quick-btn" data-q="' + dbEscape(t(key + 'Q')) + '">' +
               '<span class="q-icon">' + icon + '</span> ' + dbEscape(t(key)) + '</button>';
    }
    return '<div class="dashbot-welcome" id="dashbotWelcome">' +
        '<div class="dashbot-welcome-icon"></div>' +
        '<h3>' + dbEscape(t('welcomeTitle')) + '</h3>' +
        '<p>' + dbEscape(t('welcomeText')) + '</p>' +
        '<div class="dashbot-quick-actions">' +
            quick('&#127777;', 'qWeather') + quick('&#127359;', 'qParking') +
            quick('&#127963;', 'qBuilding') + quick('&#128587;', 'qDirections') +
            quick('&#127917;', 'qEvents') +
            '<button class="dashbot-quick-btn dashbot-loc-quick' + (locationEnabled ? ' is-on' : '') +
                '" id="dashbotLocQuick" type="button">' + locQuickLabel(locationEnabled) + '</button>' +
        '</div>' +
    '</div>';
}

// ---- Voice state (module functions live below, before the Send section) ----
const SPEAK_ALL_REPLIES = !!(options && options.speakAllReplies); // speak typed turns too
let voiceAvailable = false;     // backend /voice/* proxy configured (learned at /session/start)
let voiceRepliesOn = true;      // master switch (header speaker button, persisted)
let pendingVoiceInput = false;  // the next sendMessage() was initiated by push-to-talk
let pendingSelectedPlace = null; // the next sendMessage() came from a place button: {name, lat, lon}
try { voiceRepliesOn = localStorage.getItem('dashbot-voice') !== 'off'; } catch (e) {}
const DB_SR = window.SpeechRecognition || window.webkitSpeechRecognition;   // browser STT, if any

// ---- Request state: one answer at a time. A new question (typed or spoken)
// aborts the previous request's stream; its text stays, its speech stops. ----
let activeController = null;
let requestSeq = 0;
let speakMode = false;          // speaking mode: chat hidden, only the avatar in the corner
function abortActiveRequest() {
    if (!activeController) return;
    try { activeController.abort(); } catch (e) {}
    activeController = null;
}

//  HTML 
const html = `
<!-- Avatar Button -->
<div class="dashbot-avatar" id="dashbotAvatar">
    <div class="avatar-inner"></div>
    <div class="avatar-status-dot"></div>
    <div class="avatar-tooltip">${t('tooltip')}</div>
</div>

<!-- Chat Side Panel -->
<div class="dashbot-panel" id="dashbotPanel">
    <div class="dashbot-panel-header">
        <div class="dashbot-header-left">
            <div class="dashbot-header-avatar"></div>
            <div class="dashbot-header-info">
                <h2>Dashbot</h2>
                <span class="dashbot-header-status"><span class="dot"></span> ${t('online')}</span>
            </div>
        </div>
        <div class="dashbot-header-actions">
            <button class="dashbot-lang-btn" id="dashbotLangBtn" type="button" title="${t('langTitle')}">${dbLang.toUpperCase()}</button>
            <button class="dashbot-speaker-btn" id="dashbotSpeakerBtn" title="Voice replies"></button>
            <button class="dashbot-theme-btn" id="dashbotThemeBtn" title="Toggle dark mode"></button>
            <button class="dashbot-reset-btn" id="dashbotResetBtn" title="${t('newChat')}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38L21.5 8"/>
                </svg>
            </button>
            <button class="dashbot-close-btn" id="dashbotCloseBtn">&times;</button>
        </div>
    </div>

    <div class="dashbot-messages" id="dashbotMessages">
        ${welcomeMarkup()}
    </div>

    <div class="dashbot-typing" id="dashbotTyping">
        <div class="db-typing-wave"><span></span><span></span><span></span><span></span><span></span></div>
        <span class="dashbot-typing-text">${t('thinking')}</span>
    </div>

    <div class="dashbot-input-area">
        <div class="dashbot-context-bar">
            <button class="dashbot-speak-btn" id="dashbotSpeakBtn" type="button" title="${t('speakBtnTitle')}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                </svg>
                <span class="db-speak-label">${t('speakBtn')}</span>
            </button>
            <button class="dashbot-location-btn location-off" id="dashbotLocationBtn" type="button" title="${t('locTitleOff')}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                </svg>
                <span class="db-loc-label">${t('locOff')}</span>
            </button>
        </div>
        <div class="dashbot-input-wrap">
            <input type="text" class="dashbot-input" id="dashbotInput" placeholder="${t('placeholder')}" autocomplete="off">
            <button class="dashbot-send-btn" id="dashbotSendBtn">
                <svg id="dashbotSendIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
            </button>
        </div>
    </div>

</div>

<!-- Speaking mode: the chat slides away and ONLY the avatar stays in the
     screen corner. HOLD the avatar to talk, release to send; the answer is
     spoken. A hint pill names the state, a Keyboard pill returns to chat.
     The transcript still accumulates in the hidden chat DOM. -->
<div class="dashbot-speakmode" id="dashbotSpeakMode">
    <button class="dashbot-speak-exit" id="dashbotSpeakExit" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="6" width="20" height="12" rx="2"/>
            <path d="M6 10h0M10 10h0M14 10h0M18 10h0M6 14h0M18 14h0"/><path d="M9 14h6"/>
        </svg>
        <span class="db-speak-exit-label">${t('speakExit')}</span>
    </button>
    <div class="dashbot-speak-stage" id="dashbotSpeakStage" role="button" tabindex="0" title="${t('pttTitle')}" aria-label="${t('pttIdle')}">
        <div class="dashbot-voice-ring"></div>
        <div class="dashbot-voice-avatar"></div>
    </div>
    <div class="dashbot-speak-hint" id="dashbotSpeakHint">${t('pttIdle')}</div>
</div>
`;

root.insertAdjacentHTML('beforeend', html);

// ---- DOM refs ----
const avatar      = document.getElementById('dashbotAvatar');
const panel       = document.getElementById('dashbotPanel');
const closeBtn    = document.getElementById('dashbotCloseBtn');
const messages    = document.getElementById('dashbotMessages');
const input       = document.getElementById('dashbotInput');
const sendBtn     = document.getElementById('dashbotSendBtn');
const typing      = document.getElementById('dashbotTyping');
const resetBtn    = document.getElementById('dashbotResetBtn');
const locationBtn = document.getElementById('dashbotLocationBtn');
const themeBtn    = document.getElementById('dashbotThemeBtn');
const speakBtn    = document.getElementById('dashbotSpeakBtn');
const speakModeEl = document.getElementById('dashbotSpeakMode');
const speakStage  = document.getElementById('dashbotSpeakStage');
const speakExit   = document.getElementById('dashbotSpeakExit');
const speakHint   = document.getElementById('dashbotSpeakHint');
const langBtn     = document.getElementById('dashbotLangBtn');
const speakerBtn  = document.getElementById('dashbotSpeakerBtn');

// The widget usually mounts INSIDE the dashboard's Leaflet map container, so
// wheel/drag events over the chat bubble up to Leaflet — the MAP zooms and the
// chat never scrolls. Cut the bubbling at the widget boundary (Leaflet's own
// helpers when the map is present, plain stopPropagation otherwise).
[panel, avatar, speakModeEl].forEach(function (el) {
    if (!el) return;
    if (window.L && L.DomEvent) {
        try {
            L.DomEvent.disableScrollPropagation(el);
            L.DomEvent.disableClickPropagation(el);
        } catch (e) {}
    }
    ['wheel', 'touchmove', 'dblclick', 'mousedown'].forEach(function (t) {
        el.addEventListener(t, function (e) { e.stopPropagation(); });
    });
});

// Quick-action buttons (the data-q ones send a canned question; the location
// one shares position). Re-bound after a chat reset, which restores this HTML.
function bindWelcomeButtons() {
    document.querySelectorAll('.dashbot-quick-btn[data-q]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const q = btn.getAttribute('data-q');
            if (q) { input.value = q; sendMessage(); }
        });
    });
    const locQuick = document.getElementById('dashbotLocQuick');
    if (locQuick) locQuick.addEventListener('click', toggleLocation);
}
bindWelcomeButtons();

// ---- Session ----
// Mint a fresh session token. Returns true on success. On failure we leave the
// existing session vars untouched (don't poison them with a fake id) and let the
// caller surface a connection error.
async function startSession() {
    try {
        const res = await fetch(DASHBOT_BASE_URL + '/session/start', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        sessionId = data.session_id;
        sessionToken = data.session_token;
        // Server says whether the ElevenLabs proxy is configured; without it
        // spoken replies are silent and server-side STT is hidden.
        voiceAvailable = !!data.voice;
        studyLocation = (data.study_location && data.study_location.lat != null) ? data.study_location : null;
        updateSpeakVisibility();
        // Per-tab persistence: survives a RELOAD, dies with the tab. Without
        // this, every refresh minted a fresh session and wiped the
        // conversation history ("it forgets stuff" after each reload).
        try {
            sessionStorage.setItem('dashbot-session', JSON.stringify(
                { id: sessionId, token: sessionToken, voice: voiceAvailable, study: studyLocation }));
        } catch (e) {}
        return true;
    } catch (e) {
        console.warn('Dashbot: could not start session', e);
        return false;
    }
}

// Restore the tab's session across reloads. If it expired server-side in the
// meantime (30 min idle) or the server restarted, the 401/404 recovery in
// sendMessage transparently re-mints one. No unload teardown: the server's
// own idle TTL is the cleanup, so a reload keeps the conversation going.
try {
    const saved = JSON.parse(sessionStorage.getItem('dashbot-session') || 'null');
    if (saved && saved.id && saved.token) {
        sessionId = saved.id;
        sessionToken = saved.token;
        voiceAvailable = !!saved.voice;
        studyLocation = saved.study || null;
        updateSpeakVisibility();
        // Study mode is server state that changes with a restart (a different
        // .env): refresh it for the restored session without minting a new one.
        fetch(DASHBOT_BASE_URL + '/status')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (st) {
                if (!st) return;
                studyLocation = (st.study_location && st.study_location.lat != null) ? st.study_location : null;
                try {
                    sessionStorage.setItem('dashbot-session', JSON.stringify(
                        { id: sessionId, token: sessionToken, voice: voiceAvailable, study: studyLocation }));
                } catch (e) {}
            })
            .catch(function () {});
    }
} catch (e) {}
if (!sessionId) startSession();

// ---- Open / Close ----
function openChat() {
    isChatOpen = true;
    panel.classList.add('open');
    avatar.classList.add('hidden');
    if (!speakMode) input.focus();
}

function closeChat() {
    isChatOpen = false;
    if (speakMode) exitSpeakMode(false);   // next open starts in the chat view
    panel.classList.remove('open');
    avatar.classList.remove('hidden');
    // Nothing keeps talking off-screen: drop a held recording, stop playback.
    pttCancel();
    speech.stopAll();
}

async function resetChat() {
    // Clear backend history
    if (sessionId) {
        try {
            await fetch(DASHBOT_BASE_URL + '/chat/reset', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(sessionToken ? { 'X-Session-Token': sessionToken } : {})
                },
                body: JSON.stringify({ session_id: sessionId })
            });
        } catch (_) {}
    }
    // Clear UI messages and restore welcome
    messages.innerHTML = welcomeMarkup();
    // Re-bind welcome quick-actions (incl. the Share-my-location button)
    bindWelcomeButtons();
    hideTyping();
    setLoading(false);
    pttCancel();
    abortActiveRequest();
    speech.stopAll();
}

avatar.addEventListener('click', openChat);
closeBtn.addEventListener('click', closeChat);
resetBtn.addEventListener('click', resetChat);

// ---- Theme (light default; opt-in dark, remembered per browser) ----
const DB_MOON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const DB_SUN_SVG  = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';

function applyTheme(theme) {
    const dark = theme === 'dark';
    document.documentElement.classList.toggle('dashbot-dark', dark);
    if (themeBtn) {
        themeBtn.innerHTML = dark ? DB_SUN_SVG : DB_MOON_SVG;
        themeBtn.title = dark ? t('themeToLight') : t('themeToDark');
    }
}

function initTheme() {
    let t = null;
    try { t = localStorage.getItem('dashbot-theme'); } catch (e) {}
    if (t !== 'dark' && t !== 'light') {
        t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    applyTheme(t);
}

function toggleTheme() {
    const next = document.documentElement.classList.contains('dashbot-dark') ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('dashbot-theme', next); } catch (e) {}
}

initTheme();
if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

// ---- Avatar "listening" glow while the user is typing ----
input.addEventListener('focus', function () { panel.classList.add('listening'); });
input.addEventListener('blur',  function () { panel.classList.remove('listening'); });

// ---- Location ----
var locationUIState = 'off';
function updateLocationButton(state) {
    locationUIState = state;
    locationBtn.classList.remove('location-off', 'location-loading', 'location-on', 'location-error');
    locationBtn.classList.add('location-' + state);
    // The label IS the affordance: say what tapping does (off) or what the
    // current state is (on/loading), not just tint an icon.
    var labels = { off: t('locOff'), loading: t('locLoading'), on: t('locOn'), error: t('locError') };
    var titles = { off: t('locTitleOff'), loading: t('locTitleLoading'), on: t('locTitleOn'), error: t('locTitleError') };
    var label = locationBtn.querySelector('.db-loc-label');
    if (label) label.textContent = labels[state] || labels.off;
    locationBtn.title = titles[state] || titles.off;
    var quick = document.getElementById('dashbotLocQuick');
    if (quick) {
        quick.classList.toggle('is-on', state === 'on');
        quick.innerHTML = locQuickLabel(state === 'on');
    }
}

function showLocationToast(msg) {
    var toast = document.createElement('div');
    toast.className = 'dashbot-location-toast';
    toast.textContent = msg;
    messages.appendChild(toast);
    scrollToBottom();
    setTimeout(function() {
        toast.style.opacity = '0';
        setTimeout(function() { toast.remove(); }, 300);
    }, 2000);
}

// "You are here" on the host map while location is shared (a blue dot, plus
// the browser's accuracy circle when it's known): routes and "near me"
// answers are relative to this point, so the user can see what the bot
// assumes. Kept apart from the per-answer overlay, which every question clears.
let userLocLayer = null;
function showUserLocation(loc, accuracyM) {
    hideUserLocation();
    const m = getLeafletMap();
    if (!m || !window.L || !loc) return;
    try {
        const layers = [];
        if (accuracyM && accuracyM > 25 && accuracyM < 3000) {
            layers.push(L.circle([loc.lat, loc.lon], {
                radius: accuracyM, color: '#2563eb', weight: 1, opacity: 0.4,
                fillColor: '#3b82f6', fillOpacity: 0.08, interactive: false
            }));
        }
        const me = L.marker([loc.lat, loc.lon], {
            icon: L.divIcon({ className: 'db-me', html: '<div class="db-me-dot"></div>',
                              iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10] }),
            zIndexOffset: 500, keyboard: false
        });
        me.bindPopup(dbEscape(t('youAreHere') + (studyLocation && studyLocation.name ? ' — ' + studyLocation.name : '')));
        layers.push(me);
        userLocLayer = L.layerGroup(layers).addTo(m);
        if (!m.getBounds().contains([loc.lat, loc.lon])) m.panTo([loc.lat, loc.lon]);
    } catch (e) {}
}
function hideUserLocation() {
    const m = getLeafletMap();
    try { if (m && userLocLayer) m.removeLayer(userLocLayer); } catch (e) {}
    userLocLayer = null;
}

function toggleLocation() {
    if (locationEnabled) {
        userLocation = null;
        locationEnabled = false;
        locationStatus = 'off';
        updateLocationButton('off');
        hideUserLocation();
        showLocationToast(t('toastLocOff'));
        return;
    }
    if (studyLocation) {
        // Study mode: the server pins the position to one known place, so
        // "sharing" is instant and never depends on indoor GPS or a permission
        // prompt. The server anchors every turn there anyway; this keeps the
        // button's state and the request consistent with that.
        userLocation = { lat: studyLocation.lat, lon: studyLocation.lon };
        locationEnabled = true;
        locationStatus = 'on';
        updateLocationButton('on');
        showUserLocation(userLocation, null);
        showLocationToast(t('toastLocOn'));
        return;
    }
    if (!navigator.geolocation) {
        locationStatus = 'unsupported';
        updateLocationButton('error');
        showLocationToast(t('toastGeoUnsupported'));
        setTimeout(function() { updateLocationButton('off'); }, 3000);
        return;
    }
    updateLocationButton('loading');
    navigator.geolocation.getCurrentPosition(
        function(pos) {
            userLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
            locationEnabled = true;
            locationStatus = 'on';
            updateLocationButton('on');
            showUserLocation(userLocation, pos.coords.accuracy);
            showLocationToast(t('toastLocOn'));
        },
        function(err) {
            var msg = t('toastLocErr');
            locationStatus = 'unavailable';
            if (err.code === 1) { msg = t('toastLocDenied'); locationStatus = 'denied'; }
            else if (err.code === 2) { msg = t('toastLocUnavailable'); locationStatus = 'unavailable'; }
            else if (err.code === 3) { msg = t('toastLocTimeout'); locationStatus = 'timeout'; }
            updateLocationButton('error');
            showLocationToast(msg);
            setTimeout(function() { updateLocationButton('off'); }, 3000);
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

locationBtn.addEventListener('click', toggleLocation);

// ---- Helpers ----
function scrollToBottom() { messages.scrollTop = messages.scrollHeight; }

var typingTextEl = typing.querySelector('.dashbot-typing-text');
var typingInterval = null;

function showTyping() {
    typing.classList.add('show');
    panel.classList.add('thinking');
    var phrases = t('thinkingPhrases');
    var idx = Math.floor(Math.random() * phrases.length);
    typingTextEl.textContent = phrases[idx];
    typingInterval = setInterval(function() {
        idx = (idx + 1) % phrases.length;
        typingTextEl.style.opacity = '0';
        setTimeout(function() {
            typingTextEl.textContent = phrases[idx];
            typingTextEl.style.opacity = '1';
        }, 200);
    }, 2000);
    scrollToBottom();
}

function hideTyping() {
    typing.classList.remove('show');
    panel.classList.remove('thinking');
    if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }
}

// Pin the typing indicator to one phrase (stops the rotating placeholders).
// Used by voice mode so the SPOKEN acknowledgment and the on-screen status
// say the same thing while the agent works.
function pinTypingText(text) {
    if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }
    typingTextEl.style.opacity = '1';
    typingTextEl.textContent = '🎙️ ' + stripAudioTags(text);
}

function setLoading(on) {
    // Busy state just dims the (disabled) send button — no spinner. The
    // "Checking…" typing indicator already shows the assistant is working.
    sendBtn.disabled = on;
    refreshSpeakUI();   // speaking mode: the avatar ring shows "thinking"
}

// ElevenLabs v3 audio tags ([sighs], [pause]) the voice-mode agent emits.
// They are for the EARS only — strip from anything rendered. `(?!\()`
// spares markdown links [text](url).
var DB_AUDIO_TAG_RE = /\[[a-zA-Z][a-zA-Z ]{0,28}\](?!\()/g;
function stripAudioTags(text) {
    if (!text || text.indexOf('[') === -1) return text;
    return text.replace(DB_AUDIO_TAG_RE, '').replace(/  +/g, ' ');
}

// Light formatter for streaming — only safe inline transforms, no structure detection
function formatStreaming(content) {
    if (!content) return content;
    var f = stripAudioTags(content);
    // URLs
    f = f.replace(/(https:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" class="map-link">View Location</a>');
    // Bold markdown
    f = f.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Newlines → <br>
    f = f.replace(/\n/g, '<br>');
    return f;
}

function formatBotMessage(content) {
    if (!content) return content;

    // --- Inline transformations (URLs, bold, italic) ---
    var f = stripAudioTags(content);
    f = f.replace(/(https:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener" class="map-link">$1</a>');
    f = f.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // italic: match single * but not ** (already handled)
    f = f.replace(/(^|[\s(])\*(?!\*)([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');

    // --- Block parsing: paragraphs, bullet lists, numbered lists ---
    var rawLines = f.split('\n');
    var blocks = [];
    var current = null;

    function flush() {
        if (current && current.lines.length) blocks.push(current);
        current = null;
    }

    for (var i = 0; i < rawLines.length; i++) {
        var line = rawLines[i].trim();
        if (!line) { flush(); continue; }

        var mBullet = /^[-•]\s+(.*)$/.exec(line);
        var mNum = /^\d+\.\s+(.*)$/.exec(line);

        if (mBullet) {
            if (!current || current.type !== 'ul') { flush(); current = { type: 'ul', lines: [] }; }
            current.lines.push(mBullet[1]);
        } else if (mNum) {
            if (!current || current.type !== 'ol') { flush(); current = { type: 'ol', lines: [] }; }
            current.lines.push(mNum[1]);
        } else {
            if (!current || current.type !== 'p') { flush(); current = { type: 'p', lines: [] }; }
            current.lines.push(line);
        }
    }
    flush();

    // --- Inline highlights for times, distances, temperatures ---
    function highlight(text) {
        text = text.replace(/\b(\d+\.?\d*)\s*(minutes?|min|hours?|hrs?)\b/gi, '<span class="db-pill db-pill-time">$1 $2</span>');
        text = text.replace(/\b(\d+\.?\d*)\s*(meters?|m|km|kilometres?|kilometers?)\b(?!\w)/gi, '<span class="db-pill db-pill-dist">$1 $2</span>');
        text = text.replace(/\b(-?\d+\.?\d*)\s*°\s*(C|F)\b/gi, '<span class="db-pill db-pill-temp">$1°$2</span>');
        return text;
    }

    // --- Render ---
    var html = '';
    for (var b = 0; b < blocks.length; b++) {
        var blk = blocks[b];
        if (blk.type === 'ul') {
            html += '<ul class="db-list">';
            for (var j = 0; j < blk.lines.length; j++) html += '<li>' + highlight(blk.lines[j]) + '</li>';
            html += '</ul>';
        } else if (blk.type === 'ol') {
            html += '<ol class="db-list">';
            for (var j = 0; j < blk.lines.length; j++) html += '<li>' + highlight(blk.lines[j]) + '</li>';
            html += '</ol>';
        } else {
            html += '<p class="db-para">' + blk.lines.map(highlight).join(' ') + '</p>';
        }
    }

    return html || content;
}

function now() {
    return new Date().toLocaleTimeString(dbLang === 'de' ? 'de-DE' : 'en-US', { hour: '2-digit', minute: '2-digit' });
}

// ---- Messages ----
function addMessage(content, isUser) {
    const div = document.createElement('div');
    div.className = 'dashbot-msg ' + (isUser ? 'user' : 'bot with-avatar');

    const bubble = document.createElement('div');
    bubble.className = 'dashbot-bubble';
    bubble.innerHTML = isUser ? content : formatBotMessage(content);

    const time = document.createElement('div');
    time.className = 'dashbot-msg-time';
    time.textContent = now();

    bubble.appendChild(time);

    if (!isUser) {
        var botAvatar = document.createElement('div');
        botAvatar.className = 'db-bot-avatar';
        div.appendChild(botAvatar);
    }
    div.appendChild(bubble);
    messages.appendChild(div);

    // remove welcome
    const w = document.getElementById('dashbotWelcome');
    if (w) w.remove();

    scrollToBottom();
}

function addStreamingMessage() {
    const div = document.createElement('div');
    div.className = 'dashbot-msg bot with-avatar';

    const botAvatar = document.createElement('div');
    botAvatar.className = 'db-bot-avatar';

    const bubble = document.createElement('div');
    bubble.className = 'dashbot-bubble';

    const textContainer = document.createElement('div');
    textContainer.className = 'db-bubble-text';

    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'db-cards';

    // Text first, cards below — cards are appended after response finishes.
    bubble.appendChild(textContainer);
    bubble.appendChild(cardsContainer);

    const time = document.createElement('div');
    time.className = 'dashbot-msg-time';
    time.textContent = now();

    div.appendChild(botAvatar);
    div.appendChild(bubble);
    messages.appendChild(div);

    const w = document.getElementById('dashbotWelcome');
    if (w) w.remove();

    // Return textContainer as `bubble` so existing innerHTML assignments target the
    // text area only — the cards container above them is preserved.
    // `outerBubble` exposes the outer .dashbot-bubble for class toggles (e.g. is-streaming).
    // `msg` is the whole row (for appending suggestion chips); `botAvatar` is the orb
    // (toggled to "speaking" while tokens stream).
    return { bubble: textContainer, time, cardsContainer, outerBubble: bubble, msg: div, botAvatar };
}

// ---- Info card rendering ----
function dbEscape(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function dbFmtDist(m) {
    if (m == null) return '';
    if (m < 1000) return Math.round(m) + ' m';
    return (m / 1000).toFixed(1) + ' km';
}

function dbFmtDur(s) {
    if (s == null) return '';
    if (s < 60) return Math.round(s) + ' s';
    const min = Math.round(s / 60);
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60);
    const mm = min % 60;
    return h + 'h ' + (mm ? mm + 'm' : '');
}

function renderTransitCard(card) {
    const segments = card.segments || [];
    const transfers = card.total_transfers || 0;

    // Metric strip
    const metrics = [];
    metrics.push('<span class="db-metric"><span class="db-metric-val">' + (card.total_stops || 0) + '</span><span class="db-metric-unit">' + t('cStops') + '</span></span>');
    if (transfers > 0) {
        metrics.push('<span class="db-metric db-metric-warn"><span class="db-metric-val">' + transfers + '</span><span class="db-metric-unit">' + (transfers > 1 ? t('cTransfers') : t('cTransfer')) + '</span></span>');
    } else {
        metrics.push('<span class="db-metric db-metric-ok"><span class="db-metric-val">' + t('cDirect') + '</span></span>');
    }
    if (card.origin_walk_m) {
        metrics.push('<span class="db-metric"><span class="db-metric-val">' + dbFmtDist(card.origin_walk_m) + '</span><span class="db-metric-unit">' + t('cWalkStart') + '</span></span>');
    }
    if (card.destination_walk_m) {
        metrics.push('<span class="db-metric"><span class="db-metric-val">' + dbFmtDist(card.destination_walk_m) + '</span><span class="db-metric-unit">' + t('cWalkEnd') + '</span></span>');
    }

    // Timeline
    const rows = [];
    // Origin
    const originName = (segments[0] && segments[0].from) || card.origin_stop || card.origin || '';
    rows.push(
        '<div class="db-tl-item db-tl-start">' +
            '<div class="db-tl-marker"><div class="db-tl-dot"></div></div>' +
            '<div class="db-tl-body">' +
                '<div class="db-tl-name">' + dbEscape(originName) + '</div>' +
                '<div class="db-tl-sub">' + t('cStart') + '</div>' +
            '</div>' +
        '</div>'
    );

    segments.forEach(function(s, i) {
        const isBus = /bus/i.test(s.line || '');
        const icon = isBus ? '\uD83D\uDE8C' : '\uD83D\uDE8B';
        const badgeClass = isBus ? 'db-tl-badge db-line-bus' : 'db-tl-badge';
        const intermediate = (s.stops || []).slice(1, -1); // exclude from/to
        const stopsList = intermediate.length
            ? '<details class="db-tl-stops">' +
                '<summary>' + t('cStopsAlong')(intermediate.length) + '</summary>' +
                '<ol>' + intermediate.map(function(st) { return '<li>' + dbEscape(st) + '</li>'; }).join('') + '</ol>' +
              '</details>'
            : '';
        rows.push(
            '<div class="db-tl-item db-tl-segment">' +
                '<div class="db-tl-marker"><div class="db-tl-connector"></div></div>' +
                '<div class="db-tl-body">' +
                    '<span class="' + badgeClass + '">' + icon + ' ' + dbEscape(s.line || '') + '</span>' +
                    (s.direction ? '<div class="db-tl-dir"><span class="db-tl-dir-arrow">\u2192</span>' + dbEscape(s.direction) + (s.num_stops ? ' \u00B7 ' + t('cRide')(s.num_stops) : '') + '</div>' : '') +
                    stopsList +
                '</div>' +
            '</div>'
        );

        // Transfer marker between segments (intermediate stop is also the next from)
        if (i < segments.length - 1) {
            rows.push(
                '<div class="db-tl-item db-tl-transfer">' +
                    '<div class="db-tl-marker"><div class="db-tl-dot"></div></div>' +
                    '<div class="db-tl-body">' +
                        '<div class="db-tl-name">' + dbEscape(s.to || '') + '</div>' +
                        '<div class="db-tl-sub">' + t('cTransferAt') + '</div>' +
                    '</div>' +
                '</div>'
            );
        }
    });

    // Destination
    const destName = (segments.length && segments[segments.length - 1].to) || card.destination_stop || card.destination || '';
    rows.push(
        '<div class="db-tl-item db-tl-end">' +
            '<div class="db-tl-marker"><div class="db-tl-dot db-tl-dot-end"></div></div>' +
            '<div class="db-tl-body">' +
                '<div class="db-tl-name">' + dbEscape(destName) + '</div>' +
                '<div class="db-tl-sub">' + t('cArrive') + '</div>' +
            '</div>' +
        '</div>'
    );

    return '<div class="db-card db-card-transit">' +
        '<div class="db-card-head">' +
            '<div class="db-card-title">' +
                '<span class="db-card-icon">\uD83D\uDE8F</span>' +
                '<span>' + dbEscape(card.origin || '') + ' \u2192 ' + dbEscape(card.destination || '') + '</span>' +
            '</div>' +
        '</div>' +
        '<div class="db-metrics">' + metrics.join('') + '</div>' +
        '<div class="db-timeline">' + rows.join('') + '</div>' +
    '</div>';
}

function renderRouteCard(card) {
    const icons = { walking: '\uD83D\uDEB6', cycling: '\uD83D\uDEB4', driving: '\uD83D\uDE97' };
    const modeLabel = t('route_' + (card.mode || ''));
    const dirs = (card.directions || []).slice(0, 8).map(function(d) {
        const text = typeof d === 'string' ? d : (d.instruction || d.text || d.message || '');
        return text ? '<li>' + dbEscape(text) + '</li>' : '';
    }).filter(Boolean).join('');

    const metrics = [];
    if (card.distance_m != null) {
        metrics.push('<span class="db-metric"><span class="db-metric-val">' + dbFmtDist(card.distance_m) + '</span></span>');
    }
    if (card.duration_s != null) {
        metrics.push('<span class="db-metric"><span class="db-metric-val">' + dbFmtDur(card.duration_s) + '</span></span>');
    }
    if (card.traffic_delay_s) {
        metrics.push('<span class="db-metric db-metric-warn"><span class="db-metric-val">+' + dbFmtDur(card.traffic_delay_s) + '</span><span class="db-metric-unit">' + t('cTrafficUnit') + '</span></span>');
    }

    // ---- Live real-time chips: driving \u2192 traffic + parking;
    //      walking/cycling \u2192 air quality + weather ----
    var live = [];

    if (card.congestion) {
        var cMap = { clear: [t('cTrafficClear'), 'db-live-ok'], moderate: [t('cTrafficSlow'), 'db-live-warn'], heavy: [t('cTrafficHeavy'), 'db-live-bad'] };
        var c = cMap[card.congestion] || [card.congestion, ''];
        live.push('<span class="db-live-chip ' + c[1] + '">\uD83D\uDEA6 ' + c[0] + '</span>');
    }
    if (card.parking && card.parking.free != null) {
        var pTxt = '\uD83C\uDD7F\uFE0F ' + card.parking.free + ' ' + t('cFree');
        if (card.parking.distance_m != null) pTxt += ' \u00B7 ' + dbFmtDist(card.parking.distance_m);
        live.push('<span class="db-live-chip">' + dbEscape(pTxt) + '</span>');
    }
    if (card.air && card.air.level) {
        var aMap = { good: [t('cAirGood'), 'db-live-ok'], moderate: [t('cAirModerate'), 'db-live-warn'], poor: [t('cAirPoor'), 'db-live-bad'] };
        var a = aMap[card.air.level] || [card.air.level, ''];
        live.push('<span class="db-live-chip ' + a[1] + '"><span class="db-dot"></span>' + a[0] + '</span>');
    }
    if (card.weather && (card.weather.condition || card.weather.temp_c != null)) {
        var wMap = { rain: '\uD83C\uDF27\uFE0F', windy: '\uD83D\uDCA8', clear: '\u2600\uFE0F' };
        var wTxt = (wMap[card.weather.condition] || '\u26C5');
        if (card.weather.temp_c != null) wTxt += ' ' + Math.round(card.weather.temp_c) + '\u00B0C';
        live.push('<span class="db-live-chip">' + wTxt + '</span>');
    }

    var liveRow = live.length ? '<div class="db-live-row">' + live.join('') + '</div>' : '';
    var liveBadge = live.length ? '<span class="db-live-badge">LIVE</span>' : '';

    return '<div class="db-card db-card-route db-route-' + dbEscape(card.mode || '') + '">' +
        '<div class="db-card-head">' +
            '<div class="db-card-title">' +
                '<span class="db-card-icon">' + (icons[card.mode] || '\uD83D\uDDFA\uFE0F') + '</span>' +
                '<span>' + modeLabel + '</span>' +
            '</div>' +
            liveBadge +
        '</div>' +
        (metrics.length ? '<div class="db-metrics">' + metrics.join('') + '</div>' : '') +
        liveRow +
        (dirs ? '<details class="db-route-directions"><summary>' + t('cDirections') + '</summary><ol>' + dirs + '</ol></details>' : '') +
    '</div>';
}

// ---- Map overlay ----
// Draws on the HOST page's Leaflet map (the IMIQ dashboard's `map`). No-ops
// gracefully when the page has no Leaflet map (e.g. Dashbot's standalone chat
// page), so the widget stays self-contained and infra-free.
let dashbotMapOverlay = null;   // place markers
let routeLayers = [];           // the ONE route line on the map (+ its flow overlay for driving)
let routeCoords = null;         // that route's FULL geometry (the line may still be revealing)
let routeTraveler = null;       // the mode chip riding the line's tip (walker / cyclist / car)
let routeAnim = null;           // requestAnimationFrame handle of the running reveal
let currentRouteMode = null;    // mode of the line on the map (its card gets the highlight)
let defaultRouteDrawn = false;  // has the default (walking) route been auto-shown this answer?
let dashbotPlaceMarkers = {};   // "lat,lon" -> marker, so a place card can refocus its pin

function getLeafletMap() {
    // The dashboard declares a page-global `const map` (classic script) + global `L`.
    try { if (typeof map !== 'undefined' && window.L && map instanceof L.Map) return map; } catch (e) {}
    try { if (window.map && window.L && window.map instanceof L.Map) return window.map; } catch (e) {}
    return null;
}

function getMapOverlay(m) {
    // A featureGroup (not layerGroup): it has getBounds(), which the framing
    // of pins next to a route relies on.
    if (!dashbotMapOverlay) { dashbotMapOverlay = L.featureGroup().addTo(m); }
    return dashbotMapOverlay;
}

function reducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
}

function cancelRouteAnim() {
    if (routeAnim != null) { try { cancelAnimationFrame(routeAnim); } catch (e) {} routeAnim = null; }
}

// Take the current route (line, flow overlay, traveler) off the map, stopping
// a reveal that is still running.
function removeRouteLayers() {
    cancelRouteAnim();
    const m = getLeafletMap();
    routeLayers.forEach(function (l) { try { if (m) m.removeLayer(l); } catch (e) {} });
    routeLayers = [];
    try { if (m && routeTraveler) m.removeLayer(routeTraveler); } catch (e) {}
    routeTraveler = null;
    routeCoords = null;
    currentRouteMode = null;
}

function clearMapOverlay() {
    try { if (dashbotMapOverlay) dashbotMapOverlay.clearLayers(); } catch (e) {}
    removeRouteLayers();
    defaultRouteDrawn = false;
    dashbotPlaceMarkers = {};
}

// Route line colors (match the route cards' accent gradients). Walking is pink,
// not green: the dashboard already draws its tram/traffic segments in green,
// orange and red, and a green walking route vanished among the tram lines.
const DB_ROUTE_COLORS = { walking: '#db2777', cycling: '#0ea5e9', driving: '#7c3aed' };
// Live congestion tints the DRIVING line (the card carries `congestion`).
const DB_CONGESTION_COLORS = { moderate: '#f59e0b', heavy: '#ef4444' };
// Per-mode look and pacing. Textures: walking = round dots that read as
// footsteps, cycling = short dashes, driving = solid with light dashes flowing
// along it (direction of travel); all three textures march along the line
// (CSS, see .db-route-line-*). `duration` is the one-time REVEAL at ~2.5 km
// and `lap` the time of each LOOP of the chip along the finished line — both
// scaled by trip length within [0.75, 1.5]: the walker is unhurried, the
// bike brisk, the car quick (the reveal also eases out for the car).
const DB_MODE_STYLE = {
    walking: { emoji: '🚶', weight: 6, dashArray: '1 13',  duration: 1600, lap: 7000, ease: 'inOut' },
    cycling: { emoji: '🚴', weight: 5, dashArray: '10 11', duration: 1150, lap: 5000, ease: 'inOut' },
    driving: { emoji: '🚗', weight: 5, dashArray: null,    duration: 850,  lap: 3800, ease: 'out', flow: true }
};

// Category → pin/card emoji. `kind` is detected server-side (api.py _pin_kind)
// from the record's type fields; "place" is the neutral fallback.
const DB_PIN_EMOJI = {
    event: '🎉', restaurant: '🍽️', cafe: '☕', bar: '🍸', supermarket: '🛒',
    parking: '🅿️', stop: '🚏', hotel: '🛏️', culture: '🎭', building: '🏛️',
    place: '📍'
};

function kindEmoji(kind) {
    return DB_PIN_EMOJI[kind] || DB_PIN_EMOJI.place;
}

// Emoji chip pin (glassy circle + pointer tail) instead of Leaflet's stock
// blue marker — the category is readable at a glance on the map.
function pinIcon(kind) {
    return L.divIcon({
        className: 'db-pin',
        html: '<div class="db-pin-chip">' + kindEmoji(kind) + '</div>',
        iconSize: [34, 42],
        iconAnchor: [17, 40],
        popupAnchor: [0, -38]
    });
}

function travelerIcon(mode, color) {
    const st = DB_MODE_STYLE[mode] || DB_MODE_STYLE.walking;
    return L.divIcon({
        className: 'db-traveler',
        html: '<div class="db-traveler-chip" style="--db-route-color:' + color + '">' + st.emoji + '</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
}

function dbMeters(lat1, lon1, lat2, lon2) {
    // Equirectangular — plenty at city scale, and cheap enough to run per frame.
    const kLat = 111320, kLon = 111320 * Math.cos(lat1 * Math.PI / 180);
    const dy = (lat2 - lat1) * kLat, dx = (lon2 - lon1) * kLon;
    return Math.sqrt(dx * dx + dy * dy);
}

// Cumulative distance (m) along the route at every vertex.
function dbPathMetrics(coords) {
    const cum = [0];
    for (let i = 1; i < coords.length; i++) {
        cum.push(cum[i - 1] + dbMeters(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]));
    }
    return cum;
}

// Index of the first vertex at or beyond `d` metres from the origin.
function dbSegmentEnd(cum, d) {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    return i;
}

// The point `d` metres along the route (interpolated on its segment).
function dbPointAt(coords, cum, d) {
    const total = cum[cum.length - 1];
    if (d <= 0) return coords[0];
    if (d >= total) return coords[coords.length - 1];
    const i = dbSegmentEnd(cum, d);
    const seg = cum[i] - cum[i - 1];
    const f = seg > 0 ? Math.max(0, Math.min(1, (d - cum[i - 1]) / seg)) : 0;
    const a = coords[i - 1], b = coords[i];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

// The route up to `d` metres from the origin, ending in an interpolated point
// on the current segment — the moving tip of the reveal.
function dbPathPrefix(coords, cum, d) {
    const total = cum[cum.length - 1];
    if (d >= total) return coords.slice();
    const out = coords.slice(0, dbSegmentEnd(cum, d));
    out.push(dbPointAt(coords, cum, d));
    return out;
}

function dbEase(kind, t) {
    if (kind === 'out') return 1 - Math.pow(1 - t, 3);
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// fitBounds padding that keeps the framed area clear of the chat panel, which
// floats over the map's right side while open (25vw on the dashboard) — the
// destination and the parked traveler must not land underneath it. Measured
// from the panel's actual overlap with the map container, so it is right for
// the dashboard, the standalone page, and speaking mode (panel slid away).
function mapFitPadding(m) {
    let right = 0;
    try {
        if (isChatOpen && panel) {
            const mr = m.getContainer().getBoundingClientRect();
            const pr = panel.getBoundingClientRect();
            if (pr.width && pr.bottom > mr.top && pr.top < mr.bottom) {
                right = Math.max(0, Math.min(mr.right, pr.right) - Math.max(mr.left, pr.left));
            }
            if (right > mr.width * 0.6) right = 0;   // panel covers the map (mobile): nothing to clear
        }
    } catch (e) {}
    return { paddingTopLeft: [40, 40], paddingBottomRight: [40 + right, 40] };
}

// Frame the whole route (its FULL extent, even while the reveal is still
// drawing) together with any pins already on the map.
function fitRouteView(m, coords) {
    try {
        const b = L.latLngBounds(coords);
        if (dashbotMapOverlay && dashbotMapOverlay.getLayers().length) b.extend(dashbotMapOverlay.getBounds());
        m.fitBounds(b, Object.assign({ maxZoom: 17 }, mapFitPadding(m)));
    } catch (e) {}
}

// Reduced motion only (the chip is parked for good): a pin sitting on the
// destination (find_nearest, a resolved place) is the destination marker, and
// the parked chip would only stack on top of it. While looping, the chip just
// passes the pin each lap.
function hideTravelerIfPinned() {
    if (!routeTraveler || !routeCoords || routeAnim != null) return;
    const end = routeCoords[routeCoords.length - 1];
    for (const key in dashbotPlaceMarkers) {
        try {
            const ll = dashbotPlaceMarkers[key].getLatLng();
            if (dbMeters(ll.lat, ll.lng, end[0], end[1]) < 25) {
                const m = getLeafletMap();
                if (m) m.removeLayer(routeTraveler);
                routeTraveler = null;
                return;
            }
        } catch (e) {}
    }
}

function drawOnMap(card) {
    // Place pins only — routes are handled by drawRoute/selectRoute so the map
    // never shows more than ONE route line at a time.
    const m = getLeafletMap();
    if (!m || !window.L || !card) return;
    if (card.type !== 'place' || card.lat == null || card.lon == null) return;
    const key = card.lat.toFixed(5) + ',' + card.lon.toFixed(5);
    if (dashbotPlaceMarkers[key]) return;   // already pinned (drawn at card arrival)
    try {
        const overlay = getMapOverlay(m);
        const marker = L.marker([card.lat, card.lon], { icon: pinIcon(card.kind) });
        if (card.name) marker.bindPopup(String(card.name));
        overlay.addLayer(marker);
        dashbotPlaceMarkers[key] = marker;
        if (overlay.getLayers().length <= 1 && !routeCoords) {
            // Single pin, no route → center + open popup.
            m.fitBounds(L.latLng(card.lat, card.lon).toBounds(60),
                        Object.assign({ maxZoom: Math.max(m.getZoom(), 16) }, mapFitPadding(m)));
            marker.openPopup();
        } else {
            // Several pins, or a route on the map → frame everything.
            const b = overlay.getBounds();
            if (routeCoords) b.extend(L.latLngBounds(routeCoords));
            m.fitBounds(b, Object.assign({ maxZoom: 17 }, mapFitPadding(m)));
        }
        hideTravelerIfPinned();
    } catch (e) {
        console.warn('Dashbot: map draw failed', e);
    }
}

// After the reveal the chip keeps travelling the finished line, lap after
// lap: it dwells at the destination (with the park pop), fades out, and
// reappears at the origin. Time-based, so throttled frames only skip ahead.
// Runs until the route is replaced or cleared (a new question, a mode click).
function startTravelerLoop(traveler, coords, cum, total, st) {
    const lap = st.lap * Math.min(1.5, Math.max(0.75, total / 2500));
    const dwell = 900;    // ms at the destination between laps
    const fade = 250;     // ms hidden at the end of the dwell — masks the jump back
    const end = coords[coords.length - 1];
    let t0 = null, paused = true;
    function loop(ts) {
        if (t0 === null) t0 = ts - lap;   // begin in the dwell: the reveal just parked the chip
        const e = (ts - t0) % (lap + dwell);
        let el = null;
        try { el = traveler.getElement(); } catch (err) {}
        if (e < lap) {
            if (paused) {
                paused = false;
                if (el) { el.classList.remove('db-traveler-parked'); el.style.opacity = ''; }
            }
            traveler.setLatLng(dbPointAt(coords, cum, (e / lap) * total));
        } else {
            if (!paused) {
                paused = true;
                traveler.setLatLng(end);
                if (el) el.classList.add('db-traveler-parked');
            }
            if (el) el.style.opacity = (e > lap + dwell - fade) ? '0' : '';
        }
        routeAnim = requestAnimationFrame(loop);
    }
    routeAnim = requestAnimationFrame(loop);
}

// Always exactly ONE route line. Drawing a mode replaces the previous line.
// The line is REVEALED from origin to destination with the mode's chip riding
// its tip; the chip then keeps looping along the line (startTravelerLoop)
// while the line's texture marches along it. A straight-line connector
// (router gave no path geometry) stays a static dashed line, so an estimate
// never looks like a real path. Reduced motion → everything lands at once,
// nothing loops.
function drawRoute(mode, coords, straightLine, card) {
    const m = getLeafletMap();
    if (!m || !window.L || !Array.isArray(coords) || coords.length < 2) return;
    removeRouteLayers();
    currentRouteMode = mode;
    routeCoords = coords;
    const st = DB_MODE_STYLE[mode] || DB_MODE_STYLE.walking;
    const tint = (mode === 'driving' && card) ? DB_CONGESTION_COLORS[card.congestion] : null;
    const color = tint || DB_ROUTE_COLORS[mode] || '#7a003f';
    const animate = !straightLine && !reducedMotion();
    const first = animate ? [coords[0]] : coords;

    routeLayers.push(L.polyline(first, {
        color: color, weight: st.weight, opacity: 0.9,
        lineCap: 'round', lineJoin: 'round',
        dashArray: straightLine ? '8 10' : st.dashArray,
        className: animate ? ('db-route-line db-route-line-' + mode) : null,
        interactive: false
    }).addTo(m));
    if (st.flow && animate) {
        // Light dashes marching along the solid line: the direction of travel
        // (CSS animates stroke-dashoffset on the path; see .db-route-flow).
        routeLayers.push(L.polyline(first, {
            color: '#ffffff', weight: 2, opacity: 0.85,
            dashArray: '6 14', lineCap: 'round', lineJoin: 'round',
            className: 'db-route-flow', interactive: false
        }).addTo(m));
    }
    // Driving: pin the live-parking garage the card names ("50 free · 2.0 km"),
    // so it's visible WHICH garage — it goes away with the route.
    let fitCoords = coords;
    const pk = (mode === 'driving' && card) ? card.parking : null;
    if (pk && pk.lat != null && pk.lon != null) {
        const pm = L.marker([pk.lat, pk.lon], { icon: pinIcon('parking'), zIndexOffset: 400 });
        pm.bindPopup(dbEscape((pk.name || t('route_driving')) +
                              (pk.free != null ? ' · ' + pk.free + ' ' + t('cFree') : '')));
        routeLayers.push(pm.addTo(m));
        fitCoords = coords.concat([[pk.lat, pk.lon]]);
    }
    fitRouteView(m, fitCoords);

    if (straightLine) return;   // an estimate: no traveler, no reveal
    routeTraveler = L.marker(coords[0], {
        icon: travelerIcon(mode, color), interactive: false, zIndexOffset: 1000
    }).addTo(m);
    if (!animate) {
        routeTraveler.setLatLng(coords[coords.length - 1]);
        hideTravelerIfPinned();
        return;
    }

    const cum = dbPathMetrics(coords);
    const total = cum[cum.length - 1];
    const duration = st.duration * Math.min(1.5, Math.max(0.75, total / 2500));
    // Only the lines reveal (the parking pin is a marker, not a polyline).
    const layers = routeLayers.filter(function (l) { return typeof l.setLatLngs === 'function'; });
    const traveler = routeTraveler;
    let start = null;
    function frame(ts) {
        if (start === null) start = ts;
        const p = total > 0 ? Math.min(1, (ts - start) / duration) : 1;
        const pts = dbPathPrefix(coords, cum, dbEase(st.ease, p) * total);
        layers.forEach(function (l) { l.setLatLngs(pts); });
        traveler.setLatLng(pts[pts.length - 1]);
        if (p < 1) {
            routeAnim = requestAnimationFrame(frame);
        } else {
            try { traveler.getElement().classList.add('db-traveler-parked'); } catch (e) {}
            startTravelerLoop(traveler, coords, cum, total, st);
        }
    }
    routeAnim = requestAnimationFrame(frame);
}

// Outline the card whose mode is on the map, in that mode's color.
function highlightRouteCard(el, mode) {
    try {
        const group = el.closest('.db-cards') || el.parentElement;
        if (!group) return;
        group.querySelectorAll('.db-card-route').forEach(function (c) {
            if (c === el) {
                c.style.outline = '2px solid ' + (DB_ROUTE_COLORS[mode] || '#7a003f');
                c.style.outlineOffset = '1px';
            } else {
                c.style.outline = 'none';
            }
        });
    } catch (e) {}
}

// Draw the chosen mode's line and highlight its card among its siblings.
function selectRoute(el, card) {
    drawRoute(card.mode, card.geometry, card.straight_line, card);
    highlightRouteCard(el, card.mode);
}

// Put a card on the map the moment it ARRIVES, while the answer text is still
// typing out: pins drop and the route reveals as the user reads. The card's
// panel rendering follows once the text lands (renderCard), which then only
// wires clicks and the highlight instead of drawing again.
function previewCardOnMap(card) {
    if (!card || !getLeafletMap()) return;
    if (card.type === 'place') { drawOnMap(card); return; }
    if (card.type === 'route' && !defaultRouteDrawn
            && Array.isArray(card.geometry) && card.geometry.length > 1) {
        drawRoute(card.mode, card.geometry, card.straight_line, card);
        defaultRouteDrawn = true;
    }
}

// Pan/zoom the host map to a pinned place and open its popup (place-card click).
function selectPlace(lat, lon) {
    const m = getLeafletMap();
    if (!m || !window.L) return;
    try {
        m.fitBounds(L.latLng(lat, lon).toBounds(60),
                    Object.assign({ maxZoom: Math.max(m.getZoom(), 17) }, mapFitPadding(m)));
        const marker = dashbotPlaceMarkers[lat.toFixed(5) + ',' + lon.toFixed(5)];
        if (marker && marker.openPopup) marker.openPopup();
    } catch (e) {}
}

// A place card was clicked: highlight it among its message's cards, put its pin
// back if a later answer cleared the map, focus it, and make it the target of
// that message's "Directions to …" / "Around …" buttons. Before, the buttons
// sent a bare "How do I get there?" and the agent guessed — usually the LAST
// place listed, whichever card the user had tapped.
function selectPlaceCard(el, card) {
    drawOnMap(card);
    if (getLeafletMap()) selectPlace(card.lat, card.lon);
    const group = el.closest('.db-cards');
    if (group) {
        group.querySelectorAll('.db-card-place.db-card-selected').forEach(function (c) {
            c.classList.remove('db-card-selected');
        });
    }
    el.classList.add('db-card-selected');
    const msgDiv = el.closest('.dashbot-msg');
    if (msgDiv) {
        msgDiv._dbTarget = card;
        refreshPlaceChips(msgDiv);
    }
}

// The place a message's follow-up buttons act on: the card the user picked,
// else the message's first place (the answer's main pick).
function placeTarget(msgDiv) {
    if (!msgDiv) return null;
    return msgDiv._dbTarget || (msgDiv._dbPlaces && msgDiv._dbPlaces[0]) || null;
}

function dbShortName(name) {
    const s = String(name || '').trim();
    return s.length > 26 ? s.slice(0, 25).trim() + '…' : s;
}

function placeChipLabel(sg, target) {
    if (!sg.kind || !target || !target.name) return sg.icon + ' ' + sg.label;
    const key = sg.kind === 'directions' ? 'sDirectionsTo' : 'sNearbyOf';
    return sg.icon + ' ' + t(key)(dbShortName(target.name));
}

function refreshPlaceChips(msgDiv) {
    const target = placeTarget(msgDiv);
    (msgDiv._dbChips || []).forEach(function (c) {
        c.btn.textContent = placeChipLabel(c.sg, target);
    });
}

function renderPlaceCard(card) {
    return '<div class="db-card db-card-place">' +
        '<div class="db-card-head">' +
            '<div class="db-card-title">' +
                '<span class="db-card-icon">' + kindEmoji(card.kind) + '</span>' +
                '<span>' + dbEscape(card.name || t('cLocation')) + '</span>' +
            '</div>' +
        '</div>' +
        '<div class="db-tl-sub">' + t('cShownOnMap') + '</div>' +
    '</div>';
}

function renderCard(container, card) {
    if (!container || !card || !card.type) return;
    // Draw the geo overlay on the host Leaflet map (dashboard) when present —
    // a no-op for anything previewCardOnMap already put there at card arrival.
    drawOnMap(card);
    let html = '';
    switch (card.type) {
        case 'transit_route': html = renderTransitCard(card); break;
        case 'route': html = renderRouteCard(card); break;
        case 'place': html = renderPlaceCard(card); break;
        default: return;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const el = wrap.firstElementChild;
    if (el) {
        el.classList.add('db-card-enter');
        const isRoute = (card.type === 'route' && Array.isArray(card.geometry) && card.geometry.length > 1);
        if (isRoute) {
            el.setAttribute('data-mode', card.mode);
            el.style.cursor = 'pointer';
            el.title = t('cShowRoute');
            el.addEventListener('click', function () { selectRoute(el, card); });
        } else if (card.type === 'place' && card.lat != null && card.lon != null) {
            el.style.cursor = 'pointer';
            el.title = t('cShowPlace');
            el.addEventListener('click', function () { selectPlaceCard(el, card); });
        }
        container.appendChild(el);
        if (isRoute) {
            // Show ONE route by default (walking — route cards arrive walking-first).
            // Usually it is already revealing on the map since card arrival; then
            // just mark its card as the selected one.
            if (!defaultRouteDrawn) {
                selectRoute(el, card);
                defaultRouteDrawn = true;
            } else if (currentRouteMode === card.mode) {
                highlightRouteCard(el, card.mode);
            }
        }
        requestAnimationFrame(function() { el.classList.add('db-card-shown'); });
    }
}

// ---- Follow-up suggestion chips (rendered below a finished answer) ----
function buildSuggestions(cards) {
    var types = {};
    (cards || []).forEach(function (c) { if (c && c.type) types[c.type] = true; });
    var s = [];
    if (types.place) {
        // `kind`: re-labelled with, and sent for, the message's target place.
        s.push({ icon: '🧭', label: t('sDirections'), q: t('sDirectionsQ'), kind: 'directions' });
        s.push({ icon: '📍', label: t('sNearby'), q: t('sNearbyQ'), kind: 'nearby' });
    }
    // Route answers already show every mode (walk/bike/tram/drive) with live
    // conditions, so they get no follow-up chips — not even the generic fallback.
    var hadCards = !!(types.place || types.route || types.transit_route);
    if (!s.length && !hadCards) {
        s.push({ icon: '🅿️', label: t('sParking'), q: t('sParkingQ') });
        s.push({ icon: '⛅', label: t('sWeather'), q: t('sWeatherQ') });
    }
    // de-dupe by label, cap at 3
    var seen = {}, out = [];
    for (var i = 0; i < s.length && out.length < 3; i++) {
        if (!seen[s[i].label]) { seen[s[i].label] = true; out.push(s[i]); }
    }
    return out;
}

function renderSuggestions(msgDiv, suggestions) {
    if (!msgDiv || !suggestions || !suggestions.length) return;
    var row = document.createElement('div');
    row.className = 'db-suggestions';
    msgDiv._dbChips = [];
    suggestions.forEach(function (sg) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'db-suggest-chip';
        b.textContent = placeChipLabel(sg, placeTarget(msgDiv));
        if (sg.kind) msgDiv._dbChips.push({ btn: b, sg: sg });
        b.addEventListener('click', function () {
            if (sendBtn.disabled) return;   // ignore taps while a request is in flight
            // Place buttons carry THEIR message's target — also on an old
            // message scrolled back to, whatever was discussed since.
            var target = sg.kind ? placeTarget(msgDiv) : null;
            if (target && target.name) {
                var key = sg.kind === 'directions' ? 'sDirectionsToQ' : 'sNearbyOfQ';
                input.value = t(key)(target.name);
                pendingSelectedPlace = { name: String(target.name).slice(0, 200), lat: target.lat, lon: target.lon };
            } else {
                input.value = sg.q;
            }
            sendMessage();
        });
        row.appendChild(b);
    });
    msgDiv.appendChild(row);
    scrollToBottom();
}

// ============================================================================
// Voice — STT (push-to-talk) + TTS (spoken replies) via the backend /voice/*
// proxy (the ElevenLabs key never reaches the browser).
//
// Latency design: an agent turn takes ~6-7s (tool calls), and silence that
// long sounds robotic. So:
//   1. The server reacts to what the user SAID with a tiny, fast side
//      LLM call ("Ooh, the Mensa, one sec") that runs in parallel with the
//      agent and arrives as a `reaction` SSE event. It is spoken through the
//      fast ElevenLabs model only if the real answer hasn't started talking
//      yet; small talk gets no reaction at all (the answer itself is instant).
//      This replaced keyword-picked canned phrases, which could not tell
//      "thank you for the weather" from a weather question.
//   2. The real answer is synthesized SENTENCE BY SENTENCE as tokens
//      stream in, so speech starts when the first sentence exists — not
//      when the whole reply is done. Fetches run in parallel; a
//      sequential audio queue preserves order; `previous_text` keeps the
//      prosody continuous across chunks.
//
// STT records with MediaRecorder and transcribes through the backend's
// ElevenLabs Scribe proxy (accents, German street names) — the browser's
// built-in Web Speech engine is only an opt-in (`initDashbot({ stt: 'browser' })`)
// or the fallback where MediaRecorder is unavailable.
// ============================================================================

// (Rule-based acknowledgment / filler phrases removed: reactions now come
// from the server per turn — see the `reaction` SSE event in sendMessage.)

// ---- Text cleanup: chat markdown → speakable prose ----
function speechClean(text) {
    if (!text) return '';
    let t = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');   // md links → their label
    t = t.replace(/https?:\/\/\S+/g, '');                    // bare URLs
    t = t.replace(/^\s*(?:[-•]|\d+\.)\s+/gm, '');            // bullet/number markers
    t = t.replace(/[*_`#|]+/g, '');                          // md emphasis marks
    t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu, '');
    return t.replace(/\s+/g, ' ').trim();
}

// ---- Sequential audio player. Fetches resolve in parallel; playback is
// strictly in enqueue order. stopAll() bumps the generation so stale items
// (and stale in-flight fetches) are dropped instead of played late.
// There is deliberately NO browser-voice backup: a failed ElevenLabs chunk
// is SILENCE (the speechSynthesis fallback sounded like a different robot
// and read audio tags literally — removed at the user's request). ----
const speech = (function () {
    const queue = [];
    let playing = false;
    let generation = 0;
    let currentStop = null;   // cuts + settles the clip playing right now

    function playBlob(blob) {
        return new Promise(function (resolve) {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            let settled = false;
            function finish() {
                if (settled) return;
                settled = true;
                if (currentStop === stop) currentStop = null;
                URL.revokeObjectURL(url);
                resolve();
            }
            // pause() fires neither `ended` nor `error`, so an interrupt MUST
            // settle this promise itself — otherwise `drain` waits forever and
            // every later clip is silently dropped (the old wedge bug).
            function stop() {
                try { audio.pause(); } catch (e) {}
                finish();
            }
            currentStop = stop;
            audio.onended = finish;
            audio.onerror = finish;
            audio.play().catch(finish);   // autoplay blocked etc. — never wedge the queue
        });
    }

    let onActivity = null;   // ('speak', text) as each clip starts | ('idle') when drained

    async function drain() {
        if (playing) return;
        playing = true;
        try {
            while (queue.length) {
                const item = queue.shift();
                if (item.gen !== generation) continue;
                let blob = null;
                try { blob = await item.blobPromise; } catch (e) {}
                if (item.gen !== generation) continue;   // stopped while fetching
                if (!blob) continue;   // TTS failed/unconfigured → this chunk is silence
                if (onActivity) onActivity('speak', item.text, item.meta);
                await playBlob(blob);
            }
        } finally {
            playing = false;
            if (onActivity) onActivity('idle');
        }
    }

    return {
        // blobPromise resolves to an MP3 Blob, or null on any failure — a
        // null chunk is simply skipped (silence). `text` feeds the activity
        // listener (push-to-talk label), not any fallback voice.
        enqueue: function (blobPromise, text, meta) {
            queue.push({ gen: generation, blobPromise: blobPromise, text: text, meta: meta || null });
            drain();
        },
        // Interrupt: drop the queue, cut the playing clip, and bump the
        // generation so stale producers (an old answer's chunker, a pending
        // ack timer, an in-flight fetch) are ignored when they land.
        stopAll: function () {
            generation++;
            queue.length = 0;
            if (currentStop) currentStop();
        },
        gen: function () { return generation; },
        isActive: function () { return playing; },
        // Single observer is enough (the push-to-talk label); not a full emitter.
        setActivityListener: function (fn) { onActivity = fn; }
    };
})();

// ---- TTS fetch (backend proxy). Resolves null on any failure — the audio
// queue then skips that chunk entirely (silence, no backup voice). ----
// At most two syntheses in flight: ElevenLabs plans cap concurrent requests,
// and an over-limit request fails — that chunk would simply go missing from
// the spoken answer. Transient failures (429 / 5xx / network) are retried
// twice with a short backoff before a chunk is given up as silence.
const TTS_MAX_INFLIGHT = 2;
let ttsInflight = 0;
const ttsWaiters = [];
function ttsSlot() {
    return new Promise(function (resolve) {
        if (ttsInflight < TTS_MAX_INFLIGHT) { ttsInflight++; resolve(); }
        else ttsWaiters.push(resolve);
    });
}
function ttsFree() {
    if (ttsWaiters.length) ttsWaiters.shift()();
    else ttsInflight--;
}

function fetchTTS(text, previousText, purpose, isFinal) {
    if (!voiceAvailable || !sessionId) return Promise.resolve(null);
    const body = JSON.stringify({
        text: text,
        session_id: sessionId,
        language: dbLang,
        previous_text: previousText || undefined,
        purpose: purpose || 'answer',   // 'reaction' → ELEVENLABS_TTS_FAST_MODEL
        final: !!isFinal                // last clip of an answer (may end in a pause)
    });
    function attempt(n) {
        const retry = function () {
            if (n >= 2) return null;
            return new Promise(function (res) { setTimeout(res, 700 * (n + 1)); })
                .then(function () { return attempt(n + 1); });
        };
        return fetch(DASHBOT_BASE_URL + '/voice/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(sessionToken ? { 'X-Session-Token': sessionToken } : {})
            },
            body: body
        }).then(function (r) {
            if (r.ok) return r.blob();
            if (r.status === 429 || r.status >= 500) return retry();
            return null;
        }).catch(retry);
    }
    if (purpose === 'reaction') return attempt(0);   // fast model, never queued behind v3 chunks
    return ttsSlot().then(function () { return attempt(0); })
        .then(function (blob) { ttsFree(); return blob; },
              function () { ttsFree(); return null; });
}

// ---- Sentence chunker: feed it streaming tokens, it emits TTS-sized chunks.
// The FIRST chunk fires on the first sentence boundary (speech starts ASAP).
// Rest-chunk sizing balances two failure modes on eleven_v3 (no previous_text
// stitching): chunks too SMALL → a tone seam at every sentence; too BIG →
// synthesis of the huge tail can't keep up with playback and the voice goes
// silent mid-answer. ~2-3 sentences per generation keeps the pipeline
// gapless with at most one or two seams. ----
function makeSpeechChunker() {
    let buf = '';
    let prev = '';        // previous spoken chunk (prosody continuity on v2 models)
    let emitted = 0;
    const gen = speech.gen();   // the answer this chunker speaks for
    // eleven_v3 synthesizes ~30 chars/s and speaks ~12 chars/s, so a chunk is
    // only ready in time if it is short compared with the one playing before
    // it. Hence the RAMP: one sentence first, then bigger and bigger pieces.
    // (Measured: a 300-char second chunk after a 27-char first one left a
    // 5-second hole mid-answer.)
    const TARGETS = [45, 110, 220, 400, 600];
    const SENT = /[.!?…]+["')\]]*\s+/g;
    const CLAUSE = /[,;:]\s+|\s[—–-]\s+/g;

    let firstTimer = null;

    function emit(raw, isFinal) {
        // Interrupted (a new question, a tap, mute): the rest of this answer
        // stays silent even if its tokens keep streaming.
        if (speech.gen() !== gen) return;
        const clean = speechClean(raw);
        if (!clean || clean.length < 2) return;
        // Cap previous_text to the server's 600-char validation limit. `final`
        // marks the answer's last clip (the only one that may end in a pause).
        speech.enqueue(fetchTTS(clean, prev.slice(-500), 'answer', !!isFinal), clean, { answer: true, gen: gen });
        prev = clean;
        emitted++;
    }

    function drain(final, force) {
        if (final && firstTimer) { clearTimeout(firstTimer); firstTimer = null; }
        if (final && emitted === 0 && buf.trim().length < 110) {
            // The whole answer is short and nothing has gone out yet: ONE clip.
            if (buf.trim()) emit(buf, true);
            buf = '';
            return;
        }
        while (true) {
            const min = TARGETS[Math.min(emitted, TARGETS.length - 1)];
            let cut = -1, m;
            SENT.lastIndex = 0;
            while ((m = SENT.exec(buf)) !== null) {
                const end = m.index + m[0].length;
                if (end >= min) { cut = end; break; }
            }
            if (cut === -1 && buf.length > min * 1.5) {
                // A long sentence with no end in sight: cut at a clause boundary
                // (comma, semicolon, dash) past the target, else at a space.
                CLAUSE.lastIndex = 0;
                while ((m = CLAUSE.exec(buf)) !== null) {
                    const end = m.index + m[0].length;
                    if (end >= min && end < buf.length) { cut = end; break; }
                }
                if (cut === -1 && buf.length > min * 2.5) {
                    const sp = buf.lastIndexOf(' ', min * 2);
                    cut = sp > min ? sp + 1 : Math.floor(min * 2);
                }
            }
            if (cut === -1) break;
            if (emitted === 0 && !final && !force && buf.length < 110) {
                // A short answer ("Hey! What's up?") sounds better as ONE clip
                // than a sentence plus a stub with a seam: give the stream
                // 600 ms to finish before the first clip goes out.
                if (!firstTimer) firstTimer = setTimeout(function () { firstTimer = null; drain(false, true); }, 600);
                break;
            }
            emit(buf.slice(0, cut));
            buf = buf.slice(cut);
        }
        if (final && buf.trim()) { emit(buf, true); buf = ''; }
    }

    return {
        push: function (token) { buf += token; drain(false); },
        flush: function () { drain(true); },
        // Has any speech chunk reached the audio queue yet? Reactions and
        // fillers skip themselves once the real answer is already talking.
        hasEmitted: function () { return emitted > 0; }
    };
}

// ---- STT: talk to the AVATAR (speaking mode) ----
// TAP the avatar to start talking; the recording ends by itself when you finish
// your sentence (silence detection) or on a second tap. HOLDING the avatar works
// too: release to send. Either way the bot goes quiet the moment you start, and
// a question still streaming is superseded (its text stays, its speech stops).
// Recognition: the recording is transcribed by the backend's ElevenLabs Scribe
// proxy — far more accurate than the browser's built-in engine, which is kept
// only as an opt-in (`initDashbot({ stt: 'browser' })`) or the fallback where
// MediaRecorder is unavailable.
const STT_PROVIDER = (options && options.stt === 'browser' && DB_SR) ? 'browser'
                   : (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder) ? 'server'
                   : (DB_SR ? 'browser' : 'none');
const PTT_MAX_MS = 30000;          // safety: a recording never runs longer than this
const TAP_MAX_MS = 350;            // press shorter than this = tap (keeps listening), longer = hold
const VAD_SILENCE_MS = 1300;       // silence after speech that ends a tapped recording
const VAD_NO_SPEECH_MS = 7000;     // tapped but nothing said: give up quietly
let recognition = null;            // browser STT session (opt-in path)
let recording = false;             // a recording is armed or running
let mediaRecorder = null;
let mediaChunks = [];
let pttHeld = false;               // the pointer is down on the avatar
let pttTapMode = false;            // released quickly: keep listening until silence / next tap
let pttDiscard = false;            // stop-as-cancel: throw the transcript away
let pttPressedAt = 0;
let pttMaxTimer = null;
let pttUIState = 'idle';
let botSpeaking = false;
let vad = null;                    // silence detector for the tapped recording
let audioCtx = null;

function setPttUI(state) {
    pttUIState = state;
    refreshSpeakUI();
}

// Speaking mode needs spoken replies (the chat is hidden), so its entry button
// shows only when the ElevenLabs proxy is configured and some way to listen exists.
function updateSpeakVisibility() {
    if (speakBtn) speakBtn.style.display = (voiceAvailable && STT_PROVIDER !== 'none') ? '' : 'none';
}

// ---- Speaking mode: the chat slides away, only the avatar stays ----
// One state at a time, derived from what is actually happening:
//   listening (recording) · thinking (request in flight / transcribing) ·
//   speaking (audio playing — tapping interrupts) · idle (tap to talk).
function speakStateNow() {
    if (recording) return 'listening';
    if (pttUIState === 'busy') return 'thinking';
    if (botSpeaking) return 'speaking';
    if (sendBtn.disabled) return 'thinking';
    return 'idle';
}

function refreshSpeakUI() {
    if (!speakModeEl) return;
    const st = speakStateNow();
    speakModeEl.classList.remove('state-idle', 'state-listening', 'state-thinking', 'state-speaking');
    speakModeEl.classList.add('state-' + st);
    const hints = { idle: t('pttIdle'),
                    listening: (pttTapMode || !pttHeld) ? t('pttListeningTap') : t('pttRecording'),
                    thinking: t('speakThinking'), speaking: t('pttInterrupt') };
    if (speakHint) speakHint.textContent = hints[st];
    if (speakStage) speakStage.setAttribute('aria-label', hints[st]);
}

function enterSpeakMode() {
    if (speakMode) return;
    speakMode = true;
    if (!voiceRepliesOn) toggleSpeaker();     // speaking mode implies hearing replies
    isChatOpen = true;
    avatar.classList.add('hidden');
    panel.classList.add('open', 'speak-hidden');   // slide the chat away, keep it warm
    speakModeEl.classList.add('open');
    input.blur();
    refreshSpeakUI();
    try { speakStage.focus({ preventScroll: true }); } catch (e) {}
}

function exitSpeakMode(focusInput) {
    if (!speakMode) return;
    pttCancel();
    speech.stopAll();
    speakMode = false;
    speakModeEl.classList.remove('open');
    panel.classList.remove('speak-hidden');   // chat slides back in, transcript intact
    refreshSpeakUI();
    scrollToBottom();
    if (focusInput !== false) input.focus();
}

function sendTranscript(text) {
    const t = (text || '').trim();
    if (!t) return;
    input.value = t;
    pendingVoiceInput = true;
    sendMessage();
}

// ---- Silence detection (tap-to-talk): ends the recording ~1.3 s after the
// user stops talking, once they have said something. Noise floor is measured
// in the first 250 ms; speech = clearly above it for two consecutive frames. ----
function startVAD(stream) {
    stopVAD();
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const src = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        src.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const started = Date.now();
        let floor = null, spoke = false, loud = 0, silentSince = 0;
        const timer = setInterval(function () {
            analyser.getFloatTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
            const rms = Math.sqrt(sum / buf.length);
            const now = Date.now();
            if (now - started < 250) { floor = (floor === null) ? rms : Math.min(floor, rms); return; }
            const thr = Math.max(Math.min(floor || 0, 0.02) * 3, 0.01);
            if (rms > thr) {
                loud++; silentSince = 0;
                if (loud >= 2) spoke = true;
            } else {
                loud = 0;
                if (spoke) {
                    if (!silentSince) silentSince = now;
                    else if (now - silentSince >= VAD_SILENCE_MS && pttTapMode && !pttHeld) { stopRecording(false); return; }
                }
            }
            if (!spoke && now - started > VAD_NO_SPEECH_MS && pttTapMode && !pttHeld) stopRecording(true);
        }, 50);
        vad = { timer: timer, src: src };
    } catch (e) {
        vad = null;   // no WebAudio: the second tap (or the time cap) ends the recording
    }
}

function stopVAD() {
    if (!vad) return;
    clearInterval(vad.timer);
    try { vad.src.disconnect(); } catch (e) {}
    vad = null;
}

// ---- Recording (server transcription — the default) ----
async function startRecording() {
    if (STT_PROVIDER === 'browser') { startBrowserSTT(); return; }
    if (STT_PROVIDER !== 'server') {
        recording = false; setPttUI('idle');
        showLocationToast(t('toastVoiceUnsupported'));
        return;
    }
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
    } catch (e) {
        recording = false; setPttUI('idle');
        showLocationToast(t('toastMicDenied'));
        return;
    }
    if (!recording) {   // stopped again before the mic came up — nothing to record
        stream.getTracks().forEach(function (tr) { tr.stop(); });
        return;
    }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find(function (m) { return MediaRecorder.isTypeSupported(m); }) || '';
    mediaChunks = [];
    mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    mediaRecorder.ondataavailable = function (e) { if (e.data && e.data.size) mediaChunks.push(e.data); };
    mediaRecorder.onstop = async function () {
        stream.getTracks().forEach(function (tr) { tr.stop(); });
        stopVAD();
        mediaRecorder = null;
        recording = false;
        const blob = new Blob(mediaChunks, { type: mime || 'audio/webm' });
        mediaChunks = [];
        const discard = pttDiscard;
        pttDiscard = false;
        if (discard || blob.size < 1500) { setPttUI('idle'); return; }   // nothing said (a stray tap)
        setPttUI('busy');
        try {
            if (!sessionId || !sessionToken) await startSession();
            const form = new FormData();
            form.append('audio', blob, mime.indexOf('mp4') !== -1 ? 'audio.mp4' : 'audio.webm');
            form.append('session_id', sessionId);
            form.append('language', dbLang);   // the interface language pins the recognizer
            const res = await fetch(DASHBOT_BASE_URL + '/voice/stt', {
                method: 'POST',
                headers: sessionToken ? { 'X-Session-Token': sessionToken } : {},
                body: form
            });
            setPttUI('idle');
            if (!res.ok) { showLocationToast(t('toastTranscribeFailed')); return; }
            const data = await res.json();
            sendTranscript(data.text);
        } catch (e) {
            setPttUI('idle');
            showLocationToast(t('toastTranscribeFailed'));
        }
    };
    mediaRecorder.start(250);   // timeslice: chunks flush steadily
    startVAD(stream);
}

// ---- Browser Web Speech API (opt-in / fallback) ----
function startBrowserSTT() {
    let rec;
    try { rec = new DB_SR(); } catch (e) {
        recording = false; setPttUI('idle');
        showLocationToast(t('toastVoiceUnsupported'));
        return;
    }
    recognition = rec;
    rec.lang = sttLang();
    rec.interimResults = true;
    rec.continuous = true;       // until the second tap / release (the browser also ends it after a long silence)
    let transcript = '';
    let hadError = false;
    rec.onresult = function (e) {
        let txt = '';
        for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
        transcript = txt;
        input.value = txt;
    };
    rec.onerror = function (e) {
        // no-speech: nothing was said; aborted: our own stop().
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        hadError = true;
        if (e.error === 'not-allowed') showLocationToast(t('toastMicDenied'));
        else showLocationToast(t('toastVoiceFailed'));
    };
    rec.onend = function () {
        recognition = null;
        recording = false;
        clearMaxTimer();
        pttHeld = false; pttTapMode = false;
        setPttUI('idle');
        const discard = pttDiscard;
        pttDiscard = false;
        if (discard) { input.value = ''; return; }
        if (!hadError) sendTranscript(transcript);
    };
    try { rec.start(); } catch (e) { recognition = null; recording = false; setPttUI('idle'); }
}

function clearMaxTimer() {
    if (pttMaxTimer) { clearTimeout(pttMaxTimer); pttMaxTimer = null; }
}

// Press: while listening, a press ends the recording (tap-to-stop). Otherwise
// the bot goes quiet and listening starts at once.
function pttPress() {
    if (recording) {
        if (pttTapMode && !pttHeld) stopRecording(false);
        return;
    }
    pttHeld = true;
    pttTapMode = false;
    pttDiscard = false;
    pttPressedAt = Date.now();
    speech.stopAll();
    recording = true;             // the ring shows "listening" immediately
    setPttUI('recording');
    clearMaxTimer();
    pttMaxTimer = setTimeout(function () { pttMaxTimer = null; stopRecording(false); }, PTT_MAX_MS);
    startRecording();
}

// Release: a quick tap keeps listening (silence or the next tap ends it); a
// hold ends it now and sends.
function pttRelease() {
    if (!pttHeld) return;
    pttHeld = false;
    if (recording && Date.now() - pttPressedAt < TAP_MAX_MS) {
        pttTapMode = true;
        refreshSpeakUI();
        return;
    }
    stopRecording(false);
}

// Stop the recording; the transcript is sent (or thrown away with discard).
function stopRecording(discard) {
    if (!recording) return;
    pttDiscard = !!discard;
    pttHeld = false;
    pttTapMode = false;
    clearMaxTimer();
    stopVAD();
    try { if (recognition) recognition.stop(); } catch (e) {}
    try { if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop(); } catch (e) {}
    if (!recognition && !mediaRecorder) {   // the mic never came up: nothing to flush
        recording = false;
        setPttUI('idle');
    }
}

// Cancel: stop and throw the transcript away (close / reset / leaving speaking mode).
function pttCancel() {
    if (recording) stopRecording(true);
}

if (speakStage) {
    speakStage.addEventListener('pointerdown', function (e) {
        if (e.button !== undefined && e.button !== 0) return;   // primary button / touch only
        e.preventDefault();
        try { speakStage.setPointerCapture(e.pointerId); } catch (err) {}
        pttPress();
    });
    ['pointerup', 'pointercancel'].forEach(function (type) {
        speakStage.addEventListener(type, function (e) { e.preventDefault(); pttRelease(); });
    });
    speakStage.addEventListener('contextmenu', function (e) { e.preventDefault(); });   // long-press menu on mobile
    speakStage.addEventListener('keydown', function (e) {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); pttPress(); }
        else if (e.key === 'Escape') { exitSpeakMode(); }
    });
    speakStage.addEventListener('keyup', function (e) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pttRelease(); }
    });
    // Tab hidden mid-recording: don't keep the mic open in the background.
    document.addEventListener('visibilitychange', function () { if (document.hidden) pttCancel(); });
}
if (speakBtn) speakBtn.addEventListener('click', enterSpeakMode);
if (speakExit) speakExit.addEventListener('click', function () { exitSpeakMode(); });

// While the bot talks the avatar shows "speaking" and the hint reads "Tap to
// interrupt", so users know a tap cuts the answer short.
let answerAudioGen = -1;   // speech generation whose ANSWER audio has started playing
speech.setActivityListener(function (kind, text, meta) {
    botSpeaking = (kind === 'speak');
    if (kind === 'speak' && meta && meta.answer) answerAudioGen = meta.gen;
    refreshSpeakUI();
});

updateSpeakVisibility();

// ---- Speaker (voice replies) toggle ----
const DB_SPK_ON_SVG  = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
const DB_SPK_OFF_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';

function updateSpeakerUI() {
    if (!speakerBtn) return;
    speakerBtn.innerHTML = voiceRepliesOn ? DB_SPK_ON_SVG : DB_SPK_OFF_SVG;
    speakerBtn.classList.toggle('voice-muted', !voiceRepliesOn);
    speakerBtn.title = voiceRepliesOn ? t('voiceOn') : t('voiceOff');
}

function toggleSpeaker() {
    voiceRepliesOn = !voiceRepliesOn;
    if (!voiceRepliesOn) speech.stopAll();
    try { localStorage.setItem('dashbot-voice', voiceRepliesOn ? 'on' : 'off'); } catch (e) {}
    updateSpeakerUI();
}

if (speakerBtn) speakerBtn.addEventListener('click', toggleSpeaker);
updateSpeakerUI();

// ---- Language switch (EN/DE) ----
// Re-labels the whole widget, and from the next turn on: speech recognition
// listens in that language, the voice speaks it, and the agent answers in it.
function applyLanguage() {
    if (langBtn) {
        langBtn.textContent = dbLang.toUpperCase();
        langBtn.title = t('langTitle');
    }
    var tip = avatar.querySelector('.avatar-tooltip');
    if (tip) tip.textContent = t('tooltip');
    var status = panel.querySelector('.dashbot-header-status');
    if (status) status.innerHTML = '<span class="dot"></span> ' + t('online');
    if (resetBtn) resetBtn.title = t('newChat');
    input.placeholder = t('placeholder');
    if (!typing.classList.contains('show')) typingTextEl.textContent = t('thinking');
    if (speakBtn) {
        speakBtn.title = t('speakBtnTitle');
        var sl = speakBtn.querySelector('.db-speak-label');
        if (sl) sl.textContent = t('speakBtn');
    }
    if (speakExit) {
        var xl = speakExit.querySelector('.db-speak-exit-label');
        if (xl) xl.textContent = t('speakExit');
    }
    if (speakStage) speakStage.title = t('pttTitle');
    refreshSpeakUI();
    updateLocationButton(locationUIState);
    updateSpeakerUI();
    applyTheme(document.documentElement.classList.contains('dashbot-dark') ? 'dark' : 'light');
    // Welcome screen still up (no messages yet): re-render it in the new language.
    var w = document.getElementById('dashbotWelcome');
    if (w) { w.outerHTML = welcomeMarkup(); bindWelcomeButtons(); }
}

function setLanguage(lang) {
    dbLang = lang === 'de' ? 'de' : 'en';
    try { localStorage.setItem('dashbot-lang', dbLang); } catch (e) {}
    applyLanguage();
}

if (langBtn) langBtn.addEventListener('click', function () { setLanguage(dbLang === 'de' ? 'en' : 'de'); });
applyLanguage();

// ---- Send ----
input.addEventListener('keypress', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
sendBtn.addEventListener('click', sendMessage);

async function sendMessage() {
    const msg = input.value.trim();
    if (!msg) return;

    if (!isChatOpen) openChat();

    // A new question always supersedes the previous answer: its speech stops
    // now, and if it is still streaming its request is aborted (the text it
    // already produced stays on screen).
    speech.stopAll();
    abortActiveRequest();
    const seq = ++requestSeq;
    const controller = new AbortController();
    activeController = controller;
    const isCurrent = function () { return seq === requestSeq; };
    let finalizePartial = null;   // set once the streaming bubble exists

    // Voice: speak this reply if the question came in by voice (or the host
    // page opted into speaking everything) and the speaker isn't muted.
    const wasVoice = pendingVoiceInput;
    pendingVoiceInput = false;
    const selectedPlace = pendingSelectedPlace;
    pendingSelectedPlace = null;
    const speakReply = voiceRepliesOn && (wasVoice || SPEAK_ALL_REPLIES);
    const speechGen = speech.gen();   // reactions belong to THIS answer only
    const speechChunker = speakReply ? makeSpeechChunker() : null;
    const FILLER_DELAY_MS = 5000;     // "still on it" lines every 5 s while the lookup drags on
    let ackTimer = null;              // the pending filler
    function cancelAck() {
        if (ackTimer) { clearTimeout(ackTimer); ackTimer = null; }
    }
    // Server-sent spoken reaction: a tiny side call reacted to what the user
    // SAID ("Ooh, the Mensa, one sec") while the agent looks things up. Play
    // it only if the real answer hasn't started talking yet; the optional
    // filler follows once if the lookup still drags on.
    function playReaction(r) {
        if (!speechChunker || speech.gen() !== speechGen) return;
        if (speechChunker.hasEmitted()) return;
        const text = ((r && r.text) || '').trim();
        if (text) {
            pinTypingText(text);
            speech.enqueue(fetchTTS(text, '', 'reaction'), text);
        }
        // "Still on it" lines while a long lookup runs: OFF (MAX_FILLERS = 0)
        // — one sentence before the answer is right, three felt like chatter.
        // Raise MAX_FILLERS to bring them back (5 s apart, until the answer is
        // actually audible).
        const MAX_FILLERS = 0;
        let fillers = (r && Array.isArray(r.fillers)) ? r.fillers.slice(0, MAX_FILLERS) : [];
        if (!fillers.length && MAX_FILLERS > 0 && r && (r.filler || '').trim()) fillers = [r.filler.trim()];
        if (fillers.length) {
            cancelAck();
            let i = 0;
            const scheduleNext = function () {
                ackTimer = setTimeout(function () {
                    ackTimer = null;
                    if (speech.gen() !== speechGen || answerAudioGen === speechGen || i >= fillers.length) return;
                    const f = fillers[i++];
                    speech.enqueue(fetchTTS(f, '', 'reaction'), f);
                    scheduleNext();
                }, FILLER_DELAY_MS);
            };
            scheduleNext();
        }
    }
    addMessage(msg, true);
    clearMapOverlay();   // wipe the previous answer's pins/routes from the map
    input.value = '';
    setLoading(true);
    showTyping();

    try {
        // Make sure we have a session before sending; mint one if the initial
        // startSession() hasn't landed yet (or previously failed).
        if (!sessionId || !sessionToken) {
            await startSession();
        }

        function postChat() {
            return fetch(DASHBOT_BASE_URL + '/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(sessionToken ? { 'X-Session-Token': sessionToken } : {})
                },
                signal: controller.signal,
                body: JSON.stringify({
                    message: msg,
                    session_id: sessionId || undefined,
                    language: dbLang,   // answer language — the server instructs the agent
                    stream: true,
                    conversational: true,
                    user_location: userLocation,
                    location_status: locationStatus,
                    // Spoken question that will be spoken back: the server
                    // injects the spoken-conversation style (short, natural).
                    voice_mode: wasVoice && speakReply,
                    // A place button's target: the server hands the agent its
                    // coordinates, so the answer is about THAT place.
                    selected_place: selectedPlace || undefined
                })
            });
        }

        let res = await postChat();

        // The server expires idle sessions (and loses all sessions when it
        // restarts). When that happens our stored session_id/token is stale and
        // the server replies 404 (unknown session) or 401 (token rejected) —
        // INSTANTLY, before any work. Transparently mint a fresh session and
        // retry once, so the user never sees an error or has to reload the page.
        if (res.status === 404 || res.status === 401) {
            const ok = await startSession();
            if (ok) res = await postChat();
        }

        if (!res.ok) throw new Error('HTTP ' + res.status);

        // JSON (non-streaming) fast path for the LangGraph backend
        const ctype = res.headers.get('content-type') || '';
        if (ctype.includes('application/json')) {
            const data = await res.json();
            cancelAck();
            if (isCurrent()) hideTyping();
            const s = addStreamingMessage();
            s.outerBubble.classList.add('is-streaming');
            const fullText = data.text || t('errNoAnswer');
            s.bubble.innerHTML = formatBotMessage(fullText);
            s.bubble.appendChild(s.time);
            s.outerBubble.classList.remove('is-streaming');
            renderSuggestions(s.msg, buildSuggestions([]));
            if (speechChunker && data.text) {
                speechChunker.push(data.text);
                speechChunker.flush();
            }
            scrollToBottom();
            if (isCurrent()) setLoading(false);
            return;
        }

        var bubble = null;
        var outerBubble = null;
        var time = null;
        var cardsContainer = null;
        var msgDiv = null;
        var botAvatar = null;
        let fullText = '';
        var firstToken = true;
        var pendingCards = [];

        function ensureBubble() {
            if (!firstToken) return;
            if (isCurrent()) hideTyping();
            var s = addStreamingMessage();
            bubble = s.bubble;
            outerBubble = s.outerBubble;
            time = s.time;
            cardsContainer = s.cardsContainer;
            msgDiv = s.msg;
            botAvatar = s.botAvatar;
            outerBubble.classList.add('is-streaming');
            if (botAvatar) botAvatar.classList.add('db-speaking');
            firstToken = false;
        }

        function flushCards() {
            for (var i = 0; i < pendingCards.length; i++) {
                renderCard(cardsContainer, pendingCards[i]);
            }
            pendingCards.length = 0;
        }

        // ---- Typewriter pacing ----
        // gpt tokens arrive faster than the eye can follow (a whole answer in
        // ~0.2 s), which reads as the message "popping in". Reveal the text at
        // reading speed instead, accelerating with backlog so long answers
        // still catch up, and finish the bubble only when the reveal lands.
        var displayedLen = 0;
        var typerActive = false;
        var streamDone = false;
        var finalized = false;
        var suggList = null;

        function finalizeBubble() {
            if (finalized) return;
            finalized = true;
            cancelAck();
            if (speechChunker) speechChunker.flush();
            if (bubble) {
                bubble.innerHTML = formatBotMessage(fullText);
                bubble.appendChild(time);
            }
            if (suggList === null) suggList = buildSuggestions(pendingCards);
            // This answer's places, for its follow-up buttons (placeTarget).
            if (msgDiv) {
                msgDiv._dbPlaces = pendingCards.filter(function (c) {
                    return c && c.type === 'place' && c.lat != null && c.lon != null;
                });
            }
            flushCards();
            if (outerBubble) outerBubble.classList.remove('is-streaming');
            if (botAvatar) botAvatar.classList.remove('db-speaking');
            if (msgDiv) renderSuggestions(msgDiv, suggList);
            scrollToBottom();
        }
        // Superseded mid-stream: land whatever text arrived and tie the bubble off.
        finalizePartial = function () {
            streamDone = true;
            displayedLen = fullText.length;
            finalizeBubble();
        };

        function runTyper() {
            if (typerActive) return;
            typerActive = true;
            // setTimeout, NOT requestAnimationFrame: rAF freezes in hidden/
            // background tabs, which would stall the reveal AND the finalize
            // step (cards, suggestions) until the tab is refocused.
            function step() {
                var target = fullText.length;
                // Hidden tab → nothing to animate for anyway; land it all.
                if (document.hidden) displayedLen = target;
                if (displayedLen < target) {
                    var backlog = target - displayedLen;
                    // ~2 chars/tick at a calm pace; proportionally faster the
                    // further behind we are (and much faster once the stream
                    // has ended — no reason to dawdle on a finished answer).
                    var speed = streamDone ? Math.max(8, backlog / 6)
                                           : Math.max(2, backlog / 24);
                    displayedLen = Math.min(target, displayedLen + Math.ceil(speed));
                    if (bubble) {
                        bubble.innerHTML = formatStreaming(fullText.slice(0, displayedLen));
                        scrollToBottom();
                    }
                    setTimeout(step, 28);
                } else if (streamDone) {
                    typerActive = false;
                    finalizeBubble();
                } else {
                    typerActive = false; // idle — the next token restarts us
                }
            }
            setTimeout(step, 0);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const json = line.slice(6).trim();
                if (!json) continue;
                try {
                    const ev = JSON.parse(json);
                    if (ev.type === 'card') {
                        // Buffer until text finishes — cards render below the message
                        pendingCards.push(ev.card);
                        // ...but the MAP reacts right away: pins drop and the route reveals
                        // while the typewriter is still revealing the text.
                        if (isCurrent()) previewCardOnMap(ev.card);
                    } else if (ev.type === 'reaction') {
                        playReaction(ev);
                    } else if (ev.type === 'token') {
                        ensureBubble();
                        fullText += ev.content;
                        // Voice gets the raw feed immediately — only the
                        // VISUAL reveal is paced.
                        if (speechChunker) speechChunker.push(ev.content);
                        runTyper();
                    } else if (ev.type === 'done') {
                        ensureBubble();
                        cancelAck();   // answer landed — a late ack would be noise
                        // Build follow-ups from the cards BEFORE flushCards clears them
                        suggList = buildSuggestions(pendingCards);
                        streamDone = true;
                        runTyper();    // finalizes once the reveal catches up
                    } else if (ev.type === 'error') {
                        ensureBubble();
                        fullText += ' [Error: ' + ev.content + ']';
                        streamDone = true;
                        displayedLen = fullText.length;  // no typewriter on errors
                        finalizeBubble();
                    }
                } catch (_) {}
            }
        }

        if (isCurrent()) hideTyping();
        if (!fullText) {
            cancelAck();
            if (speechChunker) speechChunker.flush();
            if (botAvatar) botAvatar.classList.remove('db-speaking');
            if (!bubble) {
                var sf = addStreamingMessage();
                bubble = sf.bubble; time = sf.time;
                cardsContainer = sf.cardsContainer;
                outerBubble = sf.outerBubble;
                msgDiv = sf.msg;
            }
            bubble.textContent = t('errNoAnswer');
            bubble.appendChild(time);
            if (outerBubble) outerBubble.classList.remove('is-streaming');
            if (pendingCards.length && cardsContainer) flushCards();
        } else {
            // Stream ended (with or without an explicit `done`): let the
            // typewriter finish the reveal — finalizeBubble ties off the
            // text, cards, suggestions, ack and avatar state.
            streamDone = true;
            runTyper();
        }

        if (isCurrent()) setLoading(false);

    } catch (err) {
        cancelAck();
        if (err && err.name === 'AbortError') {
            // Superseded by a newer question: keep the text that arrived, no error bubble.
            if (finalizePartial) finalizePartial();
            return;
        }
        console.error('Dashbot Error:', err);
        if (isCurrent()) { hideTyping(); setLoading(false); }
        addMessage(
            err.message.includes('Failed to fetch') ? t('errConnect') : t('errGeneric'),
            false
        );
    } finally {
        if (activeController === controller) activeController = null;
    }

    if (!wasVoice && !speakMode) input.focus();   // after a spoken question, don't pop the keyboard
}

console.log('Dashbot widget initialized — base URL:', DASHBOT_BASE_URL);

}

