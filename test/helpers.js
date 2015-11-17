import _ from 'lodash'
import bitcore from 'bitcore-lib'
import request from 'request'
import io from 'socket.io-client'

let TEST_CHANGE = process.env.TEST_CHANGE || '2MvynpNLGuxgHSWd7EdX94ZTcZSZ5iM2Uo1'

/**
 * @return {Promise<bitcore.Transaction>}
 */
export async function createTx () {
  let requestOpts = {
    method: 'GET',
    uri: 'http://devel.hz.udoidio.info:6266/api/v1/preload?name=100k',
    json: true,
    zip: true
  }

  let data = await new Promise((resolve, reject) => {
    request(requestOpts, (err, response) => {
      if (err === null) {
        if (response.statusCode === 200) {
          return resolve(response.body.data)
        }

        err = new Error(`Status code is ${response.statusCode}`)
      }

      reject(err)
    })
  })

  return new bitcore.Transaction()
    .from(data.unspent)
    .change(TEST_CHANGE)
    .sign(data.privateKeyWIF)
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
