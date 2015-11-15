let blockchainjs = {}

// version
blockchainjs.version = require('../package.json').version

// library errors
blockchainjs.errors = require('./errors')

// network
blockchainjs.network = {}
blockchainjs.network.Network = require('./network/network')
blockchainjs.network.Chromanode = require('./network/chromanode')

// storage
blockchainjs.storage = require('./storage')

// chunk hashes
blockchainjs.chunkHashes = {}
// blockchainjs.chunkHashes.livenet = require('./chunkhashes/livenet')
// blockchainjs.chunkHashes.testnet = require('./chunkhashes/testnet')

// blockchain
blockchainjs.blockchain = {}
// blockchainjs.blockchain.Blockchain = require('./blockchain/blockchain')
// blockchainjs.blockchain.Naive = require('./blockchain/naive')
// blockchainjs.blockchain.Verified = require('./blockchain/verified')
// blockchainjs.blockchain.Snapshot = require('./blockchain/snapshot')

export default blockchainjs
