/**
 * Error
 *  +-- BlockchainJS
 *       +-- Blockchain
 *       |    +-- VerifyBlockchainError
 *       |    +-- VerifyChunkError
 *       |    +-- VerifyHeaderError
 *       |    +-- VerifyTxError
 *       +-- Network
 *       |    +-- Chromanode
 *       |    |    +-- Error
 *       |    |    +-- Fail
 *       |    +-- ConnectionError
 *       |    +-- ConnectionTimeout
 *       |    +-- HeaderNotFound
 *       |    +-- RequestError
 *       |    +-- TxNotFound
 *       |    +-- TxSendError
 *       |    +-- SubscribeError
 *       +-- NotImplemented
 *       +-- Storage
 *            +-- CompactMode
 *                 +-- Forbidden
 *                 +-- Limitation
 */

let spec = {
  name: 'BlockchainJS',
  message: 'Internal error',
  errors: [{
    name: 'Blockchain',
    message: 'Internal error on Blockchain {0}',
    errors: [{
      name: 'VerifyBlockchainError',
      message: 'Blockchain latest: {0}'
    }, {
      name: 'VerifyChunkError',
      message: 'Chunk #{0} ({1})'
    }, {
      name: 'VerifyHeaderError',
      message: 'Header #{0} ({1})'
    }, {
      name: 'VerifyTxError',
      message: 'TxId: {0} ({1})'
    }]
  }, {
    name: 'Network',
    message: 'Internal error on Network {0}',
    errors: [{
      name: 'Chromanode',
      message: 'Internal error on Chromanode {0}',
      errors: [{
        name: 'Error',
        message: 'Chromanode error (error: {0}, uri: {1})'
      }, {
        name: 'Fail',
        message: 'Chromanode fail (error: {0}, uri: {1})'
      }]
    }, {
      name: 'ConnectionError',
      message: 'Connection error (network: {0})'
    }, {
      name: 'ConnectionTimeout',
      message: 'Connection timeout (network: {0})'
    }, {
      name: 'HeaderNotFound',
      message: 'Header not found ({0})'
    }, {
      name: 'RequestError',
      message: 'Request HTTP error (network: {0}, code: {1}, url: {2})'
    }, {
      name: 'TxNotFound',
      message: 'Transaction not found ({0})'
    }, {
      name: 'TxSendError',
      message: 'Can\'t send transaction: {0}'
    }, {
      name: 'SubscribeError',
      message: '{0}'
    }]
  }, {
    name: 'NotImplemented',
    message: 'Function {0} was not implemented yet'
  }, {
    name: 'Storage',
    message: 'Internal error on Storage {0}',
    errors: [{
      name: 'CompactMode',
      message: 'Internal error on CompactMode {0}',
      errors: [{
        name: 'Forbidden',
        message: 'Operation forbidden. Allow only with CompactMode is true.'
      }, {
        name: 'Limitation',
        message: 'CompactMode limitation: {0}'
      }]
    }]
  }]
}

require('error-system').extend(Error, spec)
module.exports = Error.BlockchainJS
