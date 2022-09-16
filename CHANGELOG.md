

# [1.5.0](https://github.com/GitFitCode/gitfitbot/compare/v1.4.0...v1.5.0) (2022-09-16)


### Features

* added an express server to keep the bot alive ([38e8e30](https://github.com/GitFitCode/gitfitbot/commit/38e8e30027b781793d41e439d431d60df67d4cb6))
* added message author's username to the notion support ticket data ([a519ee7](https://github.com/GitFitCode/gitfitbot/commit/a519ee789b06ebef092760cac0121aba663e73fd))
* show a notion link button after creating support a ticket ([e5b0597](https://github.com/GitFitCode/gitfitbot/commit/e5b0597a63a55328c966075043f2f47580df175a))

# [1.4.0](https://github.com/GitFitCode/discord-bot/compare/v1.3.0...v1.4.0) (2022-09-13)


### Features

* added a new command `/tictactoe` to let users play that game ([dbcbb4d](https://github.com/GitFitCode/discord-bot/commit/dbcbb4d7b7ad184d64c7c56fbb1c22df562d71f0))

# [1.3.0](https://github.com/GitFitCode/discord-bot/compare/v1.2.0...v1.3.0) (2022-09-11)


### Bug Fixes

* fixed issues around env vars and no members in voice channel ([bbd10d9](https://github.com/GitFitCode/discord-bot/commit/bbd10d972d817a5d8d489616f5f625a0277f2228))


### Features

* added a command to randomly pick a user for their retro update ([001acea](https://github.com/GitFitCode/discord-bot/commit/001acea2020d65aac09b5245a0d7ae4084061277))
* added a new command `/joke` for fetching jokes ([729c989](https://github.com/GitFitCode/discord-bot/commit/729c98948cec52c49d628ff0c9f1a490083dfe10))
* added a script to clear out all registered commands ([c7ac1fe](https://github.com/GitFitCode/discord-bot/commit/c7ac1fe6c9026b27ff5fea5ece83d7668ae9ea9f))

# [1.2.0](https://github.com/GitFitCode/discord-bot/compare/v1.1.0...v1.2.0) (2022-09-08)


### Features

* /ping now returns `websocket` and `roundtrip` latency ([e8e7f6a](https://github.com/GitFitCode/discord-bot/commit/e8e7f6a3564498daef988ba93b44f5a6be3ef6fd))
* send welcome messages when a user joins the server ([44735ac](https://github.com/GitFitCode/discord-bot/commit/44735acfa1e7b2a53d094f26d930935fb464a082))

# 1.1.0 (2022-09-07)


### Bug Fixes

* fixed bot not responding issues ([94ef00f](https://github.com/GitFitCode/discord-bot/commit/94ef00fb104861d826351a43216c67b0a26f6f58))


### Features

* added `requestor` and `discord channel id` to support ticket props ([e801596](https://github.com/GitFitCode/discord-bot/commit/e801596a8fde7837d1757054e0920dbba91b5e6c))
* added ability to create and close threads ([b386413](https://github.com/GitFitCode/discord-bot/commit/b3864135c0a40f84244c46429a7dc0f2d818f3fd))
* added ability to create and update notion DB entries ([72726bc](https://github.com/GitFitCode/discord-bot/commit/72726bc7b7096d54ad2ac991909c1becfe0fce12))
* added ability to dump discord thread's contents into a notion page ([41d498b](https://github.com/GitFitCode/discord-bot/commit/41d498b0450e618896f44e9ff20816560cfaed5d))
* added husky pre-commit hooks! ([6f4c0d2](https://github.com/GitFitCode/discord-bot/commit/6f4c0d2c0044a23b455652095b60dcc54a781678))
* added release management to the app ([f823bd7](https://github.com/GitFitCode/discord-bot/commit/f823bd7434acd51f3acf1a159ffa42d803c1e271))
* integrated eslint config from airbnb ([9eeaaa4](https://github.com/GitFitCode/discord-bot/commit/9eeaaa4f706dd86a7110ee265474ce2181c84df1))
* migrated the project to typescript ([08e1752](https://github.com/GitFitCode/discord-bot/commit/08e1752699f99f1660cd2cf5c1ab8f008171aead))