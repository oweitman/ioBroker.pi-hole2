/* eslint-disable no-unused-expressions */
'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const PiholeServer = require('../../lib/piholeserver.js');
const PiholeClient = require('../../lib/piholeApiClient.js');

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
            enabledetailedversion: true,
            enabledetailedsummary: true,
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

describe('piholeserver module', () => {
    afterEach(() => {
        sinon.restore();
    });

    it('exports a class', () => {
        expect(PiholeServer).to.be.a('function');
        expect(/^class\s/.test(Function.prototype.toString.call(PiholeServer))).to.equal(true);
    });

    it('constructs with adapter and creates ioUtil', () => {
        const adapter = makeAdapter();
        const server = new PiholeServer(adapter);

        expect(server).to.be.an('object');
        expect(server.adapter).to.equal(adapter);
        expect(server.ioUtil).to.be.an('object');
    });

    it('exposes expected public methods', () => {
        const server = new PiholeServer(makeAdapter());

        [
            'init',
            'checkConfigParameters',
            'checkDatapoints',
            'checkDatapointsDetailedVersion',
            'checkDatapointsDetailedSummary',
            'subscribeDatapoints',
            'stateChange',
            'processMessages',
            'piHoleApi',
            'doToggleBlocking',
            'doDataSummary',
            'doDataBlocking',
            'doDataSystem',
            'doDataTop',
            'doDataVersion',
            'doClientDomainStats',
            'checkConnection',
            'getDataSummary',
            'getDataSystem',
            'getDataBlocking',
            'getDataVersion',
            'getDataTop',
            'analyzeVersion',
            'analyzeSummary',
            'getClientDomainStats',
            'getClientQueriesForDay',
            'updateClientDomainStates',
            'sanitizeClientName',
            'isBlockedQueryStatus',
            'aggregateClientDomains',
            'calculateClientQueryDelay',
        ].forEach(method => {
            expect(server[method], method).to.be.a('function');
        });
    });

    it('sanitizes client names for one ioBroker ID segment', () => {
        const server = new PiholeServer(makeAdapter());

        expect(server.sanitizeClientName('phone.home#1')).to.equal('phone_home_1');
        expect(server.sanitizeClientName('  #.#  ')).to.equal('unknown');
    });

    it('aggregates unique domains by blocking status and sorts by count', () => {
        const server = new PiholeServer(makeAdapter());
        const queries = [
            { domain: 'b.example', status: 'FORWARDED' },
            { domain: 'a.example', status: 'CACHE' },
            { domain: 'b.example', status: 'CACHE' },
            { domain: 'ads.example', status: 'GRAVITY' },
            { domain: 'ads.example', status: 'CNAME_REGEX' },
            { domain: 'cname.example', status: 'GRAVITY_CNAME' },
            { domain: 'ede.example', status: 'EXTERNAL_BLOCKED_EDE15' },
            { domain: 'other.example', status: 'DENYLIST' },
        ];

        expect(server.aggregateClientDomains(queries, false)).to.deep.equal([
            { domain: 'b.example', count: 2 },
            { domain: 'a.example', count: 1 },
        ]);
        expect(server.aggregateClientDomains(queries, true)).to.deep.equal([
            { domain: 'ads.example', count: 2 },
            { domain: 'cname.example', count: 1 },
            { domain: 'ede.example', count: 1 },
            { domain: 'other.example', count: 1 },
        ]);
    });

    it('writes absolute total and blocked counts for a client', async () => {
        const server = new PiholeServer(makeAdapter());
        server.clientDatapointsPath = 'Clients';
        server.ioUtil.createObjectChannelAsync = sinon.stub().resolves();
        server.ioUtil.createObjectNotExistsAsync = sinon.stub().resolves();
        server.ioUtil.extendObjectAsync = sinon.stub().resolves();
        server.ioUtil.setStateAsync = sinon.stub().resolves();
        const queries = [
            { domain: 'one.example', status: 'FORWARDED' },
            { domain: 'two.example', status: 'CACHE' },
            { domain: 'ads.example', status: 'GRAVITY_CNAME' },
        ];

        await server.updateClientDomainStates('phone.lan', 'phone_lan', queries);

        sinon.assert.calledWithExactly(server.ioUtil.setStateAsync, 'QueriesTotal', 3, 'Clients', 'phone_lan');
        sinon.assert.calledWithExactly(server.ioUtil.setStateAsync, 'QueriesBlocked', 1, 'Clients', 'phone_lan');
    });

    it('limits the total client delay to the configured refresh percentage', () => {
        const server = new PiholeServer(makeAdapter());
        server.refreshClientDomainStats = 3600;
        server.clientQuerySpread = 10;

        expect(server.calculateClientQueryDelay(1)).to.equal(0);
        expect(server.calculateClientQueryDelay(11)).to.equal(36000);
        expect(server.calculateClientQueryDelay(101) * 100).to.equal(360000);
    });

    it('paginates all current-day queries for one client', async () => {
        const server = new PiholeServer(makeAdapter());
        server.clientQueryPageSize = 2;
        const getQueriesStub = sinon.stub();
        const pihole = Object.create(PiholeClient.prototype);
        pihole.getQueries = getQueriesStub;
        server.pihole = pihole;
        getQueriesStub.onFirstCall().resolves({
            ok: true,
            body: { queries: [{ domain: 'one' }, { domain: 'two' }], cursor: 20 },
        });
        getQueriesStub.onSecondCall().resolves({
            ok: true,
            body: { queries: [{ domain: 'three' }], cursor: 10 },
        });

        const result = await server.getClientQueriesForDay('phone.lan', 100, 200);

        if (!result) {
            throw new Error('Expected query results');
        }
        expect(result.map(query => query.domain)).to.deep.equal(['one', 'two', 'three']);
        sinon.assert.calledWithExactly(getQueriesStub.firstCall, {
            from: 100,
            until: 200,
            length: 2,
            client_name: 'phone.lan',
        });
        sinon.assert.calledWithExactly(getQueriesStub.secondCall, {
            from: 100,
            until: 200,
            length: 2,
            client_name: 'phone.lan',
            cursor: 20,
        });
    });
});
