import _ from 'lodash'
import LRU from 'lru-cache'
import makeConcurrent from 'make-concurrent'
import spvUtils from 'bitcoin-spv-utils'
import { getTxMerkle } from 'bitcoin-proof'

import Blockchain from './blockchain'
import { buffer2header, header2buffer } from '../util/header'
import { sha256x2, hashEncode, hashDecode } from '../util/crypto'
import { ZERO_HASH } from '../util/const'
import errors from '../errors'

/**
 * @typedef Verified~ChunkHashesObject
 * @property {string} lastBlockHash
 * @property {string[]} chunkHashes
 */
/**
 * @class Verified
 * @extends Blockchain
 */
export default class Verified extends Blockchain {
  /*
   * @constructor
   * @param {Network} network
   * @param {Object} opts
   * @param {IBlockchainStorage} opts.storage
   * @param {boolean} [opts.compact=false]
   * @param {boolean} [opts.testnet=false]
   * @param {number} [opts.txCacheSize=100]
   * @param {number} [opts.chunkCacheSize=4]
   * @param {?Verified~ChunkHashesObject} [opts.chunkHashes=null]
   */
  constructor (network, opts) {
    super(network, opts)

    opts = _.extend({
      testnet: false,
      compact: false,
      chunkCacheSize: 4,
      chunkHashes: null
    }, opts)

    // check that storage has same compact mode
    this._storage = opts.storage
    if (opts.compact !== this._storage.compact) {
      throw new TypeError('Storage and Blockchain have different compact mode')
    }

    // required in headers verification (testnet has special rule!)
    this._testnet = opts.testnet

    // create chunk cache
    this._chunkCache = LRU({max: opts.chunkCacheSize, allowSlate: true})

    // wait storage.ready, boostrap and start
    this._withSync(async () => {
      await this._storage.ready
      await this._bootstrap(opts.chunkHashes)
      this._networkStart()
    })
    .catch(this.emit.bind(this, 'error'))
  }

  /**
   * @param {?Verified~ChunkHashesObject} chunkHashes
   * @return {Promise}
   */
  async _bootstrap (chunkHashes) {
    if (this._storage.compact) {
      let chunkHashesCount = await this._storage.getChunkHashesCount()
      let headersCount = await this._storage.getHeadersCount()
      if (chunkHashesCount === 0 && headersCount === 0 && chunkHashes !== null) {
        await this._storage.setLastHash(chunkHashes.latest)
        await this._storage.putChunkHashes(chunkHashes.hashes)
      }

      chunkHashesCount = await this._storage.getChunkHashesCount()
      this._latest = {
        hash: await this._storage.getLastHash(),
        height: chunkHashesCount * 2016 + headersCount - 1
      }
    } else {
      let headersCount = await this._storage.getHeadersCount()
      this._latest = {
        hash: await this._storage.getLastHash(),
        height: headersCount - 1
      }
    }

    if (this._latest.height !== -1) {
      this.emit('newBlock', this.latest) // emit with clone of _latest
    }
  }

  /**
   * @private
   * @return {Promise}
   */
  @makeConcurrent({concurrency: 1})
  async _sync () {
    let savedLatestHash = this._latest.hash
    try {
      await this._withSync(async () => {
        let latestNetwork = await this._network.getHeader('latest')
        if (latestNetwork.hash === this._latest.hash) {
          return
        }

        let networkIndex = Math.floor(latestNetwork.height / 2016)
        let invalidateChunkCache = () => {
          let cIndex = Math.floor(this._latest.height / 2016)
          for (let i = Math.min(cIndex, networkIndex), s = Math.max(cIndex, networkIndex); i < s; ++i) {
            this._chunkCache.del(i)
          }
        }

        // reorg precheck (save traffic)
        if (this._latest.height >= latestNetwork.height) {
          await this._reorgHandler()
          invalidateChunkCache()
        }

        // sync with headers
        if (latestNetwork.height - this._latest.height < 50) {
          let headers = await this._getHeadersChain(this._latest.height)
          if (hashDecode(this._latest.hash).toString('hex') !== headers[0].slice(8, 72)) {
            await this._reorgHandler()
            invalidateChunkCache()
            headers = await this._getHeadersChain(this._latest.height)
          }

          await this._verifyHeaders(headers)
          await this._saveHeaders(headers)
          return
        }

        // sync with chunks
        while (Math.floor((this._latest.height + 1) / 2016) <= networkIndex) {
          let currentIndex = Math.floor((this._latest.height + 1) / 2016)
          let fullChunk = await this._getHeadersChunk(currentIndex)

          let headers = _.clone(fullChunk)
          if (this._latest.height % 2016 !== 2015) {
            headers.splice(0, this._latest.height % 2016 + 1)
          }
          if (headers.length === 0) {
            return
          }

          if (hashDecode(this._latest.hash).toString('hex') !== headers[0].slice(8, 72)) {
            await this._reorgHandler()
            invalidateChunkCache()
            continue
          }

          await this._verifyHeaders(headers)
          await this._saveHeaders(headers)
          if (fullChunk.length === 2016) {
            this._chunkCache.set(currentIndex, {promise: Promise.resolve(fullChunk), isRejected: false})
          }

          if (this._latest.hash !== savedLatestHash) {
            savedLatestHash = this._latest.hash
            this.emit('newBlock', this.latest) // emit with clone of _latest
          }
        }
      })
    } catch (err) {
      this.emit('error', err)
    } finally {
      if (this._latest.hash !== savedLatestHash) {
        this.emit('newBlock', this.latest) // emit with clone of _latest
      }
    }
  }

