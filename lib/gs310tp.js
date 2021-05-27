const axios = require('axios')
const md5 = require('md5')
const NodeRSA = require('node-rsa')

const delay = ms => new Promise(ok => setTimeout(ok, ms))

const et = () => new Date().getTime()

/**
 * Add "bj4=" hash parameter to the given URL
 *
 * @param {url} input URL
 */
const bj4 = url => {
    let n = url.indexOf("?")
    let hash = md5(url.substring(n + 1))
    return `${url}&bj4=${hash}`
}

/**
 * Encode string for submission to the Netgear login API.
 *
 * @param {string} input password
 */
const encode = input => {
    var text = "";
    var len = input.length;
    var lenn = input.length;

    for (var i=1; i <= (320-len); i++ ) {
        if (0 == i % 7 && len > 0)
          text += input.charAt(--len);
        else if (i == 123)
        {
          if (lenn < 10)
            text += "0";
          else
            text += Math.floor(lenn/10);
        }
        else if (i == 289)
          text += lenn%10;
        else
          text += "X";
    }
    return text;
}

const encrypt = (tabid, expo, modulus) => {
    let rsa = new NodeRSA()
    rsa.importKey({
        n: Buffer.from(modulus, 'hex'),
        e: parseInt(expo, 16)
    }, 'components-public')

    return rsa.encrypt(Buffer.from(tabid), 'base64')
}

/**
 * Returns POST body for Netgear API from key-value table
 */
const ds = kv => {
    let arg = "_ds=1"
    for (const [k,v] of Object.entries(kv)) {
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
     * var ua = new Agent('http://netgear-switch-hostname-or-ip')
     */
    constructor(baseurl) {
        this.baseurl = baseurl
        this.ax = axios.create()
    }

    /**
     * Usage: ua.get('poe_port')
     */
    get = async (cmd) => {
        let url = bj4(`${this.baseurl}/cgi/get.cgi?cmd=${cmd}&dummy=${et()}`)
        return this.ax.get(url)
    }

    /**
     * Usage: ua.set('poe_port', ...)
     */
    set = async (cmd, data) => {
        let url = bj4(`${this.baseurl}/cgi/set.cgi?cmd=${cmd}&dummy=${et()}`)
        return this.ax.post(url, data)
    }

    /**
     * Usage: ua.login(password)
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
     * Usage: ua.poe_config({state: 1, selEntry: 0})
     */
    poe_config = async (cfg) => {
        let defcfg = {
            state: 0, priority: 0, powerMode: 3, powerLimitMode: 2, adminPower: 30000,
            detectMode: 0, sched: '%3F', selEntry: 0, xsrf: 'undefined'
        }
        return this.set('poe_port', ds({ ...defcfg, ...cfg }))
    }

    /**
     * Usage: ua.poe_reset({selEntry: 0})
     */
    poe_reset = async (cfg) => {
        let defcfg = {
            state: 1, priority: 0, powerMode: 3, powerLimitMode: 2, adminPower: 30000,
            detectMode: 0, sched: '%3F', selEntry: 0, xsrf: 'undefined'
        }
        return this.set('poe_portReset', ds({ ...defcfg, ...cfg }))
    }
}

exports.hello = () => {
    console.log('hello');
}

exports.Agent = Agent
