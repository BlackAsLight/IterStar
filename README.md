# IterStar

Iter* is a simple lib providing ways to iterate over array like objects in ways
where a traditional array preforms inefficiently for the desired movement, or
would cause spikes in memory usage. It offers ways to work with Generators and
ReadableStreams in similar ways to the traditional array, without needing to
pull it all into memory first.

Iter* offers three classes of interest here. Iter, AsyncIter and Queue.

## class Iter

The Iter class is good for when you'd want to work with a large amount of
generative data in an array type fashion. I don't see this class getting used
that much, but it's good to have a sync version of the async type.

```ts
import { Iter } from '@doctor/iterstar'

// Without Iter
for (let i = 0; i < Number.MAX_SAFE_INTEGER; ++i)
	console.log(i)

// With Iter
new Iter(range(0, Number.MAX_SAFE_INTEGER))
	.forEach(console.log)
```

## class AsyncIter

The AsyncIter class is good for when working with streaming data such as from a
ReadableStream. For instance, if you wanted to process a zipped csv file all in
memory from a fetch request.

```ts
import { AsyncIter } from '@doctor/iterstar'
import { CsvParseStream } from '@std/csv'
import { Entry, ZipReaderStream } from '@zip-js/zip-js'

// Without AsyncIter
const gen: AsyncGenerator<string[]> = unzipCSV(
	(await fetch('')).body!.pipeThrough(new ZipReaderStream())
)
const keys: string[] = (await gen.next()).value!
for await (const values of gen) {
	const row = values.reduce((obj, value, i) => (obj[keys[i]] = value, obj), {} as Record<string, string>)
	//code
}

async function* unzipCSV(
	readable: ReadableStream<Omit<Entry, "getData"> & { readable?: ReadableStream<Uint8Array> | undefined }>
): AsyncGenerator<string[]> {
	for await (const entry of readable)
		if (entry.readable)
			for await (const x of entry.readable.pipeThrough(new TextDecoderStream()).pipeThrough(new CsvParseStream()))
				yield x
}

// With AsyncIter
const iter: AsyncIter<string[]> = new AsyncIter(
	(await fetch('')).body!.pipeThrough(new ZipReaderStream())
)
	.filter(entry => entry.readable)
	.map(entry => entry.readable!.pipeThrough(new TextDecoderStream()).pipeThrough(new CsvParseStream()))
	.flat()

const keys: string[] = (await iter.shift())!
iter
	.map(values => values.reduce((obj, value, i) => (obj[keys[i]] = value, obj), {} as Record<string, string>))
	.forEach(row => {
		// code
	})
```

## class Queue

The Queue class is really only good for if you want to do a lot of
`.shift()`-ing. In most instances a traditional array will out preform this
Queue by magnitudes, but if your data structure has you working with queues
instead of stacks, and quite large queues then this queue is orders of magnitude
faster to shift than to shift on a traditional array.

```ts
import { Queue } from '@doctor/iterstar'

const sleep = (ms: number) => new Promise(a => setTimeout(() => a(true), ms))

const queue = new Queue(range(0, 10))
for (const value of queue) {
	console.log(value)
	if (Math.random() < 0.5)
		queue.push(value)
	await sleep(200)
}
```

Looping like the above example will cause the underlining index to keep
incrementing, if said underlining value surpasses `Number.MAX_SAFE_INTEGER` then
all hell could break loose. However if we assumes that it took 1ms to loop once
here then it would take ~2,926 centuries to reach that max number. If you did
happen to reach this number, you could always just pass it into another Queue to
reset the internal indexes.

```ts
let queue = new Queue(data);

// Centuries Later...

queue = new Queue(queue);
```
