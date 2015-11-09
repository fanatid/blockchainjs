import { randomBytes as getRandomBytes } from 'crypto'

import runImplementationTest from './implementation'

runImplementationTest({
  describe: describe,
  clsName: 'WebSQL',
  clsOpts: {
    dbName: getRandomBytes(10).toString('hex')
  },
  skipFullMode: false
})
