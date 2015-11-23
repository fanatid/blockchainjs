import makeConcurrent from 'make-concurrent'

import Blockchain from './blockchain'

/**
 * @class Naive
 * @extends Blockchain
 */
export default class Naive extends Blockchain {
  /*
   * @constructor
   * @param {Network} network
   * @param {Object} [opts]
   * @param {number} [opts.txCacheSize=100]
   */
  constructor (network, opts) {
    super(network, opts)
    this._networkStart()
  }

  /**
   * @private
   * @return {Promise}
   */
  @makeConcurrent({concurrency: 1})
  async _sync () {
    let savedLatest = this.latest
    try {
      await this._withSync(async () => {
        let obj = await this._network.getHeader('latest')
        this._latest = {hash: obj.hash, height: obj.height}
      })
    } catch (err) {
      this.emit('error', err)
    } finally {
      if (this._latest.hash !== savedLatest.hash) {
        this.emit('newBlock', this.latest) // emit with clone of _latest
      }
    }
  }

  /**
   * @param {(number|string)} id
   * @return {Promise<Network~HeaderObject>}
   */
  getHeader (id) {
    return this._network.getHeader(id)
  }

  /**
   * @param {string} txId
   * @return {Promise<?{hash: string, height: number}>}
   */
  async getTxBlockInfo (txId) {
    let obj = await this._network.getTxMerkle(txId)
    if (obj !== null) {
      return {hash: obj.hash, height: obj.height}
    }

    return null
  }

  /**
   * @param {string[]} addresses
   * @param {Object} [opts]
   * @param {(string|number)} [opts.from]
   * @param {(string|number)} [opts.to]
   * @param {boolean} [opts.unspent=false]
   * @return {Promise<Network~AddressesQueryObject>}
   */
  addressesQuery (addresses, opts) {
    return this._network.addressesQuery(addresses, opts)
  }
}
