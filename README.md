# nrsession

Fetch npm modules and jump into a repl

## install

```sh
$ [sudo] npm install -g nrsession
```

## usage

```sh
$ nrsession [...modules]
```

## example

Start a session with `batch` and `superagent` as a NPM dependency.

```sh
$ nrsession batch superagent
```

After bootstrapping you will be put into a session where those modules
are available to be loaded.

```js
nr> const Batch = require('batch');
nr> const agent = require('superagent');
nr> const tasks = new Batch();
nr> const resources = [RESOURCE_A, RESOURCE_B, RESOURCE_C];
nr> resources.forEach(resource => task.push(done => agent.get(resource).end(done)));
nr> tasks.end((err, res) => console.log(err, res));
```

## license

MIT
