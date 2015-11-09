import { randomBytes as getRandomBytes } from 'crypto'
import { expect } from 'chai'
import _ from 'lodash'

import blockchainjs from '../../src'

import { ZERO_HASH } from '../helpers'

/**
 * @param {Object} opts
 * @param {function} [opts.describe]
 * @param {function} opts.clsName
 * @param {Object} [opts.clsOpts]
 * @param {boolean} [opts.skipFullMode=false]
 */
module.exports = (opts) => {
  let StorageCls = blockchainjs.storage[opts.clsName]
  if (StorageCls === undefined) {
    return
  }

  let ndescribe = opts.describe || describe
  if (!StorageCls.isAvailable()) {
    ndescribe = xdescribe
  }

  ndescribe(StorageCls.name, () => {
    let storage

    afterEach(() => {
      return storage.clear()
    })

    describe('compact mode', () => {
      beforeEach(() => {
        let storageOpts = _.defaults({compact: true}, opts.clsOpts)

        storage = new StorageCls(storageOpts)
        return storage.ready
      })

      it('compact mode is true', () => {
        expect(storage.compact).to.be.true
      })

      it('isReady', () => {
        expect(storage.isReady()).to.be.true
      })

      it('setLastHash/getLastHash', async () => {
        let newHash = getRandomBytes(32).toString('hex')

        let lastHash = await storage.getLastHash()
        expect(lastHash).to.equal(ZERO_HASH)

        await storage.setLastHash(newHash)
        lastHash = await storage.getLastHash()
        expect(lastHash).to.equal(newHash)
        await storage.clear()

        lastHash = await storage.getLastHash()
        expect(lastHash).to.equal(ZERO_HASH)
      })

      it('chunkHashes', async () => {
        let hash1 = getRandomBytes(32).toString('hex')

        let chunkHashesCount = await storage.getChunkHashesCount()
        expect(chunkHashesCount).to.equal(0)

        await storage.putChunkHashes([
          getRandomBytes(32).toString('hex'),
          hash1,
          getRandomBytes(32).toString('hex')
        ])
        chunkHashesCount = await storage.getChunkHashesCount()
        expect(chunkHashesCount).to.equal(3)

        await storage.truncateChunkHashes(2)
        chunkHashesCount = await storage.getChunkHashesCount()
        expect(chunkHashesCount).to.equal(2)

        let chunkHash = await storage.getChunkHash(1)
        expect(chunkHash).to.equal(hash1)

        await expect(storage.getChunkHash(-1)).to.be.rejectedWith(RangeError)
        await expect(storage.getChunkHash(2)).to.be.rejectedWith(RangeError)

        await storage.clear()
        chunkHashesCount = await storage.getChunkHashesCount()
        expect(chunkHashesCount).to.equal(0)
      })

      it('headers', async () => {
        let hash1 = getRandomBytes(80).toString('hex')

        let headersCount = await storage.getHeadersCount()
        expect(headersCount).to.equal(0)

        await storage.putHeaders([
          getRandomBytes(80).toString('hex'),
          hash1,
          getRandomBytes(80).toString('hex')
        ])
        headersCount = await storage.getHeadersCount()
        expect(headersCount).to.equal(3)

        await storage.truncateHeaders(2)
        headersCount = await storage.getHeadersCount()
        expect(headersCount).to.equal(2)

        let header = await storage.getHeader(1)
        expect(header).to.equal(hash1)

        let headers = _.range(2014).map(() => {
          return getRandomBytes(80).toString('hex')
        })
        await expect(storage.putHeaders(headers)).to.be.rejectedWith(blockchainjs.errors.Storage.CompactMode.Limitation)

        await expect(storage.getHeader(-1)).to.be.rejectedWith(RangeError)
        await expect(storage.getHeader(2)).to.be.rejectedWith(RangeError)

        await storage.clear()
        headersCount = await storage.getHeadersCount()
        expect(headersCount).to.equal(0)
      })
    })

    let fullModeDescribe = opts.skipFullMode ? xdescribe : describe
    if (!StorageCls.isFullModeSupported()) {
      fullModeDescribe = xdescribe
    }

    fullModeDescribe('full mode', () => {
      beforeEach(async () => {
        let storageOpts = _.defaults({compact: false}, opts.clsOpts)

        storage = new StorageCls(storageOpts)
        await storage.ready
      })

      it('compact mode is false', () => {
        expect(storage.compact).to.be.false
      })

      it('isReady', () => {
        expect(storage.isReady()).to.be.true
      })

      it('setLastHash/getLastHash', async () => {
        let newHash = getRandomBytes(32).toString('hex')

        let lastHash = await storage.getLastHash()
        expect(lastHash).to.equal(ZERO_HASH)

        await storage.setLastHash(newHash)
        lastHash = await storage.getLastHash()
        expect(lastHash).to.equal(newHash)

        await storage.clear()
        lastHash = await storage.getLastHash()
        expect(lastHash).to.equal(ZERO_HASH)
      })

      it('chunkHashes', async () => {
        let chunkMethods = [
          'getChunkHashesCount',
          'getChunkHash',
          'putChunkHashes',
          'truncateChunkHashes'
        ]

        for (let method of chunkMethods) {
          await expect(storage[method]()).to.be.rejectedWith(blockchainjs.errors.Storage.CompactMode.Forbidden)
        }
      })

      it('headers', async () => {
        if (opts.clsName === 'WebSQL') {
          this.timeout(15 * 1000)
        }

        let hash1 = getRandomBytes(80).toString('hex')

        let headersCount = await storage.getHeadersCount()
        expect(headersCount).to.equal(0)

        await storage.putHeaders([
          getRandomBytes(80).toString('hex'),
          hash1,
          getRandomBytes(80).toString('hex')
        ])

        headersCount = await storage.getHeadersCount()
        expect(headersCount).to.equal(3)

        await storage.truncateHeaders(2)
        headersCount = await storage.getHeadersCount()
        expect(headersCount).to.equal(2)

        let header = await storage.getHeader(1)
        expect(header).to.equal(hash1)

        let headers = _.range(2014).map(() => {
          return getRandomBytes(80).toString('hex')
        })
        await storage.putHeaders(headers)

        headersCount = await storage.getHeadersCount()
        expect(headersCount).to.equal(2016)

        await expect(storage.getHeader(-1)).to.be.rejectedWith(RangeError)
        await expect(storage.getHeader(2016)).to.be.rejectedWith(RangeError)

        await storage.clear()
        headersCount = await storage.getHeadersCount()
        expect(headersCount).to.equal(0)
      })
    })
  })
}
