import _ from 'lodash'
import { parse as URLParse } from 'url'

import makeConcurrent from 'make-concurrent'
import URLJoin from 'url-join'
import io from 'socket.io-client'
import ws from 'ws'
import request from 'request'

import Network from './network'
import errors from '../errors'
import { hashEncode, sha256x2 } from '../util/crypto'
import { buffer2header } from '../util/header'

/**
 * [Chromanode API]{@link http://github.com/chromaway/chromanode}
 *
 * @class Chromanode
 * @extends Network
 */
export default class Chromanode extends Network {
  /*
   * @param {Object} opts
   * @param {string} opts.url
   * @param {number} [opts.concurrency=Infinity]
   * @param {number} [opts.requestTimeout=10000]
   * @param {string[]} [opts.wsTransports]
   */
  constructor (opts) {
    super(opts)

    if (this.concurrency !== Infinity) {
      this._request = makeConcurrent(::this._request, {concurrency: this.concurrency})
    }

    opts = _.extend({
      requestTimeout: 10000,
      wsTransports: ws !== null ? ['websocket', 'polling'] : ['polling']
    }, opts)

    this._connectTimeoutId = null

    this._requestURL = opts.url
    this._requestTimeout = opts.requestTimeout
    this._requestCount = 0
    this._requestLastResponse = Date.now()
    this._wsTransports = opts.wsTransports
    this._wsBlock = false
    this._wsAddresses = []

    // re-subscribe on newBlock and newTx
    this.on('connect', () => {
      if (this._wsBlock) {
        this._wsBlock = false
        this.subscribe({event: 'newBlock'}).catch(this.emit.bind(this, 'error'))
      }

      if (this._wsAddresses.length > 0) {
        let addresses = this._wsAddresses
        this._wsAddresses = []
        for (let address of addresses) {
          this.subscribe({event: 'newTx', address: address}).catch(this.emit.bind(this, 'error'))
        }
      }
    })
  }

  static SOURCES = {
    'livenet': [
      'http://v1.livenet.bitcoin.chromanode.net'
    ],
    'testnet': [
      'http://v1.testnet.bitcoin.chromanode.net'
    ]
  }

  /**
   * @param {string} networkName
   * @return {string[]}
   */
  static getSources (networkName) {
    return Chromanode.SOURCES[networkName] || []
  }

  /**
   * @private
   * @param {boolean} [reconnect=false]
   */
  _deleteSocket (reconnect) {
    if (this._socket) {
      this._socket.removeAllListeners()
      delete this._socket
    }

    if (reconnect) {
      this._connectTimeoutId = setTimeout(::this.connect, 10 * 1000)
    }
  }

  /**
   * @private
   */
  _doOpen () {
    clearTimeout(this._connectTimeoutId)

    // set stata CONNECTING
    this._setReadyState(this.READY_STATE.CONNECTING)

    // create socket
    let urldata = URLParse(this._requestURL)
    let ioURL = URLJoin((urldata.protocol === 'http:' ? 'ws://' : 'wss://') + urldata.host, 'v2')
    this._socket = io(ioURL, {
      autoConnect: false,
      forceNew: true,
      reconnectionDelay: this._requestTimeout,
      reconnectionDelayMax: this._requestTimeout,
      randomizationFactor: 0,
      forceJSONP: false,
      jsonp: false,
      timeout: this._requestTimeout,
      transports: this._wsTransports
    })

    this._socket.on('connect', () => {
      this._setReadyState(this.READY_STATE.OPEN)
    })

    this._socket.on('connect_error', () => {
      this._deleteSocket(true)
      this._setReadyState(this.READY_STATE.CLOSED)
      this.emit('error', new errors.Network.ConnectionError('Chromanode'))
    })

    this._socket.on('connect_timeout', () => {
      this._deleteSocket(true)
      this._setReadyState(this.READY_STATE.CLOSED)
      this.emit('error', new errors.Network.ConnectionTimeout('Chromanode'))
    })

    this._socket.on('disconnect', (reason) => {
      // ignore disconnect event with `forced close` as a reason
      if (reason === 'forced close') {
        return
      }

      this._deleteSocket(reason !== 'io client disconnect')
      this._setReadyState(this.READY_STATE.CLOSED)
    })

    this._socket.on('new-block', this.emit.bind(this, 'newBlock'))
    this._socket.on('address', (payload) => {
      this.emit('newTx', {txId: payload.txid, address: payload.address})
    })

    // open socket
    this._socket.open()
  }

