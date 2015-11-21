import { expect } from 'chai'
import { randomBytes as getRandomBytes } from 'crypto'

import blockchainjs from '../../src'
import { hashEncode, sha256x2 } from '../../src/util/crypto'
import fixtures from '../fixtures/network.json'

import helpers from '../helpers'

describe('blockchain.Naive', function () {
  this.timeout(60 * 1000)

  let network
  let blockchain

  beforeEach(() => {
    let url = process.env.CHROMANODE_URL || blockchainjs.network.Chromanode.getSources('testnet')[0]
    network = new blockchainjs.network.Chromanode({url: url})
    blockchain = new blockchainjs.blockchain.Naive(network)

    return new Promise((resolve, reject) => {
      network.once('error', reject)
      network.once('connect', resolve)
      network.connect()
    })
  })

  afterEach(() => {
    return new Promise((resolve, reject) => {
      network.once('error', (err) => {
        if (!(err instanceof blockchainjs.errors.SubscribeError)) {
          reject(err)
        }
      })
      network.on('newReadyState', (newState) => {
        if (newState === network.READY_STATE.CLOSED) {
          network.removeAllListeners()
          blockchain.removeAllListeners()

          network = blockchain = null

          resolve()
        }
      })
      network.disconnect()
    })
  })

  it('inherits Blockchain', () => {
    expect(blockchain).to.be.instanceof(blockchainjs.blockchain.Naive)
    expect(blockchain).to.be.instanceof(blockchainjs.blockchain.Blockchain)
  })

  it('network property', () => {
    expect(blockchain.network).to.equal(network)
  })

  it('latest', () => {
    let expected = {hash: helpers.ZERO_HASH, height: -1}
    expect(blockchain.latest).to.deep.equal(expected)
    return new Promise((resolve, reject) => {
      blockchain.once('error', reject)
      blockchain.once('newBlock', () => {
        try {
          expect(blockchain.latest).to.be.an('object')
          expect(blockchain.latest.hash).to.be.a('string').and.to.have.length(64)
          expect(blockchain.latest.height).to.at.least(600000)
          resolve()
        } catch (err) {
          reject(err)
        }
      })
    })
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
    expect(result.latest).to.be.an('object')
    expect(result.latest.height).to.be.at.least(600000)
    expect(result.latest.hash).to.have.length(64)
  })

  it('addressesQuery (unspent)', async () => {
    let fixture = fixtures.unspent[0]
    let result = await blockchain.addressesQuery(fixture.addresses, fixture.opts)
    expect(result).to.be.an('object')
    expect(result.data).to.deep.equal(fixture.data)
    expect(result.latest).to.be.an('object')
    expect(result.latest.height).to.be.at.least(600000)
    expect(result.latest.hash).to.have.length(64)
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
})
