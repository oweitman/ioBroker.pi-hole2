const { Agent, request } = require('undici');
const { URL } = require('url');

// test page http://pi.hole/api/docs

module.exports = class PiholeClient {
    /**
     * Constructor for PiholeClient
     *
     * @param {object} options - An object with the following properties:
     *   - baseUrl: The base URL of the pi-hole API. Defaults to 'http://pi.hole/api'
     *   - path: The path of the API endpoint. Defaults to '/api'
     *   - log: A logger instance
     *   - rejectUnauthorized: If true, the client will reject unauthorized certificates. Defaults to true
     */
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

    /**
     * Make a request to the pi-hole API.
     *
     * @param {string} method The HTTP method to use
     * @param {string} path The path of the API endpoint
     * @param {object} body The request body
     * @param {object} urlparams The URL parameters
     * @returns {Promise<{body: object, response: object}>} The response body and response object
     */
    async makeRequest(method, path, body = null, urlparams = null) {
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
                'User-Agent': 'iobroker.pi-hole2',
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

    /**
     * Checks if the session for the pi-hole api is valid.
     * Returns true if the session is valid, false otherwise.
     *
     * @returns {boolean} True if the session is valid, false otherwise.
     */
    checkConnection() {
        return this.session?.valid || false;
    }

    /**
     * Setups the session for the pi-hole api by first checking if a session is already valid and if not
     * creates a new session with the given password.
     *
     * @returns {Promise<void>}
     */
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

    /**
     * Checks the online status of the Pi-hole connection.
     * Ensures a session is set up and then verifies if the session is valid.
     *
     * @returns {Promise<boolean>} - Returns true if the session is valid, otherwise false.
     */

    /**
     * Checks the online status of the Pi-hole connection.
     * Ensures a session is set up and then verifies if the session is valid.
     *
     * @returns {Promise<boolean>} - Returns true if the session is valid, otherwise false.
     */
    async checkOnline() {
        await this.setupSession();
        return this.session?.valid ? true : false;
    }
    /**
     * Sets the blocking status of the Pi-hole.
     * Initiates a session before making a POST request to update the DNS blocking status.
     *
     * @param {boolean} blocking - The desired blocking status; true to enable blocking, false to disable.
     * @param {number} timer - The duration in seconds for which the blocking status should be set.
     * @returns {Promise<object>} - Returns a promise resolving to an object containing the response from the Pi-hole API.
     */

    /**
     * Sets the blocking status of the Pi-hole.
     * Initiates a session before making a POST request to update the DNS blocking status.
     *
     * @param {boolean} blocking - The desired blocking status; true to enable blocking, false to disable.
     * @param {number} timer - The duration in seconds for which the blocking status should be set.
     * @returns {Promise<object>} - Returns a promise resolving to an object containing the response from the Pi-hole API.
     */

    /**
     * Sets the blocking status of the Pi-hole.
     * Initiates a session before making a POST request to update the DNS blocking status.
     *
     * @param {boolean} blocking - The desired blocking status; true to enable blocking, false to disable.
     * @param {number} timer - The duration in seconds for which the blocking status should be set.
     *                         If set to 0 the blocking status will be set indefinitely.
     * @returns {Promise<object>} - Returns a promise resolving to an object containing the response from the Pi-hole API.
     */
    async setBlocking(blocking, timer) {
        await this.setupSession();
        return this.makeRequest('POST', '/dns/blocking', { blocking, timer });
    }

    /**
     * Gets the current blocking status of the Pi-hole.
     *
     * @returns {Promise<object>} - Returns a promise resolving to an object containing the blocking status.
     */
    async getBlocking() {
        await this.setupSession();
        return this.makeRequest('GET', '/dns/blocking');
    }
    /**
     * Gets the current summary of the Pi-hole.
     *
     * @returns {Promise<object>} - Returns a promise resolving to an object containing the summary.
     */
    async getSummary() {
        await this.setupSession();
        return this.makeRequest('GET', '/stats/summary');
    }
    /**
     * Gets the current history of the Pi-hole.
     *
     * @returns {Promise<object>} - Returns a promise resolving to an object containing the history.
     */
    async getHistory() {
        await this.setupSession();
        return this.makeRequest('GET', '/history');
    }
    /**
     * Gets the current system status of the Pi-hole.
     *
     * @returns {Promise<object>} - Returns a promise resolving to an object containing the system status.
     */
    async getSystem() {
        await this.setupSession();
        return this.makeRequest('GET', '/info/system');
    }
    /**
     * Gets the top clients from the Pi-hole database.
     *
     * @returns {Promise<{body: object, response: object}>} - Returns a promise resolving to an array of objects containing client information.
     */
    async getDatabaseTopClients() {
        await this.setupSession();
        const param = {
            from: Math.trunc(Date.now() / 1000 - 60 * 60 * 24),
            until: Math.trunc(Date.now() / 1000),
            blocked: 0,
            count: 10,
        };
        return this.makeRequest('GET', '/stats/database/top_clients', param);
    }
    /**
     * Gets the top domains from the Pi-hole database.
     *
     * @returns {Promise<{body: object, response: object}>} - Returns a promise resolving to an array of objects containing domain information.
     */
    async getDatabaseTopDomains() {
        await this.setupSession();
        const param = {
            from: Math.trunc(Date.now() / 1000 - 60 * 60 * 24),
            until: Math.trunc(Date.now() / 1000),
            blocked: 0,
            count: 10,
        };
        return this.makeRequest('GET', '/stats/database/top_domains', param);
    }
    /**
     * Gets the top clients from the Pi-hole API.
     * The blocked parameter is 0 for allowed clients and 1 for blocked clients.
     *
     * @param {boolean} blocked - Specifies whether to get allowed or blocked clients.
     * @returns {Promise<{body: object, response: object}>} - Returns a promise resolving to an array of objects containing client information.
     */
    async getTopClients(blocked) {
        await this.setupSession();
        const param = {
            blocked: blocked,
            count: 10,
        };
        return this.makeRequest('GET', '/stats/top_clients', param, true);
    }
    /**
     * Gets the top domains from the Pi-hole API.
     * The blocked parameter is 0 for allowed domains and 1 for blocked domains.
     *
     * @param {boolean} blocked - Specifies whether to get allowed or blocked domains.
     * @returns {Promise<{body: object, response: object}>} - Returns a promise resolving to an array of objects containing domain information.
     */
    async getTopDomains(blocked) {
        await this.setupSession();
        const param = {
            blocked: blocked,
            count: 10,
        };
        return this.makeRequest('GET', '/stats/top_domains', param, true);
    }
    /**
     * Gets the current version of the Pi-hole.
     *
     * @returns {Promise<object>} - Returns a promise resolving to an object containing the version.
     */
    async getVersion() {
        await this.setupSession();
        return this.makeRequest('GET', '/info/version');
    }
    /**
     * Calls the Pi-hole API with the given method, endpoint and parameters.
     *
     * @param {string} method - The request method (e.g. GET, POST, PUT, DELETE).
     * @param {string} endpoint - The endpoint to call (e.g. /stats/summary).
     * @param {object} [params] - Optional parameters to be passed in the request.
     * @returns {Promise<object>} - Returns a promise resolving to an object containing the response.
     */
    async getGeneralPiholeAPI(method, endpoint, params) {
        await this.setupSession();
        return this.makeRequest(method, endpoint, params);
    }
};
