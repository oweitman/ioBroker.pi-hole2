/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const sinon = require('sinon');
const ServerMod = require('../../lib/piholeserver.js');

function isClass(fn) { return typeof fn === 'function' && /^\s*class[\s{]/.test(fn.toString()); }

describe('piholeserver – delegation & state', function () {
    let inst, fake;

    function construct() {
        const opts = { baseUrl: 'http://127.0.0.1:8080', password: 'secret', timeoutMs: 200 };
        const tries = [() => new ServerMod(opts), () => new ServerMod('http://127.0.0.1:8080', 'secret'), () => new ServerMod()];
        let lastErr;
        for (const t of tries) { try { return t(); } catch (e) { lastErr = e; } }
        throw new Error(`cannot construct: ${lastErr && lastErr.message}`);
    }

    function inject(inst, fake) {
        // Versuche typische Felder zu ersetzen
        for (const k of ['client', 'api', 'apiClient', '_client', '_api', '_apiClient']) {
            try { inst[k] = fake; } catch (_) { }
        }
        // Fallback: Methoden suchen & ersetzen
        for (const v of Object.values(inst)) {
            if (v && typeof v === 'object') {
                ['getVersion', 'getSummary', 'enableBlocking', 'disableBlocking'].forEach(m => {
                    if (typeof v[m] === 'function') v[m] = fake[m];
                });
            }
        }
    }

    beforeEach(function () {
        if (!isClass(ServerMod)) this.skip();
        inst = construct();
        fake = {
            getVersion: sinon.stub().resolves({ ok: true }),
            getSummary: sinon.stub().resolves({ queries: { total: 1 }, clients: { total: 2 } }),
            enableBlocking: sinon.stub().resolves({ ok: true }),
            disableBlocking: sinon.stub().resolves({ ok: true }),
        };
        inject(inst, fake);
    });

    afterEach(function () { sinon.restore(); });

    it('getVersion delegates', async function () {
        if (typeof inst.getVersion !== 'function') this.skip();
        const res = await inst.getVersion();
        expect(fake.getVersion.calledOnce).to.be.true;
        expect(res).to.be.an('object');
    });

    it('getSummary delegates & error path', async function () {
        if (typeof inst.getSummary !== 'function') this.skip();
        await inst.getSummary();
        fake.getSummary.resetHistory();
        fake.getSummary.rejects(new Error('Boom'));
        await expect(inst.getSummary()).to.be.rejectedWith(/Boom/);
    });

    it('blocking on/off delegates (incl. time)', async function () {
        const hasSet = typeof inst.setBlocking === 'function';
        const hasEnable = typeof inst.enableBlocking === 'function';
        const hasDisable = typeof inst.disableBlocking === 'function';

        if (!hasSet && !hasEnable && !hasDisable) {
            this.skip(); // keine Blocking-API vorhanden -> sauber überspringen
        }

        const fake = {
            enableBlocking: sinon.stub().resolves({ ok: true }),
            disableBlocking: sinon.stub().resolves({ ok: true }),
        };
        // falls du oben schon ein fake injizierst, hier ggf. entfernen;
        // ansonsten injiziere:
        for (const k of ['client', 'api', 'apiClient', '_client', '_api', '_apiClient']) {
            try { inst[k] = { ...inst[k], ...fake }; } catch (_) { }
        }

        if (hasSet) {
            await inst.setBlocking(true);
            await inst.setBlocking(false, 30);
        } else {
            if (hasEnable) await inst.enableBlocking();
            if (hasDisable) await inst.disableBlocking(30);
        }

        const called =
            (fake.enableBlocking && fake.enableBlocking.called) ||
            (fake.disableBlocking && fake.disableBlocking.called);
        expect(Boolean(called)).to.be.true;
    });
});
