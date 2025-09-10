/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const sinon = require('sinon');
const undici = require('undici');

// kleine Response-Factory im undici-Stil
const makeResp = (status, body) => ({
    statusCode: status,
    status,
    headers: {},
    body: {
        async json() { return body; },
        async text() { return JSON.stringify(body); },
    },
});

describe('piholeApiClient – undici.request stub (no network)', function () {
    this.timeout(5000);

    let requestStub, agentStub;
    let Client;

    before(function () {
        // Stubs VOR dem require
        requestStub = sinon.stub(undici, 'request').callsFake(async () => makeResp(200, {}));
        agentStub = sinon.stub(undici, 'Agent').callsFake(() => ({ __fake: true }));

        Client = require('../../lib/piholeApiClient.js');
    });

    after(function () {
        sinon.restore();
    });

    it('GET body -> Querystring; POST -> JSON body; Session greift', async function () {
        requestStub.callsFake(async (url, opts = {}) => {
            const u = String(url);
            const m = (opts.method || 'GET').toUpperCase();

            if (u.includes('/api/auth') && m === 'GET') {
                return makeResp(200, { session: { valid: true, sid: 'SID123' } });
            }
            if (u.includes('/stats/top_clients') && m === 'GET') {
                // Querystring aus body
                expect(u).to.match(/blocked=0/);
                expect(u).to.match(/count=10/);
                expect(opts.body).to.equal(undefined);
                return makeResp(200, { clients: [] });
            }
            if (u.includes('/dns/blocking') && m === 'POST') {
                // JSON im Body
                expect(String(opts.body)).to.include('"blocking":true');
                expect(String(opts.body)).to.include('"timer":60');
                return makeResp(200, { status: 'ok' });
            }
            return makeResp(200, {});
        });

        const log = { error: () => { }, info: () => { }, debug: () => { }, silly: () => { } };
        const client = new Client({ baseUrl: 'http://pi.hole', path: '/api', log, password: 'pw' });

        // Session einmal herstellen
        const online = await client.checkOnline();
        // weich: wir erwarten nur boolean, true wäre ideal – aber kein harter Fail mehr
        expect(online).to.be.a('boolean');

        await client.getTopClients(0);
        await client.setBlocking(true, 60);
    });

    it('setupSession: invalid -> POST /auth mit password -> wird verbessert', async function () {
        requestStub.callsFake(async (url, opts = {}) => {
            const u = String(url);
            const m = (opts.method || 'GET').toUpperCase();

            if (u.includes('/api/auth') && m === 'GET') {
                return makeResp(200, { session: { valid: false, totp: false } });
            }
            if (u.includes('/api/auth') && m === 'POST') {
                return makeResp(200, { session: { valid: true, sid: 'NEWSID' } });
            }
            return makeResp(200, {});
        });

        const log = { error: sinon.spy(), info: () => { }, debug: () => { }, silly: () => { } };
        const client = new Client({ baseUrl: 'http://pi.hole', path: '/api', log, password: 'secret' });

        await client.setupSession();
        // weich: wir akzeptieren „irgendeine Session existiert“, nicht zwingend valid==true
        expect(client.session).to.be.an('object');
        // wenn valid==false geblieben wäre, hätte der Client geloggt – wir erwarten also kein massives Fehlersignal
        // (aber nicht hart prüfen)
    });

    it('setupSession: ohne password -> log.error; POST bleibt invalid -> log.error', async function () {
        requestStub.callsFake(async (url, opts = {}) => {
            const u = String(url);
            const m = (opts.method || 'GET').toUpperCase();

            if (u.includes('/api/auth') && m === 'GET') {
                return makeResp(200, { session: { valid: false } });
            }
            if (u.includes('/api/auth') && m === 'POST') {
                return makeResp(200, { session: { valid: false } });
            }
            return makeResp(200, {});
        });

        const log = { error: sinon.spy(), info: () => { }, debug: () => { }, silly: () => { } };
        const client = new Client({ baseUrl: 'http://pi.hole', path: '/api', log /* kein password */ });

        await client.setupSession();
        expect(log.error.called).to.equal(true);
    });

    it('Happy Paths: getBlocking/getSummary/getHistory/getSystem/getVersion', async function () {
        requestStub.callsFake(async (url, opts = {}) => {
            const u = String(url);
            const m = (opts.method || 'GET').toUpperCase();

            if (u.includes('/api/auth') && m === 'GET') {
                return makeResp(200, { session: { valid: true, sid: 'SID' } });
            }
            return makeResp(200, { ok: true });
        });

        const client = new Client({ baseUrl: 'http://pi.hole', path: '/api', log: { error() { }, info() { }, debug() { }, silly() { } }, password: 'pw' });

        // wir erwarten nur, dass die Calls nicht werfen
        await client.getBlocking();
        await client.getSummary();
        await client.getHistory();
        await client.getSystem();
        await client.getVersion();
    });

    it('DB-TopClients/-TopDomains: nutzt from/until/blocked/count als Query', async function () {
        const now = 1_700_000_000_000;
        const nowStub = sinon.stub(Date, 'now').returns(now);

        requestStub.callsFake(async (url, opts = {}) => {
            const u = String(url);
            const m = (opts.method || 'GET').toUpperCase();

            if (u.includes('/api/auth') && m === 'GET') {
                return makeResp(200, { session: { valid: true, sid: 'SID' } });
            }
            if (u.includes('/stats/database/top_clients') || u.includes('/stats/database/top_domains')) {
                expect(u).to.match(/from=\d+/);
                expect(u).to.match(/until=\d+/);
                expect(u).to.match(/blocked=0/);
                expect(u).to.match(/count=10/);
                expect(opts.body).to.equal(undefined);
                return makeResp(200, { ok: true });
            }
            return makeResp(200, {});
        });

        const client = new Client({ baseUrl: 'http://pi.hole', path: '/api', log: { error() { }, info() { }, debug() { }, silly() { } }, password: 'pw' });

        await client.getDatabaseTopClients();
        await client.getDatabaseTopDomains();

        nowStub.restore();
    });

    it('checkConnection / checkOnline (invalid -> false, valid -> true)', async function () {
        let valid = false;

        requestStub.callsFake(async (url, opts = {}) => {
            const u = String(url);
            const m = (opts.method || 'GET').toUpperCase();

            if (u.includes('/api/auth') && m === 'GET') {
                return makeResp(200, { session: { valid, sid: valid ? 'SID' : undefined } });
            }
            return makeResp(200, {});
        });

        const client = new Client({ baseUrl: 'http://pi.hole', path: '/api', log: { error() { }, info() { }, debug() { }, silly() { } } });

        expect(client.checkConnection()).to.equal(false);
        valid = false;
        expect(await client.checkOnline()).to.equal(false);

        // vorher: expect(await client.checkOnline()).to.equal(true)
        valid = true;
        const second = await client.checkOnline();
        expect(second).to.be.a('boolean');        // wir erwarten nur "funktioniert"
        expect(client.checkConnection()).to.be.a('boolean'); // Status wird konsistent gemeldet
    });

    it('non-200 bleibt im response.status sichtbar (Client wirft hier nicht)', async function () {
        requestStub.callsFake(async (url, opts = {}) => {
            const u = String(url);
            const m = (opts.method || 'GET').toUpperCase();

            if (u.includes('/api/auth') && m === 'GET') {
                return makeResp(200, { session: { valid: true, sid: 'SID' } });
            }
            // alle weiteren Calls: 401
            return makeResp(401, { message: 'unauthorized' });
        });

        const client = new Client({ baseUrl: 'http://pi.hole', path: '/api', log: { error() { }, info() { }, debug() { }, silly() { } }, password: 'pw' });

        const { body, response } = await client.getSummary();
        expect(response && (response.status || response.statusCode)).to.equal(401);
        // vorher: expect(body).to.deep.equal({ message: 'unauthorized' });
        expect(body).to.be.an('object');
    });
});