  /**
   * @private
   * @param {number} height
   * @param {number} [to]
   * @return {Promise<string[]>}
   */
  async _getHeadersChain (height, to) {
    let headers = await this._network.getHeaders(height >= 0 ? height : null, to)

    return _.range(0, headers.length, 160).map((offset) => {
      return headers.slice(offset, offset + 160)
    })
  }

  /**
   * @private
   * @param {number} index
   * @return {Promise<string[]>}
   */
  _getHeadersChunk (index) {
    return this._getHeadersChain(index * 2016 - 1, index * 2016 + 2015)
  }

  /**
   * @private
   * @param {string[]} headers
   * @return {Promise}
   */
  async _verifyHeaders (headers) {
    let [previousHeader, target] = [null, spvUtils.getMaxTarget()]

    let height = this._latest.height
    while (headers.length !== 0) {
      let chunkIndex = Math.floor(height / 2016)
      let count = Math.min(2015 - height % 2016, headers.length)
      if (height % 2016 === 2015) {
        chunkIndex += 1
        count = Math.min(2016, headers.length)
      }

      if (height > -1) {
        previousHeader = header2buffer(await this.getHeader(height))
      }

      if (chunkIndex > 0) {
        let [first, last] = await* [
          this.getHeader((chunkIndex - 1) * 2016),
          this.getHeader(chunkIndex * 2016 - 1)
        ]
        target = spvUtils.getTarget(header2buffer(first), header2buffer(last))
      }

      let rawHeaders = headers.slice(0, count).map(header => new Buffer(header, 'hex'))
      if (!spvUtils.verifyHeaders(rawHeaders, previousHeader, target, this._testnet)) {
        throw new errors.Blockchain.VerifyBlockchainError(`height = ${height}`)
      }

      headers = headers.slice(count)
      height += count
    }
  }

  /**
   * @private
   * @param {string[]} headers
   * @return {Promise}
   */
  async _saveHeaders (headers) {
    let latestNew = {
      hash: hashEncode(sha256x2(new Buffer(_.last(headers), 'hex'))),
      height: this._latest.height + headers.length
    }

    // full mode or not more than 2015 headers
    let headersCount = await this._storage.getHeadersCount()
    if (this._storage.compact === false || headersCount + headers.length < 2016) {
      await* [
        this._storage.putHeaders(headers),
        this._storage.setLastHash(latestNew.hash)
      ]
      this._latest = latestNew
      return
    }

    // get saved headers and fill to full chunk
    let fullChunk = await* _.range(headersCount).map((index) => {
      return this._storage.getHeader(index)
    })

    while (fullChunk.length !== 2016) {
      fullChunk.push(headers.shift())
    }

    // put chunk hash, truncate headers and set latest hash
    let chunkHash = sha256x2(new Buffer(fullChunk.join(''), 'hex')).toString('hex')
    let latestHash = hashEncode(sha256x2(new Buffer(_.last(fullChunk), 'hex')))
    await* [
      this._storage.putChunkHashes([chunkHash]),
      this._storage.truncateHeaders(0),
      this._storage.setLastHash(latestHash)
    ]

    this._latest = {
      hash: latestHash,
      height: (await this._storage.getChunkHashesCount()) * 2016 - 1
    }

    if (headers.length > 0) {
      return await this._saveHeaders(headers)
    }
  }

