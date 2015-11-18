import _ from 'lodash'
import { setImmediate } from 'timers'
import { EventEmitter } from 'events'

import errors from '../errors'

/**
 * @typedef {Object} Network~HeaderObject
 * @param {string} hash
 * @param {number} height
 * @param {number} version
 * @param {string} hashPrevBlock
 * @param {string} hashMerkleRoot
 * @param {number} time
 * @param {number} bits
 * @param {number} nonce
 */

/**
 * @typedef {Object} Network~TxMerkleObject
 * @property {string} hash
 * @property {number} height
 * @property {string[]} merkle
 * @property {number} index
 */

/**
 * @typedef {Object} Network~AQTransactionObject
 * @property {string} txId
 * @property {?number} height
 */

/**
 * @typedef {Object} Network~AQUnspentObject
 * @property {string} txId
 * @property {number} outIndex
 * @property {number} value
 * @property {string} script
 * @property {?number} height
 */

/**
 * @typedef Network~AddressesQueryObject
 * @param {(Network~AQTransactionObject|Network~AQUnspentObject)[]} data
 * @param {{hash: string, height: number}} latest
 */

/**
 * @event Network#error
 * @param {Error} error
 */

/**
 * @event Network#newReadyState
 * @param {number} readyState
 * @param {number} prevReadyState
 */

/**
 * @event Network#connect
 */

/**
 * @event Network#disconnect
 */

/**
 * @event Network#newBlock
 * @param {{hash: string, height: number}} payload
 */

/**
 * @event Network#newTx
 * @param {{txId: string, address: string}} payload
 */

/**
 * @class Network
 * @extends EventEmitter
 */
export default class Network extends EventEmitter {
  /*
   * @param {Object} [opts]
   * @param {number} [opts.concurrency=Infinity]
   */
  constructor (opts) {
    super()

    opts = _.extend({concurrency: Infinity}, opts)

    this.concurrency = opts.concurrency

    this._nextReadyState = null
    this._readyState = this.READY_STATE.CLOSED
  }

  /**
   * @param {string} networkName
   * @return {string[]}
   */
  static getSources (networkName) {
    throw new errors.NotImplemented(`Network.getSources`)
  }

  /**
   * @return {Object}
   */
  get READY_STATE () {
    return {
      CONNECTING: 'connecting',
      OPEN: 'open',
      CLOSING: 'closing',
      CLOSED: 'closed'
    }
  }

  /**
   * @abstract
   * @private
   */
  _doOpen () {
    throw new errors.NotImplemented(`${this.constructor.name}._doOpen`)
  }

  /**
   * @abstract
   * @private
   */
  _doClose () {
    throw new errors.NotImplemented(`${this.constructor.name}._doClose`)
  }

  /**
   * @private
   * @param {number} newReadyState
   */
  _setReadyState (newReadyState) {
    if (this._readyState === newReadyState) {
      return
    }

    if (newReadyState === this.READY_STATE.OPEN) {
      setImmediate(::this.emit, 'connect')
    }

    if (this._readyState === this.READY_STATE.OPEN &&
        (newReadyState === this.READY_STATE.CLOSING ||
         newReadyState === this.READY_STATE.CLOSED)) {
      setImmediate(::this.emit, 'disconnect')
    }

    if (newReadyState === this.READY_STATE.OPEN ||
        newReadyState === this.READY_STATE.CLOSED) {
      if (this._nextReadyState === this.READY_STATE.OPEN) {
        setImmediate(::this._doOpen)
      }

      if (this._nextReadyState === this.READY_STATE.CLOSED) {
        setImmediate(::this._doClose)
      }

      this._nextReadyState = null
    }

    setImmediate(::this.emit, 'newReadyState', newReadyState, this._readyState)
    this._readyState = newReadyState
  }

  /**
   * Connect to remote service
   */
  connect () {
    if (this._readyState === this.READY_STATE.CLOSING) {
      this._nextReadyState = this.READY_STATE.OPEN
      return
    }

    this._nextReadyState = null
    if (this._readyState === this.READY_STATE.CLOSED) {
      this._doOpen()
    }
  }

  /**
   * Disconnect from remote service
   */
  disconnect () {
    if (this._readyState === this.READY_STATE.CONNECTING) {
      this._nextReadyState = this.READY_STATE.CLOSED
      return
    }

    this._nextReadyState = null
    if (this._readyState === this.READY_STATE.OPEN) {
      this._doClose()
    }
  }

  /**
   * @return {boolean}
   */
  isConnected () {
    return this._readyState === this.READY_STATE.OPEN
  }

  /**
   * @abstract
   * @return {number}
   */
  getCurrentActiveRequests () {
    throw new errors.NotImplemented(`${this.constructor.name}.getCurrentActiveRequests`)
  }

  /**
   * @abstract
   * @return {number}
   */
  getTimeFromLastResponse () {
    throw new errors.NotImplemented(`${this.constructor.name}.getTimeFromLastResponse`)
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
   * Return concatenated raw headers
   *   right after `from`, up to `to` or 2016 blocks, whichever comes first.
   *
   * @abstract
   * @param {?(string|number)} from null allow get 0 header
   * @param {(string|number)} [to]
   * @return {Promise<string>}
   */
  async getHeaders () {
    throw new errors.NotImplemented(`${this.constructor.name}.getHeaders`)
  }

  /**
   * @abstract
   * @param {string} txId
   * @return {Promise<string>}
   */
  async getTx () {
    throw new errors.NotImplemented(`${this.constructor.name}.getTx`)
  }

  /**
   * @abstract
   * @param {string} txId
   * @return {Promise<?Network~TxMerkleObject>}
   */
  async getTxMerkle () {
    throw new errors.NotImplemented(`${this.constructor.name}.getTxMerkle`)
  }

  /**
   * @abstract
   * @param {string} rawTx
   * @return {Promise}
   */
  async sendTx () {
    throw new errors.NotImplemented(`${this.constructor.name}.sendTx`)
  }

  /**
   * Return affected txIds and other fields for given addresses
   *   in half-close interval for (from-to]
   *
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
   * @param {string} opts.event newBlock or newTx
   * @param {string} [opts.address]
   * @return {Promise}
   */
  async subscribe () {
    throw new errors.NotImplemented(`${this.constructor.name}.subscribe`)
  }
}
