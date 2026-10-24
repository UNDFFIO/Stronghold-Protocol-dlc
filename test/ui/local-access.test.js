import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocalAccess } from '../../public/js/ui/gameLogic/localAccess.js';

test('debug UI accepts loopback, private and link-local access addresses', () => {
  for (const host of ['localhost', 'LOCALHOST.', 'game.localhost', 'game.local', '127.0.0.1',
    '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.2', '169.254.1.2',
    '[::1]', '::1', '[fc00::1]', '[fd12:3456::1]', '[fe80::1]', '[febf::1]']) {
    assert.equal(isLocalAccess(host), true, host);
  }
});

test('debug UI rejects public addresses, domains and malformed addresses', () => {
  for (const host of ['', 'example.com', 'localhost.example.com', 'game.local.example.com',
    '8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.1.1', '10.0.0.999',
    '[2001:db8::1]', '[fec0::1]', 'fc00.example.com']) {
    assert.equal(isLocalAccess(host), false, host);
  }
});
