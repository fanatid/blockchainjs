import _ from 'lodash'
import { expect } from 'chai'
import { randomBytes as getRandomBytes } from 'crypto'
import ProgressBar from 'progress'

import blockchainjs from '../../src'

describe('blockchain.Verified', function () {
  this.timeout(90 * 1000)

  let progressStream = process.stderr
  if (typeof window !== 'undefined') {
    progressStream = {
      isTTY: true,
      columns: 100,
      clearLine: () => {},
      cursorTo: () => {},
      write: ::console.log
    }
  }

  /**
   * @param {function} StorageCls
   * @param {Object} storageOpts
   * @param {Object} blockchainOpts
   * @param {Object} opts
   * @return {function}
   */
  function getBefore (StorageCls, storageOpts, blockchainOpts, fnOpts) {
    return (opts) => {
      opts.storage = new StorageCls(storageOpts)

      let url = process.env.CHROMANODE_URL || blockchainjs.network.Chromanode.getSources('testnet')[0]
      let network = opts.network = new blockchainjs.network.Chromanode({url: url})

      blockchainOpts = _.extend({
        storage: opts.storage,
        testnet: true
      }, blockchainOpts)
      let blockchain = opts.blockchain = new blockchainjs.blockchain.Verified(network, blockchainOpts)

      let getHeader = Object.getPrototypeOf(network).getHeader
      let getHeaders = Object.getPrototypeOf(network).getHeaders
      let addressesQuery = Object.getPrototypeOf(network).addressesQuery

      network.getHeader = async (id) => {
        if (id !== 'latest') {
          return getHeader.call(network, id)
        }

        if (fnOpts.fullChain) {
          let latest = await getHeader.call(network, 'latest')
          return await getHeader.call(network, latest.height - 10)
        }

        return await getHeader.call(network, 30235)
      }

      network.getHeaders = async (from, to) => {
        if (!_.isString(to)) {
          let latest = await network.getHeader('latest')
          to = to === undefined ? latest.height : Math.min(to, latest.height)
        }

        return await await getHeaders.call(network, from, to)
      }

      network.addressesQuery = async function () {
        let [result, latest] = await* [
          addressesQuery.apply(network, arguments),
          network.getHeader('latest')
        ]
        result.latest = {hash: latest.hash, height: latest.height}
        return result
      }

      let cancelled = false
      blockchain.on('newBlock', async (payload) => {
        if (payload.height < 10000 || cancelled) {
          return
        }

        if (fnOpts.fullChain) {
          network.getHeader = getHeader.bind(network)
        } else {
          network.getHeader = (id) => {
            if (id !== 'latest') {
              return getHeader.call(network, id)
            }

            return getHeader.call(network, 30245)
          }
        }

        let latest = await network.getHeader('latest')
        network.emit('newBlock', {hash: latest.hash, height: latest.height})

        console.log('\nReturn original getHeader in network')
        cancelled = true
      })

      return new Promise((resolve, reject) => {
        network.once('error', reject)
        blockchain.once('error', reject)
        network.once('connect', async () => {
          try {
            let latest = await network.getHeader('latest')

            let bar = new ProgressBar(
              'Syncing: :percent (:current/:total), :elapseds elapsed, eta :etas',
              {total: latest.height, stream: progressStream})

            network.on('newBlock', payload => bar.total = payload.height)

            blockchain.on('newBlock', payload => bar.tick(payload.height - bar.curr))
            if (blockchain.latest.height !== -1) {
              bar.tick(blockchain.latest.height)
            }

            blockchain.on('syncStop', async () => {
              let latest = await network.getHeader('latest')
              if (blockchain.latest.hash === latest.hash) {
                resolve()
              }
            })
          } catch (err) {
            reject(err)
          }
        })
        network.connect()
      })
    }
  }

  let after = (opts) => {
    return new Promise((resolve, reject) => {
      opts.network.once('error', (err) => {
        if (!(err instanceof blockchainjs.errors.SubscribeError)) {
          reject(err)
        }
      })
      opts.network.on('newReadyState', (newState) => {
        if (newState === opts.network.READY_STATE.CLOSED) {
          opts.network.removeAllListeners()
          opts.blockchain.removeAllListeners()

          opts.storage = opts.network = opts.blockchain = null

          resolve()
        }
      })
      opts.network.disconnect()
    })
  }

  let extraTests = (opts) => {
    it('inherits Blockchain', () => {
      expect(opts.blockchain).to.be.instanceof(blockchainjs.blockchain.Verified)
      expect(opts.blockchain).to.be.instanceof(blockchainjs.blockchain.Blockchain)
    })
  }

  describe('full mode, short blockchain, memory storage', () => {
    let before = getBefore(
      blockchainjs.storage.Memory,
      {compact: false},
      {compact: false},
      {fullChain: false})

    require('./implementation')({
      before: before,
      after: after,
      extraTests: extraTests
    })
  })

  describe('compact mode, short blockchain, memory storage', () => {
    let before = getBefore(
      blockchainjs.storage.Memory,
      {compact: true},
      {compact: true},
      {fullChain: false})

    require('./implementation')({
      before: before,
      after: after,
      extraTests: extraTests
    })
  })

  // TODO: compact mode with pre-saved wrong hashes

  let runWithStorage = (clsName) => {
    var StorageCls = blockchainjs.storage[clsName]
    if (StorageCls === undefined) {
      return
    }

    var ldescribe = StorageCls.isAvailable() ? describe : xdescribe
    ldescribe(`compact mode, pre-saved chunk hashes, ${clsName} storage`, () => {
      let before = getBefore(
        StorageCls,
        {
          compact: true,
          filename: ':memory:',
          prefix: getRandomBytes(10).toString('hex'),
          dbName: getRandomBytes(10).toString('hex')
        },
        {
          compact: true,
          chunkHashes: blockchainjs.chunkHashes.testnet
        },
        {fullChain: true})

      require('./implementation')({
        before: before,
        after: after,
        extraTests: extraTests
      })
    })
  }

  runWithStorage('Memory')
  runWithStorage('SQLite')
  runWithStorage('WebSQL')
  runWithStorage('LocalStorage')
  runWithStorage('IndexedDB')
})
