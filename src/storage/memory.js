import { Memory as MemoryStorage } from 'odd-storage'

import AbstractBlockchainSyncStorage from './abstractsync'

/**
 * @class MemoryBlockchainStorage
 * @extends AbstractBlockchainSyncStorage
 */
export default class MemoryBlockchainStorage extends AbstractBlockchainSyncStorage {
  /*
   * @param {Object} [opts]
   */
  constructor (opts) {
    super(MemoryStorage, opts)
  }

  static isAvailable = MemoryStorage.isAvailable

  /**
   * @return {boolean}
   */
  static isFullModeSupported () { return true }
}
