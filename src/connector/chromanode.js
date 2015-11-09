import _ from 'lodash'
import { setImmediate } from 'timers'
import { parse as URLParse } from 'url'

import makeConcurrent from 'make-concurrent'
import URLJoin from 'url-join'
import io from 'socket.io-client'
import ws from 'ws'
import request from 'request'

import Connector from './connector'
import errors from '../errors'
import { hashEncode, sha256x2 } from '../util/crypto'
import { buffer2header } from '../util/header'

/**
 * [Chromanode API]{@link http://github.com/chromaway/chromanode}
 *
 * @class Chromanode
 * @extends Connector
 */
export default class Chromanode extends Connector {
  /*
   * @param {Object} [opts]
   * @param {string} [opts.network=livenet]
   * @param {number} [opts.concurrency=0]
   * @param {string} [opts.url] Alias for {urls: [url]}
   * @param {string[]} [opts.urls] By default SOURCES for network
   * @param {number} [opts.requestTimeout=10000]
   * @param {string} [opts.transports]
   */
  constructor (opts) {
    super(opts)

    if (this.concurrency !== Infinity) {
      this._request = makeConcurrent(::this._request, {concurrency: this.concurrency})
    }

    opts = _.extend({
      urls: Chromanode.getSources(this.network),
      requestTimeout: 10000,
      transports: ws !== null ? ['websocket', 'polling'] : ['polling']
    }, opts)
    if (opts.url !== undefined) {
      opts.urls = [opts.url]
    }

    this._requestURLs = opts.urls
    this._requestURLIndex = 0
    this._requestTimeout = opts.requestTimeout
    this._requestId = 0
    this._requests = {}
    this._requestsSubscribe = {}
    this._lastResponse = Date.now()
    this._transports = opts.transports

    // re-subscribe on newBlock and touchAddress
    this.on('connect', () => {
      for (let data of _.values(this._requestsSubscribe)) {
        this.subscribe(...data.opts)
      }
    })
  }

  static SOURCES = Object.freeze({
    'livenet': [
      'http://v1.livenet.bitcoin.chromanode.net'
    ],
    'testnet': [
      'http://v1.testnet.bitcoin.chromanode.net'
    ]
  })

  /**
   * @param {string} network
   * @return {string[]}
   */
  static getSources (network) {
    return Chromanode.SOURCES[network] || []
  }

  /**
   */
  _switchSource () {
    let oldURL = this._requestURLs[this._requestURLIndex]

    this._requestURLIndex += 1
    if (this._requestURLIndex >= this._requestURLs.length) {
      this._requestURLIndex = 0
    }

    this.emit('switchSource', this._requestURLs[this._requestURLIndex], oldURL)
  }

  /**
   * @private
   */
  _planningReconnect () {
    if (this._socket) {
      this._socket.removeAllListeners()
      delete this._socket
    }

    this._switchSource()
    setTimeout(::this.connect, 10 * 1000)
  }

  /**
   * @private
   */
  _doOpen () {
    // set stata CONNECTING
    this._setReadyState(this.READY_STATE.CONNECTING)

    // create socket
    let urldata = URLParse(this._requestURLs[this._requestURLIndex])
    let ioURL = (urldata.protocol === 'http:' ? 'ws://' : 'wss://') + urldata.host
    this._socket = io(ioURL, {
      autoConnect: false,
      forceNew: true,
      reconnectionDelay: 10000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0,
      forceJSONP: false,
      jsonp: false,
      timeout: this.__requestTimeout,
      transports: this.transports
    })

    this._socket.on('connect', () => {
      this._setReadyState(this.READY_STATE.OPEN)
    })

    this._socket.on('connect_error', () => {
      this._planningReconnect()
      this._setReadyState(this.READY_STATE.CLOSED)
      this.emit('error', new errors.Connector.ConnectionError('Chromanode'))
    })

    this._socket.on('connect_timeout', () => {
      this._planningReconnect()
      this._setReadyState(this.READY_STATE.CLOSED)
      this.emit('error', new errors.Connector.ConnectionTimeout('Chromanode'))
    })

    this._socket.on('disconnect', (reason) => {
      // ignore disconnect event with `forced close` as a reason
      if (reason === 'forced close') {
        return
      }

      if (reason === 'io client disconnect') {
        this._planningReconnect()
      } else if (this._socket) {
        this._socket.removeAllListeners()
        delete this._socket
      }

      this._setReadyState(this.READY_STATE.CLOSED)
    })

    // open socket
    this._socket.open()
  }

