import { expect } from 'chai'
import { EventEmitter } from 'events'

import blockchainjs from '../../src'

let notImplementedMethods = [
  '_doOpen',
  '_doClose',
  'getCurrentActiveRequests',
  'getTimeFromLastResponse',
  'getHeader',
  'getHeaders',
  'getTx',
  'getTxMerkle',
  'sendTx',
  'addressesQuery',
  'subscribe',
  'unsubscribe'
]

describe('network.Network', () => {
  let network

  beforeEach(() => {
    network = new blockchainjs.network.Network()
  })

  it('inherits events.EventEmitter', () => {
    expect(network).to.be.instanceof(blockchainjs.network.Network)
    expect(network).to.be.instanceof(EventEmitter)
  })

  it('isConnected', () => {
    expect(network.isConnected()).to.be.false
  })

  notImplementedMethods.forEach((method) => {
    it(method, () => {
      var promise = Promise.resolve().then(() => network[method]())
      return expect(promise).to.be.rejectedWith(blockchainjs.errors.NotImplemented)
    })
  })
})
