import { expect } from 'chai'
import { EventEmitter } from 'events'

import blockchainjs from '../../src'

import { ZERO_HASH } from '../helpers'

let notImplementedMethods = [
  'getHeader',
  'getTxBlockInfo',
  'addressesQuery'
]

describe('blockchain.Blockchain', () => {
  let network
  let blockchain

  beforeEach(() => {
    network = new blockchainjs.network.Network()
    blockchain = new blockchainjs.blockchain.Blockchain(network)
  })

  it('inherits EventEmitter', () => {
    expect(blockchain).to.be.instanceof(blockchainjs.blockchain.Blockchain)
    expect(blockchain).to.be.instanceof(EventEmitter)
  })

  it('latest', () => {
    expect(blockchain.latest).to.deep.equal({hash: ZERO_HASH, height: -1})
  })

  notImplementedMethods.forEach((method) => {
    it(method, () => {
      return expect(blockchain[method]()).to.be.rejectedWith(blockchainjs.errors.NotImplemented)
    })
  })
})
