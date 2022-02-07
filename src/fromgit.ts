// Copied from https://github.com/Rich-Harris/degit
// MIT License found https://github.com/Rich-Harris/degit/blob/master/LICENSE.md

import fs from 'fs-extra';
import path from 'path';
import tar from 'tar';
import EventEmitter from 'events';
import chalk from 'chalk';
import { exec, fetch, mkdirp, tryRequire, stashFiles, base, debug } from './utils.js';
import VError from 'verror';

const validModes = new Set(['tar', 'git']);

export type Cache = Record<string, string>;

export function fromgit(src: string, opts?: Options): FromGit {
  return new FromGit(src, opts);
}

export type Mode = 'tar' | 'git';

export interface GitRef {
  type: string;
  name?: string;
  hash: string;
}

export interface Options {
  cache?: boolean;
  force?: boolean;
  verbose?: boolean;
  mode: Mode;
  // proxy: string;
}

function DEFAULT_OPTIONS(): Options {
  return {
    cache: false,
    force: false,
    verbose: false,
    mode: 'git',
  };
}

export interface Repository {
  mode: Mode;
  site: string;
  user: string;
  name: string;
  subdir: string;
  ssh: string;
  url: string;
  ref: string;
}

export type DirectiveClone = (dir: string, dest: string, action: CloneOptions) => Promise<void>;
export interface CloneOptions {
  cache?: boolean;
  force?: boolean;
  verbose?: boolean;
  mode: Mode;
  src: string;
}
export type DirectiveRemove = (dir: string, dest: string, action: RemoveOptions) => Promise<void>;
export interface RemoveOptions {
  files: string[] | string;
}
export interface DirectiveActions {
  clone: DirectiveClone;
  remove: DirectiveRemove;
}

class FromGit extends EventEmitter {
  src: string;

  cache: boolean;
  verbose: boolean;
  force: boolean;
  proxy?: string;

  repo: Repository;

  private _hasStashed: boolean;
  private directiveActions: DirectiveActions;

  mode: Mode;

  constructor(src: string, opts: Options = DEFAULT_OPTIONS()) {
    super();

    this.src = src;
    this.cache = opts.cache || false;
    this.force = opts.force || false;
    this.verbose = opts.verbose || false;
    this.proxy = process.env.https_proxy; // TODO allow setting via --proxy

    this.repo = parse(src);
    this.mode = opts.mode || this.repo.mode;

    if (!validModes.has(this.mode)) {
      throw new Error(`Valid modes are ${Array.from(validModes).join(', ')}`);
    }

    this._hasStashed = false;

    this.directiveActions = {
      clone: async (dir, dest, action) => {
        if (this._hasStashed === false) {
          stashFiles(dir, dest);
          this._hasStashed = true;
        }
        const opts = Object.assign(
          { force: true, mode: 'git' },
          { cache: action.cache, verbose: action.verbose },
        ) as CloneOptions;
        const d = fromgit(action.src, opts);

        d.on('info', event => {
          console.error(chalk.cyan(`> ${event.message.replace('options.', '--')}`));
        });

        d.on('warn', event => {
          console.error(chalk.magenta(`! ${event.message.replace('options.', '--')}`));
        });

        await d.clone(dest).catch(err => {
          console.error(chalk.red(`! ${err.message}`));
          process.exit(1);
        });
      },
      remove: this.remove.bind(this),
    };
  }

