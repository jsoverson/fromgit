import fs from 'fs-extra';
import path from 'path';
import { homedir, tmpdir } from 'os';
import https, { RequestOptions } from 'https';
import child_process from 'child_process';
import URL from 'url';
import createHttpsProxyAgent from 'https-proxy-agent';
import DEBUG from 'debug';
export const debug = DEBUG('fromgit');

const homeOrTmp = homedir() || tmpdir();

const TEMPLATE_NAME = '.template';
const BASEDIR = '.fromgit';

const tmpDirName = 'tmp';

export interface IO {
  stdout: string;
  stderr: string;
}

export function exec(command: string): Promise<IO> {
  return new Promise((resolve, reject) => {
    debug(`Executing %o`, command);
    child_process.exec(command, (err, stdout, stderr) => {
      if (err) {
        reject(err);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

export async function mkdirp(dir: string): Promise<void> {
  const parent = path.dirname(dir);
  if (parent === dir) return;

  mkdirp(parent);

  try {
    await fs.mkdir(dir);
  } catch (err: any) {
    if (err?.code !== 'EEXIST') throw err;
  }
}

export function fetch(url: string, dest: string, proxy?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let options: RequestOptions | string = url;

    if (proxy) {
      const parsedUrl = URL.parse(url);
      options = {
        hostname: parsedUrl.host,
        path: parsedUrl.path,
        agent: createHttpsProxyAgent(proxy),
      } as RequestOptions;
    }

    https
      .get(options, response => {
        if (!response) {
          reject({ code: -1, message: 'No response received' });
          return;
        }
        const code = response.statusCode || -1;
        if (code >= 400) {
          reject({ code, message: response.statusMessage });
        } else if (code >= 300) {
          if (response.headers.location) {
            fetch(response.headers.location, dest, proxy).then(resolve, reject);
          } else {
            reject({ code: -2, message: `Received redirect with no location header.` });
          }
        } else {
          response
            .pipe(fs.createWriteStream(dest))
            .on('finish', () => resolve())
            .on('error', reject);
        }
      })
      .on('error', reject);
  });
}

export async function stashFiles(dir: string, dest: string): Promise<void> {
  const tmpDir = path.join(dir, tmpDirName);
  await fs.remove(tmpDir);
  mkdirp(tmpDir);
  const files = await fs.readdir(dest);
  const promises = files.map(async file => {
    const filePath = path.join(dest, file);
    const targetPath = path.join(tmpDir, file);
    const isDir = (await fs.lstat(filePath)).isDirectory();
    if (isDir) {
      await fs.copy(filePath, targetPath);
      await fs.remove(filePath);
    } else {
      await fs.copy(filePath, targetPath);
      await fs.unlink(filePath);
    }
  });
  await Promise.all(promises);
}

export async function unstashFiles(dir: string, dest: string): Promise<void> {
  const tmpDir = path.join(dir, tmpDirName);
  const files = await fs.readdir(tmpDir);

  const promises = files.map(async filename => {
    const tmpFile = path.join(tmpDir, filename);
    const targetPath = path.join(dest, filename);
    const isDir = fs.lstatSync(tmpFile).isDirectory();
    if (isDir) {
      await fs.copy(tmpFile, targetPath);
      await fs.remove(tmpFile);
    } else {
      if (filename !== TEMPLATE_NAME) {
        fs.copyFileSync(tmpFile, targetPath);
      }
      fs.unlinkSync(tmpFile);
    }
  });
  await Promise.all(promises);
  await fs.remove(tmpDir);
}

export const base = path.join(homeOrTmp, BASEDIR);
