# IterStar

Iter* is a simple lib for providing methods to iterate over array like objects
in a generator fashion.

It offers a few similar methods as normal arrays, but may have a few limitations
due to logic. The `Iter` class is a bit slower than a traditional array, but
allows you to work with data sets that are a lot larger than an array can be.

If the method on a Iter returns another Iter then it won't actually execute the
function provided in unless you call something like `.collect()` or `wait()` to
force it to iterate through everything. `.wait()` works just like `.collect()`
except it does not store the returned values. It is meant to be used in
instances where you want all the functions to execute but don't want a returned
array. This helps if the amount you're trying to iterate through is larger than
a normal array can be.

```ts
let array = new Iter([0, 1, 2, 3, 4, 5])
  .map((x) => x + Math.floor(Math.random() * 10))
  .collect();

array = new Iter(range(5, 10))
  .filter((x) => x % 2)
  .collect();
```

```ts
const array = await new AsyncIter(await asyncRange(5, 10))
  .filter((x) => x % 2)
  .collect();
```
## Examples
### Processing a zipped csv file
```ts
import { CsvParseStream } from 'https://deno.land/std/csv/mod.ts'
import { AsyncIter } from 'https://deno.land/x/iterstar/mod.ts'
import { read } from 'https://deno.land/x/streaming_zip/read.ts'

const iter: AsyncIter<string[]> = new AsyncIter(read((await fetch('URL')).body!))
  .filter<{ type: 'file' }>(entry => entry.type === 'file')
  .map(entry => entry.body.stream().pipeThrough(new TextDecoderStream()).pipeThrough(new CsvParseStream()))
  .flat()

const keys: string[] = (await iter.shift())!
iter
  .map(values => values.reduce((obj, value, i) => (obj[keys[i]] = value, obj), {} as Record<string, string>))
  .forEach(row => console.log(row))
