import _ from 'lodash'
import bitcore from 'bitcore-lib'
import request from 'request'
import io from 'socket.io-client'

let TEST_CHANGE = process.env.TEST_CHANGE || '2MvynpNLGuxgHSWd7EdX94ZTcZSZ5iM2Uo1'
let BLOCKTRAIL_API_KEY = process.env.BLOCKTRAIL_API_KEY || 'cf49415da4382b2a5a03aca8e4079d02321767b3'

/**
 * @return {Promise<bitcore.Transaction>}
 */
export async function createTx () {
  // TODO: create service with preloads

  let privateKey = bitcore.PrivateKey(bitcore.Networks.testnet)
  let requestOpts = {
    method: 'POST',
    uri: 'https://api.blocktrail.com/v1/tBTC/faucet/withdrawl?api_key=' + BLOCKTRAIL_API_KEY,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      address: privateKey.toAddress().toString(),
      amount: 2e4
    })
  }

  let [txId, outIndex] = await new Promise((resolve, reject) => {
    request(requestOpts, (err, response) => {
      if (err === null) {
        if (response.statusCode === 200) {
          let obj = JSON.parse(response.body)
          return resolve([obj.txHash, obj.index])
        }

        err = new Error(`Status code is ${response.statusCode}`)
      }

      reject(err)
    })
  })

  return new bitcore.Transaction()
    .from({
      txId: txId,
      outputIndex: outIndex,
      satoshis: 2e4,
      script: bitcore.Script.buildPublicKeyHashOut(privateKey.toAddress())
    })
    .to(TEST_CHANGE, 1e4)
    .sign(privateKey)
}

/**
 * @param {bitcore.Transaction}
 * @return {Promise}
 */
async function createAndPushUnconfirmedTx (tx) {
  try {
    let tx = await createTx()
    await new Promise((resolve, reject) => {
      let requestOpts = {
        method: 'POST',
        uri: 'https://test-insight.bitpay.com/api/tx/send',
        json: {rawtx: tx.toString()}
      }

      request(requestOpts, (err, response) => {
        if (err === null) {
          if (response.statusCode === 200 && response.body.txid === tx.id) {
            return resolve()
          }

          err = new Error(`Status code is ${response.statusCode}`)
        }

        reject(err)
      })
    })
    console.log('Tx was pushed')
  } catch (err) {
    console.log(`Error on pushing tx: ${err.stack}`)
    createAndPushUnconfirmedTx()
  }
}

let lastUnconfirmedTxIds = []

let socket = io('wss://test-insight.bitpay.com', {forceNew: true})
socket.on('connect_error', () => {
  console.log(`Catch connect error for test-insight.bitpay.com`)
  process.exit(1)
})
socket.on('connect_timeout', () => {
  console.log(`Catch connect timeout for test-insight.bitpay.com`)
  process.exit(1)
})
socket.on('connect', () => {
  socket.emit('subscribe', 'inv')
  console.log('Connected to insight!')
  createAndPushUnconfirmedTx()
})
socket.on('tx', (data) => {
  lastUnconfirmedTxIds.push({txId: data.txid, time: Date.now()})
  console.log('Get new tx from insight!')
})
socket.on('block', () => {
  lastUnconfirmedTxIds = []
  console.log('Get new block from insight!')
  createAndPushUnconfirmedTx()
})

function lastUnconfirmedTxIdsPredicate (o) {
  return Date.now() - o.time > 5000
}

/**
 * @return {Promise<string>}
 */
export async function getUnconfirmedTxId () {
  while (!_.some(lastUnconfirmedTxIds, lastUnconfirmedTxIdsPredicate)) {
    await new Promise((resolve) => { setTimeout(resolve, 10) })
  }

  return _.find(lastUnconfirmedTxIds, lastUnconfirmedTxIdsPredicate).txId
}

export let ZERO_HASH = new Array(65).join('0')
