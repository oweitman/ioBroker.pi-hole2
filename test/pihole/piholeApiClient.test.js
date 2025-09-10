/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const sinon = require('sinon');

// Pfad ggf. anpassen:
const ApiClient = require('../../lib/piholeApiClient.js');

describe('piholeApiClient (unit, no network)', function () {
    /** @type {any} */
    let client;

    beforeEach(function () {
        // Konstruktionsparameter ggf. an euren Code anpassen
        client = new ApiClient({
            baseUrl: 'http://127.0.0.1:8080',
            password: 'secret',     // oder token
            timeoutMs: 500,
            // falls euer Client eine transport/agent-Dependency nimmt, hier injizieren
        });
    });

    afterEach(function () {
        sinon.restore();
    });

    it('constructs with expected fields', function () {
        expect(client).to.be.an('object');
        // Diese Properties sind bewusst generisch gehalten:
        expect(client).to.have.property('baseUrl');
    });

    describe('transport delegation', function () {
        // Viele Clients haben eine zentrale Methode, z.B. request(), _request() oder doRequest()
        // ✓ Wähle unten die Richtige und lösche die Alternativen.
        const transportMethodNameCandidates = ['request', '_request', 'doRequest'];

        function pickTransport(clientInstance) {
            for (const k of transportMethodNameCandidates) {
                if (typeof clientInstance[k] === 'function') return k;
            }
            return null;
        }

        it('getVersion() calls transport with method/endpoint', async function () {
            if (typeof client.getVersion !== 'function') this.skip();

            const t = pickTransport(client);
            if (!t) this.skip();

            const stub = sinon.stub(client, t).resolves({ version: '6.0.0' });

            const res = await client.getVersion();
            expect(stub.calledOnce).to.be.true;

            // Prüfe, dass Endpoint „irgendwie“ version enthält (pfad ggf. anpassen)
            const args = stub.firstCall.args;
            expect(args[0]).to.match(/GET/i);                    // method
            expect(String(args[1])).to.match(/version/i);        // endpoint
            expect(res).to.deep.include({ version: '6.0.0' });
        });

        it('getSummary() returns shape and bubbles errors', async function () {
            if (typeof client.getSummary !== 'function') this.skip();

            const t = pickTransport(client);
            if (!t) this.skip();

            const stub = sinon.stub(client, t);
            stub.onFirstCall().resolves({ queries: { total: 1, blocked: 0 }, clients: { active: 2, total: 3 } });
            const ok = await client.getSummary();
            expect(ok).to.be.an('object');

            stub.resetHistory();
            stub.rejects(new Error('HTTP 401'));
            await expect(client.getSummary()).to.be.rejectedWith(/401/);
        });

        it('blocking enable/disable maps to correct endpoint', async function () {
            // Namen ggf. anpassen: enableBlocking / disableBlocking / setBlocking(true/false)
            const enable = client.enableBlocking || client.setBlocking;
            const disable = client.disableBlocking || client.setBlocking;

            if (!enable || !disable) this.skip();

            const t = pickTransport(client);
            if (!t) this.skip();

            const stub = sinon.stub(client, t).resolves({ ok: true });

            // enable
            if (enable === client.setBlocking) {
                await client.setBlocking(true);
            } else {
                await client.enableBlocking();
            }
            expect(stub.called).to.be.true;
            expect(String(stub.lastCall.args[1])).to.match(/(enable|blocking)/i);

            stub.resetHistory();

            // disable (mit optionaler Zeit)
            if (disable === client.setBlocking) {
                await client.setBlocking(false, 60);
            } else {
                await client.disableBlocking(60);
            }
            expect(stub.called).to.be.true;
            const ep = String(stub.lastCall.args[1]);
            expect(ep).to.match(/(disable|blocking)/i);
            // optional: prüfe, dass 60 irgendwo in params/body auftaucht
            expect(JSON.stringify(stub.lastCall.args)).to.match(/60/);
        });
    });

    describe('timeout & invalid JSON handling (if implemented in client)', function () {
        it('rejects on timeout', async function () {
            // Falls der Client intern AbortController/Timer nutzt:
            const t = ['request', '_request', 'doRequest'].find(k => typeof client[k] === 'function');
            if (!t) this.skip();

            const err = new Error('timeout');
            err.name = 'AbortError';
            sinon.stub(client, t).rejects(err);

            // wähle eine öffentlich Methode, die den Transport nutzt:
            const fn = client.getSummary || client.getVersion;
            if (!fn) this.skip();

            await expect(fn.call(client)).to.be.rejectedWith(/timeout|abort/i);
        });

        it('rejects on invalid JSON', async function () {
            // Wenn der Client JSON.parse in der öffentlichen Methode macht,
            // stube ggf. eine innere "low-level" Methode, die Raw-Text liefert:
            const parsey = client._parseJson || client.parseJson;
            const fn = client.getSummary || client.getVersion;
            if (!fn || !parsey) this.skip();

            const spy = sinon.spy(client, parsey.name || '_parseJson');
            const t = ['request', '_request', 'doRequest'].find(k => typeof client[k] === 'function');
            if (!t) this.skip();

            // Simuliere Rohstring -> erzwinge Parse-Fehler innerhalb parseJson
            sinon.stub(client, t).resolves('not-json');

            await expect(fn.call(client)).to.be.rejected;
            expect(spy.called).to.be.true;
        });
    });
});
