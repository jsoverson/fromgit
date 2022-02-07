#!/usr/bin/env node

import { debug } from './utils.js';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';

import { definition as newCmd } from './commands/clone.js';

async function main() {
  debug('Processing arguments');
  await yargs(hideBin(process.argv))
    .command(newCmd)
    // .demandCommand(1, 'You need to specify a command')
    .strictCommands()
    .help('h')
    .alias('h', 'help').argv;
  debug('Done processing command');
}

main()
  .then(() => {
    debug('Done');
  })
  .catch(e => {
    debug('Error %o', e);
    console.error(`Error: ${e?.message || e}`);
    process.exit(1);
  });
