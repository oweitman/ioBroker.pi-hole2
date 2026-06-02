const { Agent, request } = require('undici');
const { URL } = require('node:url');

/**
 * Error wrapper for Pi-hole API related errors.
 */
class PiholeApiError extends Error {
    /**
     * @param {string} message - Human readable error message.
     * @param {object} [options] - Additional error details.
     * @param {string} [options.code] - Internal error code.
     * @param {number} [options.statusCode] - HTTP status code, if available.
     * @param {Error} [options.cause] - Original error.
     */
    constructor(message, options = {}) {
        super(message);
        this.name = 'PiholeApiError';
        this.code = options.code;
        this.statusCode = options.statusCode;
        this.cause = options.cause;
    }
}

module.exports = class PiholeClient {
    /**
     * Creates a new Pi-hole API client.
     *
     * @param {object} options - Client options.
     * @param {string} options.baseUrl - Base URL of the Pi-hole instance.
     * @param {string} [options.path] - API base path. Defaults to /api.
     * @param {string} [options.password] - Pi-hole API password.
     * @param {object} options.log - ioBroker logger instance.
     * @param {boolean} [options.rejectUnauthorized] - Whether HTTPS certificates should be verified. Default is true
     * @param {number} [options.timeout] - Request timeout in milliseconds. Defaults to 10000.
     */
    constructor(options) {
        this.options = options;
        this.session = undefined;
        this.dispatcher = undefined;
        this.log = this.options.log;

        const url = new URL(this.options.path ?? '/api', this.options.baseUrl);
        this.baseUrl = url.toString().replace(/\/$/, '');

        if (url.protocol === 'https:' && options.rejectUnauthorized === false) {
            this.dispatcher = new Agent({
                connect: {
                    rejectUnauthorized: false,
                },
            });
        }
    }

    /**
     * Executes a request against the Pi-hole API.
     *
     * This method catches network errors, timeouts, invalid JSON responses and
     * HTTP error status codes. It never throws for expected connection problems.
     *
     * @param {string} method - HTTP method, for example GET, POST, PUT or DELETE.
     * @param {string} path - API endpoint path, for example /stats/summary.
     * @param {object|null} [body] - JSON request body for POST/PUT requests.  Default is null.
     * @param {object|null} [query] - URL query parameters for GET requests.  Default is null.
     * @returns {Promise<{ok: boolean, body: object|null, response: object|null, error?: PiholeApiError}>}
     * Result object containing either response data or error details.
     */
    async makeRequest(method, path, body = null, query = null) {
        let url = `${this.baseUrl}${path}`;

        if (query) {
            const searchParams = new URLSearchParams();

            for (const [key, value] of Object.entries(query)) {
                if (value !== undefined && value !== null) {
                    searchParams.append(key, value);
                }
            }

            const queryString = searchParams.toString();

            if (queryString) {
                url += `?${queryString}`;
            }
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
        }, this.options.timeout ?? 10000);

        try {
            const res = await request(url, {
                method,
                dispatcher: this.dispatcher,
                signal: controller.signal,
                body: body ? JSON.stringify(body) : undefined,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'iobroker.pi-hole2',
                    ...(this.session?.sid ? { 'X-FTL-SID': this.session.sid } : {}),
                },
            });

            let responseBody = null;

            try {
                responseBody = await res.body.json();
            } catch {
                responseBody = {};
            }

            if (res.statusCode === 401 || res.statusCode === 403) {
                this.session = undefined;

                return {
                    ok: false,
                    body: responseBody,
                    response: res,
                    error: new PiholeApiError('Pi-hole authentication failed', {
                        code: 'AUTH_FAILED',
                        statusCode: res.statusCode,
                    }),
                };
            }

            if (res.statusCode < 200 || res.statusCode >= 300) {
                return {
                    ok: false,
                    body: responseBody,
                    response: res,
                    error: new PiholeApiError(`Pi-hole API returned HTTP ${res.statusCode}`, {
                        code: 'HTTP_ERROR',
                        statusCode: res.statusCode,
                    }),
                };
            }

            return {
                ok: true,
                body: responseBody,
                response: res,
            };
        } catch (error) {
            const isTimeout = error.name === 'AbortError';

            return {
                ok: false,
                body: null,
                response: null,
                error: new PiholeApiError(isTimeout ? 'Pi-hole API request timed out' : 'Pi-hole API request failed', {
                    code: isTimeout ? 'TIMEOUT' : (error.code ?? 'NETWORK_ERROR'),
                    cause: error,
                }),
            };
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * Returns whether the current client session is valid.
     *
     * @returns {boolean} True if a valid session exists, otherwise false.
     */
    checkConnection() {
        return this.session?.valid === true;
    }

    /**
     * Ensures that a valid Pi-hole API session exists.
     *
     * If no valid session exists, this method tries to authenticate with the
     * configured password. Network errors are logged and returned as false
     * instead of being thrown.
     *
     * @returns {Promise<boolean>} True if authentication is available, otherwise false.
     */
    async setupSession() {
        const authCheck = await this.makeRequest('GET', '/auth');

        if (!authCheck.ok) {
            this.log.warn(
                `Pi-hole auth check failed: ${authCheck.error?.message ?? authCheck.error ?? 'unknown error'}`,
            );
            return false;
        }

        if (authCheck.body?.session?.valid) {
            this.session = authCheck.body.session;
            return true;
        }

        if (!this.options.password) {
            this.log.error('Pi-hole auth is required, but no password is configured');
            return false;
        }

        const login = await this.makeRequest('POST', '/auth', {
            password: this.options.password,
        });

        if (!login.ok) {
            this.log.warn(`Pi-hole login failed: ${login.error?.message ?? login.error ?? 'unknown error'}`);
            return false;
        }

        if (!login.body?.session?.valid) {
            this.log.error(`Pi-hole login returned invalid session: ${JSON.stringify(login.body)}`);
            return false;
        }

        this.session = login.body.session;
        return true;
    }

    /**
     * Executes an authenticated Pi-hole API request.
     *
     * If the session cannot be established, this method returns an offline result
     * instead of throwing an exception.
     *
     * @param {string} method - HTTP method.
     * @param {string} endpoint - API endpoint path.
     * @param {object|null} [body] - JSON request body.  Default is null.
     * @param {object|null} [query] - URL query parameters.  Default is null.
     * @returns {Promise<{ok: boolean, body: object|null, response: object|null, error?: string|PiholeApiError}>}
     * API result object.
     */
    async callAuthenticated(method, endpoint, body = null, query = null) {
        const online = await this.setupSession();

        if (!online) {
            return {
                ok: false,
                body: null,
                response: null,
                error: 'OFFLINE',
            };
        }

        return this.makeRequest(method, endpoint, body, query);
    }

    /**
     * Checks whether the Pi-hole API is online and authenticated.
     *
     * @returns {Promise<boolean>} True if the API is reachable and authenticated, otherwise false.
     */
    async checkOnline() {
        return this.setupSession();
    }

    /**
     * Enables or disables Pi-hole DNS blocking.
     *
     * @param {boolean} blocking - True to enable blocking, false to disable blocking.
     * @param {number} timer - Duration in seconds. Use 0 for permanent change.
     * @returns {Promise<object>} API result object.
     */
    async setBlocking(blocking, timer) {
        return this.callAuthenticated('POST', '/dns/blocking', { blocking, timer });
    }

    /**
     * Gets the current DNS blocking status.
     *
     * @returns {Promise<object>} API result object containing the blocking status.
     */
    async getBlocking() {
        return this.callAuthenticated('GET', '/dns/blocking');
    }

    /**
     * Gets the current Pi-hole summary statistics.
     *
     * @returns {Promise<object>} API result object containing summary statistics.
     */
    async getSummary() {
        return this.callAuthenticated('GET', '/stats/summary');
    }

    /**
     * Gets the recent Pi-hole query history.
     *
     * @returns {Promise<object>} API result object containing query history.
     */
    async getHistory() {
        return this.callAuthenticated('GET', '/history');
    }

    /**
     * Gets Pi-hole system information.
     *
     * @returns {Promise<object>} API result object containing system information.
     */
    async getSystem() {
        return this.callAuthenticated('GET', '/info/system');
    }

    /**
     * Gets top clients from the Pi-hole database for the last 24 hours.
     *
     * @returns {Promise<object>} API result object containing top client statistics.
     */
    async getDatabaseTopClients() {
        const query = {
            from: Math.trunc(Date.now() / 1000 - 60 * 60 * 24),
            until: Math.trunc(Date.now() / 1000),
            blocked: 0,
            count: 10,
        };

        return this.callAuthenticated('GET', '/stats/database/top_clients', null, query);
    }

    /**
     * Gets top domains from the Pi-hole database for the last 24 hours.
     *
     * @returns {Promise<object>} API result object containing top domain statistics.
     */
    async getDatabaseTopDomains() {
        const query = {
            from: Math.trunc(Date.now() / 1000 - 60 * 60 * 24),
            until: Math.trunc(Date.now() / 1000),
            blocked: 0,
            count: 10,
        };

        return this.callAuthenticated('GET', '/stats/database/top_domains', null, query);
    }

    /**
     * Gets top clients from the Pi-hole API.
     *
     * @param {boolean|number} blocked - 0/false for allowed clients, 1/true for blocked clients.
     * @returns {Promise<object>} API result object containing top client statistics.
     */
    async getTopClients(blocked) {
        const query = {
            blocked,
            count: 10,
        };

        return this.callAuthenticated('GET', '/stats/top_clients', null, query);
    }

    /**
     * Gets top domains from the Pi-hole API.
     *
     * @param {boolean|number} blocked - 0/false for allowed domains, 1/true for blocked domains.
     * @returns {Promise<object>} API result object containing top domain statistics.
     */
    async getTopDomains(blocked) {
        const query = {
            blocked,
            count: 10,
        };

        return this.callAuthenticated('GET', '/stats/top_domains', null, query);
    }

    /**
     * Gets Pi-hole version information.
     *
     * @returns {Promise<object>} API result object containing version information.
     */
    async getVersion() {
        return this.callAuthenticated('GET', '/info/version');
    }

    /**
     * Calls a custom Pi-hole API endpoint.
     *
     * For GET requests, params are sent as URL query parameters.
     * For all other methods, params are sent as JSON request body.
     *
     * @param {string} method - HTTP method, for example GET, POST, PUT or DELETE.
     * @param {string} endpoint - API endpoint path, for example /stats/summary.
     * @param {object|null} [params] - Request parameters.  Default is null.
     * @returns {Promise<object>} API result object.
     */
    async getGeneralPiholeAPI(method, endpoint, params = null) {
        const upperMethod = method.toUpperCase();

        if (upperMethod === 'GET') {
            return this.callAuthenticated(upperMethod, endpoint, null, params);
        }

        return this.callAuthenticated(upperMethod, endpoint, params, null);
    }
};

module.exports.PiholeApiError = PiholeApiError;
