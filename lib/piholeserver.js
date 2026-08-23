const { ioUtil } = require('./ioUtil');
const PiholeClient = require('./piholeApiClient');

/**
 * Class for handling Pi-hole server data inside the ioBroker adapter. xxx
 */
class piholeserverclass {
    /**
     * Creates a new Pi-hole server class instance.
     *
     * @param {object} adapter - ioBroker adapter instance.
     */
    constructor(adapter) {
        this.adapter = adapter;
        this.ioUtil = new ioUtil(adapter);
    }

    /**
     * Initializes the adapter class.
     *
     * Creates the Pi-hole client, validates configuration values, creates datapoints
     * and starts the recurring data update loops.
     *
     * @returns {Promise<void>} Resolves when initialization has been started.
     */
    async init() {
        this.pihole = new PiholeClient({
            password: this.adapter.config.password,
            baseUrl: this.adapter.config.address,
            path: '/api',
            rejectUnauthorized: false,
            log: this.adapter.log,
            adapter: this.adapter,
        });

        await this.pihole.setupSession();

        this.stateTemplate = {
            Summary: {
                name: 'Summary',
                read: true,
                write: false,
                type: 'string',
                role: 'json',
                def: '{}',
            },
            TopDomains: {
                name: 'TopDomains',
                read: true,
                write: false,
                type: 'string',
                role: 'json',
                def: '{}',
            },
            TopClients: {
                name: 'TopClients',
                read: true,
                write: false,
                type: 'string',
                role: 'json',
                def: '{}',
            },
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
            System: {
                name: 'System',
                read: true,
                write: false,
                type: 'string',
                role: 'json',
                def: '{}',
            },
            Version: {
                name: 'Version',
                read: true,
                write: false,
                type: 'string',
                role: 'json',
                def: '{}',
            },
            Blocking: {
                name: 'Blocking',
                read: true,
                write: true,
                type: 'boolean',
                role: 'switch',
                def: false,
            },
            BlockingTime: {
                name: 'BlockingTime',
                read: true,
                write: true,
                type: 'number',
                role: 'level',
                def: 60 * 5,
            },
        };

        this.stateTemplateDetailedVersion = {
            CoreLocal: {
                name: 'CoreLocal',
                read: true,
                write: false,
                type: 'string',
                role: 'text',
                def: '',
            },
            CoreRemote: {
                name: 'CoreRemote',
                read: true,
                write: false,
                type: 'string',
                role: 'text',
                def: '',
            },
            CoreUpdate: {
                name: 'CoreUpdate',
                read: true,
                write: false,
                type: 'boolean',
                role: 'state',
                def: false,
            },
            WebLocal: {
                name: 'WebLocal',
                read: true,
                write: false,
                type: 'string',
                role: 'text',
                def: '',
            },
            WebRemote: {
                name: 'WebRemote',
                read: true,
                write: false,
                type: 'string',
                role: 'text',
                def: '',
            },
            WebUpdate: {
                name: 'WebUpdate',
                read: true,
                write: false,
                type: 'boolean',
                role: 'state',
                def: false,
            },
            FTLLocal: {
                name: 'FTLLocal',
                read: true,
                write: false,
                type: 'string',
                role: 'text',
                def: '',
            },
            FTLRemote: {
                name: 'FTLRemote',
                read: true,
                write: false,
                type: 'string',
                role: 'text',
                def: '',
            },
            FTLUpdate: {
                name: 'FTLUpdate',
                read: true,
                write: false,
                type: 'boolean',
                role: 'state',
                def: false,
            },
            DockerLocal: {
                name: 'DockerLocal',
                read: true,
                write: false,
                type: 'string',
                role: 'text',
                def: '',
            },
            DockerRemote: {
                name: 'DockerRemote',
                read: true,
                write: false,
                type: 'string',
                role: 'text',
                def: '',
            },
            DockerUpdate: {
                name: 'DockerUpdate',
                read: true,
                write: false,
                type: 'boolean',
                role: 'state',
                def: false,
            },
        };

        this.stateTemplateDetailedSummary = {
            QueriesTotal: {
                name: 'QueriesTotal',
                read: true,
                write: false,
                type: 'number',
                role: 'value',
                def: 0,
            },
            QueriesBlocked: {
                name: 'QueriesBlocked',
                read: true,
                write: false,
                type: 'number',
                role: 'value',
                def: 0,
            },
            ClientsActive: {
                name: 'ClientsActive',
                read: true,
                write: false,
                type: 'number',
                role: 'value',
                def: 0,
            },
            ClientsTotal: {
                name: 'ClientsTotal',
                read: true,
                write: false,
                type: 'number',
                role: 'value',
                def: 0,
            },
        };

        this.detailedDatapointsPath = 'Data';
        this.detailedDatapointsVersionPath = 'Version';
        this.detailedDatapointsSummaryPath = 'Summary';
        this.clientDatapointsPath = 'Clients';
        this.colorDisabled = '#ff0000';
        this.colorEnabled = '#00C853';
        this.data = [];

        this.checkConfigParameters();

        await this.checkDatapoints();
        await this.checkDatapointsDetailedSummary();
        await this.checkDatapointsDetailedVersion();
        await this.deleteInactiveClientChannels();

        this.doDataSummary();
        this.doDataBlocking();
        this.doDataSystem();
        this.doDataTop();
        this.doDataVersion();
        if (this.enableClientDomainStats) {
            this.doClientDomainStats();
        }
    }

