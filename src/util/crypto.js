import { createHash } from 'crypto'

/**
 * @param {Buffer} buffer
 * @return {Buffer}
 */
export function sha256 (buffer) {
  return createHash('sha256').update(buffer).digest()
}

/**
 * @param {Buffer} buffer
 * @return {Buffer}
 */
export function sha256x2 (buffer) {
  return sha256(sha256(buffer))
}

/**
 * Reverse buffer and transform to hex string
 *
 * @param {Buffer} s
 * @return {string}
 */
export function hashEncode (s) {
  return Array.prototype.reverse.call(new Buffer(s)).toString('hex')
}

/**
 * Transform hex string to buffer and reverse it
 *
 * @param {string} s
 * @return {Buffer}
 */
export function hashDecode (s) {
  return Array.prototype.reverse.call(new Buffer(s, 'hex'))
}
