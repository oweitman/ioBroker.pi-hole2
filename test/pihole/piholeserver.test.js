/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const sinon = require('sinon');

describe('piholeserver (unit, no http)', function () {
    let ServerMod;
    before(function () {
        ServerMod = require('../../lib/piholeserver.js'); // Pfad prüfen
    });

    function isClass(fn) {
        if (typeof fn !== 'function') return false;
        const src = Function.prototype.toString.call(fn);
        return /^\s*class[\s{]/.test(src);
    }

    function createInstance() {
        // Versuche einige übliche Konstruktor-Signaturen
        const opts = { baseUrl: 'http://127.0.0.1:8080', password: 'secret', timeoutMs: 500 };
        const tries = [
            () => new ServerMod(opts),
            () => new ServerMod('http://127.0.0.1:8080', 'secret'),
            () => new ServerMod(),
        ];
        let inst, lastErr;
        for (const t of tries) {
            try { inst = t(); break; } catch (e) { lastErr = e; }
        }
        if (!inst) throw new Error(`Could not construct piholeserver: ${lastErr && lastErr.message}`);
        return inst;
    }

    function injectFakeClient(inst, fake) {
        const keysToTry = ['client', 'api', 'apiClient', '_client', '_api', '_apiClient'];
        for (const k of keysToTry) {
            try { inst[k] = fake; } catch (_) { }
        }
        // Zusätzlich: versuche vorhandene Client-ähnliche Property zu finden
        const vals = Object.values(inst || {});
        for (const v of vals) {
            if (v && typeof v === 'object') {
                if (['getVersion', 'getSummary', 'enableBlocking', 'disableBlocking'].some(m => typeof v[m] === 'function')) {
                    // Wir ersetzen Methoden dieses Objekts durch unsere Stubs
                    if (typeof v.getVersion === 'function') v.getVersion = fake.getVersion;
                    if (typeof v.getSummary === 'function') v.getSummary = fake.getSummary;
                    if (typeof v.enableBlocking === 'function') v.enableBlocking = fake.enableBlocking;
                    if (typeof v.disableBlocking === 'function') v.disableBlocking = fake.disableBlocking;
                }
            }
        }
    }

    it('constructs (module is a class or factory)', function () {
        if (isClass(ServerMod)) {
            const inst = createInstance();
            expect(inst).to.be.an('object');
        } else if (typeof ServerMod === 'function') {
            // Falls es eine Factory ist, die selbst Instanzen zurückgibt
            const inst = ServerMod({ baseUrl: 'http://127.0.0.1:8080', password: 'secret' });
            expect(inst).to.be.an('object');
        } else {
            // Objekt-Export ist auch ok
            expect(ServerMod).to.be.an('object');
        }
    });

    describe('delegation to ApiClient', function () {
        let inst, fake;
        beforeEach(function () {
            if (!isClass(ServerMod)) this.skip();
            inst = createInstance();
            fake = {
                getVersion: sinon.stub().resolves({ version: '6.0.0', api: 'v1' }),
                getSummary: sinon.stub().resolves({ queries: { total: 1, blocked: 0 }, clients: { active: 1, total: 2 } }),
                enableBlocking: sinon.stub().resolves({ ok: true }),
                disableBlocking: sinon.stub().resolves({ ok: true }),
            };
            injectFakeClient(inst, fake);
        });

        it('getVersion() delegates and returns data', async function () {
            if (typeof inst.getVersion !== 'function') this.skip();
            const res = await inst.getVersion();
            expect(fake.getVersion.calledOnce).to.be.true;
            expect(res).to.deep.include({ version: '6.0.0' });
        });

        it('getSummary() delegates and propagates errors', async function () {
            if (typeof inst.getSummary !== 'function') this.skip();

            // OK path
            let res = await inst.getSummary();
            expect(res).to.be.an('object');
            expect(fake.getSummary.calledOnce).to.be.true;

            // Error path
            fake.getSummary.resetHistory();
            fake.getSummary.rejects(new Error('HTTP 401'));
            await expect(inst.getSummary()).to.be.rejectedWith(/401/);
            expect(fake.getSummary.calledOnce).to.be.true;
        });

        it('enable/disable blocking delegates (with optional time)', async function () {
            const hasEnable = typeof inst.enableBlocking === 'function';
            const hasDisable = typeof inst.disableBlocking === 'function';
            const hasSet = typeof inst.setBlocking === 'function';

            if (!(hasEnable || hasSet) || !(hasDisable || hasSet)) this.skip();

            if (hasSet) {
                await inst.setBlocking(true);
                await inst.setBlocking(false, 60);
            } else {
                await inst.enableBlocking();
                await inst.disableBlocking(60);
            }

            expect(fake.enableBlocking.called || fake.disableBlocking.called).to.be.true;
        });
    });
});