  async clone(dest: string) {
    this._checkDirIsEmpty(dest);

    const { repo } = this;

    const dir = path.join(base, repo.site, repo.user, repo.name);

    if (this.mode === 'tar') {
      await this._cloneWithTar(dir, dest);
    } else {
      await this._cloneWithGit(dir, dest);
    }

    this._info({
      code: 'SUCCESS',
      message: `cloned ${chalk.bold(repo.user + '/' + repo.name)}#${chalk.bold(repo.ref)}${
        dest !== '.' ? ` to ${dest}` : ''
      }`,
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
          message: `action wants to remove ${chalk.bold(file)} but it does not exist`,
        });
        return null;
      }
    });

    const removedFiles = (await Promise.all(promises)).filter(d => d);

    if (removedFiles.length > 0) {
      this._info({
        code: 'REMOVED',
        message: `removed: ${chalk.bold(removedFiles.map(d => chalk.bold(d)).join(', '))}`,
      });
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
    this.emit('info', info);
  }

  _warn(info: any) {
    this.emit('warn', info);
  }

  _verbose(info: any) {
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

  async _cloneWithTar(dir: string, dest: string) {
    const { repo } = this;

    const cached = (tryRequire(path.join(dir, 'map.json')) as Cache) || {};

    const hash = this.cache ? this._getHashFromCache(repo, cached) : await this._getHash(repo, cached);

    const subdir = repo.subdir ? `${repo.name}-${hash}${repo.subdir}` : '';

    if (!hash) {
      // TODO 'did you mean...?'
      throw new VError(`could not find commit hash for ${repo.ref}`, {
        code: 'MISSING_REF',
        ref: repo.ref,
      });
    }

    const file = `${dir}/${hash}.tar.gz`;
    const url =
      repo.site === 'gitlab'
        ? `${repo.url}/repository/archive.tar.gz?ref=${hash}`
        : repo.site === 'bitbucket'
        ? `${repo.url}/get/${hash}.tar.gz`
        : `${repo.url}/archive/${hash}.tar.gz`;

    try {
      if (!this.cache) {
        try {
          fs.statSync(file);
          this._verbose({
            code: 'FILE_EXISTS',
            message: `${file} already exists locally`,
          });
        } catch (err) {
          mkdirp(path.dirname(file));

          if (this.proxy) {
            this._verbose({
              code: 'PROXY',
              message: `using proxy ${this.proxy}`,
            });
          }

          this._verbose({
            code: 'DOWNLOADING',
            message: `downloading ${url} to ${file}`,
          });

          await fetch(url, file, this.proxy);
        }
      }
    } catch (err) {
      throw new VError(`could not download ${url}`, {
        code: 'COULD_NOT_DOWNLOAD',
        url,
        original: err,
      });
    }

    updateCache(dir, repo, hash, cached);

    this._verbose({
      code: 'EXTRACTING',
      message: `extracting ${subdir ? repo.subdir + ' from ' : ''}${file} to ${dest}`,
    });

    mkdirp(dest);
    await untar(file, dest, subdir);
  }

  async _cloneWithGit(dir: string, dest: string) {
    await exec(`git clone ${this.repo.ssh} ${dest}`);
    await exec(`rm -rf ${path.resolve(dest, '.git')}`);
  }
}

const supported = new Set(['github', 'gitlab', 'bitbucket', 'git.sr.ht']);

function parse(src: string): Repository {
  const match =
    /^(?:(?:https:\/\/)?([^:/]+\.[^:/]+)\/|git@([^:/]+)[:/]|([^/]+):)?([^/\s]+)\/([^/\s#]+)(?:((?:\/[^/\s#]+)+))?(?:\/)?(?:#(.+))?/.exec(
      src,
    );
  if (!match) {
    throw new VError(`could not parse ${src}`, {
      code: 'BAD_SRC',
    });
  }

  const site = (match[1] || match[2] || match[3] || 'github').replace(/\.(com|org)$/, '');
  if (!supported.has(site)) {
    throw new VError(`fromgit supports GitHub, GitLab, Sourcehut and BitBucket`, {
      code: 'UNSUPPORTED_HOST',
    });
  }

  const user = match[4];
  const name = match[5].replace(/\.git$/, '');
  const subdir = match[6];
  const ref = match[7] || 'HEAD';

  const domain = `${site}.${site === 'bitbucket' ? 'org' : site === 'git.sr.ht' ? '' : 'com'}`;
  const url = `https://${domain}/${user}/${name}`;
  const ssh = `git@${domain}:${user}/${name}`;

  const mode = supported.has(site) ? 'tar' : 'git';

  return { site, user, name, ref, url, ssh, subdir, mode };
}

async function untar(file: string, dest: string, subdir = '') {
  return tar.extract(
    {
      file,
      strip: subdir ? subdir.split('/').length : 1,
      C: dest,
    },
    subdir ? [subdir] : [],
  );
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

function updateCache(dir: string, repo: Repository, hash: string, cached: Cache) {
  // update access logs
  const logs = (tryRequire(path.join(dir, 'access.json')) as Record<string, string>) || {};
  logs[repo.ref] = new Date().toISOString();
  fs.writeFileSync(path.join(dir, 'access.json'), JSON.stringify(logs, null, '  '));

  if (cached[repo.ref] === hash) return;

  const oldHash = cached[repo.ref];
  if (oldHash) {
    let used = false;
    for (const key in cached) {
      if (cached[key] === hash) {
        used = true;
        break;
      }
    }

    if (!used) {
      // we no longer need this tar file
      try {
        fs.unlinkSync(path.join(dir, `${oldHash}.tar.gz`));
      } catch (err) {
        // ignore
      }
    }
  }

  cached[repo.ref] = hash;
  fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify(cached, null, '  '));
}
