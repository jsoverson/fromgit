#!/usr/bin/env node

import yargs, { Arguments, Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';

import { fromgit } from './index.js';
import { debug } from './utils.js';

interface Options {
  url: string;
  directory: string;
  branch?: string;
}

async function main() {
  debug('Processing arguments');
  await yargs(hideBin(process.argv))
    .command({
      command: `$0 <url> <directory> [options]`,
      describe: 'Start a new project from the passed repository',
      builder: (yargs: Argv): Argv<Options> => {
        return yargs
          .positional('url', {
            demandOption: true,
            type: 'string',
            description: 'The git url to clone',
          })
          .positional('directory', {
            demandOption: true,
            type: 'string',
            description: 'The directory to clone into',
          })
          .options({
            path: { type: 'string', description: 'Sub-directory of the git repo to check out' },
            branch: { type: 'string', description: 'Reference or branch to check out' },
            silent: { type: 'boolean', description: 'Enable to disable interactive prompt for project variables' },
          })
          .example(
            `$0 https://github.com/chromaui/intro-storybook-vue-template .`,
            'Clones intro-storybook-vue-template into the current directory',
          );
      },
      async handler(args: Arguments<Options>): Promise<void> {
        debug('Processing clone command');
        const prompt = !args.silent;
        await fromgit(args.url, args.directory, { branch: args.branch, prompt });
      },
    })
    .fail(false)
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
    debug('%o', e);
    console.error(`Error: ${e?.message || e}`);
    process.exit(1);
  });