  /**
   * @private
   */
  _doClose () {
    // set state CLOSING
    this._setReadyState(this.READY_STATE.CLOSING)

    // close socket, remove listeners and delete on disconnect event...
    this._socket.close()

    // reject data requests
    let err = new errors.Connector.Unreachable('Chromanode')
    for (let deferred of _.values(this._requests)) {
      deferred.reject(err)
    }

    this._requests = {}
  }

  /**
   * @private
   * @param {string} path
   * @param {string} method
   * @param {Object} [data]
   * @return {Promise<string>}
   */
  async _request (path, method, data) {
    let requestOpts = {
      method: 'GET',
      uri: URLJoin(this._requestURLs[this._requestURLIndex], path),
      timeout: this._requestTimeout,
      json: true,
      zip: true
    }

    if (method === 'GET') {
      requestOpts.uri += '?' + _.map(data, (val, key) => {
        return [key, val].map(encodeURIComponent).join('=')
      }).join('&')
    } else if (method === 'POST') {
      requestOpts.method = 'POST'
      requestOpts.json = data
    }

    return await new Promise((resolve, reject) => {
      let requestId = this._requestId++
      this._requests[requestId] = {resolve: resolve, reject: reject}

      try {
        let body = await new Promise((resolve, reject) => {
          request(requestOpts, (err, response, body) => {
            if (err) {
              return reject(err)
            }

            if (response.statusCode >= 500) {
              return this.disconnect()
            }

            if (response.statusCode !== 200) {
              let err = new errors.Connector.RequestError('Chromanode', response.statusCode, requestOpts.uri)
              return reject(err)
            }

            resolve(body)
          })
        })

        this._lastResponse = new Date()

        switch (body.status) {
          case 'success':
            return body.data
          case 'fail':
            let err = new errors.Connector.Chromanode.Fail(body.data.type, requestOpts.uri)
            err.data = body.data
            throw err
          case 'error':
            throw new errors.Connector.Chromanode.Error(body.message, requestOpts.uri)
          default:
            let msg = 'Unknow status -- ' + body.status
            throw new errors.Connector.Chromanode.Error(msg, requestOpts.uri)
        }
      } catch (err) {
        if (err instanceof errors.Connector.RequestError ||
            err.code === 'ETIMEDOUT' ||
            err.code === 'ESOCKETTIMEDOUT') {
          timers.setImmediate(() => {
            this.disconnect()
            this._switchSource()
            setTimeout(::this.connect, 10 * 1000)
          })
        }

        reject(err)
      }

      delete this._requests[requestId]
    })
  }

  /**
   * @private
   */
  _get (path, data) {
    return this._request(path, 'GET', data)
  }

  /**
   * @private
   */
  _post (path, data) {
    return this._request(path, 'POST', data)
  }

  /**
   * @return {number}
   */
  getCurrentActiveRequests () {
    return _.keys(this._requests).length
  }

  /**
   * @return {number}
   */
  getTimeFromLastResponse () {
    return Date.now() - this._lastResponse
  }

  /**
   * @param {(number|string)} id
   * @return {Promise<Connector~HeaderObject>}
   */
  async getHeader (id) {
    try {
      let height
      let headerHex

      if (id === 'latest') {
        let result = await this._get('/v1/headers/latest')
        [height, headerHex] = [result.height, result.header]
      } else {
        let opts = {from: id, count: 1}
        let result = await this._get('/v1/headers/query', opts)
        [height, headerHex] = [result.from, result.headers.slice(0, 160)]
      }

      let rawHeader = new Buffer(headerHex, 'hex')
      return _.extend(buffer2header(rawHeader), {
        height: height,
        hash: hashEncode(sha256x2(rawHeader))
      })
    } catch (err) {
      if (err instanceof errors.Connector.Chromanode.Fail &&
          ['FromNotFound', 'ToNotFound'].indexOf(err.data.type) !== -1) {
        err = new errors.Connector.HeaderNotFound(id)
      }

      throw err
    }
  }

  /**
   * @param {(string|number)} from
   * @param {Object} [opts]
   * @param {(string|number)} [opts.to]
   * @param {number} [opts.count]
   * @return {Promise<{from: number, headers: string}>}
   */
  async headersQuery (from, opts) {
    try {
      opts = _.extend({from: from}, opts)
      return await this._get('/v1/headers/query', opts)
    } catch (err) {
      if (err instanceof errors.Connector.Chromanode.Fail &&
          ['FromNotFound', 'ToNotFound'].indexOf(err.data.type) !== -1) {
        let id = err.data.type === 'FromNotFound' ? opts.from : opts.to
        err = new errors.Connector.HeaderNotFound(id)
      }

      throw err
    }
  }

