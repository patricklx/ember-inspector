/* eslint-disable */
'use strict';

const getChannelURL = require('ember-source-channel-url');

module.exports = function () {
  return Promise.all([
    getChannelURL('release'),
    getChannelURL('beta'),
    getChannelURL('canary'),
  ]).then((urls) => {
    return {
      usePnpm: true,
      scenarios: [
        {
          name: 'ember-lts-3.16',
          npm: {
            devDependencies: {
              'ember-source': '~3.16.0',
              'ember-qunit': '^5.1.5',
            },
          },
        },
        {
          name: 'ember-lts-3.20',
          npm: {
            devDependencies: {
              'ember-source': '~3.20.5',
              'ember-qunit': '^5.1.5',
            },
          },
        },
        {
          name: 'ember-lts-3.24',
          npm: {
            devDependencies: {
              'ember-source': '~3.24.0',
              'ember-qunit': '^5.1.5',
            },
          },
        },
        {
          name: 'ember-lts-3.28',
          npm: {
            devDependencies: {
              'ember-source': '~3.28.0',
            },
          },
        },
        {
          name: 'ember-release',
          npm: {
            devDependencies: {
              'ember-source': urls[0],
              'ember-qunit': '^7.0.0',
              '@ember/test-helpers': '^3.0.3'
            },
          },
        },
        {
          name: 'ember-beta',
          npm: {
            devDependencies: {
              'ember-source': urls[1],
              'ember-qunit': '^7.0.0',
              '@ember/test-helpers': '^3.0.3'
            },
          },
        },
        {
          name: 'ember-canary',
          npm: {
            devDependencies: {
              'ember-source': urls[2],
              'ember-qunit': '^7.0.0',
              '@ember/test-helpers': '^3.0.3'
            },
          },
        },
        {
          name: 'ember-default',
          npm: {
            devDependencies: {},
          },
        },
        {
          name: 'ember-default-no-prototype-extensions',
          env: {
            NO_EXTEND_PROTOTYPES: 'true',
          },
        },
      ],
    };
  });
};
