import { Queue, QueueState } from './index';

test('Queue', () => {
  const q = new Queue('foo');
  expect(q.name).toEqual('foo');
  expect(q.len()).toEqual(0);
  expect(q.state).toEqual(QueueState.beforeStart);
});

let buf = '';
function log(s: string) {
  return () => (buf += s + '\n');
}
function asyncLog(s: string) {
  return async () => {
    await Promise.resolve();
    buf += s + '\n';
  };
}
function assertLog(exp: string) {
  expect(buf).toEqual(exp);
  buf = '';
}

beforeEach(() => {
  buf = '';
});

test('start queue contains exist task', async () => {
  const q = new Queue('foo');

  q.put(log('a'));
  q.put(asyncLog('b'));
  q.put(asyncLog('c'));
  q.put(log('d'));
  expect(q.len()).toEqual(4);
  assertLog('');
  q.start();

  // although they are sync tasks, but start always returned immediately.
  assertLog('');

  await q.wait();
  assertLog('a\nb\nc\nd\n');
  expect(q.len()).toBe(0);
});

test('tasks raise exception', async () => {
  const q = new Queue('foo');

  q.put(() => {
    log('a')();
    throw Error('sync error');
  });

  q.start();

  q.put(async () => {
    await asyncLog('b')();
    throw Error('sync error');
  });

  await q.wait();
  assertLog('a\nb\n');
});

test('wait', async () => {
  const q = new Queue('bar');

  q.put(log('a'));
  q.start();
  await q.wait();
  expect(q.state).toBe(QueueState.stopped);
});

test('add task to an idle started queue', async () => {
  const q = new Queue('bar');
  q.start();

  q.put(log('a'));
  q.put(log('b'));
  q.put(log('c'));

  assertLog('');
  await q.wait();
  assertLog('a\nb\nc\n');
  expect(q.len()).toEqual(0);
});

test('wait no tasks has ran', async () => {
  const q = new Queue('foo');
  q.start();
  await q.wait();
  expect(q.state).toEqual(QueueState.stopped);
});

test('put() on stopped queue', async () => {
  const q = new Queue('foo');
  q.start();
  await q.wait();

  expect(() => q.put(log('c'))).toThrow();
});

test('wait not started', async () => {
  const q = new Queue('');
  await q.wait();
  expect(q.state).toBe(QueueState.stopped);
});

test('wait on wait', () => {
  const q = new Queue('foo');
  const ar = q.wait();
  expect(q.wait()).toBe(ar);
});

test('start stopped', async () => {
  const q = new Queue('foo');
  q.start();
  await q.wait();

  expect(() => q.start()).toThrow();
  expect(q.state).toBe(QueueState.stopped);
});

describe('reset', () => {
  let q: Queue;
  beforeEach(() => {
    q = new Queue('foo');
  });

  afterEach(async () => {
    await q.reset();
    expect(q.len()).toEqual(0);
    expect(q.state).toEqual(QueueState.beforeStart);

    assertLog('');
  });

  test('not started', () => {
    q.put(log('a'));
  });

  test('started', () => {
    q.start();
    q.put(log('a'));
  });

  test('stopped', () => {
    q.start();
    q.wait();
  });
});
