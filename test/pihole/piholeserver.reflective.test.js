/* eslint-disable no-unused-expressions */
'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const PiholeServer = require('../../lib/piholeserver.js');

function makeAdapter() {
    return {
        namespace: 'pi-hole2.0',
        config: {
            password: 'x',
            address: 'http://pi',
            refreshSummary: 1,
            refreshBlocking: 1,
            refreshSystem: 1,
            refreshTop: 1,
            refreshVersion: 1,
            enabledetailedversion: false,
            enabledetailedsummary: false,
        },
        log: {
            debug: sinon.spy(),
            silly: sinon.spy(),
            info: sinon.spy(),
            warn: sinon.spy(),
            error: sinon.spy(),
        },
        subscribeStates: sinon.spy(),
        sendTo: sinon.spy(),
    };
}

describe('piholeserver reflective smoke test', () => {
    afterEach(() => {
        sinon.restore();
    });

    it('has only callable prototype methods besides constructor', () => {
        const server = new PiholeServer(makeAdapter());
        const proto = Object.getPrototypeOf(server);

        const methodNames = Object.getOwnPropertyNames(proto).filter(name => name !== 'constructor');

        expect(methodNames.length).to.be.greaterThan(0);

        for (const name of methodNames) {
            expect(server[name], name).to.be.a('function');
        }
    });

    it('can call simple non-network methods safely', async () => {
        const server = new PiholeServer(makeAdapter());

        server.ioUtil = /** @type {any} */ ({
            logdebug: sinon.spy(),
            logsilly: sinon.spy(),
            checkNumberRange: sinon.stub().callsFake((v, min, max, def) => {
                const n = Number(v);
                if (!Number.isFinite(n)) return def;
                return Math.max(min, Math.min(max, n));
            }),
            setStateAsync: sinon.stub().resolves(),
        });

        server.checkConfigParameters();
        await server.subscribeDatapoints();
        await server.checkConnection();

        expect(server.refreshSummary).to.equal(1);
    });
});
