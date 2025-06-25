const { ioUtil } = require('./ioUtil');
const PiholeClient = require('./piholeApiClient');

class piholeserverclass {
    constructor(adapter) {
        this.adapter = adapter;
        this.ioUtil = new ioUtil(adapter);
    }
    async init() {
        //await this.checkDatapoints();
        this.pihole = new PiholeClient({
            password: this.adapter.config.password,
            baseUrl: this.adapter.config.address,
            path: '/api',
            rejectUnauthorized: true,
            log: this.adapter.log,
        });
        await this.pihole.setupSession();

        this.stateTemplate = {
            Summary: {
                name: 'Summary',
                read: true,
                write: false,
                type: 'string',
                role: 'value',
                def: '{}',
            },
            TopDomains: {
                name: 'TopDomains',
                read: true,
                write: false,
                type: 'string',
                role: 'value',
                def: '{}',
            },
            TopClients: {
                name: 'TopClients',
                read: true,
                write: false,
                type: 'string',
                role: 'value',
                def: '{}',
            },
            TopDomainsBlocked: {
                name: 'TopDomainsBlocked',
                read: true,
                write: false,
                type: 'string',
                role: 'value',
                def: '{}',
            },
            TopClientsBlocked: {
                name: 'TopClientsBlocked',
                read: true,
                write: false,
                type: 'string',
                role: 'value',
                def: '{}',
            },
            History: {
                name: 'History',
                read: true,
                write: false,
                type: 'string',
                role: 'value',
                def: '{}',
            },
            System: {
                name: 'System',
                read: true,
                write: false,
                type: 'string',
                role: 'value',
                def: '{}',
            },
            Version: {
                name: 'Version',
                read: true,
                write: false,
                type: 'string',
                role: 'value',
                def: '{}',
            },
            Blocking: {
                name: 'Blocking',
                read: true,
                write: true,
                type: 'boolean',
                role: 'value',
                def: false,
            },
            BlockingTime: {
                name: 'BlockingTime',
                read: true,
                write: true,
                type: 'number',
                role: 'value.interval',
                def: 60 * 5, // 5 Minutes
            },
        };
        this.stateTemplateDetailedVersion = {
            CoreLocal: {
                name: 'CoreLocal',
                read: true,
                write: false,
                type: 'string',
                role: 'value',
                def: '',
            },
            CoreRemote: {
                name: 'CoreRemote',
                read: true,
                write: false,
                type: 'string',
                role: 'value',
                def: '',
            },
            WebLocal: {
                name: 'WebLocal',
                read: true,
                write: false,
                type: 'string',
                role: 'value',
                def: '',
            },
            WebRemote: {
                name: 'WebRemote',
                read: true,
                write: false,
                type: 'string',
                role: 'value',
                def: '',
            },
            FTLLocal: {
                name: 'FTLLocal',
                read: true,
                write: false,
                type: 'string',
                role: 'value',
                def: '',
            },
            FTLRemote: {
                name: 'FTLRemote',
                read: true,
                write: false,
                type: 'string',
                role: 'value',
                def: '',
            },
            DockerLocal: {
                name: 'DockerLocal',
                read: true,
                write: false,
                type: 'string',
                role: 'value',
                def: '',
            },
            DockerRemote: {
                name: 'DockerRemote',
                read: true,
                write: false,
                type: 'string',
                role: 'value',
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
        this.data = [];
        await this.checkDatapoints();
        await this.checkDatapointsDetailedSummary();
        await this.checkDatapointsDetailedVersion();
        this.doDataSummary();
        this.doDataBlocking();
        this.doDataSystem();
        this.doDataTop();
        this.doDataVersion();
    }
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
    async checkDatapointsDetailedVersion() {
        this.ioUtil.logdebug('checkDatapointsDetaile');
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
    }
    async checkDatapointsDetailedSummary() {
        this.ioUtil.logdebug('checkDatapointsDetailedSummary');
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
    }
    async subscribeDatapoints() {
        this.ioUtil.logdebug('subscribeDatapoints');
        this.adapter.subscribeStates('Blocking');
        this.adapter.subscribeStates('BlockingTime');
    }
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
    processMessages(msg) {
        this.ioUtil.logdebug(`processMessages ${JSON.stringify(msg)}`);
        if (msg.command === 'piholeapi') {
            this.ioUtil.logdebug('send piholeapi');
            this.piHoleApi(msg);
        }
    }
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
    async doToggleBlocking() {
        this.ioUtil.logdebug('doToggleBlocking');
        const dataBlocking = await this.pihole?.getBlocking();
        let blockingTime = 0;
        if (this.data && this.data['BlockingTime']) {
            blockingTime = this.data['BlockingTime'];
        }
        this.pihole &&
            (await this.pihole.setBlocking(dataBlocking.body?.blocking == 'enabled' ? false : true, blockingTime));
        setTimeout(() => this.getDataBlocking(), 100);
    }
    async doDataSummary() {
        this.ioUtil.logdebug('doDataSummary');
        await this.getDataSummary();
        await this.ioUtil.delay(this.adapter.config.refreshSummary * 1000);
        this.doDataSummary();
    }
    async doDataBlocking() {
        this.ioUtil.logdebug('doDataBlocking');
        await this.getDataBlocking();
        await this.ioUtil.delay(this.adapter.config.refreshBlocking * 1000);
        this.doDataBlocking();
    }
    async doDataSystem() {
        this.ioUtil.logdebug('doDataSystem');
        await this.getDataSystem();
        await this.ioUtil.delay(this.adapter.config.refreshSystem * 1000);
        this.doDataSystem();
    }
    async doDataTop() {
        this.ioUtil.logdebug('doDataTop');
        await this.checkDatapoints();
        await this.checkDatapointsDetailedSummary();
        await this.checkDatapointsDetailedVersion();

        await this.getDataTop();
        await this.ioUtil.delay(this.adapter.config.refreshTop * 1000);
        this.doDataTop();
    }
    async doDataVersion() {
        this.ioUtil.logdebug('doDataVersion');
        await this.getDataVersion();
        await this.ioUtil.delay(this.adapter.config.refreshVersion * 1000);
        this.doDataVersion();
    }
    async checkConnection() {
        const connect = this.pihole?.checkConnection();
        await this.ioUtil.setStateAsync('info.connection', connect, null, null);
        return connect;
    }
    async getDataSummary() {
        this.ioUtil.logdebug('getDataSummary');
        if (this.pihole) {
            if (await this.checkConnection()) {
                const dataSummary = await this.pihole.getSummary();
                await this.ioUtil.setStateAsync('Summary', JSON.stringify(dataSummary.body), null, null);
                if (this.data) {
                    this.data['Summary'] = JSON.stringify(dataSummary.body);
                }
                await this.analyzeSummary(dataSummary.body);
            }
        }
    }
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
    async getDataVersion() {
        this.ioUtil.logdebug('getDataVersion');
        if (this.pihole) {
            if (await this.checkConnection()) {
                const dataVersion = await this.pihole.getVersion();
                await this.ioUtil.setStateAsync('Version', JSON.stringify(dataVersion.body), null, null);
                if (this.data) {
                    this.data['Version'] = JSON.stringify(dataVersion.body);
                }
                await this.analyzeVersion(dataVersion.body);
            }
        }
    }
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
