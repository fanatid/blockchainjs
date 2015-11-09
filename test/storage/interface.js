import { expect } from 'chai'

import blockchainjs from '../../src'

let NOT_IMPLEMENTED_METHODS = [
  'getLastHash',
  'setLastHash',
  'getChunkHashesCount',
  'getChunkHash',
  'putChunkHashes',
  'truncateChunkHashes',
  'getHeadersCount',
  'getHeader',
  'putHeaders',
  'truncateHeaders',
  'clear'
]

describe('storage.Interface', () => {
  describe('compact', () => {
    it('compact is false by default', () => {
      let storage = new blockchainjs.storage.Interface()
      expect(storage.compact).to.be.false
      return expect(storage._iscompactCheck()).to.be.rejectedWith(blockchainjs.errors.Storage.CompactMode.Forbidden)
    })

    it('compact is true', () => {
      let storage = new blockchainjs.storage.Interface({compact: true})
      expect(storage.compact).to.be.true
      return expect(storage._iscompactCheck()).to.be.fulfilled
    })
  })

  NOT_IMPLEMENTED_METHODS.forEach((method) => {
    let storage = new blockchainjs.storage.Interface()
    let fn = ::storage[method]

    it(method, () => {
      return expect(fn()).to.be.rejectedWith(blockchainjs.errors.NotImplemented)
    })
  })
})
