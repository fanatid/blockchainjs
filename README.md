# blockchainjs

[![NPM Package](https://img.shields.io/npm/v/blockchainjs.svg?style=flat-square)](https://www.npmjs.org/package/blockchainjs)
[![Build Status](https://img.shields.io/travis/chromaway/blockchainjs.svg?branch=master&style=flat-square)](https://travis-ci.org/chromaway/blockchainjs)
[![Coverage Status](https://img.shields.io/coveralls/chromaway/blockchainjs.svg?style=flat-square)](https://coveralls.io/r/chromaway/blockchainjs)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/feross/standard)
[![Dependency status](https://img.shields.io/david/chromaway/blockchainjs.svg?style=flat-square)](https://david-dm.org/chromaway/blockchainjs#info=dependencies)

Bitcoin Blockchain on JavaScript.

## Examples

### Show new transactions for address
```js
import blockchainjs from 'blockchainjs'

let address = '...'

let network = new blockchainjs.network.Chromanode({
  url: blockchainjs.network.Chromanode.getSources('testnet')
})

network.on('connect', () => console.log('connected'))
network.on('newTx', (payload) => {
  console.log(`${payload.address}: ${payload.txId}`)
})

network.subscribe('newTx', {address: address})
network.connect()
```

### Blockchain syncing progress
```js
import blockchainjs from 'blockchainjs'

let network = new blockchainjs.network.Chromanode({
  url: blockchainjs.network.Chromanode.getSources('testnet')
})
let blockchain = new blockchain.blockchain.Verified(network, {
  storage: new blockchainjs.storage.Memory(),
  testnet: true
})

network.on('connect', () => console.log('connected'))
blockchain.on('newBlock', (payload) => {
  console.log(`New height ${payload.height} (${payload.hash})`)
})

network.connect()
```

## License

This software is licensed under the MIT License.
