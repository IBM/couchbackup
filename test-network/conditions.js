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

const assert = require('assert');
const axios = require('axios');
const net = require('node:net');
const { once } = require('node:events');
const { setInterval } = require('node:timers/promises');

// Import the common hooks
require('../test/hooks.js');

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

const proxyName = 'couchdb';
const toxicProxyName = proxyName + '_toxic';
const toxicProxyURL = process.env.PROXY_URL + '/proxies/' + toxicProxyName;
const upstreamURL = new URL(process.env.COUCH_UPSTREAM_URL);
const upstream = upstreamURL.hostname + ':' + (upstreamURL.port || (upstreamURL.protocol === 'https:' ? '443' : '80'));

const waitForSocket = async (port, interval = 1000, maxWait = 8000) => {
  const ac = new AbortController();
  let attempts = 0;
  for await (const maxAttempts of setInterval(interval, Math.trunc(maxWait / interval), { signal: ac.signal })) {
    const socket = new net.Socket();
    socket.connect({ port });
    try {
      await once(socket, 'connect', { signal: ac.signal });
      ac.abort();
      socket.end();
      return;
    } catch {
      if (++attempts >= maxAttempts) {
        throw new Error(`Port ${port} not reachable after ${maxAttempts} attempts`);
      }
    }
  }
};

describe('unreliable network tests', function() {
  before('add proxies', async function() {
    // wait up to 10 sec for both proxies to allocate ports.
    this.timeout(10000);

    // We create 2 proxies on different ports
    // 1. will use toxics (COUCH_URL)
    // 2. will only forward with no toxics (COUCH_BACKEND_URL)
    const toxiProxy = [
      {
        name: toxicProxyName,
        listen: '127.0.0.1:8888',
        upstream,
        enabled: true
      },
      {
        name: proxyName,
        listen: '127.0.0.1:8889',
        upstream,
        enabled: true
      },
    ];
    const resp = await axios.post(process.env.PROXY_URL + '/populate', toxiProxy);
    assert.equal(resp.status, 201, 'Should create proxies.');
    await waitForSocket(8888);
    await waitForSocket(8889);
  });

  after('remove proxies', async function() {
    const resetResp = await axios.post(process.env.PROXY_URL + '/reset');
    assert.equal(resetResp.status, 204, 'Should reset proxies.');
    const deleteToxicProxyResp = await axios.delete(toxicProxyURL);
    assert.equal(deleteToxicProxyResp.status, 204, `Should remove proxy "${toxicProxyName}".`);
    const deleteProxyResp = await axios.delete(process.env.PROXY_URL + '/proxies/' + proxyName);
    assert.equal(deleteProxyResp.status, 204, `Should remove proxy "${proxyName}".`);
  });

  poisons.forEach(function(poison) {
    describe(`tests using poison '${poison.name}'`, function() {
      before(`add toxic ${poison.name}`, async function() {
        if (poison.name === 'normal') return;
        const resp = await axios.post(toxicProxyURL + '/toxics', poison);
        assert.equal(resp.status, 200, `Should create toxic ${poison.name}`);
      });

      after(`remove toxic ${poison.name}`, async function() {
        if (poison.name === 'normal') return;
        const resp = await axios.delete(toxicProxyURL + '/toxics/' + poison.name);
        assert.equal(resp.status, 204, `Should remove toxic ${poison.name}`);
      });

      delete require.cache[require.resolve('../test/ci_e2e.js')];
      require('../test/ci_e2e.js');
    });
  });
});