  /**
   * @private
   */
  _doClose () {
    clearTimeout(this._connectTimeoutId)

    // set state CLOSING
    this._setReadyState(this.READY_STATE.CLOSING)

    // close socket, remove listeners and delete on disconnect event...
    this._socket.close()
  }

  /**
   * @private
   * @param {string} path
   * @param {string} [method='GET']
   * @param {Object} [data={}]
   * @return {Promise<string>}
   */
  async _request (path, method, data) {
    if (_.isObject(method)) {
      data = method
    }

    let requestOpts = {
      method: method !== 'POST' ? 'GET' : 'POST',
      uri: URLJoin(this._requestURL, path),
      timeout: this._requestTimeout,
      json: data,
      zip: true
    }

    if (requestOpts.method === 'GET') {
      requestOpts.uri += '?' + _.map(data, (value, key) => {
        return [key, value].map(encodeURIComponent).join('=')
      }).join('&')
      requestOpts.json = true
    }

    try {
      this._requestCount += 1

      let body = await new Promise((resolve, reject) => {
        request(requestOpts, (err, response, body) => {
          if (response.statusCode === 200) {
            return resolve(body)
          } else {
            err = new errors.Network.RequestError('Chromanode', response.statusCode, requestOpts.uri)
          }

          reject(err)
        })
      })

      this._requestLastResponse = new Date()

      switch (body.status) {
        case 'success':
          return body.data
        case 'fail':
          let err = new errors.Network.Chromanode.Fail(body.data.type, requestOpts.uri)
          err.data = body.data
          throw err
        case 'error':
          throw new errors.Network.Chromanode.Error(body.message, requestOpts.uri)
        default:
          throw new errors.Network.Chromanode.Error(`Unknow status -- ${body.status}`, requestOpts.uri)
      }
    } finally {
      this._requestCount -= 1
    }
  }

  /**
   * @return {number}
   */
  getCurrentActiveRequests () {
    return this._requestCount
  }

  /**
   * @return {number}
   */
  getTimeFromLastResponse () {
    return Date.now() - this._requestLastResponse
  }

  /**
   * @param {(number|string)} id
   * @return {Promise<Network~HeaderObject>}
   */
  async getHeader (id) {
    try {
      let height
      let headerHex

      if (id === 'latest') {
        let result = await this._request('/v2/headers/latest')
        ;[height, headerHex] = [result.height, result.header]
      } else {
        let result = await this._request('/v2/headers/query', {id: id})
        ;[height, headerHex] = [result.from, result.headers.slice(0, 160)]
      }

      let rawHeader = new Buffer(headerHex, 'hex')
      return _.extend(buffer2header(rawHeader), {
        height: height,
        hash: hashEncode(sha256x2(rawHeader))
      })
    } catch (err) {
      var nerr = err
      if (err instanceof errors.Network.Chromanode.Fail &&
          err.data.type === 'HeaderNotFound') {
        nerr = new errors.Network.HeaderNotFound(id)
      }

      throw nerr
    }
  }

  /**
   * @param {?(string|number)} from null allow get 0 header
   * @param {(string|number)} [to]
   * @return {Promise<string>}
   */
  async getHeaders (from, to) {
    try {
      let opts = {}
      if (from !== null) {
        opts.from = from
      }
      if (to !== undefined) {
        opts.to = to
      }

      let result = await this._request('/v2/headers/query', opts)
      return result.headers
    } catch (err) {
      var nerr = err
      if (err instanceof errors.Network.Chromanode.Fail &&
          ['FromNotFound', 'ToNotFound'].indexOf(err.data.type) !== -1) {
        let id = err.data.type === 'FromNotFound' ? from : to
        nerr = new errors.Network.HeaderNotFound(id)
      }

      throw nerr
    }
  }

