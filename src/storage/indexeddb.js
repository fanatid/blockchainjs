import _ from 'lodash'
import { IndexedDB as IndexedDBStorage } from 'odd-storage'

import AbstractBlockchainSyncStorage from './abstractsync'

/**
 * @class IndexedDBStorage
 * @extends AbstractBlockchainSyncStorage
 */
export default class IndexedDBBlockchainStorage extends AbstractBlockchainSyncStorage {
  /*
   * @param {Object} [opts]
   * @param {string} [opts.dbName=blockchainjs]
   */
  constructor (opts) {
    super(IndexedDBStorage, _.extend({dbName: 'blockchainjs'}, opts))
  }

  static isAvailable = IndexedDBStorage.isAvailable

  /**
   * @return {boolean}
   */
  static isFullModeSupported () { return true }
}
