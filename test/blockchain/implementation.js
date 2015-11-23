import { expect } from 'chai'
import { randomBytes as getRandomBytes } from 'crypto'

import blockchainjs from '../../src'
import { hashEncode, sha256x2 } from '../../src/util/crypto'
import fixtures from '../fixtures/network.json'

import helpers from '../helpers'

/**
 * @param {Object} opts
 */
export default (opts) => {
  let persistent = {}
  let network
  let blockchain

  before(async () => {
    let result = await opts.before(persistent)
    network = persistent.network
    blockchain = persistent.blockchain
    return result
  })
  after(() => opts.after(persistent))

  opts.extraTests(persistent)

  it('latest property', async () => {
    expect(blockchain.latest).to.deep.equal(await helpers.getLatest(network))
  })

  it('getHeader 0 by height', async () => {
    let header = await blockchain.getHeader(fixtures.headers[0].height)
    expect(header).to.deep.equal(fixtures.headers[0])
  })

  it('getHeader 30000 by id', async () => {
    let header = await blockchain.getHeader(fixtures.headers[30000].hash)
    expect(header).to.deep.equal(fixtures.headers[30000])
  })

  it('getHeader (not-exists -- wrong height)', () => {
    let id = 1e7
    return expect(blockchain.getHeader(id))
      .to.be.rejectedWith(blockchainjs.errors.Network.HeaderNotFound, new RegExp(id))
  })

  it('getHeader (not-exists -- wrong blockHash)', () => {
    let id = getRandomBytes(32).toString('hex')
    return expect(blockchain.getHeader(id))
      .to.be.rejectedWith(blockchainjs.errors.Network.HeaderNotFound, new RegExp(id))
  })

  it('getTx (confirmed tx)', async () => {
    let txId = '9854bf4761024a1075ebede93d968ce1ba98d240ba282fb1f0170e555d8fdbd8'
    let rawTx = await blockchain.getTx(txId)
    let hash = hashEncode(sha256x2(new Buffer(rawTx, 'hex')))
    expect(hash).to.equal(txId)
  })

  it('getTx (unconfirmed tx)', async () => {
    let txId = await helpers.getUnconfirmedTxId()
    let rawTx = await blockchain.getTx(txId)
    let hash = hashEncode(sha256x2(new Buffer(rawTx, 'hex')))
    expect(hash).to.equal(txId)
  })

  it('getTx (not-exists tx)', () => {
    let txId = getRandomBytes(32).toString('hex')
    return expect(blockchain.getTx(txId))
      .to.be.rejectedWith(blockchainjs.errors.Network.TxNotFound, new RegExp(txId))
  })

  it('getTxBlockInfo (confirmed tx)', async() => {
    let fixture = fixtures.txMerkle.confirmed[0]
    let result = await blockchain.getTxBlockInfo(fixture.txId)
    expect(result).to.deep.equal({hash: fixture.result.hash, height: fixture.result.height})
  })

  it('getTxBlockInfo (unconfirmed tx)', async () => {
    let txId = await helpers.getUnconfirmedTxId()
    let result = await blockchain.getTxBlockInfo(txId)
    expect(result).to.be.null
  })

  it('getTxBlockInfo (not exists tx)', () => {
    let txId = getRandomBytes(32).toString('hex')
    return expect(blockchain.getTxBlockInfo(txId))
      .to.be.rejectedWith(blockchainjs.errors.Network.TxNotFound, new RegExp(txId))
  })

  it('sendTx', async () => {
    let tx = await helpers.createTx()
    return blockchain.sendTx(tx.serialize())
  })

  it('addressesQuery (history)', async () => {
    let fixture = fixtures.history[0]
    let result = await blockchain.addressesQuery(fixture.addresses, fixture.opts)
    expect(result).to.be.an('object')
    expect(result.data).to.deep.equal(fixture.data)
    expect(result.latest).to.deep.equal(await helpers.getLatest(network))
  })

  it('addressesQuery (unspent)', async () => {
    let fixture = fixtures.unspent[0]
    let result = await blockchain.addressesQuery(fixture.addresses, fixture.opts)
    expect(result).to.be.an('object')
    expect(result.data).to.deep.equal(fixture.data)
    expect(result.latest).to.deep.equal(await helpers.getLatest(network))
  })

  it('subscribe and wait event', async () => {
    let tx = await helpers.createTx()
    let address = tx.outputs[0].script.toAddress('testnet').toString()

    await new Promise((resolve, reject) => {
      blockchain.on(`newTx`, (payload) => {
        try {
          expect(payload).to.deep.equal({txId: tx.id, address: address})
          resolve()
        } catch (err) {
          reject(err)
        }
      })

      blockchain.subscribe({address: address})
      blockchain.sendTx(tx.serialize()).catch(reject)
    })
  })
}
