// Copyright © 2023 IBM Corp. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/* global */
'use strict';

const { fork, spawn } = require('node:child_process');
const { once } = require('node:events');
const { Duplex } = require('node:stream');
const debug = require('debug');
const logProcess = debug('couchbackup:test:process');

class TestProcess {
  constructor(cmd, args) {
    this.cmd = cmd;
    const childProcessOptions = { stdio: ['pipe', 'pipe', 'pipe'] };
    if (cmd.endsWith('.js')) {
      childProcessOptions.stdio.push('ipc');
      logProcess(`Forking Node process for ${cmd}`);
      this.childProcess = fork(cmd, args, childProcessOptions);
    } else {
      logProcess(`Spawning process for ${cmd}`);
      this.childProcess = spawn(cmd, args, childProcessOptions);
    }

    this.childProcessPromise = once(this.childProcess, 'close').then(() => {
      const code = this.childProcess.exitCode;
      const signal = this.childProcess.signalCode;
      logProcess(`Test process ${cmd} closed with code ${code} and signal ${signal}`);
      if (code === 0) {
        logProcess(`Resolving process promise for ${cmd}`);
        return Promise.resolve(code);
      } else {
        const e = new Error(`Test child process ${cmd} exited with code ${code} and ${signal}. This may be normal for error case testing.`);
        e.code = code;
        e.signal = signal;
        logProcess(`Will reject process promise for ${cmd} with ${e}`);
        return Promise.reject(e);
      }
    });
    // Make sure we get error output on the main process error log too
    this.childProcess.stderr.pipe(process.stderr);
    this.stream = Duplex.from({ writable: this.childProcess.stdin, readable: this.childProcess.stdout });
  }
}

module.exports = {
  TestProcess,
  cliBackup: function(databaseName, params = {}) {
    const args = ['--db', databaseName];
    if (params.opts) {
      if (params.opts.mode) {
        args.push('--mode');
        args.push(params.opts.mode);
      }
      if (params.opts.output) {
        args.push('--output');
        args.push(params.opts.output);
      }
      if (params.opts.log) {
        args.push('--log');
        args.push(params.opts.log);
      }
      if (params.opts.resume) {
        args.push('--resume');
        args.push(params.opts.resume);
      }
      if (params.opts.bufferSize) {
        args.push('--buffer-size');
        args.push(params.opts.bufferSize);
      }
      if (params.opts.iamApiKey) {
        args.push('--iam-api-key');
        args.push(params.opts.iamApiKey);
      }
    }
    return new TestProcess('./bin/couchbackup.bin.js', args);
  },
  cliRestore: function(databaseName, params) {
    const args = ['--db', databaseName];
    if (params.opts) {
      if (params.opts.bufferSize) {
        args.push('--buffer-size');
        args.push(params.opts.bufferSize);
      }
      if (params.opts.parallelism) {
        args.push('--parallelism');
        args.push(params.opts.parallelism);
      }
      if (params.opts.requestTimeout) {
        args.push('--request-timeout');
        args.push(params.opts.requestTimeout);
      }
      if (params.opts.iamApiKey) {
        args.push('--iam-api-key');
        args.push(params.opts.iamApiKey);
      }
    }
    return new TestProcess('./bin/couchrestore.bin.js', args);
  },
  cliGzip: function() {
    return new TestProcess('gzip', []);
  },
  cliGunzip: function() {
    return new TestProcess('gunzip', []);
  },
  cliEncrypt: function() {
    return new TestProcess('openssl', ['aes-128-cbc', '-pass', 'pass:12345']);
  },
  cliDecrypt: function() {
    return new TestProcess('openssl', ['aes-128-cbc', '-d', '-pass', 'pass:12345']);
  }
};
