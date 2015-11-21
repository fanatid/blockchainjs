require('chai').use(require('chai-as-promised'))

if (global.__env__) {
  process.env.CHROMANODE_URL = global.__env__.CHROMANODE_URL
}

process.on('unhandledRejection', (reason) => {
  console.log(reason && reason.stack || reason)
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
