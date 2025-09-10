/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const sinon = require('sinon');

const { ioUtil } = require('../../lib/ioUtil.js');

describe('ioUtil utility methods', () => {
    it('logsilly covers true + false branch', () => {
        const adapter = {
            log: { silly: sinon.spy(), debug: sinon.spy(), info: sinon.spy(), error: sinon.spy() },
            // Dummy Timer/Delay API, wird hier nicht genutzt:
            setTimeout: () => 0, clearTimeout: () => { }, clearInterval: () => { }, delay: (ms) => Promise.resolve(ms),
            namespace: 'test.ns',
        };
        const util = new ioUtil(adapter);

        // true-Branch (default islogsilly = true)
        util.logsilly('hit-silly');
        expect(adapter.log.silly.calledOnce).to.be.true;

        // false-Branch
        adapter.log.silly.resetHistory();
        util.islogsilly = false;
        util.logsilly('skip-silly');
        expect(adapter.log.silly.called).to.be.false;
    });

    it('logdebug covers true + false branch', () => {
        const adapter = {
            log: { silly: sinon.spy(), debug: sinon.spy(), info: sinon.spy(), error: sinon.spy() },
            setTimeout: () => 0, clearTimeout: () => { }, clearInterval: () => { }, delay: (ms) => Promise.resolve(ms),
            namespace: 'test.ns',
        };
        const util = new ioUtil(adapter);

        // true-Branch (default islogdebug = true)
        util.logdebug('hit-debug');
        expect(adapter.log.debug.calledOnce).to.be.true;

        // false-Branch
        adapter.log.debug.resetHistory();
        util.islogdebug = false;
        util.logdebug('skip-debug');
        expect(adapter.log.debug.called).to.be.false;
    });

    it('loginfo hits the direct log line', () => {
        const adapter = {
            log: { silly: sinon.spy(), debug: sinon.spy(), info: sinon.spy(), error: sinon.spy() },
            setTimeout: () => 0, clearTimeout: () => { }, clearInterval: () => { }, delay: (ms) => Promise.resolve(ms),
            namespace: 'test.ns',
        };
        const util = new ioUtil(adapter);

        util.loginfo('hello-info');
        expect(adapter.log.info.calledOnceWith('hello-info')).to.be.true;
    });

    it('logerror hits the direct log line', () => {
        const adapter = {
            log: { silly: sinon.spy(), debug: sinon.spy(), info: sinon.spy(), error: sinon.spy() },
            setTimeout: () => 0, clearTimeout: () => { }, clearInterval: () => { }, delay: (ms) => Promise.resolve(ms),
            namespace: 'test.ns',
        };
        const util = new ioUtil(adapter);

        util.logerror('hello-error');
        expect(adapter.log.error.calledOnceWith('hello-error')).to.be.true;
    });
});
