import _ from 'lodash'
import { SQLite as SQLiteStorage } from 'odd-storage'

import AbstractBlockchainSQLStorage from './abstractsql'

/**
 * @class SQLiteBlockchainStorage
 * @extends AbstractBlockchainSQLStorage
 */
export default class SQLiteBlockchainStorage extends AbstractBlockchainSQLStorage {
  /*
   * @param {Object} [opts]
   * @param {string} [opts.dbName=blockchainjs.sqlite]
   */
  constructor (opts) {
    super(SQLiteStorage, _.extend({dbName: 'blockchainjs.sqlite'}, opts))
  }

  static isAvailable = SQLiteStorage.isAvailable

  /**
   * @return {boolean}
   */
  static isFullModeSupported () { return true }
}
