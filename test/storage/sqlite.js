require('./implementation')({
  describe: describe,
  clsName: 'SQLite',
  clsOpts: {
    filename: ':memory:'
  },
  skipFullMode: false
})
