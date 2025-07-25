'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const piholeclassNew = require(`${__dirname}/lib/piholeserver.js`);
let piholeserver;

class PiHole2 extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options] Adapter options
     */
    constructor(options) {
        super({
            ...options,
            name: 'pi-hole2',
        });
        this.pihole = null;
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        // this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here
        if (!piholeserver) {
            this.log.debug('main onReady open pihole');
            piholeserver = new piholeclassNew(this);
            await piholeserver.init();
        }

        // Reset the connection indicator during startup
        this.setState('info.connection', false, true);

        // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
        this.subscribeStates('*');
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param {() => void} callback callback to adapter
     */
    // onUnload(callback) {
    //     try {
    //         // Here you must clear all timeouts or intervals that may still be active
    //         // clearTimeout(timeout1);
    //         // clearTimeout(timeout2);
    //         // ...
    //         // clearInterval(interval1);

    //         callback();
    //     } catch /* (e) */ {
    //         callback();
    //     }
    // }

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  * @param {string} id
    //  * @param {ioBroker.Object | null | undefined} obj
    //  */
    // onObjectChange(id, obj) {
    //     if (obj) {
    //         // The object was changed
    //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    //     } else {
    //         // The object was deleted
    //         this.log.info(`object ${id} deleted`);
    //     }
    // }

    /**
     * Is called if a subscribed state changes
     *
     * @param {string} id id
     * @param {ioBroker.State | null | undefined} state state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            if (piholeserver) {
                piholeserver.stateChange(id, state);
            }
        }
    }

    /**
     * Is called when a message is received from another adapter.
     *
     * @param obj - Message object
     */
    onMessage(obj) {
        if (typeof obj === 'object' && obj.message) {
            piholeserver.processMessages(obj);
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = options => new PiHole2(options);
} else {
    // otherwise start the instance directly
    new PiHole2();
}
