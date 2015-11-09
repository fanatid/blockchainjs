import { hashDecode } from './crypto'

/**
 * @typedef {Object} BitcoinHeader
 * @param {number} version
 * @param {string} hashPrevBlock
 * @param {string} hashMerkleRoot
 * @param {number} time
 * @param {number} bits
 * @param {number} nonce
 */

/**
 * @param {BitcoinHeader} header
 * @return {Buffer}
 */
export function header2buffer (header) {
  var buffer = new Buffer(80)
  buffer.writeUInt32LE(header.version, 0)
  buffer.write(hashDecode(header.hashPrevBlock).toString('hex'), 4, 32, 'hex')
  buffer.write(hashDecode(header.hashMerkleRoot).toString('hex'), 36, 32, 'hex')
  buffer.writeUInt32LE(header.time, 68)
  buffer.writeUInt32LE(header.bits, 72)
  buffer.writeUInt32LE(header.nonce, 76)

  return buffer
}

/**
 * @param {Buffer} buffer
 * @return {BitcoinHeader}
 */
export function buffer2header (buffer) {
  return {
    version: buffer.readUInt32LE(0),
    hashPrevBlock: Array.prototype.reverse.call(buffer.slice(4, 36)).toString('hex'),
    hashMerkleRoot: Array.prototype.reverse.call(buffer.slice(36, 68)).toString('hex'),
    time: buffer.readUInt32LE(68),
    bits: buffer.readUInt32LE(72),
    nonce: buffer.readUInt32LE(76)
  }
}
