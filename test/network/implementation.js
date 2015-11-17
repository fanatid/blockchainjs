import { expect } from 'chai'
import _ from 'lodash'
import { randomBytes as getRandomBytes } from 'crypto'
import bitcore from 'bitcore-lib'

import blockchainjs from '../../src'
import { hashEncode, sha256x2 } from '../../src/util/crypto'
import { header2buffer } from '../../src/util/header'

import { createTx, getUnconfirmedTxId } from '../helpers'
import fixtures from '../fixtures/network.json'

/**
 * @param {Object} [opts]
 * @param {function} [opts.describe]
 * @param {string} [opts.clsName]
 * @param {Object} [opts.clsOpts]
 */
module.exports = function (opts) {
  let NetworkCls = blockchainjs.network[opts.clsName]

  let ndescribe = opts.describe || describe
  let clsOpts = opts.clsOpts
  clsOpts.url = clsOpts.url || NetworkCls.getSources('testnet')[0]

  ndescribe(opts.clsName, function () {
    this.timeout(90 * 1000)

    let network

    beforeEach(() => {
      network = new NetworkCls(clsOpts)
      return new Promise((resolve, reject) => {
        network.once('error', reject)
        network.once('connect', resolve)
        network.connect()
      })
    })

    afterEach((done) => {
      if (!network.isConnected()) {
        return
      }

      network.on('newReadyState', (readyState) => {
        if (readyState !== network.READY_STATE.CLOSED) {
          return
        }

        network.removeAllListeners()
        network = null
        done()
      })

      network.disconnect()
    })

    it('inherits Network', () => {
      expect(network).to.be.instanceof(blockchainjs.network.Network)
      expect(network).to.be.instanceof(NetworkCls)
    })

    it('isConnected', () => {
      expect(network.isConnected()).to.be.true
    })

    it('disconnect/connect', (done) => {
      network.once('disconnect', () => {
        network.once('connect', done)
        network.connect()
      })

      network.disconnect()
    })

    it('getCurrentActiveRequests', (done) => {
      network.getHeader('latest')

      setTimeout(() => {
        expect(network.getCurrentActiveRequests()).to.equal(1)
        done()
      }, 5)
    })

    it('getTimeFromLastResponse', async () => {
      await network.getHeader('latest')
      expect(network.getTimeFromLastResponse()).to.be.below(50)
    })

    it('getHeader (not exists -- wrong height)', () => {
      let height = 1e6 - 1
      return expect(network.getHeader(height))
        .to.be.rejectedWith(blockchainjs.errors.Network.HeaderNotFound, new RegExp(height))
    })

    it('getHeader (not exists -- wrong hash)', () => {
      let hash = getRandomBytes(32).toString('hex')
      return expect(network.getHeader(hash))
        .to.be.rejectedWith(blockchainjs.errors.Network.HeaderNotFound, new RegExp(hash))
    })

    it('getHeader 0 by height', async () => {
      let header = await network.getHeader(fixtures.headers[0].height)
      expect(header).to.deep.equal(fixtures.headers[0])
    })

    it('getHeader 0 by hash', async () => {
      let header = await network.getHeader(fixtures.headers[0].hash)
      expect(header).to.deep.equal(fixtures.headers[0])
    })

    it('getHeader 30000 by height', async () => {
      let header = await network.getHeader(fixtures.headers[30000].height)
      expect(header).to.deep.equal(fixtures.headers[30000])
    })

    it('getHeader (latest keyword)', async () => {
      let header = await network.getHeader('latest')
      expect(header).to.be.a('Object')
      let rawHeader = header2buffer(header)
      expect(header.hash).to.equal(hashEncode(sha256x2(rawHeader)))
      expect(header.height).to.be.a('number')
      expect(header.height).to.be.at.least(600000)
    })

    it('getHeaders (not found)', () => {
      let from = getRandomBytes(32).toString('hex')
      return expect(network.getHeaders(from))
        .to.be.rejectedWith(blockchainjs.errors.Network.HeaderNotFound, new RegExp(from))
    })

    it('getHeaders (first chunk)', async () => {
      let result = await network.getHeaders(null)
      expect(result).to.be.a('string').and.to.have.length(2016 * 160)
      let headersHash = hashEncode(sha256x2(new Buffer(result, 'hex')))
      expect(headersHash).to.equal('9b9a9a4d1d72d4ca173a7c659119bb6d756458d1624b7035eb63bf2f893befda')
    })

    it('getHeaders (only latest header)', async () => {
      let latest = await network.getHeader('latest')
      let result = await network.getHeaders(latest.hashPrevBlock)
      expect(result).to.equal(header2buffer(latest).toString('hex'))
    })

    it('getTx (not exists tx)', () => {
      let txId = getRandomBytes(32).toString('hex')
      return expect(network.getTx(txId))
        .to.be.rejectedWith(blockchainjs.errors.Network.TxNotFound, new RegExp(txId))
    })

    it('getTx (confirmed tx)', async () => {
      let txId = '9854bf4761024a1075ebede93d968ce1ba98d240ba282fb1f0170e555d8fdbd8'
      let txHex = await network.getTx(txId)
      let responseTxId = hashEncode(sha256x2(new Buffer(txHex, 'hex')))
      expect(responseTxId).to.equal(txId)
    })

    it('getTx (unconfirmed tx)', async () => {
      let txId = await getUnconfirmedTxId()
      let txHex = await network.getTx(txId)
      let responseTxId = hashEncode(sha256x2(new Buffer(txHex, 'hex')))
      expect(responseTxId).to.equal(txId)
    })

    it('getTxMerkle (non-exists tx)', () => {
      let txId = getRandomBytes(32).toString('hex')
      return expect(network.getTxMerkle(txId))
        .to.be.rejectedWith(blockchainjs.errors.Network.TxNotFound, new RegExp(txId))
    })

    it('getTxMerkle (confirmed tx)', async () => {
      let expected = _.cloneDeep(fixtures.txMerkle.confirmed[0].result)
      let result = await network.getTxMerkle(fixtures.txMerkle.confirmed[0].txId)
      expect(result).to.deep.equal(expected)
    })

    it('getTxMerkle (confirmed tx, coinbase)', async () => {
      let expected = _.cloneDeep(fixtures.txMerkle.confirmed[1].result)
      let result = await network.getTxMerkle(fixtures.txMerkle.confirmed[1].txId)
      expect(result).to.deep.equal(expected)
    })

    it('getTxMerkle (unconfirmed tx)', async () => {
      let txId = await getUnconfirmedTxId()
      let result = await network.getTxMerkle(txId)
      expect(result).to.deep.equal([])
    })

    it('sendTx', async () => {
      let tx = await createTx()
      try {
        await network.sendTx(tx.toString())
      } catch (err) {
        if (err instanceof blockchainjs.errors.Network.TxSendError &&
            err.message.search(/Missing inputs/) !== -1) {
          return
        }

        throw err
      }
    })

    it('addressesQuery', async () => {
      let fixture = fixtures.history[0]
      let result = await network.addressesQuery(fixture.addresses, fixture.opts)
      expect(result).to.be.an('object')
      expect(result.data).to.deep.equal(fixture.data)
      expect(result.latest).to.be.an('object')
      expect(result.latest.height).to.be.at.least(600000)
      expect(result.latest.hash).to.have.length(64)
    })

    it('addressesQuery (unspent)', async () => {
      let fixture = fixtures.unspent[0]
      let result = await network.addressesQuery(fixture.addresses, fixture.opts)
      expect(result).to.be.an('object')
      expect(result.data).to.deep.equal(fixture.data)
      expect(result.latest).to.be.an('object')
      expect(result.latest.height).to.be.at.least(600000)
      expect(result.latest.hash).to.have.length(64)
    })

    it('subscribe on newBlocks', () => {
      return network.subscribe({event: 'newBlock'})
    })

    // fail with missing inputs ...
    it.skip('subscribe on newTx and wait event', async () => {
      let tx = await createTx(2e4)
      let address = tx.outputs[0].script.toAddress(bitcore.Networks.testnet)

      await new Promise((resolve, reject) => {
        network.on(`newTx`, (payload) => {
          try {
            expect(payload).to.deep.equal({txId: tx.id, address: address})
            resolve()
          } catch (err) {
            reject(err)
          }
        })

        network.subscribe({event: 'newTx', address: address})
        network.sendTx(tx.toString()).catch(reject)
      })
    })
  })
}
