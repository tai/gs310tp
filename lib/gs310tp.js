'use strict'

const axios = require('axios')
const md5 = require('md5')
const rsa = require('node-bignumber')

/**
 * Inserts async delay
 */
const delay = ms => new Promise(ok => setTimeout(ok, ms))

/**
 * Returns UNIX epoch time in milliseconds
 */
const et = () => new Date().getTime()

/**
 * Adds "bj4=" hash parameter to the given URL
 *
 * @param {url} input URL
 */
const bj4 = url => {
    let n = url.indexOf("?")
    let hash = md5(url.substring(n + 1))
    return `${url}&bj4=${hash}`
}

/**
 * Encodes string for submission to the Netgear login API.
 *
 * GS310TP expects password to be given in 320byte semi-scrambled
 * format, and this function generates it from a plain password.
 * Note that it is not secure at all.
 *
 * @param {string} input password
 */
const encode = input => {
    let nch = input.length
    let rev = Buffer.from(input).reverse()
    let buf = Buffer.alloc(320).fill('X')

    // For every 7 chars, place password in reverse order.
    for (let i = 0; i < nch; i++) {
        buf[6 + 7 * i] = rev[i]
    }

    // Put length information at index 122
    buf[122] = '0'.charCodeAt(0) + Math.floor(nch / 10)

    // Put length information at index 288
    buf[288] = '0'.charCodeAt(0) + nch % 10

    return buf.toString()
}

/**
 * Returns an encrypted key for use in X-CSRF-XSID: header.
 *
 * Internally, this uses node-bignumber to encrypt data in a way
 * that is compatible with rsa.js embedded in GS310TP.
 *
 * @param {string} tabid unencrypted key to be encrypted
 * @param {hexstring} expo 'e' in RSA public key
 * @param {hexstring} modulus 'n' in RSA public key
 */
const encrypt = (tabid, expo, modulus) => {
    let pub = new rsa.Key();
    pub.setPublic(modulus, expo);

    let enc = pub.encrypt(tabid)
    return Buffer.from(enc, 'hex').toString('base64')
}

/**
 * Generates POST body string for Netgear API from key-value table.
 *
 * @param {dict} kv URL query parameter in key-value table
 */
const ds = kv => {
    let arg = "_ds=1"
    for (const [k,v] of Object.entries(kv)) {
        // NOTE: Should I support array value here?
        arg += `&${k}=${v}`
    }
    arg += "&_de=1"

    return `{"${arg}":{}}`
}

/**
 * NetGear API access agent
 */
class Agent {
    /**
     * Creates a new instance of NetGear WebAPI agent.
     *
     * @param {string} baseurl Base URL (up to hostname) of target web console.
     *
     * Example:
     *   var ua = new Agent('http://192.168.0.1')
     */
    constructor(baseurl) {
        this.baseurl = baseurl
        this.ax = axios.create()
    }

    /**
     * Fetches data through the get.cgi API.
     *
     * This is a basic function to support all other high-level functions.
     * Can be used to control the device which this library does not (yet) provide
     * high-level function.
     *
     * @param {string} cmd API command name (as cmd=... URL parameter)
     *
     * Example:
     *   // Fetch status of PoE ports
     *   let ret = await ua.get('poe_port')
     */
    get = async (cmd) => {
        let url = bj4(`${this.baseurl}/cgi/get.cgi?cmd=${cmd}&dummy=${et()}`)
        return this.ax.get(url)
    }

    /**
     * Submit data through the set.cgi API.
     *
     * This is a basic function to support all other high-level functions.
     * Can be used to control the device which this library does not (yet) provide
     * high-level function.
     *
     * @param {string} cmd API command name (as cmd=... URL parameter)
     * @param {string} data POST body string passed to the API
     *
     * Example:
     *   // Set PoE port configuration (or use ua.poe_config() API)
     *   ua.set('poe_port', ...)
     */
    set = async (cmd, data) => {
        let url = bj4(`${this.baseurl}/cgi/set.cgi?cmd=${cmd}&dummy=${et()}`)
        return this.ax.post(url, data)
    }

    /**
     * Sets up authenticated session to NetGear Web Console.
     * This operation is exclusive and seem to cause other existing session to be logged out.
     *
     * Example:
     *   // Setup authenticated session with given password
     *   ua.login(password)
     */
    login = async password => {
        let pwd = encode(password)

        return this.set('home_loginAuth', ds({ pwd: pwd })).then(ret => {
            if (ret.data && ret.data.status == 'ok' && ret.data.msgType == 'save_success') {
                return ret
            }
            throw Error('ERROR: loginAuth API error')

        }).then(async ret => {
            for (let retry = 0; retry < 5; retry++) {
                let ret = await this.get('home_loginStatus')
                if (ret.data && ret.data.data.status == 'ok' && ret.data.data.sess) {
                    let dec = Buffer.from(ret.data.data.sess, 'base64').toString()
                    let key = {
                        tabid: dec.substring(0, 32),
                        expo: dec.substring(32, 37),
                        modulus: dec.substring(37, dec.length - 1)
                    }
                    return encrypt(key.tabid, key.expo, key.modulus)
                }
                await delay(1000)
            }
            throw Error('ERROR: loginStatus API error')

        }).then(key => {
            this.ax.defaults.headers.common["X-CSRF-XSID"] = key
	    return this
        })
    }

    /**
     * Reconfigure PoE port state (on/off state, power limit, ...).
     *
     * @param {dict} cfg Key-value table data to be encoded and sent in POST body
     *
     * Example:
     *   // Enable PoE on port 1
     *   ua.poe_config({state: 1, selEntry: 0})
     *
     *   // Disable PoE on port 2
     *   ua.poe_config({state: 0, selEntry: 1})
     */
    poe_config = async (cfg) => {
        let defcfg = {
            state: 0, priority: 0, powerMode: 3, powerLimitMode: 2, adminPower: 30000,
            detectMode: 0, sched: '%3F', selEntry: 0, xsrf: 'undefined'
        }
        return this.set('poe_port', ds({ ...defcfg, ...cfg }))
    }

    /**
     * Power cycles given PoE port.
     *
     * Currently, it will also overwrite other port configuration (like max power limit)
     * with defaults defined in this function.
     *
     * @param {dict} cfg Key-value table data to be encoded and sent in POST body
     *
     * Example:
     *   // Power cycle PoE port 1
     *   ua.poe_reset({selEntry: 0})
     */
    poe_reset = async (cfg) => {
        let defcfg = {
            state: 1, priority: 0, powerMode: 3, powerLimitMode: 2, adminPower: 30000,
            detectMode: 0, sched: '%3F', selEntry: 0, xsrf: 'undefined'
        }
        return this.set('poe_portReset', ds({ ...defcfg, ...cfg }))
    }
}

exports.Agent = Agent
