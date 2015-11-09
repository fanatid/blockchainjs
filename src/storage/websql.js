import _ from 'lodash'
import { WebSQL as WebSQLStorage } from 'odd-storage'

import AbstractBlockchainSQLStorage from './abstractsql'

/**
 * @class WebSQLBlockchainStorage
 * @extends AbstractBlockchainSQLStorage
 */
export default class WebSQLBlockchainStorage extends AbstractBlockchainSQLStorage {
  /*
   * @param {Object} [opts]
   * @param {string} [opts.dbName=blockchainjs]
   */
  constructor (opts) {
    super(WebSQLStorage, _.extend({dbName: 'blockchainjs'}, opts))
  }

  static isAvailable = WebSQLStorage.isAvailable

  /**
   * @return {boolean}
   */
  static isFullModeSupported () { return true }
}
