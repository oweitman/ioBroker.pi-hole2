const { ioUtil } = require('./ioUtil');
const PiholeClient = require('./piholeApiClient');

class piholeserverclass {
    endpoints = ['Summary', 'TopDomains', 'TopClients', 'History', 'Blocking'];
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
            History: {
                name: 'History',
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
        this.data = [];
        this.doDataObserver();
        this.doStatusObserver();
    }
    async checkDatapoints() {
        this.ioUtil.logdebug('checkDatapoints');
        for (const key in this.stateTemplate) {
            const stateTemplate = this.stateTemplate[key];
            if (!stateTemplate?.exist) {
                await this.ioUtil.createObjectAsync(stateTemplate, '', '');
                await this.ioUtil.setStateAsync(stateTemplate.name, stateTemplate.def, '', '');
                if (this.data) {
                    this.data[stateTemplate.name] = stateTemplate.def;
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
        setTimeout(() => this.getData(), 100);
    }
    async doDataObserver() {
        this.ioUtil.logdebug('doDataObserver');
        await this.checkDatapoints();
        await this.getData();
        await this.ioUtil.delay(this.adapter.config.refresh * 1000);
        this.doDataObserver();
    }
    async doStatusObserver() {
        this.ioUtil.logdebug('doStatusObserver');
        await this.getStatus();
        await this.ioUtil.delay(2000);
        this.doStatusObserver();
    }
    async checkConnection() {
        const connect = this.pihole?.checkConnection();
        await this.ioUtil.setStateAsync('info.connection', connect, null, null);
        return connect;
    }
    async getData() {
        if (this.pihole) {
            if (await this.checkConnection()) {
                const dataSummary = await this.pihole.getSummary();
                await this.ioUtil.setStateAsync('Summary', JSON.stringify(dataSummary.body), null, null);
                if (this.data) {
                    this.data['Summary'] = JSON.stringify(dataSummary.body);
                }

                const dataTopClients = await this.pihole.getTopClients();
                await this.ioUtil.setStateAsync('TopClients', JSON.stringify(dataTopClients.body), null, null);
                if (this.data) {
                    this.data['TopClients'] = JSON.stringify(dataTopClients.body);
                }

                const dataTopDomains = await this.pihole.getTopDomains();
                await this.ioUtil.setStateAsync('TopDomains', JSON.stringify(dataTopDomains.body), null, null);
                if (this.data) {
                    this.data['TopDomains'] = JSON.stringify(dataTopDomains.body);
                }

                const dataHistory = await this.pihole.getHistory();
                await this.ioUtil.setStateAsync('History', JSON.stringify(dataHistory.body), null, null);
                if (this.data) {
                    this.data['History'] = JSON.stringify(dataHistory.body);
                }

                const dataVersion = await this.pihole.getVersion();
                await this.ioUtil.setStateAsync('Version', JSON.stringify(dataVersion.body), null, null);
                if (this.data) {
                    this.data['Version'] = JSON.stringify(dataVersion.body);
                }

                this.checkConnection();
            }
        }
    }
    async getStatus() {
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
                this.checkConnection();
            }
        }
    }
}

module.exports = piholeserverclass;
