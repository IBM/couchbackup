// Copyright © 2017 IBM Corp. All rights reserved.
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

/* eslint space-before-function-paren: ["error", { "anonymous": "ignore" }] */
/* global after before describe */
'use strict';

const assert = require('assert');
const axios = require('axios');
const net = require('node:net');
const url = require('url');

// Import the common hooks
const hooks = require('../test/hooks.js');
const client = hooks.sharedClient;

const poisons = [
  {
    name: 'normal'
  },
  {
    name: 'bandwidth-limit-upstream',
    type: 'bandwidth',
    stream: 'upstream', // client -> server
    attributes: { rate: 512 } // 0.5 MB/s
  },
  {
    name: 'bandwidth-limit-downstream',
    type: 'bandwidth',
    stream: 'downstream', // client <- server
    attributes: { rate: 512 }
  },
  {
    name: 'latency',
    type: 'latency',
    attributes: { latency: 875, jitter: 625 }, // max: 1500, mix: 250
    toxicity: 0.6 // probability: 60%
  },
  {
    name: 'slow-read',
    type: 'slicer',
    attributes: { average_size: 256, delay: 100 },
    toxicity: 0.1 // probability: 10%
  }
];

const proxyURL = process.env.PROXY_URL + '/proxies/couchdb';

describe('unreliable network tests', function () {
  before('add proxy', async function () {
    const backendUrl = new url.URL(process.env.COUCH_BACKEND_URL);
    const proxy = {
      name: 'couchdb',
      listen: '[::]:8888',
      upstream: `${backendUrl.hostname}:${backendUrl.port}`,
      enabled: true
    };
    const resp = await axios.post(process.env.PROXY_URL + '/proxies', proxy);
    assert.equal(resp.status, 201, 'Should create proxy "couchdb".');

    // wait up to 5 sec for proxy port to be allocated, retrying every second.
    this.timeout(5000);
    await new Promise((resolve) => {
      const socket = new net.Socket();
      const connect = () => socket.connect({ port: 8888 });
      let reConnect = false;

      socket.on('connect', () => {
        if (reConnect !== false) {
          clearInterval(reConnect);
          reConnect = false;
        }
        socket.end();
        client.setServiceUrl(process.env.COUCH_URL);
        resolve(socket);
      });

      socket.on('error', () => {
        if (reConnect === false) {
          reConnect = setInterval(connect, 1000);
        }
      });

      connect();
    });
  });

  after('remove proxy', async function () {
    const resp = await axios.delete(proxyURL);
    assert.equal(resp.status, 204, 'Should remove toxic "couchdb".');
  });

  poisons.forEach(function (poison) {
    describe(`tests using poison '${poison.name}'`, function () {
      before('add toxic', async function () {
        if (poison.name === 'normal') return;
        const resp = await axios.post(proxyURL + '/toxics', poison);
        assert.equal(resp.status, 200, `Should create toxic ${poison.name}`);
      });

      after('remove toxic', async function () {
        if (poison.name === 'normal') return;
        const resp = await axios.delete(proxyURL + '/toxics/' + poison.name);
        assert.equal(resp.status, 204, `Should remove toxic ${poison.name}`);
      });

      delete require.cache[require.resolve('../test/ci_e2e.js')];
      require('../test/ci_e2e.js');
    });
  });
});
