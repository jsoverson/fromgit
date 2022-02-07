// Copied from https://github.com/Rich-Harris/degit
// MIT License found https://github.com/Rich-Harris/degit/blob/master/LICENSE.md

import fs from 'fs-extra';
import path from 'path';
import EventEmitter from 'events';
import { exec, debug } from './utils.js';
import VError from 'verror';
import { prompt, readConfiguration, renderTemplate, rmConfiguration } from './template.js';

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
  force?: boolean;
  verbose?: boolean;
  prompt?: boolean;
  ref?: string;
}

function DEFAULT_OPTIONS(): Options {
  return {
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

  proxy?: string;
  opts: Options;

  constructor(src: string, opts: Options = DEFAULT_OPTIONS()) {
    super();

    this.src = src;
    this.opts = opts;
    this.opts.ref ||= 'HEAD';
    this.proxy = process.env.https_proxy; // TODO allow setting via --proxy
  }

  async clone(dest: string) {
    if (!(await this.shouldContinue(dest))) return;

    await this._cloneWithGit(dest);

    this._info({
      code: 'SUCCESS',
      message: `cloned ${this.src}#${this.opts.ref}${dest !== '.' ? ` to ${dest}` : ''}`,
      dest,
    });
    await this.render(dest);
  }

  async remove(dir: string, dest: string, action: RemoveOptions) {
    let files = action.files;
    if (!Array.isArray(files)) {
      files = [files];
    }
    const promises = files.map(async (file: string) => {
      const filePath = path.resolve(dest, file);
      if (fs.existsSync(filePath)) {
        const isDir = (await fs.lstat(filePath)).isDirectory();
        if (isDir) {
          await fs.remove(filePath);
          return file + '/';
        } else {
          await fs.unlink(filePath);
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

    const data = await prompt(templateConfig.variables, this.opts.prompt === false);

    for (const template of templateConfig.templates || []) {
      await renderTemplate(dest, template, data);
    }

    await rmConfiguration(dest);
  }

  private async shouldContinue(dir: string): Promise<boolean> {
    let files = [];
    try {
      files = await fs.readdir(dir);
    } catch (e: any) {
      if (e?.code === 'ENOENT') return true;
    }

    if (files.length > 0) {
      if (this.opts.force) {
        this._info({
          code: 'DEST_NOT_EMPTY',
          message: `destination directory is not empty. Using options.force, continuing`,
        });
      } else {
        this._info({
          code: 'DEST_NOT_EMPTY',
          message: `destination directory is not empty. Use options.force to override. Aborting`,
        });
        return false;
      }
    }
    this._verbose({
      code: 'DEST_IS_EMPTY',
      message: `destination directory is empty`,
    });
    return true;
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
    if (this.opts.verbose) this._info(info);
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
    await exec(`git clone ${this.src} ${dest}`);
    if (this.opts.ref !== 'HEAD') {
      await exec(`git --git-dir=${dest}/.git --work-tree=${dest} checkout ${this.opts.ref}`);
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
