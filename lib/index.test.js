"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
test('Queue', () => {
    const q = new index_1.Queue('foo');
    expect(q.name).toEqual('foo');
    expect(q.len()).toEqual(0);
    expect(q.state).toEqual(index_1.QueueState.beforeStart);
});
let buf = '';
function log(s) {
    return () => (buf += s + '\n');
}
function asyncLog(s) {
    return async () => {
        await Promise.resolve();
        buf += s + '\n';
    };
}
function assertLog(exp) {
    expect(buf).toEqual(exp);
    buf = '';
}
beforeEach(() => {
    buf = '';
});
test('start queue contains exist task', async () => {
    const q = new index_1.Queue('foo');
    q.put(log('a'));
    q.put(asyncLog('b'));
    q.put(asyncLog('c'));
    q.put(log('d'));
    expect(q.len()).toEqual(4);
    assertLog('');
    q.start();
    assertLog('');
    await q.wait();
    assertLog('a\nb\nc\nd\n');
    expect(q.len()).toBe(0);
});
test('tasks raise exception', async () => {
    const q = new index_1.Queue('foo');
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
    const q = new index_1.Queue('bar');
    q.put(log('a'));
    q.start();
    await q.wait();
    expect(q.state).toBe(index_1.QueueState.stopped);
});
test('add task to an idle started queue', async () => {
    const q = new index_1.Queue('bar');
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
    const q = new index_1.Queue('foo');
    q.start();
    await q.wait();
    expect(q.state).toEqual(index_1.QueueState.stopped);
});
test('put() on stopped queue', async () => {
    const q = new index_1.Queue('foo');
    q.start();
    await q.wait();
    expect(() => q.put(log('c'))).toThrow();
});
test('wait not started', async () => {
    const q = new index_1.Queue('');
    await q.wait();
    expect(q.state).toBe(index_1.QueueState.stopped);
});
test('wait on wait', () => {
    const q = new index_1.Queue('foo');
    const ar = q.wait();
    expect(q.wait()).toBe(ar);
});
test('start stopped', async () => {
    const q = new index_1.Queue('foo');
    q.start();
    await q.wait();
    expect(() => q.start()).toThrow();
    expect(q.state).toBe(index_1.QueueState.stopped);
});
describe('retry', () => {
    let q;
    beforeEach(() => {
        q = new index_1.Queue('foo');
    });
    afterEach(async () => {
        await q.reset();
        expect(q.len()).toEqual(0);
        expect(q.state).toEqual(index_1.QueueState.beforeStart);
        assertLog('');
    });
    it('task succeed', async () => {
        q.put(log('a'), '', { retry: true });
        q.start();
        await q.wait();
        assertLog('a\n');
    });
    it('auto retry', async () => {
        q.start();
        const f = jest.fn().mockRejectedValueOnce(Error('recoverable error'));
        f.mockResolvedValue(null);
        q.put(f, '', { retry: true });
        q.put(log('a'));
        await q.wait();
        expect(f).toHaveBeenCalledTimes(2);
        assertLog('a\n');
    });
    it('fatal error abort retry', async () => {
        q.start();
        const f = jest.fn().mockRejectedValueOnce({
            message: 'foo',
            isFatalError: true,
        });
        q.put(f, '', { retry: true });
        q.put(log('a'));
        await q.wait();
        assertLog('a\n');
        expect(f).toHaveBeenCalledTimes(1);
    });
});
describe('reset', () => {
    let q;
    beforeEach(() => {
        q = new index_1.Queue('foo');
    });
    afterEach(async () => {
        await q.reset();
        expect(q.len()).toEqual(0);
        expect(q.state).toEqual(index_1.QueueState.beforeStart);
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
