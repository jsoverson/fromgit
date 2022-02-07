#!/usr/bin/env node

import { debug } from './utils.js';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';

import { definition as newCmd } from './commands/clone.js';

debug('Starting');
try {
  yargs(hideBin(process.argv))
    .command(newCmd)
    .demandCommand(1, 'You need to specify a command')
    .strictCommands()
    .help('h')
    .alias('h', 'help').argv;
  debug('Done processing command');
} catch (e) {
  debug('Error %o', e);
  console.error(`Error: ${e}`);
  process.exit(1);
}
debug('Done with main');
