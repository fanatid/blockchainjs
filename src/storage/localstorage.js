import _ from 'lodash'
import { LocalStorage as LocalStorage } from 'odd-storage'

import AbstractBlockchainSyncStorage from './abstractsync'

/**
 * @class LocalStorageBlockchainStorage
 * @extends AbstractBlockchainSyncStorage
 */
export default class LocalStoragBlockchainStorage extends AbstractBlockchainSyncStorage {
  /*
   * @param {Object} [opts]
   * @param {string} [opts.prefix=blockchainjs]
   */
  constructor (opts) {
    super(LocalStorage, _.extend({prefix: 'blockchainjs'}, opts))
  }

  static isAvailable = LocalStorage.isAvailable

  /**
   * @return {boolean}
   */
  static isFullModeSupported () { return false }
}
