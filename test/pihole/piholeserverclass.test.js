/* eslint-disable no-unused-expressions */
'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const PiholeServer = require('../../lib/piholeserver.js');

const fx = {
    summary: { queries: { total: 100, blocked: 7 }, clients: { active: 3, total: 5 } },
    system: { cpu: { load: 0.12 } },
    blockingEnabled: { blocking: 'enabled' },
    blockingDisabled: { blocking: 'disabled' },
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
    topClientsBlocked: { clients: [{ ip: '5.6.7.8', count: 10 }] },
    topDomainsBlocked: { domains: [{ domain: 'blocked.example', count: 9 }] },
};

const ok = body => ({
    ok: true,
    body,
    response: { statusCode: 200 },
});

const fail = message => ({
    ok: false,
    body: null,
    response: null,
    error: new Error(message),
});

function makeAdapter(overrides = {}) {
    return {
        namespace: 'pi-hole2.0',
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
            debug: sinon.spy(),
            silly: sinon.spy(),
            info: sinon.spy(),
            warn: sinon.spy(),
            error: sinon.spy(),
            ...(overrides.log || {}),
        },
        subscribeStates: sinon.spy(),
        sendTo: sinon.spy(),
        ...overrides,
    };
}

/**
 * @returns {any}
 */
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
        delay: sinon.stub().resolves(),
    };
}

/**
 * @returns {any}
 */
function makePiholeMock() {
    return {
        setupSession: sinon.stub().resolves(true),
        checkOnline: sinon.stub().resolves(true),
        getSummary: sinon.stub().resolves(ok(fx.summary)),
        getSystem: sinon.stub().resolves(ok(fx.system)),
        getBlocking: sinon.stub().resolves(ok(fx.blockingEnabled)),
        setBlocking: sinon.stub().resolves(ok({})),
        getVersion: sinon.stub().resolves(ok(fx.version)),
        getTopClients: sinon.stub(),
        getTopDomains: sinon.stub(),
        getGeneralPiholeAPI: sinon.stub().resolves(ok({ ok: true })),
    };
}

function initServerFields(server) {
    server.stateTemplate = {
        Summary: { name: 'Summary', read: true, write: false, type: 'string', role: 'json', def: '{}' },
        TopDomains: { name: 'TopDomains', read: true, write: false, type: 'string', role: 'json', def: '{}' },
        TopClients: { name: 'TopClients', read: true, write: false, type: 'string', role: 'json', def: '{}' },
        TopDomainsBlocked: {
            name: 'TopDomainsBlocked',
            read: true,
            write: false,
            type: 'string',
            role: 'json',
            def: '{}',
        },
        TopClientsBlocked: {
            name: 'TopClientsBlocked',
            read: true,
            write: false,
            type: 'string',
            role: 'json',
            def: '{}',
        },
        System: { name: 'System', read: true, write: false, type: 'string', role: 'json', def: '{}' },
        Version: { name: 'Version', read: true, write: false, type: 'string', role: 'json', def: '{}' },
        Blocking: { name: 'Blocking', read: true, write: true, type: 'boolean', role: 'switch', def: false },
        BlockingTime: { name: 'BlockingTime', read: true, write: true, type: 'number', role: 'level', def: 300 },
    };

    server.stateTemplateDetailedVersion = {
        CoreLocal: { name: 'CoreLocal', read: true, write: false, type: 'string', role: 'text', def: '' },
        CoreRemote: { name: 'CoreRemote', read: true, write: false, type: 'string', role: 'text', def: '' },
        CoreUpdate: { name: 'CoreUpdate', read: true, write: false, type: 'boolean', role: 'state', def: false },
        WebLocal: { name: 'WebLocal', read: true, write: false, type: 'string', role: 'text', def: '' },
        WebRemote: { name: 'WebRemote', read: true, write: false, type: 'string', role: 'text', def: '' },
        WebUpdate: { name: 'WebUpdate', read: true, write: false, type: 'boolean', role: 'state', def: false },
        FTLLocal: { name: 'FTLLocal', read: true, write: false, type: 'string', role: 'text', def: '' },
        FTLRemote: { name: 'FTLRemote', read: true, write: false, type: 'string', role: 'text', def: '' },
        FTLUpdate: { name: 'FTLUpdate', read: true, write: false, type: 'boolean', role: 'state', def: false },
        DockerLocal: { name: 'DockerLocal', read: true, write: false, type: 'string', role: 'text', def: '' },
        DockerRemote: { name: 'DockerRemote', read: true, write: false, type: 'string', role: 'text', def: '' },
        DockerUpdate: { name: 'DockerUpdate', read: true, write: false, type: 'boolean', role: 'state', def: false },
    };

    server.stateTemplateDetailedSummary = {
        QueriesTotal: { name: 'QueriesTotal', read: true, write: false, type: 'number', role: 'value', def: 0 },
        QueriesBlocked: { name: 'QueriesBlocked', read: true, write: false, type: 'number', role: 'value', def: 0 },
        ClientsActive: { name: 'ClientsActive', read: true, write: false, type: 'number', role: 'value', def: 0 },
        ClientsTotal: { name: 'ClientsTotal', read: true, write: false, type: 'number', role: 'value', def: 0 },
    };

    server.detailedDatapointsPath = 'Data';
    server.detailedDatapointsVersionPath = 'Version';
    server.detailedDatapointsSummaryPath = 'Summary';
    server.colorDisabled = '#ff0000';
    server.colorEnabled = '#00C853';
    server.data = [];
}

