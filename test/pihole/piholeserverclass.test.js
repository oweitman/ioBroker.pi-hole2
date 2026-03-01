/* eslint-disable no-unused-expressions */
'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

// >>> Pfad ggf. anpassen (liegt die Klasse im Projekt-Root oder in src/?)
const PiholeServer = require('../../lib/piholeserver.js');

// ------------------------------
// Fixtures
// ------------------------------
const fx = {
    summary: { queries: { total: 100, blocked: 7 }, clients: { active: 3, total: 5 } },
    system: { cpu: { load: 0.12 } },
    blockingEnabled: { body: { blocking: 'enabled' } },
    blockingDisabled: { body: { blocking: 'disabled' } },
    version: {
        version: {
            core: { local: { version: 'v1' }, remote: { version: 'v2' } },
            web: { local: { version: 'v1' }, remote: { version: 'v1' } },
            ftl: { local: { version: 'v3' }, remote: { version: 'v4' } },
            docker: { local: '2024.01', remote: '2025.01' },
        },
    },
    topClients: { clients: [{ ip: '1.2.3.4', count: 42 }] },
    topDomains: { domains: [{ domain: 'example.com', count: 21 }] },
};

// ------------------------------
// Test-Doubles
// ------------------------------
function makeAdapter(overrides = {}) {
    return {
        config: {
            password: 'x',
            address: 'http://pi',
            refreshSummary: 1,
            refreshBlocking: 1,
            refreshSystem: 1,
            refreshTop: 1,
            refreshVersion: 1,
            enabledetailedversion: true,
            enabledetailedsummary: true,
            ...overrides.config,
        },
        log: {
            debug: () => { },
            silly: () => { },
            info: () => { },
            warn: () => { },
            error: () => { },
            ...(overrides.log || {}),
        },
        subscribeStates: sinon.spy(),
        sendTo: sinon.spy(),
        ...overrides,
    };
}

function makeIoUtil() {
    return {
        logdebug: sinon.spy(),
        logsilly: sinon.spy(),
        checkNumberRange: sinon.stub().callsFake((v, min, max, def) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return def;
            return Math.max(min, Math.min(max, n));
        }),
        createFolderNotExistsAsync: sinon.stub().resolves(),
        createObjectNotExistsAsync: sinon.stub().resolves(),
        extendObjectAsync: sinon.stub().resolves(),
        getStateAsync: sinon.stub().resolves({ val: null }),
        setStateAsync: sinon.stub().resolves(),
        delay: sinon.stub().resolves(), // sofort "fertig"
    };
}

function makePiholeMock() {
    return {
        setupSession: sinon.stub().resolves(),
        checkConnection: sinon.stub().returns(true),
        getSummary: sinon.stub().resolves({ body: fx.summary }),
        getSystem: sinon.stub().resolves({ body: fx.system }),
        getBlocking: sinon.stub().resolves(fx.blockingEnabled),
        setBlocking: sinon.stub().resolves({}),
        getVersion: sinon.stub().resolves({ body: fx.version }),
        getTopClients: sinon.stub().resolves({ body: fx.topClients }),
        getTopDomains: sinon.stub().resolves({ body: fx.topDomains }),
        getGeneralPiholeAPI: sinon.stub().resolves({ body: { ok: true } }),
    };
}

