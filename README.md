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

```sh
$ nrsession batch superagent
...
nr> const Batch = require('batch');
nr> const agent = require('superagent');
nr> const tasks = new Batch();
nr> const resources = [RESOURCE_A, RESOURCE_B, RESOURCE_C];
nr> resources.forEach(resource => task.push(done => agent.get(resource).end(done)));
nr> tasks.end((err, res) => console.log(err, res));
```

## license

MIT