describe('piholeserverclass', () => {
    let adapter;
    let server;

    beforeEach(() => {
        adapter = makeAdapter();
        server = new PiholeServer(adapter);
        server.ioUtil = makeIoUtil();
        server.pihole = makePiholeMock();

        /** @type {any} */ (server.pihole).getTopClients.withArgs(false).resolves(ok(fx.topClients));
        /** @type {any} */ (server.pihole).getTopClients.withArgs(true).resolves(ok(fx.topClientsBlocked));
        /** @type {any} */ (server.pihole).getTopDomains.withArgs(false).resolves(ok(fx.topDomains));
        /** @type {any} */ (server.pihole).getTopDomains.withArgs(true).resolves(ok(fx.topDomainsBlocked));

        initServerFields(server);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('checkConfigParameters', () => {
        it('clamps values and applies fallback defaults', () => {
            adapter.config.refreshSummary = '999999';
            adapter.config.refreshBlocking = -10;
            adapter.config.refreshSystem = 'abc';
            adapter.config.refreshTop = Infinity;
            adapter.config.refreshVersion = null;

            server.checkConfigParameters();

            expect(server.refreshSummary).to.equal(86400);
            expect(server.refreshBlocking).to.equal(1);
            expect(server.refreshSystem).to.equal(20);
            expect(server.refreshTop).to.equal(60);
            expect(server.refreshVersion).to.equal(1);
        });
    });

    describe('datapoints', () => {
        it('checkDatapoints creates missing main states', async () => {
            await server.checkDatapoints();

            expect(server.ioUtil.createObjectNotExistsAsync.callCount).to.be.greaterThan(0);
            expect(server.ioUtil.getStateAsync.callCount).to.be.greaterThan(0);
        });

        it('checkDatapointsDetailedVersion sets enabled and disabled colors', async () => {
            adapter.config.enabledetailedversion = true;
            await server.checkDatapointsDetailedVersion();

            let colorCalls = server.ioUtil.extendObjectAsync.getCalls().filter(c => c.args?.[3]?.common?.color);
            expect(colorCalls.some(c => c.args[3].common.color === server.colorEnabled)).to.equal(true);

            server.ioUtil.extendObjectAsync.resetHistory();
            adapter.config.enabledetailedversion = false;
            await server.checkDatapointsDetailedVersion();

            colorCalls = server.ioUtil.extendObjectAsync.getCalls().filter(c => c.args?.[3]?.common?.color);
            expect(colorCalls.some(c => c.args[3].common.color === server.colorDisabled)).to.equal(true);
        });

        it('checkDatapointsDetailedSummary sets enabled and disabled colors', async () => {
            adapter.config.enabledetailedsummary = true;
            await server.checkDatapointsDetailedSummary();

            let colorCalls = server.ioUtil.extendObjectAsync.getCalls().filter(c => c.args?.[3]?.common?.color);
            expect(colorCalls.some(c => c.args[3].common.color === server.colorEnabled)).to.equal(true);

            server.ioUtil.extendObjectAsync.resetHistory();
            adapter.config.enabledetailedsummary = false;
            await server.checkDatapointsDetailedSummary();

            colorCalls = server.ioUtil.extendObjectAsync.getCalls().filter(c => c.args?.[3]?.common?.color);
            expect(colorCalls.some(c => c.args[3].common.color === server.colorDisabled)).to.equal(true);
        });
    });

    describe('getData* happy paths', () => {
        it('getDataSummary writes Summary and detailed summary states', async () => {
            await server.getDataSummary();

            sinon.assert.calledWith(server.ioUtil.setStateAsync, 'Summary', JSON.stringify(fx.summary), null, null);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'QueriesTotal', 100);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'QueriesBlocked', 7);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'ClientsActive', 3);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'ClientsTotal', 5);
            sinon.assert.calledWith(server.ioUtil.setStateAsync, 'info.connection', true, null, null);
        });

        it('getDataSystem writes System', async () => {
            await server.getDataSystem();

            sinon.assert.calledWith(server.ioUtil.setStateAsync, 'System', JSON.stringify(fx.system), null, null);
            sinon.assert.calledWith(server.ioUtil.setStateAsync, 'info.connection', true, null, null);
        });

        it('getDataBlocking writes boolean Blocking state', async () => {
            server.pihole.getBlocking.resolves(ok(fx.blockingEnabled));
            await server.getDataBlocking();
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'Blocking', true);

            server.ioUtil.setStateAsync.resetHistory();
            server.pihole.getBlocking.resolves(ok(fx.blockingDisabled));
            await server.getDataBlocking();
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'Blocking', false);
        });

        it('getDataVersion writes Version and detailed version states', async () => {
            await server.getDataVersion();

            sinon.assert.calledWith(server.ioUtil.setStateAsync, 'Version', JSON.stringify(fx.version), null, null);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'CoreUpdate', true);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'WebUpdate', false);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'FTLUpdate', true);
            sinon.assert.calledWithMatch(server.ioUtil.setStateAsync, 'DockerUpdate', true);
        });

        it('getDataTop writes top and blocked top states correctly', async () => {
            await server.getDataTop();

            sinon.assert.calledWith(
                server.ioUtil.setStateAsync,
                'TopClients',
                JSON.stringify(fx.topClients),
                null,
                null,
            );
            sinon.assert.calledWith(
                server.ioUtil.setStateAsync,
                'TopDomains',
                JSON.stringify(fx.topDomains),
                null,
                null,
            );
            sinon.assert.calledWith(
                server.ioUtil.setStateAsync,
                'TopClientsBlocked',
                JSON.stringify(fx.topClientsBlocked),
                null,
                null,
            );
            sinon.assert.calledWith(
                server.ioUtil.setStateAsync,
                'TopDomainsBlocked',
                JSON.stringify(fx.topDomainsBlocked),
                null,
                null,
            );

            expect(server.data.TopClientsBlocked).to.equal(JSON.stringify(fx.topClientsBlocked));
            expect(server.data.TopDomainsBlocked).to.equal(JSON.stringify(fx.topDomainsBlocked));
        });
    });

    describe('error paths', () => {
        it('getDataSummary logs warning and checks connection on failed result', async () => {
            server.pihole.getSummary.resolves(fail('summary failed'));

            await server.getDataSummary();

            sinon.assert.calledOnce(adapter.log.warn);
            sinon.assert.calledOnce(server.pihole.checkOnline);
            sinon.assert.neverCalledWithMatch(server.ioUtil.setStateAsync, 'Summary');
        });

        it('getDataVersion does not analyze invalid result', async () => {
            server.pihole.getVersion.resolves(fail('version failed'));

            await server.getDataVersion();

            sinon.assert.calledOnce(adapter.log.warn);
            sinon.assert.neverCalledWithMatch(server.ioUtil.setStateAsync, 'Version');
        });

        it('analyzeSummary logs warning for invalid structure', async () => {
            await server.analyzeSummary({});

            sinon.assert.calledOnce(adapter.log.warn);
        });

        it('analyzeVersion logs warning for invalid structure', async () => {
            await server.analyzeVersion({});

            sinon.assert.calledOnce(adapter.log.warn);
        });
    });

    describe('stateChange and blocking', () => {
        it('ignores acked state changes', async () => {
            await server.stateChange('adapter.0.Blocking', { val: true, ack: true });

            sinon.assert.notCalled(server.pihole.getBlocking);
            sinon.assert.notCalled(server.pihole.setBlocking);
        });

        it('toggles Blocking and refreshes after timeout', async () => {
            const clock = sinon.useFakeTimers();
            const getDataBlockingStub = sinon.stub(server, 'getDataBlocking').resolves();

            server.pihole.getBlocking.resolves(ok(fx.blockingEnabled));

            await server.stateChange('adapter.0.Blocking', { val: true, ack: false });

            sinon.assert.calledWith(server.pihole.setBlocking, false, 0);

            clock.tick(100);
            sinon.assert.calledOnce(getDataBlockingStub);

            clock.restore();
        });

        it('uses BlockingTime when blocking is currently enabled', async () => {
            const clock = sinon.useFakeTimers();
            sinon.stub(server, 'getDataBlocking').resolves();

            server.data.BlockingTime = 180;
            server.pihole.getBlocking.resolves(ok(fx.blockingEnabled));

            await server.stateChange('adapter.0.Blocking', { val: true, ack: false });

            sinon.assert.calledWith(server.pihole.setBlocking, false, 180);

            clock.restore();
        });

        it('updates BlockingTime state', async () => {
            await server.stateChange('adapter.0.BlockingTime', { val: '180', ack: false });

            expect(server.data.BlockingTime).to.equal(180);
            sinon.assert.calledWith(server.ioUtil.setStateAsync, 'BlockingTime', 180, '', '');
        });

        it('does not throw if getBlocking fails while toggling', async () => {
            server.pihole.getBlocking.resolves(fail('blocking failed'));

            await server.doToggleBlocking();

            sinon.assert.calledOnce(adapter.log.warn);
            sinon.assert.notCalled(server.pihole.setBlocking);
            sinon.assert.calledOnce(server.pihole.checkOnline);
        });
    });

    describe('messages', () => {
        it('piHoleApi sends API response body to callback', async () => {
            await server.piHoleApi({
                from: 'system.adapter.test.0',
                command: 'piholeapi',
                callback: 'cb-1',
                message: {
                    method: 'GET',
                    endpoint: '/stats/summary',
                    params: { count: 10 },
                },
            });

            sinon.assert.calledWith(server.pihole.getGeneralPiholeAPI, 'GET', '/stats/summary', { count: 10 });
            sinon.assert.calledWith(adapter.sendTo, 'system.adapter.test.0', 'piholeapi', { ok: true }, 'cb-1');
        });

        it('piHoleApi sends error response to callback on failed API result', async () => {
            server.pihole.getGeneralPiholeAPI.resolves(fail('custom failed'));

            await server.piHoleApi({
                from: 'system.adapter.test.0',
                command: 'piholeapi',
                callback: 'cb-1',
                message: {
                    method: 'GET',
                    endpoint: '/stats/summary',
                    params: {},
                },
            });

            sinon.assert.calledOnce(adapter.log.warn);
            sinon.assert.calledWithMatch(
                adapter.sendTo,
                'system.adapter.test.0',
                'piholeapi',
                {
                    ok: false,
                    error: 'custom failed',
                },
                'cb-1',
            );
        });

        it('processMessages forwards piholeapi command', () => {
            const piHoleApiStub = sinon.stub(server, 'piHoleApi').resolves();

            server.processMessages({
                command: 'piholeapi',
                message: {},
            });

            sinon.assert.calledOnce(piHoleApiStub);
        });
    });

    describe('connection and subscriptions', () => {
        it('checkConnection uses checkOnline and writes info.connection', async () => {
            server.pihole.checkOnline.resolves(true);

            const result = await server.checkConnection();

            expect(result).to.equal(true);
            sinon.assert.calledWith(server.ioUtil.setStateAsync, 'info.connection', true, null, null);
        });

        it('subscribeDatapoints subscribes writable states', async () => {
            await server.subscribeDatapoints();

            sinon.assert.calledWith(adapter.subscribeStates, 'Blocking');
            sinon.assert.calledWith(adapter.subscribeStates, 'BlockingTime');
        });
    });
});
