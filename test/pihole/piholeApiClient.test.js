/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const sinon = require('sinon');

const PiholeClient = require('../../lib/piholeApiClient.js');

describe('piholeApiClient (unit, no network)', function () {
    let client;
    let log;

    beforeEach(function () {
        log = {
            error: sinon.spy(),
            warn: sinon.spy(),
            info: sinon.spy(),
            debug: sinon.spy(),
            silly: sinon.spy(),
        };

        client = new PiholeClient({
            baseUrl: 'http://127.0.0.1:8080',
            path: '/api',
            password: 'secret',
            timeout: 500,
            log,
        });
    });

    afterEach(function () {
        sinon.restore();
    });

    it('constructs with expected fields', function () {
        expect(client).to.be.an('object');
        expect(client.baseUrl).to.equal('http://127.0.0.1:8080/api');
        expect(client.session).to.equal(undefined);
        expect(client.dispatcher).to.equal(undefined);
    });

    it('checkConnection returns false without valid session', function () {
        expect(client.checkConnection()).to.equal(false);
    });

    it('checkConnection returns true with valid session', function () {
        client.session = {
            valid: true,
            sid: 'SID123',
        };

        expect(client.checkConnection()).to.equal(true);
    });

    describe('setupSession', function () {
        it('uses existing valid session from GET /auth', async function () {
            const makeRequestStub = sinon.stub(client, 'makeRequest');

            makeRequestStub.withArgs('GET', '/auth').resolves({
                ok: true,
                body: {
                    session: {
                        valid: true,
                        sid: 'EXISTING',
                    },
                },
                response: {
                    statusCode: 200,
                },
            });

            const result = await client.setupSession();

            expect(result).to.equal(true);
            expect(client.session).to.deep.equal({
                valid: true,
                sid: 'EXISTING',
            });
            sinon.assert.calledOnce(makeRequestStub);
            sinon.assert.calledWith(makeRequestStub, 'GET', '/auth');
        });

        it('logs and returns false if auth check fails', async function () {
            sinon.stub(client, 'makeRequest').resolves({
                ok: false,
                body: null,
                response: null,
                error: new Error('network failed'),
            });

            const result = await client.setupSession();

            expect(result).to.equal(false);
            sinon.assert.calledOnce(log.warn);
            expect(log.warn.firstCall.args[0]).to.match(/auth check failed/i);
        });

        it('logs and returns false if password is missing and auth is invalid', async function () {
            client.options.password = '';

            sinon.stub(client, 'makeRequest').resolves({
                ok: true,
                body: {
                    session: {
                        valid: false,
                    },
                },
                response: {
                    statusCode: 200,
                },
            });

            const result = await client.setupSession();

            expect(result).to.equal(false);
            sinon.assert.calledOnce(log.error);
            expect(log.error.firstCall.args[0]).to.match(/auth is required/i);
        });

        it('logs in with password if GET /auth returns invalid session', async function () {
            const makeRequestStub = sinon.stub(client, 'makeRequest');

            makeRequestStub.onFirstCall().resolves({
                ok: true,
                body: {
                    session: {
                        valid: false,
                    },
                },
                response: {
                    statusCode: 200,
                },
            });

            makeRequestStub.onSecondCall().resolves({
                ok: true,
                body: {
                    session: {
                        valid: true,
                        sid: 'NEWSID',
                    },
                },
                response: {
                    statusCode: 200,
                },
            });

            const result = await client.setupSession();

            expect(result).to.equal(true);
            expect(client.session).to.deep.equal({
                valid: true,
                sid: 'NEWSID',
            });

            sinon.assert.calledTwice(makeRequestStub);
            sinon.assert.calledWith(makeRequestStub.firstCall, 'GET', '/auth');
            sinon.assert.calledWith(makeRequestStub.secondCall, 'POST', '/auth', {
                password: 'secret',
            });
        });

        it('returns false if login request fails', async function () {
            const makeRequestStub = sinon.stub(client, 'makeRequest');

            makeRequestStub.onFirstCall().resolves({
                ok: true,
                body: {
                    session: {
                        valid: false,
                    },
                },
                response: {
                    statusCode: 200,
                },
            });

            makeRequestStub.onSecondCall().resolves({
                ok: false,
                body: null,
                response: null,
                error: new Error('login failed'),
            });

            const result = await client.setupSession();

            expect(result).to.equal(false);
            sinon.assert.calledOnce(log.warn);
            expect(log.warn.firstCall.args[0]).to.match(/login failed/i);
        });

        it('returns false if login response contains no valid session', async function () {
            const makeRequestStub = sinon.stub(client, 'makeRequest');

            makeRequestStub.onFirstCall().resolves({
                ok: true,
                body: {
                    session: {
                        valid: false,
                    },
                },
                response: {
                    statusCode: 200,
                },
            });

            makeRequestStub.onSecondCall().resolves({
                ok: true,
                body: {
                    session: {
                        valid: false,
                    },
                },
                response: {
                    statusCode: 200,
                },
            });

            const result = await client.setupSession();

            expect(result).to.equal(false);
            sinon.assert.calledOnce(log.error);
            expect(log.error.firstCall.args[0]).to.match(/invalid session/i);
        });
    });

    describe('callAuthenticated', function () {
        it('returns OFFLINE result if setupSession fails', async function () {
            sinon.stub(client, 'setupSession').resolves(false);
            const makeRequestStub = sinon.stub(client, 'makeRequest');

            const result = await client.callAuthenticated('GET', '/stats/summary');

            expect(result).to.deep.equal({
                ok: false,
                body: null,
                response: null,
                error: 'OFFLINE',
            });

            sinon.assert.notCalled(makeRequestStub);
        });

        it('delegates to makeRequest if setupSession succeeds', async function () {
            sinon.stub(client, 'setupSession').resolves(true);

            const expected = {
                ok: true,
                body: {
                    ok: true,
                },
                response: {
                    statusCode: 200,
                },
            };

            const makeRequestStub = sinon.stub(client, 'makeRequest').resolves(expected);

            const result = await client.callAuthenticated('GET', '/stats/summary', null, { count: 10 });

            expect(result).to.equal(expected);
            sinon.assert.calledOnceWithExactly(makeRequestStub, 'GET', '/stats/summary', null, { count: 10 });
        });
    });

    describe('public API methods', function () {
        beforeEach(function () {
            sinon.stub(client, 'callAuthenticated').resolves({
                ok: true,
                body: {
                    ok: true,
                },
                response: {
                    statusCode: 200,
                },
            });
        });

        it('getBlocking calls /dns/blocking', async function () {
            await client.getBlocking();

            sinon.assert.calledOnceWithExactly(client.callAuthenticated, 'GET', '/dns/blocking');
        });

        it('setBlocking sends blocking payload', async function () {
            await client.setBlocking(true, 60);

            sinon.assert.calledOnceWithExactly(client.callAuthenticated, 'POST', '/dns/blocking', {
                blocking: true,
                timer: 60,
            });
        });

        it('getSummary calls /stats/summary', async function () {
            await client.getSummary();

            sinon.assert.calledOnceWithExactly(client.callAuthenticated, 'GET', '/stats/summary');
        });

        it('getHistory calls /history', async function () {
            await client.getHistory();

            sinon.assert.calledOnceWithExactly(client.callAuthenticated, 'GET', '/history');
        });

        it('getSystem calls /info/system', async function () {
            await client.getSystem();

            sinon.assert.calledOnceWithExactly(client.callAuthenticated, 'GET', '/info/system');
        });

        it('getVersion calls /info/version', async function () {
            await client.getVersion();

            sinon.assert.calledOnceWithExactly(client.callAuthenticated, 'GET', '/info/version');
        });

        it('getTopClients sends query parameters', async function () {
            await client.getTopClients(false);

            sinon.assert.calledOnceWithExactly(client.callAuthenticated, 'GET', '/stats/top_clients', null, {
                blocked: false,
                count: 10,
            });
        });

        it('getTopDomains sends query parameters', async function () {
            await client.getTopDomains(true);

            sinon.assert.calledOnceWithExactly(client.callAuthenticated, 'GET', '/stats/top_domains', null, {
                blocked: true,
                count: 10,
            });
        });

        it('getDatabaseTopClients sends calculated query parameters', async function () {
            const now = 1_700_000_000_000;
            const nowStub = sinon.stub(Date, 'now').returns(now);

            await client.getDatabaseTopClients();

            sinon.assert.calledOnceWithExactly(client.callAuthenticated, 'GET', '/stats/database/top_clients', null, {
                from: 1699913600,
                until: 1700000000,
                blocked: 0,
                count: 10,
            });

            nowStub.restore();
        });

        it('getDatabaseTopDomains sends calculated query parameters', async function () {
            const now = 1_700_000_000_000;
            const nowStub = sinon.stub(Date, 'now').returns(now);

            await client.getDatabaseTopDomains();

            sinon.assert.calledOnceWithExactly(client.callAuthenticated, 'GET', '/stats/database/top_domains', null, {
                from: 1699913600,
                until: 1700000000,
                blocked: 0,
                count: 10,
            });

            nowStub.restore();
        });

        it('getGeneralPiholeAPI sends GET params as query', async function () {
            await client.getGeneralPiholeAPI('GET', '/stats/summary', {
                count: 10,
            });

            sinon.assert.calledOnceWithExactly(client.callAuthenticated, 'GET', '/stats/summary', null, {
                count: 10,
            });
        });

        it('getGeneralPiholeAPI sends POST params as body', async function () {
            await client.getGeneralPiholeAPI('POST', '/dns/blocking', {
                blocking: true,
            });

            sinon.assert.calledOnceWithExactly(
                client.callAuthenticated,
                'POST',
                '/dns/blocking',
                {
                    blocking: true,
                },
                null,
            );
        });
    });

    describe('checkOnline', function () {
        it('delegates to setupSession', async function () {
            const setupSessionStub = sinon.stub(client, 'setupSession').resolves(true);

            const result = await client.checkOnline();

            expect(result).to.equal(true);
            sinon.assert.calledOnce(setupSessionStub);
        });
    });
});