    /**
     * Validates refresh configuration values.
     *
     * Values outside the allowed range are replaced with fallback values.
     */
    checkConfigParameters() {
        this.refreshSummary = this.ioUtil.checkNumberRange(this.adapter.config.refreshSummary, 1, 86400, 1);
        this.refreshBlocking = this.ioUtil.checkNumberRange(this.adapter.config.refreshBlocking, 1, 86400, 10);
        this.refreshSystem = this.ioUtil.checkNumberRange(this.adapter.config.refreshSystem, 1, 86400, 20);
        this.refreshTop = this.ioUtil.checkNumberRange(this.adapter.config.refreshTop, 1, 86400, 60);
        this.refreshVersion = this.ioUtil.checkNumberRange(this.adapter.config.refreshVersion, 1, 86400, 120);
        this.enableClientDomainStats = this.adapter.config.enableClientDomainStats !== false;
        this.deleteInactiveClients = this.adapter.config.deleteInactiveClients === true;
        this.refreshClientDomainStats = this.ioUtil.checkNumberRange(
            this.adapter.config.refreshClientDomainStats,
            60,
            86400,
            3600,
        );
        this.clientQuerySpread = this.ioUtil.checkNumberRange(this.adapter.config.clientQuerySpread, 0, 90, 10);
        this.clientQueryPageSize = 1000;
    }

    /**
     * Calculates a safe pause between client requests.
     *
     * The configured percentage limits the sum of all client pauses to a
     * fraction of the complete refresh interval, so a delay configuration can
     * never create overlapping update loops.
     *
     * @param {number} clientCount - Number of clients in the current update.
     * @returns {number} Delay between two clients in milliseconds.
     */
    calculateClientQueryDelay(clientCount) {
        if (clientCount < 2 || this.clientQuerySpread <= 0) {
            return 0;
        }

        const spreadMilliseconds = this.refreshClientDomainStats * 1000 * (this.clientQuerySpread / 100);
        return Math.floor(spreadMilliseconds / (clientCount - 1));
    }

