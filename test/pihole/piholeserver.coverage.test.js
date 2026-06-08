/* eslint-disable no-unused-expressions */
'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const PiholeServer = require('../../lib/piholeserver.js');

function makeAdapter() {
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
            enabledetailedversion: false,
            enabledetailedsummary: false,
        },
        log: {
            debug: sinon.spy(),
            silly: sinon.spy(),
            info: sinon.spy(),
            warn: sinon.spy(),
            error: sinon.spy(),
        },
        subscribeStates: sinon.spy(),
        sendTo: sinon.spy(),
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
        delay: sinon.stub().resolves(),
    };
}

function initMinimalFields(server) {
    server.stateTemplate = {
        Summary: { name: 'Summary' },
        Blocking: { name: 'Blocking' },
    };

    server.stateTemplateDetailedVersion = {
        CoreLocal: { name: 'CoreLocal' },
    };

    server.stateTemplateDetailedSummary = {
        QueriesTotal: { name: 'QueriesTotal' },
    };

    server.detailedDatapointsPath = 'Data';
    server.detailedDatapointsVersionPath = 'Version';
    server.detailedDatapointsSummaryPath = 'Summary';
    server.colorDisabled = '#ff0000';
    server.colorEnabled = '#00C853';
    server.data = [];
}

describe('piholeserver coverage helpers', () => {
    let server;
    let adapter;

    beforeEach(() => {
        adapter = makeAdapter();
        server = new PiholeServer(adapter);
        server.ioUtil = /** @type {any} */ (makeIoUtil());
        server.pihole = /** @type {any} */ ({
            checkOnline: sinon.stub().resolves(false),
            getSummary: sinon.stub().resolves({ ok: false, error: 'OFFLINE', body: null, response: null }),
            getSystem: sinon.stub().resolves({ ok: false, error: 'OFFLINE', body: null, response: null }),
            getBlocking: sinon.stub().resolves({ ok: false, error: 'OFFLINE', body: null, response: null }),
            getVersion: sinon.stub().resolves({ ok: false, error: 'OFFLINE', body: null, response: null }),
            getTopClients: sinon.stub().resolves({ ok: false, error: 'OFFLINE', body: null, response: null }),
            getTopDomains: sinon.stub().resolves({ ok: false, error: 'OFFLINE', body: null, response: null }),
            setBlocking: sinon.stub().resolves({ ok: false, error: 'OFFLINE', body: null, response: null }),
            getGeneralPiholeAPI: sinon.stub().resolves({ ok: false, error: 'OFFLINE', body: null, response: null }),
        });

        initMinimalFields(server);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('handles missing pihole client without throwing', async () => {
        server.pihole = null;

        await server.getDataSummary();
        await server.getDataSystem();
        await server.getDataBlocking();
        await server.getDataVersion();
        await server.getDataTop();
        await server.doToggleBlocking();

        expect(true).to.equal(true);
    });

    it('handles failed getData methods without throwing', async () => {
        await server.getDataSummary();
        await server.getDataSystem();
        await server.getDataBlocking();
        await server.getDataVersion();
        await server.getDataTop();

        expect(adapter.log.warn.callCount).to.be.greaterThan(0);
    });

    it('handles invalid message payload without throwing', async () => {
        await server.piHoleApi({ message: null });
        await server.piHoleApi({ message: 'invalid' });

        sinon.assert.notCalled(server.pihole.getGeneralPiholeAPI);
    });

    it('handles stateChange with missing input without throwing', async () => {
        await server.stateChange(null, null);
        await server.stateChange('adapter.0.Blocking', null);
        await server.stateChange('adapter.0.Blocking', { ack: true });

        sinon.assert.notCalled(server.pihole.getBlocking);
    });
});
