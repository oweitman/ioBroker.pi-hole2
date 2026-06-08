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
            enabledetailedversion: true,
            enabledetailedsummary: true,
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

describe('piholeserver module', () => {
    afterEach(() => {
        sinon.restore();
    });

    it('exports a class', () => {
        expect(PiholeServer).to.be.a('function');
        expect(/^class\s/.test(Function.prototype.toString.call(PiholeServer))).to.equal(true);
    });

    it('constructs with adapter and creates ioUtil', () => {
        const adapter = makeAdapter();
        const server = new PiholeServer(adapter);

        expect(server).to.be.an('object');
        expect(server.adapter).to.equal(adapter);
        expect(server.ioUtil).to.be.an('object');
    });

    it('exposes expected public methods', () => {
        const server = new PiholeServer(makeAdapter());

        [
            'init',
            'checkConfigParameters',
            'checkDatapoints',
            'checkDatapointsDetailedVersion',
            'checkDatapointsDetailedSummary',
            'subscribeDatapoints',
            'stateChange',
            'processMessages',
            'piHoleApi',
            'doToggleBlocking',
            'doDataSummary',
            'doDataBlocking',
            'doDataSystem',
            'doDataTop',
            'doDataVersion',
            'checkConnection',
            'getDataSummary',
            'getDataSystem',
            'getDataBlocking',
            'getDataVersion',
            'getDataTop',
            'analyzeVersion',
            'analyzeSummary',
        ].forEach(method => {
            expect(server[method], method).to.be.a('function');
        });
    });
});
