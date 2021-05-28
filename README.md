# gs310tp - Netgear GS310TP Controller

This is a set of library and CLI tool to control Netgear GS310TP
10-port PoE L2 smart switch. It should support other S350-series
switches and possibly others.

Being a "smart switch" (industry term of describing a switch with
limited management features), this switch only supports
management over an WebUI. This package is an attempt to automate
by directly accessing the underlying "get/set.cgi" APIs.

Currently, CLI tool targets PoE operation only while the backing
library should support access to all other management features as well.

## CLI Tool Usage

```
$ gs310tp -h
gs310tp - Controls NetGear GS310TP (and maybe others) over its HTTP API
Usage: gs310tp [options] <subcommand> <args...>
Options:
  -u URL : base URL of NetGear Web console
  -p str : password for the console
Example:
  $ gs310tp -u http://gs310 poe status
  $ gs310tp poe on 1
  $ gs310tp poe off 1
  $ gs310tp poe cycle 1
NOTE:
  - Currently, only PoE operation is supported in CLI tool
  - Env $NETGEAR_URL can be used instead of -u option
  - Env $NETGEAR_PWD can be used instead of -p option

# Set defaults in envvars
$ export NETGEAR_URL=http://192.168.0.249
$ export NETGEAR_PWD=hogehoge

# Check PoE port status
$ gs310tp poe status
{
  powerUnit: 'mW',
  adminPower_min: 3000,
  adminPower_max: 30000,
  ports: [
...

# Disable PoE for given ports
$ gs310tp poe off 1 2 3

# Enable PoE for given ports
$ gs310tp poe on 1 2 3

# Power cycle PoE for given ports
$ gs310tp poe cycle 1 2 3
```

## Library Usage

```
const gs = require('gs310tp')

async function main() {
  let ua = new gs.Agent('http://192.168.0.249')
  await ua.login('hogehoge')
  let ret = await ua.get('poe_port')
  console.log(ret.data.data)
}

main()
```

## TODO

- Add non-PoE subcommands to the CLI tool
- Convert the project to TypeScript


