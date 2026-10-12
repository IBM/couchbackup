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

const dns = require('dns');
const target = process.env.COUCH_URL
  ? new URL(process.env.COUCH_URL).hostname
  : null;
const ip = process.env.TOXIC_DNS_OVERRIDE_IP || '127.0.0.1';

if (target) {
  const origPromisesLookup = dns.promises.lookup;

  dns.promises.lookup = function(hostname, options) {
    if (typeof options === 'number') { options = { family: options }; }
    if (hostname === target) {
      return Promise.resolve(
        options && options.all
          ? [{ address: ip, family: 4 }]
          : { address: ip, family: 4 }
      );
    }
    return origPromisesLookup.call(dns.promises, hostname, options);
  };

  dns.lookup = function(hostname, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    if (typeof options === 'number') { options = { family: options }; }
    dns.promises.lookup(hostname, options)
      .then(result =>
        options && options.all
          ? callback(null, result)
          : callback(null, result.address, result.family))
      .catch(callback);
  };
}
