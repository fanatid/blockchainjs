import _ from 'lodash'

import IBlockchainStorage from './interface'
import errors from '../errors'
import { ZERO_HASH } from '../util/const'

/**
 * @class AbstractBlockchainSyncStorage
 * @extends IBlockchainStorage
 */
export default class AbstractBlockchainSyncStorage extends IBlockchainStorage {
  /*
   * @param {function} StorageCls
   * @param {Object} [opts]
   */
  constructor (StorageCls, opts) {
    super(opts)

    this._storage = new StorageCls(opts)
    this._storage.open()
      .then(() => this._ready(null), (err) => this._ready(err))
  }

  /**
   * @return {string}
   */
  _getInitData () {
    return JSON.stringify({
      lastHash: ZERO_HASH,
      chunkHashes: 0,
      headers: 0
    })
  }

  /**
   * @return {Promise<string>}
   */
  async getLastHash () {
    let data = await this._storage.withLock(() => {
      return this._storage.get('info')
    })

    if (data === null) {
      data = this._getInitData()
    }

    return JSON.parse(data).lastHash
  }

  /**
   * @param {string} lastHash
   * @return {Promise}
   */
  async setLastHash (lastHash) {
    await this._storage.withLock(async () => {
      let data = await this._storage.get('info')
      if (data === null) {
        data = this._getInitData()
      }

      data = _.defaults({lastHash: lastHash}, JSON.parse(data))
      return await this._storage.set('info', JSON.stringify(data))
    })
  }

  /**
   * @return {Promise<number>}
   */
  async getChunkHashesCount () {
    await this._iscompactCheck()

    let data = await this._storage.withLock(() => {
      return this._storage.get('info')
    })

    if (data === null) {
      data = this._getInitData()
    }

    return JSON.parse(data).chunkHashes
  }

  /**
   * @param {number} index
   * @return {Promise<string>}
   */
  async getChunkHash (index) {
    await this._iscompactCheck()

    return this._storage.withLock(async () => {
      let data = await this._storage.get('info')
      if (data === null) {
        data = this._getInitData()
      }

      data = JSON.parse(data)
      if (index < 0 || index >= data.chunkHashes) {
        throw new RangeError(`Chunk hash for index ${index} not exists`)
      }

      return await this._storage.get(`ch-${index}`)
    })
  }

  /**
   * @param {string[]} chunkHashes
   * @return {Promise}
   */
  async putChunkHashes (chunkHashes) {
    await this._iscompactCheck()

    return this._storage.withLock(async () => {
      let data = await this._storage.get('info')
      if (data === null) {
        data = this._getInitData()
      }

      data = JSON.parse(data)
      for (let [index, chunkHash] of chunkHashes.entries()) {
        index += data.chunkHashes
        await this._storage.set(`ch-${index}`, chunkHash)
      }

      data.chunkHashes += chunkHashes.length
      return await this._storage.set('info', JSON.stringify(data))
    })
  }

  /**
   * @param {number} limit
   * @return {Promise}
   */
  async truncateChunkHashes (limit) {
    await this._iscompactCheck()

    return this._storage.withLock(async () => {
      let data = await this._storage.get('info')
      if (data === null) {
        data = this._getInitData()
      }

      data = JSON.parse(data)
      limit = data.chunkHashes = Math.min(data.chunkHashes, limit)
      await this._storage.set('info', JSON.stringify(data))

      for (let key of await this._storage.keys()) {
        if (key.substring(0, 3) !== 'ch-') {
          continue
        }

        let index = parseInt(key.slice(3), 10)
        if (!isNaN(index) && index >= limit) {
          await this._storage.remove(key)
        }
      }
    })
  }

  /**
   * @return {Promise<number>}
   */
  async getHeadersCount () {
    let data = await this._storage.withLock(() => {
      return this._storage.get('info')
    })

    if (data === null) {
      data = this._getInitData()
    }

    return JSON.parse(data).headers
  }

  /**
   * @param {number} index
   * @return {Promise<string>}
   */
  async getHeader (index) {
    let data = await this._storage.withLock(async () => {
      let data = await this._storage.get('info')
      if (data === null) {
        data = this._getInitData()
      }

      data = JSON.parse(data)
      if (index < 0 || index >= data.headers) {
        throw new RangeError(`Header for index ${index} not exists`)
      }

      return await this._storage.get(`hc-${Math.floor(index / 2016)}`)
    })

    let shift = (index % 2016) * 160
    return data.slice(shift, shift + 160)
  }

  /**
   * @param {string[]} headers
   * @return {Promise}
   */
  async putHeaders (headers) {
    await this._storage.withLock(async () => {
      let data = await this._storage.get('info')
      if (data === null) {
        data = this._getInitData()
      }

      data = JSON.parse(data)
      let totalHeaders = data.headers + headers.length

      if (this.compact && totalHeaders > 2015) {
        var msg = 'you can store maximum 2015 headers'
        throw new errors.Storage.CompactMode.Limitation(msg)
      }

      while (data.headers !== totalHeaders) {
        let chunk = Math.floor(data.headers / 2016)
        let shift = data.headers % 2016

        let rawChunk = await this._storage.get(`hc-${chunk}`)
        if (rawChunk === null) {
          rawChunk = ''
        }
        rawChunk = rawChunk.slice(0, shift * 160)

        while (shift < 2016 && data.headers < totalHeaders) {
          rawChunk += headers[data.headers % 2016]
          data.headers += 1
        }

        await this._storage.set(`hc-${chunk}`, rawChunk)
      }

      return await this._storage.set('info', JSON.stringify(data))
    })
  }

  /**
   * @param {number} limit
   * @return {Promise}
   */
  async truncateHeaders (limit) {
    await this._storage.withLock(async () => {
      let data = await this._storage.get('info')
      if (data === null) {
        data = this._getInitData()
      }

      data = JSON.parse(data)
      data.headers = Math.min(data.headers, limit)
      await this._storage.set('info', JSON.stringify(data))

      let chunk = Math.floor(data.headers / 2016)
      let shift = data.headers % 2016

      for (let {key, value: rawChunk} of await this._storage.entries()) {
        if (key.substring(0, 3) !== 'hc-') {
          continue
        }

        let index = parseInt(key.slice(3), 10)
        if (isNaN(index) || index < chunk) {
          continue
        }

        if (index > chunk || shift === 0) {
          await this._storage.remove(key)
        } else {
          rawChunk = rawChunk.slice(0, shift * 160)
          await this._storage.set(key, rawChunk)
        }
      }
    })
  }

  /**
   * @return {Promise}
   */
  async clear () {
    await this._storage.withLock(() => {
      return this._storage.clear()
    })
  }
}