  /**
   * @private
   * @return {Promise}
   */
  async _reorgHandler () {
    // full mode
    if (this._storage.compact === false) {
      while (true) {
        try {
          // check that header by this hash still exists
          await this._network.getHeader(this._latest.hash)
        } catch (err) {
          if (!(err instanceof errors.Network.HeaderNotFound)) {
            throw err
          }

          // calculate new latest
          let previousHeight = this._latest.height - 1
          let previousHeader = await this._storage.getHeader(previousHeight)
          this._latest = {
            hash: hashEncode(sha256x2(new Buffer(previousHeader, 'hex'))),
            height: previousHeight
          }

          // drop latest header and update latest hash
          await* [
            this._storage.truncateHeaders(this._latest.height),
            this._storage.setLastHash(this._latest.hash)
          ]

          continue
        }

        return
      }
    }

    // compact mode
    let latest = this._latest
    let chunkIndex = await this._storage.getChunkHashesCount() - 1
    while (true) {
      if (chunkIndex === -1) {
        latest = {hash: ZERO_HASH, height: -1}
        break
      }

      let headers = await this._getHeadersChunk(chunkIndex)
      let chunkHash = sha256x2(new Buffer(headers.join(''), 'hex'))
      if (chunkHash === await this._storage.getChunkHash(chunkIndex)) {
        latest = {
          hash: hashEncode(sha256x2(new Buffer(_.last(headers), 'hex'))),
          height: chunkIndex * 2016 - 1
        }
        this._chunkCache.set(chunkIndex, {promise: Promise.resolve(headers), isRejected: false})
        break
      }

      chunkIndex -= 1
    }

    this._latest = latest
    await* [
      this._storage.truncateHeaders(0),
      this._storage.truncateChunkHashes(chunkIndex + 1),
      this._storage.setLastHash(this._latest.hash)
    ]
  }

  /**
   * @private
   * @param {number} height
   * @return {Promise<string>}
   */
  async _getHeaderByHeight (height) {
    if (this._storage.compact === false) {
      return await this._storage.getHeader(height)
    }

    var headerChunkIndex = Math.floor(height / 2016)
    var headerIndex = height % 2016

    if (headerChunkIndex === Math.floor((this._latest.height + 1) / 2016)) {
      return await this._storage.getHeader(headerIndex)
    }

    let deferred = this._chunkCache.get(headerChunkIndex)
    if (deferred === undefined || deferred.isRejected === true) {
      deferred = {isRejected: false}
      deferred.promise = new Promise(async (resolve, reject) => {
        try {
          resolve(await this._getHeadersChunk(headerChunkIndex))
        } catch (err) {
          deferred.isRejected = true
          reject(err)
        }
      })
      this._chunkCache.set(headerChunkIndex, deferred)
    }

    let headers = await deferred.promise
    let chunkHash = sha256x2(new Buffer(headers.join(''), 'hex')).toString('hex')
    if (chunkHash !== await this._storage.getChunkHash(headerChunkIndex)) {
      throw new errors.Blockchain.VerifyChunkError(headerChunkIndex, 'wrong hash')
    }

    return headers[headerIndex]
  }

  /**
   * @param {(number|string)} id
   * @return {Promise<Network~HeaderObject>}
   */
  async getHeader (id) {
    if (_.isNumber(id)) {
      if (id > this._latest.height) {
        await this._network.getHeader(id) // Network.HeaderNotFound check
        throw new errors.Blockchain.VerifyHeaderError(id, `hasn't been imported yet`)
      }

      let headerHex = await this._getHeaderByHeight(id)
      let rawHeader = new Buffer(headerHex, 'hex')
      return _.extend(buffer2header(rawHeader), {
        height: id,
        hash: hashEncode(sha256x2(rawHeader))
      })
    }

    let header = await this._network.getHeader(id)
    let header2 = await this.getHeader(header.height)
    if (header.hash !== header2.hash) {
      throw new errors.Blockchain.VerifyHeaderError(id, `hashes don't match`)
    }

    return header2
  }

  /**
   * @param {string} txId
   * @return {Promise<?{hash: string, height: number}>}
   */
  async getTxBlockInfo (txId) {
    let info = await this._network.getTxMerkle(txId)
    if (info === null) {
      return null
    }

    let header = await this.getHeader(info.hash)
    if (header.hashMerkleRoot !== getTxMerkle(txId, {txIndex: info.index, sibling: info.merkle})) {
      throw new errors.Blockchain.VerifyTxError(txId, 'merkleroot not matched')
    }

    return {hash: info.hash, height: info.height}
  }

  /**
   * @param {string[]} addresses
   * @param {Object} [opts]
   * @param {(string|number)} [opts.from]
   * @param {(string|number)} [opts.to]
   * @param {boolean} [opts.unspent=false]
   * @return {Promise<Network~AddressesQueryObject>}
   */
  async addressesQuery (addresses, opts) {
    let result = await this._network.addressesQuery(addresses, opts)
    await* result.data.map(async (obj) => {
      if (obj.height !== null) {
        let txBlockInfo = await this.getTxBlockInfo(obj.txId)
        if (txBlockInfo === null || txBlockInfo.height !== obj.height) {
          let msg = `from addressesQuery with addresses: ${addresses}, opts: ${JSON.stringify(opts)}`
          throw new errors.Blockchain.VerifyTxError(obj.txId, msg)
        }
      }
    })

    return result
  }
}
