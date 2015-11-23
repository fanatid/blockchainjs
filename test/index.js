require('chai').use(require('chai-as-promised'))

if (global.__env__) {
  process.env.CHROMANODE_URL = global.__env__.CHROMANODE_URL
}

let errors = require('../src').errors
process.on('unhandledRejection', (err) => {
  let msg = (err && err.stack || err).toString()

  if (err instanceof errors.Network.Chromanode.Fail ||
      err instanceof errors.Network.SubscribeError) {
    console.error(msg.split('\n')[0])
    return
  }

  console.log(msg)
})

describe('blockchainjs', () => {
  // network
  require('./network/network')
  require('./network/chromanode')

  // storage
  require('./storage/interface')
  require('./storage/indexeddb')
  require('./storage/localstorage')
  require('./storage/memory')
  require('./storage/sqlite')
  require('./storage/websql')

  // blockchain
  require('./blockchain/blockchain')
  require('./blockchain/naive')
  require('./blockchain/verified')
})