  /**
   * @param {string} txId
   * @return {Promise<string>}
   */
  async getTx (txId) {
    try {
      let result = await this._get('/v1/transactions/raw', {txid: txId})
      return result.hex
    } catch (err) {
      if (err instanceof errors.Connector.Chromanode.Fail &&
          err.data.type === 'TxNotFound') {
        err = new errors.Connector.TxNotFound(txId)
      }

      throw err
    }
  }

  /**
   * @param {string} txId
   * @return {Promise<Connector~TxMerkleObject>}
   */
  async getTxMerkle (txId) {
    try {
      return await this._get('/v1/transactions/merkle', {txid: txId})
    } catch (err) {
      if (err instanceof errors.Connector.Chromanode.Fail &&
          err.data.type === 'TxNotFound') {
        err = new errors.Connector.TxNotFound(txId)
      }

      throw err
    }
  }

  /**
   * @param {string} txId
   * @param {number} outIndex
   * @return {Promise<Connector~TxSpentObject>}
   */
  async isOutputSpent (txId, outIndex) {
    try {
      let result = await this._get('/v1/transactions/merkle', {txid: txId, vout: outIndex})
      if (result.txid) {
        result.txId = result.txid
        delete result.txid
      }

      return result
    } catch (err) {
      if (err instanceof errors.Connector.Chromanode.Fail &&
          err.data.type === 'TxNotFound') {
        err = new errors.Connector.TxNotFound(txId)
      }

      throw err
    }
  }

  /**
   * @param {string} rawTx
   * @return {Promise}
   */
  async sendTx (rawTx) {
    try {
      return await this._post('/v1/transactions/send', {rawtx: rawtx})
    } catch (err) {
      if (err instanceof errors.Connector.Chromanode.Fail &&
          err.data.type === 'SendTxError') {
        err = new errors.Connector.TxSendError(err.data.message)
      }

      throw err
    }
  }

  /**
   * @param {string[]} addresses
   * @param {Object} [opts]
   * @param {string} [opts.source] `blocks` or `mempool`
   * @param {(string|number)} [opts.from] `hash` or `height`
   * @param {(string|number)} [opts.to] `hash` or `height`
   * @param {string} [opts.status]
   */
  async addressesQuery (addresses, opts) {
    try {
      opts = _.extend({addresses: addresses}, opts)
      return await this._get('/v1/addresses/query', opts)
    } catch (err) {
      if (err instanceof errors.Connector.Chromanode.Fail &&
          ['FromNotFound', 'ToNotFound'].indexOf(err.data.type) !== -1) {
        let id = err.data.type === 'FromNotFound' ? opts.from : opts.to
        err = new errors.Connector.HeaderNotFound(id)
      }

      throw err
    }
  }

  /**
   * @private
   * @param {Object} opts
   * @param {string} opts.event
   * @param {string} [opts.address]
   * @param {string} [opts.txId]
   * @return {?string}
   */
  _getRoomName (opts) {
    switch (Object(opts).type) {
      case 'new-block':
        return 'new-block'

      case 'new-tx':
        return 'new-tx'

      case 'tx':
        return `tx-${opts.txid}`

      case 'address':
        return `address-${opts.address}`

      case 'status':
        return 'status'

      default:
        return null
    }
  }

  /**
   * @param {Object} opts
   * @param {string} opts.event
   * @param {string} [opts.address]
   * @param {string} [opts.txId]
   * @return {Promise}
   */
  async subscribe (opts) {
    let room = this._getRoomName(opts)
    if (room === null) {
      throw new errors.Connector.SubscribeError('Wrong type')
    }

    let deferred = {aborted: false}
    deferred.promise = new Promise((resolve, reject) => {
      deferred.resolve = resolve
      deferred.reject = reject
    })

    let data = this._subscribeRequests[room] || {opts: opts, queue: []}
    data.queue.push(deferred)

    if (data.queue.length > 1) {
      try {
        await _.last(data.queue).promise
      } catch (err) {}
    }

    if (deferred.aborted) {
      return
    }




    var this = this
    return Promise.try(function () {
      var request = {event: opts.event, address: opts.address}
      if (_.findIndex(this._subscribeRequests, request) !== -1) {
        return
      }

      this._subscribeRequests.push(request)
      if (this._socket === undefined) {
        return
      }

      if (request.event === 'newBlock') {
        this._socket.on('new-block', function (hash, height) {
          this.emit('newBlock', hash, height)
        })
        this._socket.emit('subscribe', type)
        return this._socketSubscribe('new-block')
      }

      if (request.event === 'touchAddress') {
        this._socket.on(request.address, function (txId) {
          this.emit('touchAddress', request.address, txId)
        })
        this._socket.emit('subscribe', type)
        return this._socketSubscribe(request.address)
      }
    })
  }

  /**
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
