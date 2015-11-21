import { writeFileSync } from 'fs'
import _ from 'lodash'
import ProgressBar from 'progress'
import bitcore from 'bitcore-lib'

import Chromanode from '../src/network/chromanode'
import { sha256x2, hashEncode } from '../src/util/crypto'

// network
let networkName = process.env.NETWORK || 'livenet'
let networkObj = bitcore.Networks.get(networkName)
if (networkObj === undefined || networkObj.name !== networkName) {
  throw new Error(`Network ${networkName} not allowed.`)
}

// output
let output = process.env.OUTPUT
if (/\.js$/.test(output) === false) {
  throw new Error('Output file must have js extension')
}
writeFileSync(output, '')

// chromanode url
let URL = process.env.CHROMANODE_URL || Chromanode.getSources(networkName)[0]
console.log(`URL: ${URL}`)

// start
let network = new Chromanode({url: URL, concurrency: 3})
network.on('error', err => console.error(err.stack))
network.on('connect', async () => {
  console.log('Connected!')

  try {
    let latest = await network.getHeader('latest')
    let chunksTotal = Math.floor(latest.height / 2016)

    let bar = new ProgressBar(
      'Progress: :percent (:current/:total), :elapseds elapsed, eta :etas',
      {total: chunksTotal})

    let data = {lastBlockHash: null}
    data.hashes = await* _.range(chunksTotal).map(async (chunkIndex) => {
      let headers = await network.getHeaders(chunkIndex === 0 ? null : (chunkIndex * 2016 - 1))

      if (chunkIndex + 1 === chunksTotal) {
        data.lastBlockHash = hashEncode(sha256x2(new Buffer(headers.slice(-160), 'hex')))
      }

      bar.tick()
      return sha256x2(new Buffer(headers, 'hex')).toString('hex')
    })

    network.disconnect()

    writeFileSync(output, `// Network: ${networkName}
// ${new Date().toUTCString()}
module.exports = ${JSON.stringify(data, null, 2).replace(/"/g, '\'')}
`)

    process.exit(0)
  } catch (err) {
    console.error(err.stack)
    process.exit(1)
  }
})
network.connect()
