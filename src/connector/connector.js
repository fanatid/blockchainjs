import _ from 'lodash'
import { setImmediate } from 'timers'
import { EventEmitter } from 'events'

import errors from '../errors'

/**
 * @typedef {Object} Connector~HeaderObject
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
 * @typedef {Object} Connector~TxMerkleObject
 * @property {string} source `blocks` or `mempool`
 * @property {Object} [block] defined only for confirmed transactions
 * @property {string} [block.hash]
 * @property {number} [block.height]
 * @property {?string[]} [block.merkle]
 * @property {?number} [block.index]
 */

/**
 * @typedef {Object} Connector~TxSpentObject
 * @property {boolean} spent
 * @property {string} [txId]
 * @property {number} [height]
 */

/**
 * @typedef Connector~AddressesQueryObject
 * @param {{txId: string, height: ?number}[]} transactions
 * @param {{hash: string, height: number}} latest
 */

/**
 * @event Connector#connect
 */

/**
 * @event Connector#disconnect
 */

/**
 * @event Connector#switchSource
 * @param {string} newSource
 * @param {string} oldSource
 */

/**
 * @event Connector#error
 * @param {Error} error
 */

/**
 * @event Connector#newReadyState
 * @param {number} readyState
 * @param {number} prevReadyState
 */

/**
 * Abstract class for communication with remote service
 *
 * @class Connector
 * @extends EventEmitter
 */
export default class Connector extends EventEmitter {
  /*
   * @param {Object} [opts]
   * @param {string} [opts.network=livenet]
   * @param {number} [opts.concurrency=Infinity]
   */
  constructor (opts) {
    super()

    opts = _.extend({network: 'livenet', concurrency: Infinity}, opts)

    this.network = opts.network
    this.concurrency = opts.concurrency

    this._nextReadyState = null
    this._readyState = this.READY_STATE.CLOSED
  }

  /**
   * Connected to remote service
   *
   * @abstract
   * @private
   */
  _doOpen () {
    throw new errors.NotImplemented('Connector._doOpen')
  }

  /**
   * Disconnected from remote service
   *
   * @abstract
   * @private
   */
  _doClose () {
    throw new errors.NotImplemented('Connector._doClose')
  }

  /**
   * Set readyState and emit `newReadyState` if state changed
   *
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

    if (newReadyState === this.READY_STATE.OPEN) {
      if (this._nextReadyState === this.READY_STATE.CLOSED) {
        setImmediate(::this._doClose)
      }

      this._nextReadyState = null
    }

    if (newReadyState === this.READY_STATE.CLOSED) {
      if (this._nextReadyState === this.READY_STATE.OPEN) {
        setImmediate(::this._doOpen)
      }

      this._nextReadyState = null
    }

    let prevReadyState = this._readyState
    this._readyState = newReadyState

    this.emit('newReadyState', newReadyState, prevReadyState)
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
   * Return `true` if network connected to a remote service
   *
   * @return {boolean}
   */
  isConnected () {
    return this._readyState === this.READY_STATE.OPEN
  }

  /**
   * Return number of current active requests
   *
   * @abstract
   * @return {number}
   */
  getCurrentActiveRequests () {
    throw new errors.NotImplemented(`${this.constructor.name}.getCurrentActiveRequests`)
  }

  /**
   * Return elapsed time from last response in milliseconds
   *
   * @abstract
   * @return {number}
   */
  getTimeFromLastResponse () {
    throw new errors.NotImplemented(`${this.constructor.name}.getTimeFromLastResponse`)
  }

  /**
   * Return Connector~HeaderObject
   *
   * @abstract
   * @param {(number|string)} id
   * @return {Promise<Connector~HeaderObject>}
   */
  async getHeader () {
    throw new errors.NotImplemented(`${this.constructor.name}.getHeader`)
  }

  /**
   * Return height of first header and concatenated headers in raw format.
   * Half-open interval for [from-to)
   *
   * @abstract
   * @param {(string|number)} from
   * @param {Object} [opts]
   * @param {(string|number)} [opts.to]
   * @param {number} [opts.count]
   * @return {Promise<{from: number, headers: string}>}
   */
  async headersQuery () {
    throw new errors.NotImplemented(`${this.constructor.name}.headersQuery`)
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
   * @return {Promise<Connector~TxMerkleObject>}
   */
  async getTxMerkle () {
    throw new errors.NotImplemented(`${this.constructor.name}.getTxMerkle`)
  }

  /**
   * @abstract
   * @param {string} txId
   * @param {number} outIndex
   * @return {Promise<Connector~TxSpentObject>}
   */
  async isOutputSpent () {
    throw new errors.NotImplemented(`${this.constructor.name}.isOutputSpent`)
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
   * Return affected txIds for given addresses
   * Half-close interval for (from-to]
   *
   * @abstract
   * @param {string[]} addresses
   * @param {Object} [opts]
   * @param {string} [opts.source] `blocks` or `mempool`
   * @param {(string|number)} [opts.from] `hash` or `height`
   * @param {(string|number)} [opts.to] `hash` or `height`
   * @param {string} [opts.status]
   * @return {Promise<Connector~AddressesQueryObject>}
   */
  async addressesQuery () {
    throw new errors.NotImplemented(`${this.constructor.name}.addressesQuery`)
  }

  /**
   * Subscribe on `type` events from remote service
   *
   * @abstract
   * @param {Object} opts
   * @param {string} opts.event
   * @param {string} [opts.address]
   * @param {string} [opts.txId]
   * @return {Promise}
   */
  async subscribe () {
    throw new errors.NotImplemented(`${this.constructor.name}.subscribe`)
  }

  /**
   * Unsubscribe on `type` events from remote service
   *
   * @abstract
   * @param {Object} opts
   * @param {string} opts.event
   * @param {string} [opts.address]
   * @param {string} [opts.txId]
   * @return {Promise}
   */
  async unsubscribe () {
    throw new errors.NotImplemented(`${this.constructor.name}.unsubscribe`)
  }
}

/**
 * READY_STATE property
 */
Object.defineProperty(Connector.prototype, 'READY_STATE', {
  configurable: false,
  enumerable: true,
  writable: false,
  value: Object.freeze({
    CONNECTING: 'connecting',
    OPEN: 'open',
    CLOSING: 'closing',
    CLOSED: 'closed'
  })
})
