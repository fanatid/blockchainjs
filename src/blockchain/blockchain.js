import _ from 'lodash'
import { EventEmitter } from 'events'
import LRU from 'lru-cache'
import { mixin } from 'core-decorators'
import SyncMixin from 'sync-mixin'

import errors from '../errors'
import { ZERO_HASH } from '../util/const'

/**
 * @event Blockchain#error
 * @param {Error} error
 */

/**
 * @event Blockchain#syncStart
 */

/**
 * @event Blockchain#syncStop
 */

/**
 * @event Blockchain#newBlock
 * @param {{hash: string, height: number}} payload
 */

/**
 * @event Blockchain#newTx
 * @param {{txId: string, address: string}} payload
 */

/**
 * @class Blockchain
 * @extends events.EventEmitter
 * @mixes SyncMixin
 */
@mixin(SyncMixin)
export default class Blockchain extends EventEmitter {
  /*
   * @constructor
   * @param {Network} network
   * @param {Object} [opts]
   * @param {number} [opts.txCacheSize=100]
   */
  constructor (network, opts) {
    super()

    opts = _.extend({
      txCacheSize: 100
    }, opts)

    this._network = network

    this._latest = {hash: ZERO_HASH, height: -1}
    this._txCache = LRU({max: opts.txCacheSize, allowSlate: true})
  }

  /**
   * @return {Network}
   */
  get network () {
    return this._network
  }

  /**
   * @return {{hash: string, height: number}}
   */
  get latest () {
    return _.clone(this._latest)
  }

  /**
   * @private
   */
  _networkStart () {
    this._network.subscribe({event: 'newBlock'})

    this._network.on('connect', ::this._sync)
    this._network.on('newBlock', ::this._sync)
    this._network.on('newTx', this.emit.bind(this, 'newTx'))

    if (this._network.isConnected()) {
      this._sync()
    }
  }

  /**
   * @abtract
   * @private
   * @return {Promise}
   */
  async _sync () {
    throw new errors.NotImplemented(`${this.constructor.name}._sync`)
  }

  /**
   * @abstract
   * @param {(number|string)} id
   * @return {Promise<Network~HeaderObject>}
   */
  async getHeader () {
    throw new errors.NotImplemented(`${this.constructor.name}.getHeader`)
  }

  /**
   * @param {string} txId
   * @return {Promise<string>}
   */
  getTx (txId) {
    let deferred = this._txCache.get(txId)
    if (deferred === undefined || deferred.isRejected === true) {
      deferred = {isRejected: false}
      deferred.promise = new Promise(async (resolve, reject) => {
        try {
          resolve(await this._network.getTx(txId))
        } catch (err) {
          deferred.isRejected = true
          reject(err)
        }
      })
      this._txCache.set(txId, deferred)
    }

    return deferred.promise
  }

  /**
   * @abstract
   * @param {string} txId
   * @return {Promise<?{hash: string, height: number}>}
   */
  async getTxBlockInfo () {
    throw new errors.NotImplemented(`${this.constructor.name}.getTxBlockInfo`)
  }

  /**
   * @abstract
   * @param {string} rawTx
   * @return {Promise}
   */
  sendTx (rawTx) {
    return this._network.sendTx(rawTx)
  }

  /**
   * @abstract
   * @param {string[]} addresses
   * @param {Object} [opts]
   * @param {(string|number)} [opts.from]
   * @param {(string|number)} [opts.to]
   * @param {boolean} [opts.unspent=false]
   * @return {Promise<Network~AddressesQueryObject>}
   */
  async addressesQuery () {
    throw new errors.NotImplemented(`${this.constructor.name}.addressesQuery`)
  }

  /**
   * @abstract
   * @param {Object} opts
   * @param {string} opts.address
   * @return {Promise}
   */
  subscribe (opts) {
    return this._network.subscribe({event: 'newTx', address: _.get(opts, 'address')})
  }
}
