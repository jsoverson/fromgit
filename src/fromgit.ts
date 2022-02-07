// Copied from https://github.com/Rich-Harris/degit
// MIT License found https://github.com/Rich-Harris/degit/blob/master/LICENSE.md

import fs from 'fs-extra';
import path from 'path';
import { exec, debug } from './utils.js';
import { prompt, readConfiguration, renderTemplate, rmConfiguration } from './template.js';

export type Cache = Record<string, string>;

export interface Options {
  force?: boolean;
  verbose?: boolean;
  prompt?: boolean;
  branch?: string;
}

function DEFAULT_OPTIONS(): Options {
  return {
    force: false,
    verbose: false,
    prompt: true,
  };
}

export interface RemoveOptions {
  files: string[] | string;
}

export class FromGit {
  src: string;

  proxy?: string;
  opts: Options;

  constructor(src: string, opts: Options = DEFAULT_OPTIONS()) {
    this.src = src;
    this.opts = opts;
    this.proxy = process.env.https_proxy; // TODO allow setting via --proxy
  }

  async clone(dest: string): Promise<void> {
    await this.assertShouldContinue(dest);

    await this._cloneWithGit(dest);

    debug(`Success: cloned ${this.src}#${this.opts.branch}`);
    await this.render(dest);
  }

  async render(dest: string): Promise<void> {
    const templateConfig = await readConfiguration(dest);

    const data = await prompt(templateConfig.variables, this.opts.prompt === false);

    for (const template of templateConfig.templates || []) {
      await renderTemplate(dest, template, data);
    }

    await rmConfiguration(dest);
  }

  private async assertShouldContinue(dir: string): Promise<boolean> {
    let files = [];
    try {
      files = await fs.readdir(dir);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      if (e?.code === 'ENOENT') return true;
      else throw e;
    }

    if (files.length > 0) {
      if (this.opts.force) {
        debug(`Destination directory is not empty. Using options.force, continuing`);
      } else {
        throw new Error(`destination directory is not empty. Use options.force to override.`);
      }
    } else {
      debug('Destination is empty');
    }

    return true;
  }

  async _cloneWithGit(dest: string): Promise<void> {
    if (this.opts.branch !== undefined) {
      await exec(`git clone -b ${this.opts.branch} --depth=1 ${this.src} ${dest}`);
      await exec(`git --git-dir=${dest}/.git --work-tree=${dest} checkout ${this.opts.branch}`);
    } else {
      await exec(`git clone --depth=1 ${this.src} ${dest}`);
    }
    await fs.remove(path.resolve(dest, '.git'));
  }
}
