import _ from 'lodash'
import { mixin } from 'core-decorators'
import ReadyMixin from 'ready-mixin'

import errors from '../errors'

/**
 * Storage interface for verified blockchain
 *
 * You can save all hashes, but that needed store a large size
 *  on 20 February 2015 mainnet have more that 344k blocks
 *  thats mean you need store minimum 80 * 344000 / 1024 / 1024 = 26.24 MB
 *    or 52.48 MB if you store data in hex
 *  but in localStorage you have only 2.5 MB
 *
 * We offer store maximum 2015 blocks hashes and sha256x2 hash for every chunk
 *  it's required nearly 105.31 KB for 344k blocks
 *  if you need block hash you can:
 *   - get from storage if it belongs to last not complete unhashed chunk
 *   - get chunk from network, calculate hash and compare with saved in storage,
 *       use block hashes from chunk and save it in memory if you needed this
 *  besides you can use pre-saved chunk hashes,
 *   it's saved traffic and accelerate blockchain initialization
 *   pre-saved data has next structure: {latest: string, hashes: string[]}
 *
 * All methods return Promise,
 *  this is done for asynchronous storages such as: SQLite, WebSQL
 */

/*
 * @class IBlockchainStorage
 * @mixes ReadyMixin
 */
@mixin(ReadyMixin)
export default class IBlockchainStorage {
  /*
   * @param {function} StorageCls
   * @param {Object} [opts]
   * @param {boolean} [opts.compact=false]
   */
  constructor (opts) {
    opts = _.extend({compact: false}, opts)

    this.compact = opts.compact
  }

  /**
   * @return {boolean}
   */
  static isAvailable () { return false }

  /**
   * @return {boolean}
   */
  static isFullModeSupported () { return true }

  /**
   * @private
   * @return {Promise}
   */
  async _iscompactCheck () {
    if (!this.compact) {
      throw new errors.Storage.CompactMode.Forbidden()
    }
  }

  /**
   * Return last header hash as hex string
   *
   * @abstract
   * @return {Promise<string>}
   */
  async getLastHash () {
    throw new errors.NotImplemented(`${this.constructor.name}.getLastHash`)
  }

  /**
   * Set last header hash (hex string needed)
   *
   * @abstract
   * @param {string} lastHash
   * @return {Promise}
   */
  async setLastHash () {
    throw new errors.NotImplemented(`${this.constructor.name}.setLastHash`)
  }

  /**
   * Return total available chunk hashes
   *
   * @abstract
   * @return {Promise<number>}
   */
  async getChunkHashesCount () {
    throw new errors.NotImplemented(`${this.constructor.name}.getChunkHashesCount`)
  }

  /**
   * Get chunk hash for given `index`
   *
   * @abstract
   * @param {number[]} indices
   * @return {Promise<string>}
   */
  async getChunkHash () {
    throw new errors.NotImplemented(`${this.constructor.name}.getChunkHashes`)
  }

  /**
   * Put chunk hashes to storage
   *
   * @abstract
   * @param {string[]} chunkHashes
   * @return {Promise}
   */
  async putChunkHashes () {
    throw new errors.NotImplemented(`${this.constructor.name}.putChunkHashes`)
  }

  /**
   * Truncate number of saved chunk hashes
   *
   * @abstract
   * @param {number} limit
   * @return {Promise}
   */
  async truncateChunkHashes () {
    throw new errors.NotImplemented(`${this.constructor.name}.truncateChunkHashes`)
  }

  /**
   * Return total available headers
   *
   * @abstract
   * @return {Promise<number>}
   */
  async getHeadersCount () {
    throw new errors.NotImplemented(`${this.constructor.name}.getHeadersCount`)
  }

  /**
   * Return hex header for given `index`
   *
   * @abstract
   * @param {number} index
   * @return {Promise<string>}
   */
  async getHeader () {
    throw new errors.NotImplemented(`${this.constructor.name}.getHeader`)
  }

  /**
   * Put hex headers to storage
   *
   * @abstract
   * @param {string[]} headers
   * @return {Promise}
   */
  async putHeaders () {
    throw new errors.NotImplemented(`${this.constructor.name}.putHeaders`)
  }

  /**
   * Truncate number of saved headers
   *
   * @abstract
   * @param {number} limit
   * @return {Promise}
   */
  async truncateHeaders () {
    throw new errors.NotImplemented(`${this.constructor.name}.truncateHeaders`)
  }

  /**
   * Remove all data
   *
   * @abstract
   * @return {Promise}
   */
  async clear () {
    throw new errors.NotImplemented(`${this.constructor.name}.clear`)
  }
}
