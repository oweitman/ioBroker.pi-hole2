const { Agent, request } = require('undici');
const { URL } = require('url');

// test page http://pi.hole/api/docs

module.exports = class PiholeClient {
    constructor(options) {
        this.options = options;
        this.session = undefined;
        this.dispatcher = undefined;
        this.log = this.options.log;

        const url = new URL(this.options.path ?? '/api', this.options.baseUrl);
        this.baseUrl = url.toString().replace(/\/$/, ''); // remove trailing slash

        if (url.protocol === 'https:' && options.rejectUnauthorized === false) {
            this.dispatcher = new Agent({ connect: { rejectUnauthorized: options.rejectUnauthorized } });
        }
    }

    async makeRequest(method, path, body, urlparams) {
        let url = `${this.baseUrl}${path}`;

        /*         console.log('Request', {
                    method,
                    body,
                    url,
                    urlparams,
                }); */

        if (urlparams && body && method.toUpperCase() === 'GET') {
            const searchParams = new URLSearchParams();
            for (const [key, value] of Object.entries(body)) {
                searchParams.append(key, value);
            }
            url += `?${searchParams.toString()}`;
            body = undefined;
        }

        const res = await request(url, {
            method,
            dispatcher: this.dispatcher,
            body: body ? JSON.stringify(body) : undefined,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'PiholeClient',
                ...(this.session?.sid ? { 'X-FTL-SID': this.session.sid } : {}),
            },
        });

        const responseBody = await res.body.json();

        /*         console.log('Response', {
                    method,
                    body,
                    responseBody,
                    response: { ...res, body: {} }, // prevent logging binary body stream
                    url,
                }); */

        return { body: responseBody, response: res };
    }

    checkConnection() {
        return this.session?.valid || false;
    }

    async setupSession() {
        try {
            const { body } = await this.makeRequest('GET', '/auth');

            if (!body.session?.valid) {
                if (!this.options.password) {
                    this.log.error('Auth is required');
                }

                const { body: loginBody, response } = await this.makeRequest('POST', '/auth', {
                    password: this.options.password,
                });

                if (!loginBody.session?.valid) {
                    this.log.error(`Auth not valid ${JSON.stringify({ body: loginBody, response })}`);
                }

                this.session = loginBody.session;
            } else {
                this.session = body.session;
            }
        } catch (error) {
            this.log.error(error);
        }
    }

    async checkOnline() {
        await this.setupSession();
        return this.session?.valid ? true : false;
    }
    async setBlocking(blocking, timer) {
        await this.setupSession();
        return this.makeRequest('POST', '/dns/blocking', { blocking, timer });
    }

    async getBlocking() {
        await this.setupSession();
        return this.makeRequest('GET', '/dns/blocking');
    }
    async getSummary() {
        await this.setupSession();
        return this.makeRequest('GET', '/stats/summary');
    }
    async getHistory() {
        await this.setupSession();
        return this.makeRequest('GET', '/history');
    }
    async getDatabaseTopClients(/* unixTime */) {
        await this.setupSession();
        const param = {
            from: Math.trunc(Date.now() / 1000 - 60 * 60 * 24),
            until: Math.trunc(Date.now() / 1000),
            blocked: 0,
            count: 10,
        };
        return this.makeRequest('GET', '/stats/database/top_clients', param);
    }
    async getDatabaseTopDomains(/* unixTime */) {
        await this.setupSession();
        const param = {
            from: Math.trunc(Date.now() / 1000 - 60 * 60 * 24),
            until: Math.trunc(Date.now() / 1000),
            blocked: 0,
            count: 10,
        };
        return this.makeRequest('GET', '/stats/database/top_domains', param);
    }
    async getTopClients(/* unixTime */) {
        await this.setupSession();
        const param = {
            blocked: 0,
            count: 10,
        };
        return this.makeRequest('GET', '/stats/top_clients', param);
    }
    async getTopDomains(/* unixTime */) {
        await this.setupSession();
        const param = {
            blocked: 0,
            count: 10,
        };
        return this.makeRequest('GET', '/stats/top_domains', param);
    }
    async getVersion() {
        await this.setupSession();
        return this.makeRequest('GET', '/info/version');
    }
    async getGeneralPiholeAPI(method, endpoint, params) {
        await this.setupSession();
        return this.makeRequest(method, endpoint, params);
    }
};
