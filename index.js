const os = require('os')
const fs = require('fs').promises
const { createReadStream } = require('fs')
const path = require('path')
const readline = require('readline')

async function * asyncEnumerate (iterable, start = 0) {
  let counter = start
  for await (const obj of iterable) {
    yield [counter, obj]
    counter++
  }
}

async function * matchFileLines (regex, filepath) {
  const readStream = createReadStream(filepath)
  const lineReader = readline.createInterface(readStream)
  for await (const [lineNumber, line] of asyncEnumerate(lineReader)) {
    const lineMatches = [...line.matchAll(regex)]
    if (!lineMatches.length) continue
    yield ({ filepath, lineNumber, lineMatches })
  }
}

async function * grep (regex, paths, options) {
  for (const filepath of paths) {
    const absPath = path.resolve(filepath)
    const stats = await fs.stat(absPath)
    const isDir = stats.isDirectory()

    if (isDir && !options.recursive) {
      console.log('%s: is a directory.', absPath)
      continue
    }

    if (isDir && options.recursive) {
      const dir = await fs.opendir(absPath)
      const dirPaths = []
      for await (const dirent of dir) {
        dirPaths.push(path.join(dir.path, dirent.name))
      }
      yield * grep(regex, dirPaths, options)
      continue
    }

    yield * matchFileLines(regex, absPath)
  }
}

async function printResults (results) {
  for await (const { filepath, lineNumber, lineMatches } of results) {
    for (const match of lineMatches) {
      const matchPrint = match.input.replace(match, '\u001b[31m$&\u001b[0m')
      process.stdout.write(
        `\u001b[32m${filepath}\u001b[0m\t${lineNumber}:${match.index}\t${matchPrint}${os.EOL}`
      )
    }
  }
}

module.exports = { grep }

if (require.main === module) {
  const yargs = require('yargs')

  yargs // eslint-disable-line no-unused-expressions
    .scriptName('node-grep')
    .option({
      i: {
        alias: 'ignore-case',
        type: 'boolean',
        default: false
      },

      r: {
        alias: 'recursive',
        type: 'boolean',
        default: false
      }
    })
    .command(
      '$0 <regex> <paths...>', 'Search for PATTERNS in each FILE.',
      (yargs) => {
        yargs.positional('regex', {
          type: 'string',
          coerce (value) {
            let flags = 'g'
            if (yargs.argv.i) flags += 'i'
            return new RegExp(value, flags)
          }
        })

        yargs.positional('paths', {
          type: 'string'
        })
      },
      (args) => {
        const grepGen = grep(args.regex, args.paths, args)
        printResults(grepGen)
      }
    )
    .help()
    .argv
}
