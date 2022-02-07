// Copied from https://github.com/Rich-Harris/degit
// MIT License found https://github.com/Rich-Harris/degit/blob/master/LICENSE.md

import fs from 'fs-extra';
import path from 'path';
import EventEmitter from 'events';
import { exec, stashFiles, debug } from './utils.js';
import VError from 'verror';
import { prompt, readConfiguration, renderTemplate } from './template.js';

export type Cache = Record<string, string>;

export function fromgit(src: string, opts?: Options): FromGit {
  return new FromGit(src, opts);
}

export interface GitRef {
  type: string;
  name?: string;
  hash: string;
}

export interface Options {
  cache?: boolean;
  force?: boolean;
  verbose?: boolean;
  prompt?: boolean;
  ref?: string;
}

function DEFAULT_OPTIONS(): Options {
  return {
    cache: false,
    force: false,
    verbose: false,
    prompt: true,
  };
}

export interface Repository {
  url: string;
  ref: string;
}

export interface RemoveOptions {
  files: string[] | string;
}

export interface RenderOptions {
  silent?: boolean;
}

class FromGit extends EventEmitter {
  src: string;

  cache: boolean;
  verbose: boolean;
  force: boolean;
  proxy?: string;
  opts: Options;

  repo: Repository;

  constructor(src: string, opts: Options = DEFAULT_OPTIONS()) {
    super();

    this.src = src;
    this.cache = opts.cache || false;
    this.force = opts.force || false;
    this.verbose = opts.verbose || false;
    this.opts = opts;
    this.proxy = process.env.https_proxy; // TODO allow setting via --proxy

    this.repo = { url: src, ref: opts.ref || 'HEAD' };
  }

  async clone(dest: string) {
    this._checkDirIsEmpty(dest);

    const repo = this.repo;

    await this._cloneWithGit(dest);

    this._info({
      code: 'SUCCESS',
      message: `cloned ${repo.url}#${repo.ref}${dest !== '.' ? ` to ${dest}` : ''}`,
      repo,
      dest,
    });
  }

  async remove(dir: string, dest: string, action: RemoveOptions) {
    let files = action.files;
    if (!Array.isArray(files)) {
      files = [files];
    }
    const promises = files.map(async (file: string) => {
      const filePath = path.resolve(dest, file);
      if (fs.existsSync(filePath)) {
        const isDir = fs.lstatSync(filePath).isDirectory();
        if (isDir) {
          await fs.remove(filePath);
          return file + '/';
        } else {
          fs.unlinkSync(filePath);
          return file;
        }
      } else {
        this._warn({
          code: 'FILE_DOES_NOT_EXIST',
          message: `action wants to remove '${file}' but it does not exist`,
        });
        return null;
      }
    });

    const removedFiles = (await Promise.all(promises)).filter(d => d);

    if (removedFiles.length > 0) {
      this._info({
        code: 'REMOVED',
        message: `removed: ${removedFiles.join(', ')}`,
      });
    }
  }

  async render(dest: string): Promise<void> {
    const templateConfig = await readConfiguration(dest);

    const data = await prompt(templateConfig.variables, !this.opts.prompt);

    for (const template of templateConfig.templates || []) {
      await renderTemplate(dest, template, data);
    }
  }

  _checkDirIsEmpty(dir: string) {
    try {
      const files = fs.readdirSync(dir);
      if (files.length > 0) {
        if (this.force) {
          this._info({
            code: 'DEST_NOT_EMPTY',
            message: `destination directory is not empty. Using options.force, continuing`,
          });
        } else {
          throw new VError(`destination directory is not empty, aborting. Use options.force to override`, {
            code: 'DEST_NOT_EMPTY',
          });
        }
      } else {
        this._verbose({
          code: 'DEST_IS_EMPTY',
          message: `destination directory is empty`,
        });
      }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err;
    }
  }

  _info(info: any) {
    debug(info);
    this.emit('info', info);
  }

  _warn(info: any) {
    debug(info);
    this.emit('warn', info);
  }

  _verbose(info: any) {
    debug(info);
    if (this.verbose) this._info(info);
  }

  async _getHash(repo: Repository, cached: Cache): Promise<string | undefined> {
    try {
      const refs = await fetchRefs(repo);
      if (repo.ref === 'HEAD') {
        return refs.find(ref => ref.type === 'HEAD')?.hash;
      }
      return this._selectRef(refs, repo.ref);
    } catch (err) {
      this._warn(err);

      return this._getHashFromCache(repo, cached);
    }
  }

  _getHashFromCache(repo: Repository, cached: Cache): string | undefined {
    if (repo.ref in cached) {
      const hash = cached[repo.ref];
      this._info({
        code: 'USING_CACHE',
        message: `using cached commit hash ${hash}`,
      });
      return hash;
    }
  }

  _selectRef(refs: GitRef[], selector: string): string | undefined {
    for (const ref of refs) {
      if (ref.name === selector) {
        this._verbose({
          code: 'FOUND_MATCH',
          message: `found matching commit hash: ${ref.hash}`,
        });
        return ref.hash;
      }
    }

    if (selector.length < 8) return undefined;

    for (const ref of refs) {
      if (ref.hash.startsWith(selector)) return ref.hash;
    }
  }

  async _cloneWithGit(dest: string) {
    await exec(`git clone ${this.repo.url} ${dest}`);
    if (this.repo.ref !== 'HEAD') {
      await exec(`git --git-dir=${dest}/.git --work-tree=${dest} checkout ${this.repo.ref}`);
    }
    await fs.remove(path.resolve(dest, '.git'));
  }
}

async function fetchRefs(repo: Repository): Promise<GitRef[]> {
  try {
    const { stdout } = await exec(`git ls-remote ${repo.url}`);

    return stdout
      .split('\n')
      .filter(Boolean)
      .map((row: string) => {
        const [hash, ref] = row.split('\t');

        if (ref === 'HEAD') {
          return {
            type: 'HEAD',
            hash,
          };
        }

        const match = /refs\/(\w+)\/(.+)/.exec(ref);
        if (!match)
          throw new VError(`could not parse ${ref}`, {
            code: 'BAD_REF',
          });

        return {
          type: match[1] === 'heads' ? 'branch' : match[1] === 'refs' ? 'ref' : match[1],
          name: match[2],
          hash,
        };
      });
  } catch (error) {
    throw new VError(`could not fetch remote ${repo.url}`, {
      code: 'COULD_NOT_FETCH',
      url: repo.url,
      original: error,
    });
  }
}
