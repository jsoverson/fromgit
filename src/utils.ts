import fs from 'fs-extra';
import path from 'path';
import https, { RequestOptions } from 'https';
import child_process from 'child_process';
import URL from 'url';
import createHttpsProxyAgent from 'https-proxy-agent';
import DEBUG from 'debug';
export const debug = DEBUG('fromgit');

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