    /**
     * Converts a Pi-hole client name into one safe ioBroker object-id segment.
     *
     * @param {string} clientName - Client hostname reported by Pi-hole.
     * @returns {string} Sanitized object-id segment.
     */
    sanitizeClientName(clientName) {
        const sanitized = String(clientName ?? '')
            .trim()
            .replace(/[^A-Za-z0-9_-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');

        return sanitized || 'unknown';
    }

    /**
     * Returns whether a Pi-hole query status represents a blocked query.
     *
     * @param {string|null|undefined} status - Pi-hole query status.
     * @returns {boolean} True for all known Pi-hole blocking statuses.
     */
    isBlockedQueryStatus(status) {
        return new Set([
            'GRAVITY',
            'DENYLIST',
            'REGEX',
            'EXTERNAL_BLOCKED_IP',
            'EXTERNAL_BLOCKED_NULL',
            'EXTERNAL_BLOCKED_NXRA',
            'EXTERNAL_BLOCKED_EDE15',
            'GRAVITY_CNAME',
            'DENYLIST_CNAME',
            'REGEX_CNAME',
            // Older/non-standard spellings retained for compatibility.
            'CNAME_GRAVITY',
            'CNAME_DENYLIST',
            'CNAME_REGEX',
        ]).has(String(status ?? '').toUpperCase());
    }

    /**
     * Aggregates query rows into unique domains sorted by descending count.
     *
     * @param {object[]} queries - Pi-hole query rows.
     * @param {boolean} blocked - Select blocked or permitted rows.
     * @returns {{domain: string, count: number}[]} Aggregated domain list.
     */
    aggregateClientDomains(queries, blocked) {
        const counts = new Map();

        for (const query of queries) {
            if (!query?.domain || this.isBlockedQueryStatus(query.status) !== blocked) {
                continue;
            }
            counts.set(query.domain, (counts.get(query.domain) ?? 0) + 1);
        }

        return [...counts.entries()]
            .map(([domain, count]) => ({ domain, count }))
            .sort((left, right) => right.count - left.count || left.domain.localeCompare(right.domain));
    }

    /**
     * Reads all query pages for one named client for the current local day.
     *
     * @param {object} clientFilter - Pi-hole client filter (`client_ip` or `client_name`).
     * @param {number} from - Start-of-day Unix timestamp.
     * @param {number} until - Current Unix timestamp.
     * @returns {Promise<object[]|null>} Query rows or null when a request failed.
     */
    async getClientQueriesForDay(clientFilter, from, until) {
        const queries = [];
        const pageSize = this.clientQueryPageSize ?? 1000;
        let cursor;
        let start = 0;
        let hasMore = true;

        while (hasMore) {
            if (!this.pihole) {
                return null;
            }
            const result = await this.pihole.getQueries({
                from,
                until,
                length: pageSize,
                start,
                ...clientFilter,
                ...(cursor !== undefined ? { cursor } : {}),
            });

            const responseBody = result.body;
            if (!result.ok || !Array.isArray(responseBody?.queries)) {
                this.adapter.log.warn(
                    `Could not get daily queries for client ${Object.values(clientFilter)[0]}: ${result.error?.message ?? result.error ?? 'invalid response'}`,
                );
                return null;
            }

            queries.push(...responseBody.queries);
            start += responseBody.queries.length;
            if (cursor === undefined) {
                cursor = responseBody.cursor;
            }

            const recordsFiltered = Number(responseBody.recordsFiltered);
            const reachedFilteredTotal = Number.isFinite(recordsFiltered) && start >= recordsFiltered;
            hasMore =
                responseBody.queries.length >= pageSize &&
                cursor !== undefined &&
                cursor !== null &&
                !reachedFilteredTotal;
        }

        return queries;
    }

    /**
     * Creates and updates the permitted/blocked JSON states for one client.
     *
     * @param {string} clientName - Original Pi-hole client hostname.
     * @param {string} clientIp - Pi-hole client IP address.
     * @param {string} objectName - Sanitized, unique ioBroker object-id segment.
     * @param {object[]} queries - Query rows for the current day.
     * @param {boolean} clientExists - Whether the client channel already exists.
     * @returns {Promise<void>} Resolves after both states were updated.
     */
    async updateClientDomainStates(clientName, clientIp, objectName, queries, clientExists = false) {
        if (queries.length === 0 && !clientExists) {
            return;
        }

        if (queries.length > 0) {
            await this.ioUtil.createObjectChannelAsync({ name: objectName }, this.clientDatapointsPath, '');
            await this.ioUtil.extendObjectAsync(objectName, this.clientDatapointsPath, null, {
                common: { name: clientIp || clientName },
                native: { clientName, clientIp },
            });
        }

        for (const state of [
            { name: 'permitted', blocked: false },
            { name: 'blocked', blocked: true },
        ]) {
            const stateName = state.name;
            await this.ioUtil.createObjectNotExistsAsync(
                {
                    name: stateName,
                    read: true,
                    write: false,
                    type: 'string',
                    role: 'json',
                    def: '[]',
                },
                this.clientDatapointsPath,
                objectName,
            );
            await this.ioUtil.extendObjectAsync(stateName, this.clientDatapointsPath, objectName, {
                native: { clientName, clientIp },
            });
            await this.ioUtil.setStateAsync(
                stateName,
                JSON.stringify(this.aggregateClientDomains(queries, state.blocked)),
                this.clientDatapointsPath,
                objectName,
            );
        }

        const blockedCount = queries.reduce(
            (count, query) => count + (this.isBlockedQueryStatus(query?.status) ? 1 : 0),
            0,
        );
        for (const state of [
            { name: 'QueriesTotal', value: queries.length },
            { name: 'QueriesBlocked', value: blockedCount },
        ]) {
            await this.ioUtil.createObjectNotExistsAsync(
                {
                    name: state.name,
                    read: true,
                    write: false,
                    type: 'number',
                    role: 'value',
                    def: 0,
                },
                this.clientDatapointsPath,
                objectName,
            );
            await this.ioUtil.extendObjectAsync(state.name, this.clientDatapointsPath, objectName, {
                native: { clientName, clientIp },
            });
            await this.ioUtil.setStateAsync(state.name, state.value, this.clientDatapointsPath, objectName);
        }
    }

    /**
     * Returns the existing direct client channels below the Clients folder.
     *
     * @returns {Promise<Map<string, object>>} Channels keyed by their object-id segment.
     */
    async getExistingClientChannels() {
        const objects = await this.ioUtil.getObjects(`${this.clientDatapointsPath}.`);
        const prefix = `${this.adapter.namespace}.${this.clientDatapointsPath}.`;
        const channels = new Map();

        for (const [id, row] of Object.entries(objects)) {
            const object = row?.value ?? row;
            const objectName = id.startsWith(prefix) ? id.slice(prefix.length) : '';
            if (object?.type === 'channel' && objectName && !objectName.includes('.')) {
                channels.set(objectName, object);
            }
        }

        return channels;
    }

    /**
     * Deletes inactive client channels once per local day after 00:05.
     * A channel must have QueriesTotal set to zero and must not have been
     * updated since the start of the previous local calendar day. Future
     * timestamps are invalid.
     *
     * @param {Date} now - Current local time, injectable for deterministic tests.
     * @returns {Promise<void>} Resolves after eligible channels were deleted.
     */
    async deleteInactiveClientChannels(now = new Date()) {
        if (!this.deleteInactiveClients || (now.getHours() === 0 && now.getMinutes() < 5)) {
            return;
        }

        const localDate = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
        if (this.lastClientCleanupDate === localDate) {
            return;
        }

        const channels = await this.getExistingClientChannels();
        const nowTimestamp = now.getTime();
        const startOfPreviousDay = new Date(now);
        startOfPreviousDay.setHours(0, 0, 0, 0);
        startOfPreviousDay.setDate(startOfPreviousDay.getDate() - 1);
        const startOfPreviousDayTimestamp = startOfPreviousDay.getTime();

        for (const [objectName, channel] of channels) {
            const timestamp = Number(channel.ts);
            const wasRecentlyUpdated =
                Number.isFinite(timestamp) && timestamp >= startOfPreviousDayTimestamp && timestamp <= nowTimestamp;
            if (wasRecentlyUpdated) {
                continue;
            }

            const queriesTotal = await this.ioUtil.getStateAsync('QueriesTotal', this.clientDatapointsPath, objectName);
            if (queriesTotal?.val === 0) {
                await this.ioUtil.deleteObjectAsync(objectName, this.clientDatapointsPath, null);
            }
        }

        this.lastClientCleanupDate = localDate;
    }

    /**
     * Updates current-day domain statistics for all named Pi-hole clients.
     * Client requests are deliberately separated by the configured delay.
     *
     * @returns {Promise<void>} Resolves after all clients were processed.
     */
    async getClientDomainStats() {
        if (!this.pihole) {
            return;
        }
        const suggestions = await this.pihole.getQuerySuggestions();
        const clientNames = suggestions.body?.suggestions?.client_name;
        const clientIps = suggestions.body?.suggestions?.client_ip;

        if (!suggestions.ok || (!Array.isArray(clientNames) && !Array.isArray(clientIps))) {
            this.adapter.log.warn(
                `Could not get Pi-hole client names: ${suggestions.error?.message ?? suggestions.error ?? 'invalid response'}`,
            );
            return;
        }

        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const from = Math.trunc(startOfDay.getTime() / 1000);
        const until = Math.trunc(now.getTime() / 1000);
        const usedObjectNames = new Map();
        const uniqueClientNames = [
            ...new Set((clientNames ?? []).filter(name => typeof name === 'string' && name.trim())),
        ].sort();
        const uniqueClientIps = [
            ...new Set((clientIps ?? []).filter(ip => typeof ip === 'string' && ip.trim())),
        ].sort();
        const clientFilters = [
            ...uniqueClientIps.map(ip => ({ type: 'client_ip', value: ip })),
            ...uniqueClientNames.map(name => ({ type: 'client_name', value: name })),
        ];
        const clientQueryDelay = this.calculateClientQueryDelay(clientFilters.length);
        const existingClientChannels = await this.getExistingClientChannels();
        const resolvedClientNames = new Set();

        for (let index = 0; index < clientFilters.length; index++) {
            const filter = clientFilters[index];
            if (filter.type === 'client_name' && resolvedClientNames.has(filter.value)) {
                continue;
            }

            const queries = await this.getClientQueriesForDay({ [filter.type]: filter.value }, from, until);
            if (!queries) {
                continue;
            }

            const queryClient = queries.find(query => query?.client?.ip || query?.client?.name)?.client;
            const clientIp = String(queryClient?.ip ?? (filter.type === 'client_ip' ? filter.value : '')).trim();
            const clientName = String(queryClient?.name ?? (filter.type === 'client_name' ? filter.value : '')).trim();
            const displayName = clientName || clientIp;
            if (!displayName) {
                continue;
            }
            if (clientName) {
                resolvedClientNames.add(clientName);
            }

            let objectName = this.sanitizeClientName(displayName);
            const duplicateNumber = (usedObjectNames.get(objectName) ?? 0) + 1;
            usedObjectNames.set(objectName, duplicateNumber);
            if (duplicateNumber > 1) {
                objectName = `${objectName}_${duplicateNumber}`;
            }

            const clientExists = existingClientChannels.has(objectName);
            if (queries && (queries.length > 0 || clientExists)) {
                await this.updateClientDomainStates(clientName, clientIp, objectName, queries, clientExists);
            }

            if (index < clientFilters.length - 1 && clientQueryDelay > 0) {
                await this.ioUtil.delay(clientQueryDelay);
            }
        }

        await this.deleteInactiveClientChannels(now);
    }

    /**
     * Creates missing main datapoints and stores their current values locally.
     *
     * @returns {Promise<void>} Resolves when all datapoints have been checked.
     */
    async checkDatapoints() {
        this.ioUtil.logdebug('checkDatapoints');

        for (const key in this.stateTemplate) {
            const stateTemplate = this.stateTemplate[key];

            if (!stateTemplate?.exist) {
                await this.ioUtil.createObjectNotExistsAsync(stateTemplate, '', '');

                const state = await this.ioUtil.getStateAsync(stateTemplate.name, '', '');

                if (this.data) {
                    this.data[stateTemplate.name] = state.val;
                }

                stateTemplate.exist = true;
            }
        }
    }

    /**
     * Creates missing detailed version datapoints and updates their object color.
     *
     * @returns {Promise<void>} Resolves when all detailed version datapoints have been checked.
     */
    async checkDatapointsDetailedVersion() {
        this.ioUtil.logdebug('checkDatapointsDetailedVersion');

        await this.ioUtil.createFolderNotExistsAsync(this.detailedDatapointsPath, null, null);
        await this.ioUtil.createFolderNotExistsAsync(
            this.detailedDatapointsVersionPath,
            this.detailedDatapointsPath,
            null,
        );

        for (const key in this.stateTemplateDetailedVersion) {
            const stateTemplate = this.stateTemplateDetailedVersion[key];

            if (!stateTemplate?.exist) {
                await this.ioUtil.createObjectNotExistsAsync(
                    stateTemplate,
                    this.detailedDatapointsPath,
                    this.detailedDatapointsVersionPath,
                );

                const state = await this.ioUtil.getStateAsync(
                    stateTemplate.name,
                    this.detailedDatapointsPath,
                    this.detailedDatapointsVersionPath,
                );

                if (this.data) {
                    this.data[`${this.detailedDatapointsVersionPath}.${stateTemplate.name}`] = state.val;
                }

                stateTemplate.exist = true;
            }
        }

        const color = this.adapter.config.enabledetailedversion ? this.colorEnabled : this.colorDisabled;

        await this.ioUtil.extendObjectAsync(this.detailedDatapointsVersionPath, this.detailedDatapointsPath, null, {
            common: {
                color,
            },
        });

        for (const key in this.stateTemplateDetailedVersion) {
            await this.ioUtil.extendObjectAsync(key, this.detailedDatapointsPath, this.detailedDatapointsVersionPath, {
                common: {
                    color,
                },
            });
        }
    }

    /**
     * Creates missing detailed summary datapoints and updates their object color.
     *
     * @returns {Promise<void>} Resolves when all detailed summary datapoints have been checked.
     */
    async checkDatapointsDetailedSummary() {
        this.ioUtil.logdebug('checkDatapointsDetailedSummary');

        await this.ioUtil.createFolderNotExistsAsync(this.detailedDatapointsPath, null, null);
        await this.ioUtil.createFolderNotExistsAsync(
            this.detailedDatapointsSummaryPath,
            this.detailedDatapointsPath,
            null,
        );

        for (const key in this.stateTemplateDetailedSummary) {
            const stateTemplate = this.stateTemplateDetailedSummary[key];

            if (!stateTemplate?.exist) {
                await this.ioUtil.createObjectNotExistsAsync(
                    stateTemplate,
                    this.detailedDatapointsPath,
                    this.detailedDatapointsSummaryPath,
                );

                const state = await this.ioUtil.getStateAsync(
                    stateTemplate.name,
                    this.detailedDatapointsPath,
                    this.detailedDatapointsSummaryPath,
                );

                if (this.data) {
                    this.data[`${this.detailedDatapointsSummaryPath}.${stateTemplate.name}`] = state.val;
                }

                stateTemplate.exist = true;
            }
        }

        const color = this.adapter.config.enabledetailedsummary ? this.colorEnabled : this.colorDisabled;

        await this.ioUtil.extendObjectAsync(this.detailedDatapointsSummaryPath, this.detailedDatapointsPath, null, {
            common: {
                color,
            },
        });

        for (const key in this.stateTemplateDetailedSummary) {
            await this.ioUtil.extendObjectAsync(key, this.detailedDatapointsPath, this.detailedDatapointsSummaryPath, {
                common: {
                    color,
                },
            });
        }
    }

    /**
     * Subscribes to writable datapoints.
     */
    async subscribeDatapoints() {
        this.ioUtil.logdebug('subscribeDatapoints');

        this.adapter.subscribeStates('Blocking');
        this.adapter.subscribeStates('BlockingTime');
    }

    /**
     * Handles changes of subscribed ioBroker states.
     *
     * @param {string} id - Changed state id.
     * @param {any|null|undefined} state - Changed state value.
     * @returns {Promise<void>} Resolves when the state change has been handled.
     */
    async stateChange(id, state) {
        this.ioUtil.logsilly('stateChange');

        if (!id || !state || state.ack) {
            return;
        }

        const idParts = id.split('.');
        idParts.shift();
        idParts.shift();

        if (idParts[0] === 'Blocking') {
            await this.doToggleBlocking();
        }

        if (idParts[0] === 'BlockingTime') {
            if (this.data) {
                this.data['BlockingTime'] = parseInt(state.val, 10);
                await this.ioUtil.setStateAsync('BlockingTime', parseInt(state.val, 10), '', '');
            }
        }
    }

    /**
     * Processes adapter messages.
     *
     * @param {object} msg - ioBroker message object.
     */
    processMessages(msg) {
        this.ioUtil.logdebug(`processMessages ${JSON.stringify(msg)}`);

        if (msg.command === 'piholeapi') {
            this.ioUtil.logdebug('send piholeapi');
            this.piHoleApi(msg);
        }
    }

    /**
     * Executes a custom Pi-hole API request from an ioBroker message.
     *
     * @param {object} msg - The message object containing the command, method, endpoint, params and callback.
     */
    async piHoleApi(msg) {
        this.ioUtil.logdebug('piHoleApi');

        if (!msg?.message || typeof msg.message !== 'object' || !this.pihole) {
            return;
        }

        const method = msg.message.method;
        const endpoint = msg.message.endpoint;
        const params = msg.message.params;

        const dataapi = await this.pihole.getGeneralPiholeAPI(method, endpoint, params);

        if (!dataapi.ok) {
            const errorMessage = dataapi.error?.message ?? dataapi.error ?? 'unknown error';

            this.adapter.log.warn(`Pi-hole API command failed: ${errorMessage}`);

            if (msg.callback) {
                this.adapter.sendTo(
                    msg.from,
                    msg.command,
                    {
                        ok: false,
                        error: errorMessage,
                    },
                    msg.callback,
                );
            }

            return;
        }

        this.ioUtil.logdebug(
            `piHoleApi send ${msg.from} ${msg.command} ${JSON.stringify(dataapi.body).substring(0, 100)} ${
                msg.callback
            }`,
        );

        if (msg.callback) {
            this.adapter.sendTo(msg.from, msg.command, dataapi.body, msg.callback);
        }
    }

    /**
     * Toggles Pi-hole DNS blocking.
     *
     * Reads the current blocking state and switches it to the opposite value.
     * If blocking is currently enabled, the configured blocking time is used
     * when disabling blocking.
     *
     * @returns {Promise<void>} Resolves when the toggle operation has been started.
     */
    async doToggleBlocking() {
        this.ioUtil.logdebug('doToggleBlocking');

        if (!this.pihole) {
            return;
        }

        const dataBlocking = await this.pihole.getBlocking();

        if (!dataBlocking.ok) {
            this.adapter.log.warn(
                `Could not read Pi-hole blocking state: ${
                    dataBlocking.error?.message ?? dataBlocking.error ?? 'unknown error'
                }`,
            );
            await this.checkConnection();
            return;
        }

        const dataBlockingBool = dataBlocking.body?.blocking === 'enabled';
        let blockingTime = 0;

        if (this.data && this.data['BlockingTime'] && dataBlockingBool) {
            blockingTime = this.data['BlockingTime'];
        }

        const result = await this.pihole.setBlocking(!dataBlockingBool, blockingTime);

        if (!result.ok) {
            this.adapter.log.warn(
                `Could not change Pi-hole blocking state: ${result.error?.message ?? result.error ?? 'unknown error'}`,
            );
            await this.checkConnection();
            return;
        }

        this.ioUtil.setMyTimeout('getDataBlocking', () => this.getDataBlocking(), 100);
    }

    /**
     * Starts the recurring summary update loop.
     *
     * @returns {Promise<void>} Resolves after one loop iteration.
     */
    async doDataSummary() {
        this.ioUtil.logdebug('doDataSummary');

        await this.getDataSummary();
        await this.ioUtil.delay(this.refreshSummary * 1000);
        this.doDataSummary();
    }

    /**
     * Starts the recurring blocking update loop.
     *
     * @returns {Promise<void>} Resolves after one loop iteration.
     */
    async doDataBlocking() {
        this.ioUtil.logdebug('doDataBlocking');

        await this.getDataBlocking();
        await this.ioUtil.delay(this.refreshBlocking * 1000);
        this.doDataBlocking();
    }

    /**
     * Starts the recurring system update loop.
     *
     * @returns {Promise<void>} Resolves after one loop iteration.
     */
    async doDataSystem() {
        this.ioUtil.logdebug('doDataSystem');

        await this.getDataSystem();
        await this.ioUtil.delay(this.refreshSystem * 1000);
        this.doDataSystem();
    }

    /**
     * Starts the recurring top statistics update loop.
     *
     * @returns {Promise<void>} Resolves after one loop iteration.
     */
    async doDataTop() {
        this.ioUtil.logdebug('doDataTop');

        await this.checkDatapoints();
        await this.checkDatapointsDetailedSummary();
        await this.checkDatapointsDetailedVersion();

        await this.getDataTop();
        await this.ioUtil.delay(this.refreshTop * 1000);
        this.doDataTop();
    }

    /**
     * Starts the recurring version update loop.
     *
     * @returns {Promise<void>} Resolves after one loop iteration.
     */
    async doDataVersion() {
        this.ioUtil.logdebug('doDataVersion');

        await this.getDataVersion();
        await this.ioUtil.delay(this.refreshVersion * 1000);
        this.doDataVersion();
    }

    /**
     * Starts the recurring current-day per-client domain update loop.
     *
     * @returns {Promise<void>} Resolves after one loop iteration.
     */
    async doClientDomainStats() {
        this.ioUtil.logdebug('doClientDomainStats');

        const startedAt = Date.now();
        await this.getClientDomainStats();
        const remainingDelay = Math.max(0, this.refreshClientDomainStats * 1000 - (Date.now() - startedAt));
        await this.ioUtil.delay(remainingDelay);
        this.doClientDomainStats();
    }

    /**
     * Checks whether the Pi-hole API is currently reachable and authenticated.
     *
     * Updates the ioBroker info.connection state.
     *
     * @returns {Promise<boolean>} True if the Pi-hole API is online, otherwise false.
     */
    async checkConnection() {
        const connect = this.pihole ? await this.pihole.checkOnline() : false;

        await this.ioUtil.setStateAsync('info.connection', connect, null, null);

        return connect;
    }

    /**
     * Reads summary data from the Pi-hole API and updates related datapoints.
     *
     * @returns {Promise<void>} Resolves when summary data has been processed.
     */
    async getDataSummary() {
        this.ioUtil.logdebug('getDataSummary');

        if (!this.pihole) {
            return;
        }

        const dataSummary = await this.pihole.getSummary();

        if (!dataSummary.ok) {
            this.adapter.log.warn(
                `Could not get Pi-hole summary: ${dataSummary.error?.message ?? dataSummary.error ?? 'unknown error'}`,
            );
            await this.checkConnection();
            return;
        }

        await this.ioUtil.setStateAsync('Summary', JSON.stringify(dataSummary.body), null, null);

        if (this.data) {
            this.data['Summary'] = JSON.stringify(dataSummary.body);
        }

        if (this.adapter.config.enabledetailedsummary) {
            await this.analyzeSummary(dataSummary.body);
        }

        await this.ioUtil.setStateAsync('info.connection', true, null, null);
    }

    /**
     * Reads system information from the Pi-hole API and updates the System datapoint.
     *
     * @returns {Promise<void>} Resolves when system data has been processed.
     */
    async getDataSystem() {
        this.ioUtil.logdebug('getDataSystem');

        if (!this.pihole) {
            return;
        }

        const dataSystem = await this.pihole.getSystem();

        if (!dataSystem.ok) {
            this.adapter.log.warn(
                `Could not get Pi-hole system data: ${dataSystem.error?.message ?? dataSystem.error ?? 'unknown error'}`,
            );
            await this.checkConnection();
            return;
        }

        await this.ioUtil.setStateAsync('System', JSON.stringify(dataSystem.body), null, null);

        if (this.data) {
            this.data['System'] = JSON.stringify(dataSystem.body);
        }

        await this.ioUtil.setStateAsync('info.connection', true, null, null);
    }

    /**
     * Reads DNS blocking status from the Pi-hole API and updates the Blocking datapoint.
     *
     * @returns {Promise<void>} Resolves when blocking data has been processed.
     */
    async getDataBlocking() {
        this.ioUtil.logdebug('getDataBlocking');

        if (!this.pihole) {
            return;
        }

        const dataBlocking = await this.pihole.getBlocking();

        if (!dataBlocking.ok) {
            this.adapter.log.warn(
                `Could not get Pi-hole blocking state: ${
                    dataBlocking.error?.message ?? dataBlocking.error ?? 'unknown error'
                }`,
            );
            await this.checkConnection();
            return;
        }

        const blocking = dataBlocking.body?.blocking === 'enabled';

        await this.ioUtil.setStateAsync('Blocking', blocking, null, null);

        if (this.data) {
            this.data['Blocking'] = blocking;
        }

        await this.ioUtil.setStateAsync('info.connection', true, null, null);
    }

    /**
     * Reads version information from the Pi-hole API and updates related datapoints.
     *
     * @returns {Promise<void>} Resolves when version data has been processed.
     */
    async getDataVersion() {
        this.ioUtil.logdebug('getDataVersion');

        if (!this.pihole) {
            return;
        }

        const dataVersion = await this.pihole.getVersion();

        if (!dataVersion.ok) {
            this.adapter.log.warn(
                `Could not get Pi-hole version data: ${
                    dataVersion.error?.message ?? dataVersion.error ?? 'unknown error'
                }`,
            );
            await this.checkConnection();
            return;
        }

        await this.ioUtil.setStateAsync('Version', JSON.stringify(dataVersion.body), null, null);

        if (this.data) {
            this.data['Version'] = JSON.stringify(dataVersion.body);
        }

        if (this.adapter.config.enabledetailedversion) {
            await this.analyzeVersion(dataVersion.body);
        }

        await this.ioUtil.setStateAsync('info.connection', true, null, null);
    }

    /**
     * Reads top clients and top domains from the Pi-hole API and updates related datapoints.
     *
     * @returns {Promise<void>} Resolves when top statistics have been processed.
     */
    async getDataTop() {
        this.ioUtil.logdebug('getDataTop');

        if (!this.pihole) {
            return;
        }

        const dataTopClients = await this.pihole.getTopClients(false);

        if (!dataTopClients.ok) {
            this.adapter.log.warn(
                `Could not get Pi-hole top clients: ${
                    dataTopClients.error?.message ?? dataTopClients.error ?? 'unknown error'
                }`,
            );
            await this.checkConnection();
            return;
        }

        await this.ioUtil.setStateAsync('TopClients', JSON.stringify(dataTopClients.body), null, null);

        if (this.data) {
            this.data['TopClients'] = JSON.stringify(dataTopClients.body);
        }

        const dataTopDomains = await this.pihole.getTopDomains(false);

        if (!dataTopDomains.ok) {
            this.adapter.log.warn(
                `Could not get Pi-hole top domains: ${
                    dataTopDomains.error?.message ?? dataTopDomains.error ?? 'unknown error'
                }`,
            );
            await this.checkConnection();
            return;
        }

        await this.ioUtil.setStateAsync('TopDomains', JSON.stringify(dataTopDomains.body), null, null);

        if (this.data) {
            this.data['TopDomains'] = JSON.stringify(dataTopDomains.body);
        }

        const dataTopClientsBlocked = await this.pihole.getTopClients(true);

        if (!dataTopClientsBlocked.ok) {
            this.adapter.log.warn(
                `Could not get Pi-hole blocked top clients: ${
                    dataTopClientsBlocked.error?.message ?? dataTopClientsBlocked.error ?? 'unknown error'
                }`,
            );
            await this.checkConnection();
            return;
        }

        await this.ioUtil.setStateAsync('TopClientsBlocked', JSON.stringify(dataTopClientsBlocked.body), null, null);

        if (this.data) {
            this.data['TopClientsBlocked'] = JSON.stringify(dataTopClientsBlocked.body);
        }

        const dataTopDomainsBlocked = await this.pihole.getTopDomains(true);

        if (!dataTopDomainsBlocked.ok) {
            this.adapter.log.warn(
                `Could not get Pi-hole blocked top domains: ${
                    dataTopDomainsBlocked.error?.message ?? dataTopDomainsBlocked.error ?? 'unknown error'
                }`,
            );
            await this.checkConnection();
            return;
        }

        await this.ioUtil.setStateAsync('TopDomainsBlocked', JSON.stringify(dataTopDomainsBlocked.body), null, null);

        if (this.data) {
            this.data['TopDomainsBlocked'] = JSON.stringify(dataTopDomainsBlocked.body);
        }

        await this.ioUtil.setStateAsync('info.connection', true, null, null);
    }

    /**
     * Updates detailed version datapoints from Pi-hole version data.
     *
     * @param {object} data - Pi-hole version response body.
     * @returns {Promise<void>} Resolves when detailed version datapoints have been updated.
     */
    async analyzeVersion(data) {
        this.ioUtil.logdebug('analyzeVersion');

        if (!data?.version) {
            this.adapter.log.warn('Could not analyze Pi-hole version data: invalid response structure');
            return;
        }

        await this.ioUtil.setStateAsync(
            'CoreLocal',
            data.version.core?.local?.version ?? '',
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );

        await this.ioUtil.setStateAsync(
            'CoreRemote',
            data.version.core?.remote?.version ?? '',
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );

        await this.ioUtil.setStateAsync(
            'CoreUpdate',
            data.version.core?.remote?.version !== data.version.core?.local?.version,
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );

        await this.ioUtil.setStateAsync(
            'WebLocal',
            data.version.web?.local?.version ?? '',
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );

        await this.ioUtil.setStateAsync(
            'WebRemote',
            data.version.web?.remote?.version ?? '',
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );

        await this.ioUtil.setStateAsync(
            'WebUpdate',
            data.version.web?.remote?.version !== data.version.web?.local?.version,
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );

        await this.ioUtil.setStateAsync(
            'FTLLocal',
            data.version.ftl?.local?.version ?? '',
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );

        await this.ioUtil.setStateAsync(
            'FTLRemote',
            data.version.ftl?.remote?.version ?? '',
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );

        await this.ioUtil.setStateAsync(
            'FTLUpdate',
            data.version.ftl?.remote?.version !== data.version.ftl?.local?.version,
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );

        await this.ioUtil.setStateAsync(
            'DockerLocal',
            data.version.docker?.local ?? '',
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );

        await this.ioUtil.setStateAsync(
            'DockerRemote',
            data.version.docker?.remote ?? '',
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );

        await this.ioUtil.setStateAsync(
            'DockerUpdate',
            data.version.docker?.remote !== data.version.docker?.local,
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );
    }

    /**
     * Updates detailed summary datapoints from Pi-hole summary data.
     *
     * @param {object} data - Pi-hole summary response body.
     * @param {object} data.queries - Query statistics.
     * @param {number} data.queries.total - Total number of queries.
     * @param {number} data.queries.blocked - Number of blocked queries.
     * @param {object} data.clients - Client statistics.
     * @param {number} data.clients.active - Number of active clients.
     * @param {number} data.clients.total - Total number of clients.
     * @returns {Promise<void>} Resolves when detailed summary datapoints have been updated.
     */
    async analyzeSummary(data) {
        this.ioUtil.logdebug('analyzeSummary');

        if (!data?.queries || !data?.clients) {
            this.adapter.log.warn('Could not analyze Pi-hole summary data: invalid response structure');
            return;
        }

        await this.ioUtil.setStateAsync(
            'QueriesTotal',
            data.queries.total ?? 0,
            this.detailedDatapointsPath,
            this.detailedDatapointsSummaryPath,
        );

        await this.ioUtil.setStateAsync(
            'QueriesBlocked',
            data.queries.blocked ?? 0,
            this.detailedDatapointsPath,
            this.detailedDatapointsSummaryPath,
        );

        await this.ioUtil.setStateAsync(
            'ClientsActive',
            data.clients.active ?? 0,
            this.detailedDatapointsPath,
            this.detailedDatapointsSummaryPath,
        );

        await this.ioUtil.setStateAsync(
            'ClientsTotal',
            data.clients.total ?? 0,
            this.detailedDatapointsPath,
            this.detailedDatapointsSummaryPath,
        );
    }
}

module.exports = piholeserverclass;