  /**
   * @param {string} txId
   * @return {Promise<string>}
   */
  async getTx (txId) {
    try {
      let result = await this._request('/v2/transactions/raw', {txid: txId})
      return result.hex
    } catch (err) {
      var nerr = err
      if (err instanceof errors.Network.Chromanode.Fail &&
          err.data.type === 'TxNotFound') {
        nerr = new errors.Network.TxNotFound(txId)
      }

      throw nerr
    }
  }

  /**
   * @param {string} txId
   * @return {Promise<?Network~TxMerkleObject>}
   */
  async getTxMerkle (txId) {
    try {
      let result = await this._request('/v2/transactions/merkle', {txid: txId})
      if (result.source === 'mempool') {
        return null
      }

      return result.block
    } catch (err) {
      var nerr = err
      if (err instanceof errors.Network.Chromanode.Fail &&
          err.data.type === 'TxNotFound') {
        nerr = new errors.Network.TxNotFound(txId)
      }

      throw nerr
    }
  }

  /**
   * @param {string} rawTx
   * @return {Promise}
   */
  async sendTx (rawTx) {
    try {
      await this._request('/v2/transactions/send', 'POST', {rawtx: rawTx})
    } catch (err) {
      var nerr = err
      if (err instanceof errors.Network.Chromanode.Fail &&
          err.data.type === 'SendTxError') {
        nerr = new errors.Network.TxSendError(err.data.message)
      }

      throw nerr
    }
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
    try {
      let reqOpts = _.extend({addresses: addresses}, opts)
      if (opts.unspent === true) {
        reqOpts.status = 'unspent'
      }

      let response = await this._request('/v2/addresses/query', reqOpts)

      let result = {latest: response.latest}
      if (opts.unspent === true) {
        result.data = response.unspent.map((o) => {
          return {
            txId: o.txid,
            outIndex: o.vount,
            value: o.value,
            script: o.script,
            height: o.height
          }
        })
      } else {
        result.data = response.transactions.map((o) => {
          return {
            txId: o.txid,
            height: o.height
          }
        })
      }

      return result
    } catch (err) {
      var nerr = err
      if (err instanceof errors.Network.Chromanode.Fail &&
          ['FromNotFound', 'ToNotFound'].indexOf(err.data.type) !== -1) {
        let id = err.data.type === 'FromNotFound' ? opts.from : opts.to
        nerr = new errors.Network.HeaderNotFound(id)
      }

      throw nerr
    }
  }

  /**
   * @param {Object} opts
   * @param {string} opts.event newBlock or newTx
   * @param {string} [opts.address]
   * @return {Promise}
   */
  @makeConcurrent({concurrency: 1})
  async subscribe (opts) {
    switch (_.get(opts, 'event')) {
      case 'newBlock':
        if (this._wsBlock) {
          return
        }

        this._wsBlock = true
        opts = {type: 'new-block'}
        break

      case 'newTx':
        let address = _.get(opts, 'address').toString()
        if (this._wsAddresses.indexOf(address) !== -1) {
          return
        }

        this._wsAddresses.push(address)
        opts = {type: 'address', address: address}
        break

      default:
        throw new errors.Network.SubscribeError('Wrong event type')
    }

    if (!this.isConnected()) {
      return
    }

    let deferred = {}
    deferred.promise = new Promise((resolve, reject) => {
      deferred.resolve = resolve
      deferred.reject = reject
    })

    function onSubscribed (payload, err) {
      if (err === null) {
        if (_.eq(payload, opts)) {
          return deferred.resolve()
        }

        let msg = `Subscribe on wrong event (${JSON.stringify(payload)} instead ${JSON.stringify(opts)})`
        err = new errors.Network.SubscribeError(msg)
      }

      deferred.reject(err)
    }

    function onChangeReadyState (newReadyState) {
      if (newReadyState === this.READY_STATE.CLOSING ||
          newReadyState === this.READY_STATE.CLOSED) {
        let err = new errors.Network.SubscribeError('Connection was lost')
        deferred.reject(err)
      }
    }

    try {
      this._socket.once('subscribed', onSubscribed)
      this.on('newReadyState', onChangeReadyState)
      this._socket.emit('subscribe', opts)
      await deferred.promise
    } finally {
      if (this._socket) {
        this._socket.removeListener('subscribed', onSubscribed)
      }
      this.removeListener('newReadyState', onChangeReadyState)
    }
  }
}
