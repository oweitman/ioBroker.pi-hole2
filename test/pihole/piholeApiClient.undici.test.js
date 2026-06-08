/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const sinon = require('sinon');
const undici = require('undici');

const modulePath = require.resolve('../../lib/piholeApiClient.js');

const makeResp = (statusCode, body, options = {}) =>
    /** @type {any} */ ({
        statusCode,
        statusText: String(statusCode),
        headers: {},
        trailers: {},
        opaque: null,
        context: null,
        body: {
            async json() {
                if (options.throwJson) {
                    throw new Error('invalid json');
                }

                return body;
            },
            async text() {
                return JSON.stringify(body);
            },
        },
    });

describe('piholeApiClient – undici.request stub (no network)', function () {
    this.timeout(5000);

    let requestStub;
    let agentStub;
    let Client;
    let log;

    beforeEach(function () {
        delete require.cache[modulePath];

        requestStub = sinon.stub(undici, 'request').callsFake(async () => makeResp(200, /** @type {any} */ ({})));
        agentStub = sinon.stub(undici, 'Agent').callsFake(() => ({ __fake: true }));

        Client = require('../../lib/piholeApiClient.js');

        log = {
            error: sinon.spy(),
            warn: sinon.spy(),
            info: sinon.spy(),
            debug: sinon.spy(),
            silly: sinon.spy(),
        };
    });

    afterEach(function () {
        sinon.restore();
        delete require.cache[modulePath];
    });

    it('makeRequest sends query parameters for GET requests', async function () {
        requestStub.callsFake(async (url, opts = {}) => {
            expect(String(url)).to.equal('http://pi.hole/api/stats/top_clients?blocked=0&count=10');
            expect(opts.method).to.equal('GET');
            expect(opts.body).to.equal(undefined);
            expect(opts.headers['Content-Type']).to.equal('application/json');
            expect(opts.headers['User-Agent']).to.equal('iobroker.pi-hole2');

            return makeResp(200, {
                clients: [],
            });
        });

        const client = new Client({
            baseUrl: 'http://pi.hole',
            path: '/api',
            log,
            password: 'pw',
        });

        const result = await client.makeRequest('GET', '/stats/top_clients', null, {
            blocked: 0,
            count: 10,
        });

        expect(result.ok).to.equal(true);
        expect(result.body).to.deep.equal({
            clients: [],
        });
        expect(result.response.statusCode).to.equal(200);
        sinon.assert.calledOnce(requestStub);
    });

    it('makeRequest sends JSON body for POST requests', async function () {
        requestStub.callsFake(async (url, opts = {}) => {
            expect(String(url)).to.equal('http://pi.hole/api/dns/blocking');
            expect(opts.method).to.equal('POST');
            expect(JSON.parse(opts.body)).to.deep.equal({
                blocking: true,
                timer: 60,
            });

            return makeResp(200, {
                status: 'ok',
            });
        });

        const client = new Client({
            baseUrl: 'http://pi.hole',
            path: '/api',
            log,
            password: 'pw',
        });

        const result = await client.makeRequest('POST', '/dns/blocking', {
            blocking: true,
            timer: 60,
        });

        expect(result.ok).to.equal(true);
        expect(result.body).to.deep.equal({
            status: 'ok',
        });
        sinon.assert.calledOnce(requestStub);
    });

    it('makeRequest sends X-FTL-SID header when session exists', async function () {
        requestStub.callsFake(async (url, opts = {}) => {
            expect(String(url)).to.equal('http://pi.hole/api/stats/summary');
            expect(opts.headers['X-FTL-SID']).to.equal('SID123');

            return makeResp(200, {
                ok: true,
            });
        });

        const client = new Client({
            baseUrl: 'http://pi.hole',
            path: '/api',
            log,
            password: 'pw',
        });

        client.session = {
            valid: true,
            sid: 'SID123',
        };

        const result = await client.makeRequest('GET', '/stats/summary');

        expect(result.ok).to.equal(true);
        expect(result.body).to.deep.equal({
            ok: true,
        });
    });

    it('makeRequest returns AUTH_FAILED for HTTP 401 and clears session', async function () {
        requestStub.resolves(
            makeResp(401, {
                error: 'unauthorized',
            }),
        );

        const client = new Client({
            baseUrl: 'http://pi.hole',
            path: '/api',
            log,
            password: 'pw',
        });

        client.session = {
            valid: true,
            sid: 'SID123',
        };

        const result = await client.makeRequest('GET', '/stats/summary');

        expect(result.ok).to.equal(false);
        expect(result.error).to.be.instanceOf(Error);
        expect(result.error.name).to.equal('PiholeApiError');
        expect(result.error.code).to.equal('AUTH_FAILED');
        expect(result.error.statusCode).to.equal(401);
        expect(client.session).to.equal(undefined);
    });

    it('makeRequest returns HTTP_ERROR for non-2xx status codes', async function () {
        requestStub.resolves(
            makeResp(500, {
                error: 'server error',
            }),
        );

        const client = new Client({
            baseUrl: 'http://pi.hole',
            path: '/api',
            log,
            password: 'pw',
        });

        const result = await client.makeRequest('GET', '/stats/summary');

        expect(result.ok).to.equal(false);
        expect(result.body).to.deep.equal({
            error: 'server error',
        });
        expect(result.error.name).to.equal('PiholeApiError');
        expect(result.error.code).to.equal('HTTP_ERROR');
        expect(result.error.statusCode).to.equal(500);
    });

    it('makeRequest returns empty object if JSON parsing fails', async function () {
        requestStub.resolves(
            makeResp(200, null, {
                throwJson: true,
            }),
        );

        const client = new Client({
            baseUrl: 'http://pi.hole',
            path: '/api',
            log,
            password: 'pw',
        });

        const result = await client.makeRequest('GET', '/stats/summary');

        expect(result.ok).to.equal(true);
        expect(result.body).to.deep.equal({});
    });

    it('makeRequest returns NETWORK_ERROR if undici.request throws', async function () {
        const error = Object.assign(new Error('connection refused'), {
            code: 'ECONNREFUSED',
        });

        requestStub.rejects(error);

        const client = new Client({
            baseUrl: 'http://pi.hole',
            path: '/api',
            log,
            password: 'pw',
        });

        const result = await client.makeRequest('GET', '/stats/summary');

        expect(result.ok).to.equal(false);
        expect(result.body).to.equal(null);
        expect(result.response).to.equal(null);
        expect(result.error.name).to.equal('PiholeApiError');
        expect(result.error.code).to.equal('ECONNREFUSED');
        expect(result.error.cause).to.equal(error);
    });

    it('setupSession returns true if GET /auth has valid session', async function () {
        requestStub.callsFake(async (url, opts = {}) => {
            const method = opts.method.toUpperCase();

            expect(String(url)).to.equal('http://pi.hole/api/auth');
            expect(method).to.equal('GET');

            return makeResp(200, {
                session: {
                    valid: true,
                    sid: 'SID',
                },
            });
        });

        const client = new Client({
            baseUrl: 'http://pi.hole',
            path: '/api',
            log,
            password: 'pw',
        });

        const result = await client.setupSession();

        expect(result).to.equal(true);
        expect(client.session).to.deep.equal({
            valid: true,
            sid: 'SID',
        });
        sinon.assert.calledOnce(requestStub);
    });

    it('setupSession performs POST /auth if GET /auth is not valid', async function () {
        requestStub.callsFake(async (url, opts = {}) => {
            const method = opts.method.toUpperCase();

            if (String(url) === 'http://pi.hole/api/auth' && method === 'GET') {
                return makeResp(200, {
                    session: {
                        valid: false,
                    },
                });
            }

            if (String(url) === 'http://pi.hole/api/auth' && method === 'POST') {
                expect(JSON.parse(opts.body)).to.deep.equal({
                    password: 'pw',
                });

                return makeResp(200, {
                    session: {
                        valid: true,
                        sid: 'NEWSID',
                    },
                });
            }

            throw new Error(`Unexpected request: ${method} ${url}`);
        });

        const client = new Client({
            baseUrl: 'http://pi.hole',
            path: '/api',
            log,
            password: 'pw',
        });

        const result = await client.setupSession();

        expect(result).to.equal(true);
        expect(client.session).to.deep.equal({
            valid: true,
            sid: 'NEWSID',
        });
        sinon.assert.calledTwice(requestStub);
    });

    it('setupSession returns false and logs if auth check request fails', async function () {
        requestStub.rejects(new Error('network down'));

        const client = new Client({
            baseUrl: 'http://pi.hole',
            path: '/api',
            log,
            password: 'pw',
        });

        const result = await client.setupSession();

        expect(result).to.equal(false);
        sinon.assert.calledOnce(log.warn);
        expect(log.warn.firstCall.args[0]).to.match(/auth check failed/i);
    });

    it('public methods use authenticated API calls and return ok result objects', async function () {
        requestStub.callsFake(async (url, opts = {}) => {
            const method = opts.method.toUpperCase();

            if (String(url) === 'http://pi.hole/api/auth' && method === 'GET') {
                return makeResp(200, {
                    session: {
                        valid: true,
                        sid: 'SID',
                    },
                });
            }

            return makeResp(200, {
                ok: true,
                path: String(url),
                method,
            });
        });

        const client = new Client({
            baseUrl: 'http://pi.hole',
            path: '/api',
            log,
            password: 'pw',
        });

        const blocking = await client.getBlocking();
        const summary = await client.getSummary();
        const history = await client.getHistory();
        const system = await client.getSystem();
        const version = await client.getVersion();

        expect(blocking.ok).to.equal(true);
        expect(summary.ok).to.equal(true);
        expect(history.ok).to.equal(true);
        expect(system.ok).to.equal(true);
        expect(version.ok).to.equal(true);

        expect(blocking.body.path).to.equal('http://pi.hole/api/dns/blocking');
        expect(summary.body.path).to.equal('http://pi.hole/api/stats/summary');
        expect(history.body.path).to.equal('http://pi.hole/api/history');
        expect(system.body.path).to.equal('http://pi.hole/api/info/system');
        expect(version.body.path).to.equal('http://pi.hole/api/info/version');
    });

    it('getTopClients and getTopDomains use query parameters', async function () {
        requestStub.callsFake(async (url, opts = {}) => {
            const method = opts.method.toUpperCase();

            if (String(url) === 'http://pi.hole/api/auth' && method === 'GET') {
                return makeResp(200, {
                    session: {
                        valid: true,
                        sid: 'SID',
                    },
                });
            }

            return makeResp(200, {
                url: String(url),
            });
        });

        const client = new Client({
            baseUrl: 'http://pi.hole',
            path: '/api',
            log,
            password: 'pw',
        });

        const clients = await client.getTopClients(0);
        const domains = await client.getTopDomains(1);

        expect(clients.ok).to.equal(true);
        expect(clients.body.url).to.equal('http://pi.hole/api/stats/top_clients?blocked=0&count=10');

        expect(domains.ok).to.equal(true);
        expect(domains.body.url).to.equal('http://pi.hole/api/stats/top_domains?blocked=1&count=10');
    });

    it('getDatabaseTopClients and getDatabaseTopDomains use calculated query parameters', async function () {
        const nowStub = sinon.stub(Date, 'now').returns(1_700_000_000_000);

        requestStub.callsFake(async (url, opts = {}) => {
            const method = opts.method.toUpperCase();

            if (String(url) === 'http://pi.hole/api/auth' && method === 'GET') {
                return makeResp(200, {
                    session: {
                        valid: true,
                        sid: 'SID',
                    },
                });
            }

            return makeResp(200, {
                url: String(url),
            });
        });

        const client = new Client({
            baseUrl: 'http://pi.hole',
            path: '/api',
            log,
            password: 'pw',
        });

        const clients = await client.getDatabaseTopClients();
        const domains = await client.getDatabaseTopDomains();

        expect(clients.ok).to.equal(true);
        expect(clients.body.url).to.equal(
            'http://pi.hole/api/stats/database/top_clients?from=1699913600&until=1700000000&blocked=0&count=10',
        );

        expect(domains.ok).to.equal(true);
        expect(domains.body.url).to.equal(
            'http://pi.hole/api/stats/database/top_domains?from=1699913600&until=1700000000&blocked=0&count=10',
        );

        nowStub.restore();
    });

    it('getGeneralPiholeAPI sends GET params as query and POST params as body', async function () {
        requestStub.callsFake(async (url, opts = {}) => {
            const method = opts.method.toUpperCase();

            if (String(url) === 'http://pi.hole/api/auth' && method === 'GET') {
                return makeResp(200, {
                    session: {
                        valid: true,
                        sid: 'SID',
                    },
                });
            }

            if (method === 'GET') {
                return makeResp(200, {
                    url: String(url),
                    body: opts.body,
                });
            }

            return makeResp(200, {
                url: String(url),
                body: JSON.parse(opts.body),
            });
        });

        const client = new Client({
            baseUrl: 'http://pi.hole',
            path: '/api',
            log,
            password: 'pw',
        });

        const getResult = await client.getGeneralPiholeAPI('GET', '/custom/get', {
            count: 10,
        });

        const postResult = await client.getGeneralPiholeAPI('POST', '/custom/post', {
            enabled: true,
        });

        expect(getResult.ok).to.equal(true);
        expect(getResult.body.url).to.equal('http://pi.hole/api/custom/get?count=10');
        expect(getResult.body.body).to.equal(undefined);

        expect(postResult.ok).to.equal(true);
        expect(postResult.body.url).to.equal('http://pi.hole/api/custom/post');
        expect(postResult.body.body).to.deep.equal({
            enabled: true,
        });
    });

    it('creates an undici Agent if HTTPS is used with rejectUnauthorized false', function () {
        const client = new Client({
            baseUrl: 'https://pi.hole',
            path: '/api',
            log,
            password: 'pw',
            rejectUnauthorized: false,
        });

        expect(client.dispatcher).to.deep.equal({
            __fake: true,
        });

        sinon.assert.calledOnce(agentStub);
        sinon.assert.calledWithNew(agentStub);
    });
});
