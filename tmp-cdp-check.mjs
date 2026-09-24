const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const appUrl = process.argv[2] || 'http://localhost:4317';

const pages = await (await fetch('http://127.0.0.1:9334/json/list')).json();
const page = pages.find((item) => item.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = [];

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
        return;
    }

    if (
        message.method === 'Runtime.exceptionThrown' ||
        message.method === 'Log.entryAdded' ||
        message.method === 'Runtime.consoleAPICalled'
    ) {
        events.push(message);
    }
};

await new Promise((resolve) => {
    ws.onopen = resolve;
});

function send(method, params = {}) {
    return new Promise((resolve) => {
        const callId = ++id;
        pending.set(callId, resolve);
        ws.send(JSON.stringify({ id: callId, method, params }));
    });
}

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.navigate', { url: appUrl });
await wait(2500);
await send('Runtime.evaluate', {
    expression: 'document.getElementById("main-page-trigger").click()'
});
await wait(2000);

const result = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({
        ionApp: !!document.querySelector('ion-app.hydrated'),
        ionContent: !!document.querySelector('ion-content.hydrated'),
        mainDisplay: getComputedStyle(document.getElementById('mainPage')).display,
        landingDisplay: getComputedStyle(document.getElementById('landingPage')).display,
        chips: document.querySelectorAll('.service-category-container ion-chip').length,
        status: document.getElementById('appStatus').textContent,
        cards: document.querySelectorAll('ion-card.service-card').length
    })`
});

console.log(JSON.stringify({
    result: result.result.result.value,
    events: events.map((event) => ({
        method: event.method,
        text: event.params?.entry?.text ||
            event.params?.exceptionDetails?.text ||
            event.params?.args?.map((arg) => arg.value).join(' ')
    }))
}, null, 2));

ws.close();
