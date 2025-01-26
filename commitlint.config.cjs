/* eslint-disable indent */

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    //   TODO Add Scope Enum Here
    // 'scope-enum': [2, 'always', ['yourscope', 'yourscope']],
    'subject-case': [0, 'always', ['sentence-case', 'start-case', 'pascal-case']],
    'type-enum': [
      2,
      'always',
      [
        'build',
        'bump',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'release',
        'style',
        'test',
      ],
    ],
  },
};
