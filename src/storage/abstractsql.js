import IBlockchainStorage from './interface'
import errors from '../errors'
import { ZERO_HASH } from '../util/const'

let SQL = {
  create: {
    info: `CREATE TABLE IF NOT EXISTS blockchainjs_info (
             key CHAR(100) PRIMARY KEY,
             value TEXT NOT NULL)`,
    chunkHashes: `CREATE TABLE IF NOT EXISTS blockchainjs_chunkhashes (
                    id INTEGER PRIMARY KEY,
                    hash CHAR(64) NOT NULL)`,
    headers: `CREATE TABLE IF NOT EXISTS blockchainjs_headers (
                id INTEGER PRIMARY KEY,
                header CHAR(160) NOT NULL)`
  },
  insert: {
    lastHash: `INSERT INTO blockchainjs_info
                 (key, value)
               VALUES
                 ("lasthash", $1)`,
    chunkHash: `INSERT INTO blockchainjs_chunkhashes
                  (id, hash)
                VALUES
                  ($1, $2)`,
    headers: `INSERT INTO blockchainjs_headers
                (id, header)
              VALUES
                ($1, $2)`
  },
  select: {
    lastHash: `SELECT
                 value
               FROM
                 blockchainjs_info
               WHERE
                 key = "lasthash"`,
    chunkHashes: {
      count: `SELECT
                COUNT(*) AS cnt
              FROM
                blockchainjs_chunkhashes`,
      byIndex: `SELECT
                  hash
                FROM
                  blockchainjs_chunkhashes
                WHERE id = $1`
    },
    headers: {
      count: `SELECT
                COUNT(*) AS cnt
              FROM
                blockchainjs_headers`,
      byIndex: `SELECT
                  header
                FROM
                  blockchainjs_headers
                WHERE
                  id = $1`
    }
  },
  update: {
    lastHash: `UPDATE
                 blockchainjs_info
               SET
                 value = $1
               WHERE
                 key = "lasthash"`
  },
  delete: {
    info: {
      all: `DELETE FROM blockchainjs_info`
    },
    chunkHashes: {
      all: `DELETE FROM blockchainjs_chunkhashes`,
      gte: `DELETE FROM blockchainjs_chunkhashes WHERE id >= $1`
    },
    headers: {
      all: `DELETE FROM blockchainjs_headers`,
      gte: `DELETE FROM blockchainjs_headers WHERE id >= $1`
    }
  }
}

/**
 * @class AbstractSQLStorage
 * @extends IBlockchainStorage
 */
export default class AbstractSQLStorage extends IBlockchainStorage {
  /*
   * @param {function} StorageCls
   * @param {Object} [opts]
   */
  constructor (StorageCls, opts) {
    super(opts)

    this._storage = new StorageCls(opts)
    this._storage.open()
      .then(() => {
        return this._storage.withLock(() => {
          return Promise.all([
            this._storage.executeSQL(SQL.create.info),
            this._storage.executeSQL(SQL.create.chunkHashes),
            this._storage.executeSQL(SQL.create.headers)
          ])
        })
      })
      .then(() => this._ready(null), (err) => this._ready(err))
  }

  /**
   * @return {Promise<string>}
   */
  async getLastHash () {
    let rows = await this._storage.withLock(() => {
      return this._storage.executeSQL(SQL.select.lastHash)
    })

    if (rows.length === 0) {
      return ZERO_HASH
    }

    return rows[0].value
  }

  /**
   * @param {string} lastHash
   * @return {Promise}
   */
  async setLastHash (lastHash) {
    await this._storage.withLock(async () => {
      let result = await this._storage.executeSQL(SQL.select.lastHash)
      let sql = result.length === 0
                  ? SQL.insert.lastHash
                  : SQL.update.lastHash

      return this._storage.executeSQL(sql, [lastHash])
    })
  }

  /**
   * @return {Promise<number>}
   */
  async getChunkHashesCount () {
    await this._iscompactCheck()

    let rows = await this._storage.withLock(() => {
      return this._storage.executeSQL(SQL.select.chunkHashes.count)
    })

    return rows[0].cnt
  }

  /**
   * @param {number} index
   * @return {Promise<string>}
   */
  async getChunkHash (index) {
    await this._iscompactCheck()

    let rows = await this._storage.withLock(() => {
      return this._storage.executeSQL(SQL.select.chunkHashes.byIndex, [index])
    })

    if (rows.length === 0) {
      throw new RangeError(`Chunk hash for index ${index} not exists`)
    }

    return rows[0].hash
  }

  /**
   * @param {string[]} chunkHashes
   * @return {Promise}
   */
  async putChunkHashes (chunkHashes) {
    await this._iscompactCheck()

    let rows = await this._storage.withLock(() => {
      return this._storage.executeSQL(SQL.select.chunkHashes.count)
    })

    for (let [index, chunkHash] of chunkHashes.entries()) {
      index += rows[0].cnt
      await this._storage.executeSQL(SQL.insert.chunkHash, [index, chunkHash])
    }
  }

  /**
   * @param {number} limit
   * @return {Promise}
   */
  async truncateChunkHashes (limit) {
    await this._iscompactCheck()

    await this._storage.withLock(() => {
      return this._storage.executeSQL(SQL.delete.chunkHashes.gte, [limit])
    })
  }

  /**
   * @return {Promise<number>}
   */
  async getHeadersCount () {
    let rows = await this._storage.withLock(() => {
      return this._storage.executeSQL(SQL.select.headers.count)
    })

    return rows[0].cnt
  }

  /**
   * @param {number} index
   * @return {Promise<string>}
   */
  async getHeader (index) {
    let rows = await this._storage.withLock((tx) => {
      return this._storage.executeSQL(SQL.select.headers.byIndex, [index])
    })

    if (rows.length === 0) {
      throw new RangeError(`Header for index ${index} not exists`)
    }

    return rows[0].header
  }

  /**
   * @param {Array.<string>} headers
   * @return {Promise}
   */
  async putHeaders (headers) {
    await this._storage.withLock(async () => {
      let rows = await this._storage.executeSQL(SQL.select.headers.count)

      if (this.compact && rows[0].cnt + headers.length > 2015) {
        var msg = 'you can store maximum 2015 headers'
        throw new errors.Storage.CompactMode.Limitation(msg)
      }

      for (let [index, header] of headers.entries()) {
        index += rows[0].cnt
        await this._storage.executeSQL(SQL.insert.headers, [index, header])
      }
    })
  }

  /**
   * @param {number} limit
   * @return {Promise}
   */
  async truncateHeaders (limit) {
    await this._storage.withLock(() => {
      return this._storage.executeSQL(SQL.delete.headers.gte, [limit])
    })
  }

  /**
   * @return {Promise}
   */
  async clear () {
    await this._storage.withLock(() => {
      return Promise.all([
        this._storage.executeSQL(SQL.delete.info.all),
        this._storage.executeSQL(SQL.delete.chunkHashes.all),
        this._storage.executeSQL(SQL.delete.headers.all)
      ])
    })
  }
}
