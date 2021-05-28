#!/usr/bin/env node
'use strict'

const yargs = require('yargs')
const gs = require('../lib/gs310tp')

function help() {
    let p = 'gs310tp'
    console.log(`\
${p} - Controls NetGear GS310TP (and maybe others) over its HTTP API
Usage: ${p} [options] <subcommand> <args...>
Options:
  -u URL : base URL of NetGear Web console
  -p str : password for the console
Example:
  \$ ${p} -u http://gs310 poe status
  \$ ${p} poe on 1
  \$ ${p} poe off 1
  \$ ${p} poe cycle 1
NOTE:
  - Currently, only PoE operation is supported in CLI tool
  - Env \$NETGEAR_URL can be used instead of -u option
  - Env \$NETGEAR_PWD can be used instead of -p option
`)
    process.exit(0)
}

async function handle_poe(ua, cmds) {
    switch (cmds[1]) {
    case 'status':
        let ret = await ua.get('poe_port')
        console.log(ret.data.data)
        break
    case 'on':
        for (let i of cmds.slice(2)) {
            let ret = await ua.poe_config({selEntry: i - 1, state: 1})
            console.log(ret.data)
        }
        break
    case 'off':
        for (let i of cmds.slice(2)) {
            let ret = await ua.poe_config({selEntry: i - 1, state: 0})
            console.log(ret.data)
        }
        break
    case 'cycle':
        for (let i of cmds.slice(2)) {
            let ret = await ua.poe_reset({selEntry: i - 1})
            console.log(ret.data)
        }
        break
    default:
        help()
    }
}

async function main() {
    if (yargs.argv.h || yargs.argv.help) {
        help()
    }

    let url = process.env.NETGEAR_URL || yargs.argv.u
    if (url === undefined) {
        help()
    }

    let pwd = process.env.NETGEAR_PWD || yargs.argv.p
    if (pwd === undefined) {
        help()
    }

    let args = yargs.argv._
    if (args.length == 0) {
        help()
    }

    var ua = new gs.Agent(url);

    ua.login(pwd).then(async ua => {
        switch (args[0]) {
        case 'poe':
            await handle_poe(ua, args)
            break
        case 'test':
            let ret = await ua.get('poe_port')
            console.log(ret.data.data)
            break
        default:
            help()
        }
    })
}

main()




