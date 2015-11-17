import runImplementationTest from './implementation'

runImplementationTest({
  describe: describe,
  clsName: 'Chromanode',
  clsOpts: {url: process.env.CHROMANODE_URL}
})
