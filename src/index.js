let blockchainjs = {}

// version
blockchainjs.version = require('../package.json').version

// library errors
blockchainjs.errors = require('./errors')

// blockchain
blockchainjs.blockchain = {}
// blockchainjs.blockchain.Blockchain = require('./blockchain/blockchain')
// blockchainjs.blockchain.Naive = require('./blockchain/naive')
// blockchainjs.blockchain.Verified = require('./blockchain/verified')
// blockchainjs.blockchain.Snapshot = require('./blockchain/snapshot')

// connector
blockchainjs.connector = {}
blockchainjs.connector.Connector = require('./connector/connector')
// blockchainjs.connector.Chromanode = require('./connector/chromanode')

// storage
blockchainjs.storage = require('./storage')

// chunk hashes
blockchainjs.chunkHashes = {}
// blockchainjs.chunkHashes.livenet = require('./chunkhashes/livenet')
// blockchainjs.chunkHashes.testnet = require('./chunkhashes/testnet')

export default blockchainjs
