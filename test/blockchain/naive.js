import { expect } from 'chai'

import blockchainjs from '../../src'

describe('blockchain.Naive', function () {
  this.timeout(90 * 1000)

  let before = (opts) => {
    let url = process.env.CHROMANODE_URL || blockchainjs.network.Chromanode.getSources('testnet')[0]
    opts.network = new blockchainjs.network.Chromanode({url: url})
    opts.blockchain = new blockchainjs.blockchain.Naive(opts.network)

    return new Promise((resolve, reject) => {
      opts.network.once('error', reject)
      opts.blockchain.once('error', reject)
      opts.blockchain.once('syncStop', resolve)
      opts.network.connect()
    })
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

          opts.network = opts.blockchain = null

          resolve()
        }
      })
      opts.network.disconnect()
    })
  }

  let extraTests = (opts) => {
    it('inherits Blockchain', () => {
      expect(opts.blockchain).to.be.instanceof(blockchainjs.blockchain.Naive)
      expect(opts.blockchain).to.be.instanceof(blockchainjs.blockchain.Blockchain)
    })
  }

  require('./implementation')({
    before: before,
    after: after,
    extraTests: extraTests
  })
})