// ------------------------------
// Tests
// ------------------------------
describe('piholeserverclass', () => {
    let adapter;
    let server;

    beforeEach(() => {
        adapter = makeAdapter();
        server = new PiholeServer(adapter);

        // ioUtil und pihole nachträglich ersetzen (kein echter HTTP/Adapter-Zugriff)
        server.ioUtil = makeIoUtil();
        server.pihole = makePiholeMock();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('checkConfigParameters', () => {
        it('clamped Werte setzen (min/max/Defaults)', () => {
            adapter.config.refreshSummary = '999999'; // zu groß -> clamp auf 86400
            adapter.config.refreshBlocking = -10;     // zu klein -> clamp auf 1
            adapter.config.refreshSystem = 'abc';     // NaN -> default 20
            adapter.config.refreshTop = Infinity;     // -> max 86400
            adapter.config.refreshVersion = null;     // -> default 120

            server.checkConfigParameters();

            expect(server.refreshSummary).to.equal(86400);
            expect(server.refreshBlocking).to.equal(1);
            expect(server.refreshSystem).to.equal(20);
            expect(server.refreshTop).to.equal(86400);
            expect(server.refreshVersion).to.equal(120);
        });
    });

    describe('checkDatapoints / Detailed checks', () => {
        it('checkDatapoints erstellt States falls nicht existent', async () => {
            // getStateAsync liefert null, sodass createObjectNotExistsAsync aufgerufen wird
            await server.checkDatapoints();

            // Mindestens einmal für ein Template aufgerufen
            expect(server.ioUtil.createObjectNotExistsAsync.callCount).to.be.greaterThan(0);
            expect(server.ioUtil.getStateAsync.callCount).to.be.greaterThan(0);
        });

        it('checkDatapointsDetailedVersion setzt Farbe je nach enabledetailedversion', async () => {
            adapter.config.enabledetailedversion = true;
            await server.checkDatapointsDetailedVersion();

            const colorCalls = server.ioUtil.extendObjectAsync.getCalls().filter(c => {
                const args = c.args;
                return args[0] && typeof args[3] === 'object' && args[3].common && 'color' in args[3].common;
            });

            expect(colorCalls.length).to.be.greaterThan(0);
            // Prüfe, dass mindestens ein extendObjectAsync mit Enabled-Farbe kam
            const hasEnabled = colorCalls.some(c => c.args[3].common.color === server.colorEnabled);
            expect(hasEnabled).to.be.true;

            // Toggle: disabled → rote Farbe
            server.ioUtil.extendObjectAsync.resetHistory();
            adapter.config.enabledetailedversion = false;
            await server.checkDatapointsDetailedVersion();

            const colorCalls2 = server.ioUtil.extendObjectAsync.getCalls().filter(c => {
                const args = c.args;
                return args[0] && typeof args[3] === 'object' && args[3].common && 'color' in args[3].common;
            });
            const hasDisabled = colorCalls2.some(c => c.args[3].common.color === server.colorDisabled);
            expect(hasDisabled).to.be.true;
        });

        it('checkDatapointsDetailedSummary setzt Farbe je nach enabledetailedsummary', async () => {
            adapter.config.enabledetailedsummary = true;
            await server.checkDatapointsDetailedSummary();

            let colorCalls = server.ioUtil.extendObjectAsync.getCalls().filter(c => {
                const args = c.args;
                return args[0] && typeof args[3] === 'object' && args[3].common && 'color' in args[3].common;
            });
            expect(colorCalls.length).to.be.greaterThan(0);
            const hasEnabled = colorCalls.some(c => c.args[3].common.color === server.colorEnabled);
            expect(hasEnabled).to.be.true;

            server.ioUtil.extendObjectAsync.resetHistory();
            adapter.config.enabledetailedsummary = false;
            await server.checkDatapointsDetailedSummary();
            colorCalls = server.ioUtil.extendObjectAsync.getCalls().filter(c => c.args?.[3]?.common?.color);
            const hasDisabled = colorCalls.some(c => c.args[3].common.color === server.colorDisabled);
            expect(hasDisabled).to.be.true;
        });
    });

    describe('getData* Basics', () => {
        it('getDataSummary schreibt Summary und Detailed', async () => {
            await server.getDataSummary();

            sinon.assert.calledWith(
                server.ioUtil.setStateAsync,
                'Summary',
                JSON.stringify(fx.summary),
                null,
                null
            );
            // Detailed Werte
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'QueriesTotal', 100);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'QueriesBlocked', 7);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'ClientsActive', 3);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'ClientsTotal', 5);
        });

        it('getDataSystem schreibt System', async () => {
            await server.getDataSystem();

            sinon.assert.calledWith(
                server.ioUtil.setStateAsync,
                'System',
                JSON.stringify(fx.system),
                null,
                null
            );
        });

        it('getDataBlocking setzt boolean je nach API', async () => {
            server.pihole.getBlocking.resolves(fx.blockingEnabled);
            await server.getDataBlocking();
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'Blocking', true);

            server.pihole.getBlocking.resolves(fx.blockingDisabled);
            await server.getDataBlocking();
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'Blocking', false);
        });

        it('getDataVersion schreibt Version und Detailed-Updates korrekt', async () => {
            await server.getDataVersion();

            sinon.assert.calledWith(
                server.ioUtil.setStateAsync,
                'Version',
                JSON.stringify(fx.version),
                null,
                null
            );

            // Update-Flags aus Fixtures: core true, web false, ftl true, docker true
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'CoreUpdate', true);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'WebUpdate', false);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'FTLUpdate', true);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'DockerUpdate', true);
        });
    });

    describe('getDataTop & Bug-Check für *Blocked Speicherung', () => {
        it('setzt Top-States und verwechselt nicht unblocked/blocked', async () => {
            // Standard-Mocks liefern jeweils fx.topClients/fx.topDomains
            await server.getDataTop();

            // wurden alle 4 States geschrieben?
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'TopClients', sinon.match.string, null, null);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'TopDomains', sinon.match.string, null, null);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'TopClientsBlocked', sinon.match.string, null, null);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'TopDomainsBlocked', sinon.match.string, null, null);

            // Prüfe, dass die *Blocked-States NICHT die unblocked-Payload enthalten.
            const calls = server.ioUtil.setStateAsync.getCalls().filter(c =>
                ['TopClientsBlocked', 'TopDomainsBlocked'].includes(c.args[0])
            );

            // Payloads parsen und vergleichen
            for (const call of calls) {
                const key = call.args[0];
                const payload = JSON.parse(call.args[1]);

                if (key === 'TopClientsBlocked') {
                    // Wenn der Produktivcode versehentlich dataTopClients.body schreibt,
                    // wäre payload == fx.topClients → Test soll das verhindern.
                    expect(payload).to.not.deep.equal(fx.topClients);
                }
                if (key === 'TopDomainsBlocked') {
                    expect(payload).to.not.deep.equal(fx.topDomains);
                }
            }
        });
    });

    describe('stateChange', () => {
        it('Blocking toggelt und triggert Refresh nach 100ms', async () => {
            const clock = sinon.useFakeTimers();
            const getDataBlockingStub = sinon.stub(server, 'getDataBlocking').resolves();

            // Derzeit enabled → Toggle soll disable (false, Zeit 0) setzen
            server.pihole.getBlocking.resolves(fx.blockingEnabled);

            await server.stateChange('adapter.0.Blocking', { val: true, ack: false });

            sinon.assert.calledWith(server.pihole.setBlocking, false, 0);

            // setTimeout(100) auslösen
            clock.tick(100);
            sinon.assert.calledOnce(getDataBlockingStub);
            clock.restore();
        });

        it('BlockingTime setzt Wert in State', async () => {
            await server.stateChange('adapter.0.BlockingTime', { val: 180, ack: false });

            sinon.assert.calledWith(
                server.ioUtil.setStateAsync,
                'BlockingTime',
                180,
                '',
                ''
            );
        });
    });

    describe('processMessages → piHoleApi', () => {
        it('ruft getGeneralPiholeAPI und sendTo korrekt', async () => {
            await server.processMessages({
                from: 'ctrl',
                command: 'piholeapi',
                callback: '123',
                message: { method: 'GET', endpoint: '/ping', params: {} },
            });

            sinon.assert.calledWith(server.pihole.getGeneralPiholeAPI, 'GET', '/ping', {});
            sinon.assert.calledWith(adapter.sendTo, 'ctrl', 'piholeapi', { ok: true }, '123');
        });
    });

    describe('checkConnection', () => {
        it('schreibt info.connection und gibt Bool zurück', async () => {
            server.pihole.checkConnection.returns(true);
            const res = await server.checkConnection();
            expect(res).to.be.true;

            sinon.assert.calledWith(
                server.ioUtil.setStateAsync,
                'info.connection',
                true,
                null,
                null
            );
        });
    });
});
