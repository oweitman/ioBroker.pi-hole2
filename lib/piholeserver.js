const { ioUtil } = require('./ioUtil');
const PiholeClient = require('./piholeApiClient');

/**
 * class for pihole server adapter
 */
class piholeserverclass {
    /**
     * Create a new instance of pihole server class
     *
     * @param {object} adapter - the adapter instance
     */
    constructor(adapter) {
        this.adapter = adapter;
        this.ioUtil = new ioUtil(adapter);
    }
    /**
     * Initialize the adapter
     *
     * Create the states and initialize the pi-hole session
     *
     * @returns {Promise<void>}
     */
    async init() {
        //await this.checkDatapoints();
        this.pihole = new PiholeClient({
            password: this.adapter.config.password,
            baseUrl: this.adapter.config.address,
            path: '/api',
            rejectUnauthorized: false,
            log: this.adapter.log,
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
                def: 60 * 5, // 5 Minutes
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
        this.colorDisabled = '#ff0000';
        this.colorEnabled = '#00C853';
        this.data = [];
        this.checkConfigParameters();
        await this.checkDatapoints();
        await this.checkDatapointsDetailedSummary();
        await this.checkDatapointsDetailedVersion();
        this.doDataSummary();
        this.doDataBlocking();
        this.doDataSystem();
        this.doDataTop();
        this.doDataVersion();
    }
    /**
     * Checks the config parameters and ensures they are within the specified
     * range. If the parameter is out of range, the default value is used.
     * The parameters are refreshSummary, refreshBlocking, refreshSystem,
     * refreshTop, and refreshVersion.
     */
    checkConfigParameters() {
        this.refreshSummary = this.ioUtil.checkNumberRange(this.adapter.config.refreshSummary, 1, 86400, 1);
        this.refreshBlocking = this.ioUtil.checkNumberRange(this.adapter.config.refreshBlocking, 1, 86400, 10);
        this.refreshSystem = this.ioUtil.checkNumberRange(this.adapter.config.refreshSystem, 1, 86400, 20);
        this.refreshTop = this.ioUtil.checkNumberRange(this.adapter.config.refreshTop, 1, 86400, 60);
        this.refreshVersion = this.ioUtil.checkNumberRange(this.adapter.config.refreshVersion, 1, 86400, 120);
    }
    /**
     * Checks if the datapoints in stateTemplate exist. If they don't, they are created.
     * The values are also stored in the this.data array for later use.
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
     * Checks and ensures the existence of detailed version datapoints.
     * Creates necessary folders and state objects if they do not exist.
     * Updates the `this.data` array with the current state values.
     * Sets the color of the datapoints based on the configuration setting.
     */
    async checkDatapointsDetailedVersion() {
        this.ioUtil.logdebug('checkDatapointsDetaile');
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
                color: color,
            },
        });
        for (const key in this.stateTemplateDetailedVersion) {
            await this.ioUtil.extendObjectAsync(key, this.detailedDatapointsPath, this.detailedDatapointsVersionPath, {
                common: {
                    color: color,
                },
            });
        }
    }
    /**
     * Checks and ensures the existence of detailed summary datapoints.
     * Creates necessary folders and state objects if they do not exist.
     * Updates the `this.data` array with the current state values.
     * Sets the color of the datapoints based on the configuration setting.
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
                color: color,
            },
        });
        for (const key in this.stateTemplateDetailedSummary) {
            await this.ioUtil.extendObjectAsync(key, this.detailedDatapointsPath, this.detailedDatapointsSummaryPath, {
                common: {
                    color: color,
                },
            });
        }
    }
    /**
     * Subscribes to the 'Blocking' and 'BlockingTime' states to monitor changes.
     * Logs the subscription process for debugging purposes.
     */
    async subscribeDatapoints() {
        this.ioUtil.logdebug('subscribeDatapoints');
        this.adapter.subscribeStates('Blocking');
        this.adapter.subscribeStates('BlockingTime');
    }
    /**
     * Is called if a subscribed state changes
     *
     * @param {string} id id
     * @param {any | null | undefined} state state
     */
    async stateChange(id, state) {
        this.ioUtil.logsilly('stateChange');
        // Warning, state can be null if it was deleted
        if (!id || !state || state.ack) {
            return;
        }
        const idParts = id.split('.');
        idParts.shift();
        idParts.shift();
        if (idParts[0] == 'Blocking') {
            await this.doToggleBlocking();
        }
        if (idParts[0] == 'BlockingTime') {
            if (this.data) {
                this.data['BlockingTime'] = parseInt(state.val);
                await this.ioUtil.setStateAsync('BlockingTime', parseInt(state.val), '', '');
            }
        }
    }
    /**
     * Processes incoming messages and executes corresponding actions.
     * Logs the message for debugging purposes.
     * If the command is 'piholeapi', it delegates the processing to the piHoleApi method.
     *
     * @param {object} msg - The message object containing the command and other details.
     */
    processMessages(msg) {
        this.ioUtil.logdebug(`processMessages ${JSON.stringify(msg)}`);
        if (msg.command === 'piholeapi') {
            this.ioUtil.logdebug('send piholeapi');
            this.piHoleApi(msg);
        }
    }
    /**
     * Sends a request to the pi-hole api and processes the response.
     * Called if the command is 'piholeapi'.
     * Logs the request and response for debugging purposes.
     * If a callback is provided, it sends the response to the from object.
     *
     * @param {object} msg - The message object containing the command, method, endpoint, params and callback.
     */
    async piHoleApi(msg) {
        this.ioUtil.logdebug('piHoleApi ');
        if (typeof msg.message === 'object') {
            const method = msg.message.method;
            const endpoint = msg.message.endpoint;
            const params = msg.message.params;
            const dataapi = this.pihole && (await this.pihole.getGeneralPiholeAPI(method, endpoint, params));
            this.ioUtil.logdebug(
                `piHoleApi send${msg.from} ${msg.command} ${JSON.stringify(dataapi.body).substring(0, 100)} ${msg.callback}`,
            );
            if (msg.callback) {
                this.adapter.sendTo(msg.from, msg.command, dataapi.body, msg.callback);
            }
        }
    }
    /**
     * Toggles the blocking on and off.
     * If the blocking is on, it sets it to off and vice versa.
     * If the blocking time is set, it sets it.
     * Logs the toggle process for debugging purposes.
     * Calls getDataBlocking after 100ms to update the datapoints.
     */
    async doToggleBlocking() {
        this.ioUtil.logdebug('doToggleBlocking');
        const dataBlocking = await this.pihole?.getBlocking();
        const dataBlockingBool = dataBlocking.body?.blocking == 'enabled' ? true : false;
        let blockingTime = 0;
        if (this.data && this.data['BlockingTime'] && dataBlockingBool) {
            blockingTime = this.data['BlockingTime'];
        }
        this.pihole && (await this.pihole.setBlocking(dataBlockingBool ? false : true, blockingTime));
        setTimeout(() => this.getDataBlocking(), 100);
    }
    /**
     * Continuously retrieves and updates the summary data from the Pi-hole API at a specified interval.
     * Logs the process for debugging purposes.
     * Calls getDataSummary to fetch the data and delays the next call based on the configured refresh interval.
     */
    async doDataSummary() {
        this.ioUtil.logdebug('doDataSummary');
        await this.getDataSummary();
        await this.ioUtil.delay(this.refreshSummary * 1000);
        this.doDataSummary();
    }
    /**
     * Continuously retrieves and updates the blocking data from the Pi-hole API at a specified interval.
     * Logs the process for debugging purposes.
     * Calls getDataBlocking to fetch the data and delays the next call based on the configured refresh interval.
     */
    async doDataBlocking() {
        this.ioUtil.logdebug('doDataBlocking');
        await this.getDataBlocking();
        await this.ioUtil.delay(this.refreshBlocking * 1000);
        this.doDataBlocking();
    }
    /**
     * Continuously retrieves and updates the system data from the Pi-hole API at a specified interval.
     * Logs the process for debugging purposes.
     * Calls getDataSystem to fetch the data and delays the next call based on the configured refresh interval.
     */
    async doDataSystem() {
        this.ioUtil.logdebug('doDataSystem');
        await this.getDataSystem();
        await this.ioUtil.delay(this.refreshSystem * 1000);
        this.doDataSystem();
    }
    /**
     * Continuously retrieves and updates the top clients and domains data from the Pi-hole API at a specified interval.
     * Logs the process for debugging purposes.
     * Ensures that necessary datapoints are checked before fetching the data.
     * Calls getDataTop to fetch the data and delays the next call based on the configured refresh interval.
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
     * Continuously retrieves and updates the version data from the Pi-hole API at a specified interval.
     * Logs the process for debugging purposes.
     * Calls getDataVersion to fetch the data and delays the next call based on the configured refresh interval.
     */
    async doDataVersion() {
        this.ioUtil.logdebug('doDataVersion');
        await this.getDataVersion();
        await this.ioUtil.delay(this.refreshVersion * 1000);
        this.doDataVersion();
    }

    /**
     * Checks the connection status of the Pi-hole.
     * Updates the 'info.connection' state with the current connection status.
     *
     * @returns {Promise<boolean|undefined>} The current connection status.
     */
    async checkConnection() {
        const connect = this.pihole?.checkConnection();
        await this.ioUtil.setStateAsync('info.connection', connect, null, null);
        return connect;
    }
    /**
     * Collects data from Pi-hole API about the summary.
     * Saves the data to the state Summary.
     * If enabledetailedsummary is true, it also analyzes the data and saves it to the states
     * in the path Data.Summary.
     *
     * @returns {Promise<void>}
     */
    async getDataSummary() {
        this.ioUtil.logdebug('getDataSummary');
        if (this.pihole) {
            if (await this.checkConnection()) {
                const dataSummary = await this.pihole.getSummary();
                await this.ioUtil.setStateAsync('Summary', JSON.stringify(dataSummary.body), null, null);
                if (this.data) {
                    this.data['Summary'] = JSON.stringify(dataSummary.body);
                }
                if (this.adapter.config.enabledetailedsummary) {
                    await this.analyzeSummary(dataSummary.body);
                }
            }
        }
    }
    /**
     * Collects data from Pi-hole API about the system.
     * Saves the data to the state System.
     *
     * @returns {Promise<void>}
     */
    async getDataSystem() {
        this.ioUtil.logdebug('getDataSystem');
        if (this.pihole) {
            if (await this.checkConnection()) {
                const dataSystem = await this.pihole.getSystem();
                await this.ioUtil.setStateAsync('System', JSON.stringify(dataSystem.body), null, null);
                if (this.data) {
                    this.data['System'] = JSON.stringify(dataSystem.body);
                }
            }
        }
    }
    /**
     * Collects and updates the blocking status from the Pi-hole API.
     * Saves the blocking status to the state 'Blocking'.
     * If the blocking is enabled, it sets the state to true, otherwise false.
     * Also updates the local data object with the blocking status.
     *
     * @returns {Promise<void>}
     */
    async getDataBlocking() {
        this.ioUtil.logdebug('getDataBlocking');
        if (this.pihole) {
            if (await this.checkConnection()) {
                const dataBlocking = await this.pihole.getBlocking();
                await this.ioUtil.setStateAsync(
                    'Blocking',
                    dataBlocking.body?.blocking == 'enabled' ? true : false,
                    null,
                    null,
                );
                if (this.data) {
                    this.data['Blocking'] = dataBlocking.body?.blocking == 'enabled' ? true : false;
                }
            }
        }
    }
    /**
     * Collects and updates the version data from the Pi-hole API.
     * Saves the data to the state 'Version'.
     * If enabledetailedversion is true, it also analyzes the data and updates the detailed version datapoints.
     *
     * @returns {Promise<void>}
     */
    async getDataVersion() {
        this.ioUtil.logdebug('getDataVersion');
        if (this.pihole) {
            if (await this.checkConnection()) {
                const dataVersion = await this.pihole.getVersion();
                await this.ioUtil.setStateAsync('Version', JSON.stringify(dataVersion.body), null, null);
                if (this.data) {
                    this.data['Version'] = JSON.stringify(dataVersion.body);
                }
                if (this.adapter.config.enabledetailedversion) {
                    await this.analyzeVersion(dataVersion.body);
                }
            }
        }
    }
    /**
     * Collects data from Pi-hole API about top clients and domains.
     * Saves the data to the states TopClients, TopDomains, TopClientsBlocked and TopDomainsBlocked.
     *
     * @returns {Promise<void>}
     */
    async getDataTop() {
        this.ioUtil.logdebug('getDataTop');
        if (this.pihole) {
            if (await this.checkConnection()) {
                const dataTopClients = await this.pihole.getTopClients(false);
                await this.ioUtil.setStateAsync('TopClients', JSON.stringify(dataTopClients.body), null, null);
                if (this.data) {
                    this.data['TopClients'] = JSON.stringify(dataTopClients.body);
                }

                const dataTopDomains = await this.pihole.getTopDomains(false);
                await this.ioUtil.setStateAsync('TopDomains', JSON.stringify(dataTopDomains.body), null, null);
                if (this.data) {
                    this.data['TopDomains'] = JSON.stringify(dataTopDomains.body);
                }

                const dataTopClientsBlocked = await this.pihole.getTopClients(true);
                await this.ioUtil.setStateAsync(
                    'TopClientsBlocked',
                    JSON.stringify(dataTopClientsBlocked.body),
                    null,
                    null,
                );
                if (this.data) {
                    this.data['TopClientsBlocked'] = JSON.stringify(dataTopClients.body);
                }

                const dataTopDomainsBlocked = await this.pihole.getTopDomains(true);
                await this.ioUtil.setStateAsync(
                    'TopDomainsBlocked',
                    JSON.stringify(dataTopDomainsBlocked.body),
                    null,
                    null,
                );
                if (this.data) {
                    this.data['TopDomainsBlocked'] = JSON.stringify(dataTopDomains.body);
                }
            }
        }
    }
    /**
     * Analyzes and updates the detailed version datapoints with the provided data.
     *
     * @param {object} data - The data object containing version statistics.
     */
    async analyzeVersion(data) {
        this.ioUtil.logdebug('analyzeVersion');
        //await this.ioUtil.getStateAsync(stateTemplate.name, this.detailedDatapointsPath, '');
        await this.ioUtil.setStateAsync(
            'CoreLocal',
            data.version.core.local.version,
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );
        await this.ioUtil.setStateAsync(
            'CoreRemote',
            data.version.core.remote.version,
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );
        await this.ioUtil.setStateAsync(
            'WebLocal',
            data.version.web.local.version,
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );
        await this.ioUtil.setStateAsync(
            'WebRemote',
            data.version.web.remote.version,
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );
        await this.ioUtil.setStateAsync(
            'FTLLocal',
            data.version.ftl.local.version,
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );
        await this.ioUtil.setStateAsync(
            'FTLRemote',
            data.version.ftl.remote.version,
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );
        await this.ioUtil.setStateAsync(
            'DockerLocal',
            data.version.docker.local,
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );
        await this.ioUtil.setStateAsync(
            'DockerRemote',
            data.version.docker.remote,
            this.detailedDatapointsPath,
            this.detailedDatapointsVersionPath,
        );
    }
    /**
     * Analyzes and updates the detailed summary datapoints with the provided data.
     *
     * @param {object} data - The data object containing query and client statistics.
     * @param {object} data.queries - Contains total and blocked query counts.
     * @param {number} data.queries.total - The total number of queries.
     * @param {number} data.queries.blocked - The number of blocked queries.
     * @param {object} data.clients - Contains active and total client counts.
     * @param {number} data.clients.active - The number of active clients.
     * @param {number} data.clients.total - The total number of clients.
     */
    async analyzeSummary(data) {
        this.ioUtil.logdebug('analyzeSummary');
        await this.ioUtil.setStateAsync(
            'QueriesTotal',
            data.queries.total,
            this.detailedDatapointsPath,
            this.detailedDatapointsSummaryPath,
        );
        await this.ioUtil.setStateAsync(
            'QueriesBlocked',
            data.queries.blocked,
            this.detailedDatapointsPath,
            this.detailedDatapointsSummaryPath,
        );
        await this.ioUtil.setStateAsync(
            'ClientsActive',
            data.clients.active,
            this.detailedDatapointsPath,
            this.detailedDatapointsSummaryPath,
        );
        await this.ioUtil.setStateAsync(
            'ClientsTotal',
            data.clients.total,
            this.detailedDatapointsPath,
            this.detailedDatapointsSummaryPath,
        );
    }
}
module.exports = piholeserverclass;
