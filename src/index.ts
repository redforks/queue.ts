import { Action0, Func0 } from 'funts';
import { isObject } from 'lodash';
import { assert } from 'rcheck-ts';

export enum QueueState {
  beforeStart,
  running,
  stopped,
}

export type Task = Action0 | Func0<Promise<void>>;

interface TaskRecord {
  task: Task;
  name: string;
  retry: boolean;
}

export interface FatalError {
  isFatalError: true;
}

function isFatalError(x: any): x is FatalError {
  return isObject(x) && x.isFatalError === true;
}

const maxRetryDelay = 10 * 60 * 1000;
const firstRetryDelay = 1000;

/**
 * Queue execute tasks in order. It solves:
 *
 * 1. performance problem by not running all the task at the same time
 * 1. data race problem, not running tasks related on the same object at the
 * same time, they must run sequentially.
 *
 * Task is async function without arguments, can be async or sync.
 *
 * Task is a unit of work, it should complete the work and take care of
 * possible errors.
 *
 * Exceptions caught and logged, although it is possible to design an API
 * returns processed result and exception by defined .put() method be async.
 *
 * Return task processed result is bad, because it breaks isolation, if
 * application code depends on this, it very easy to cause data race condition.
 * When a task returned, other tasks may put into queue and started executing.
 *
 * For the same reason, task function can not assume object's current state,
 * always check state before do the job, abort operation if necessary.
 */
export class Queue {
  readonly name: string;
  state: QueueState = QueueState.beforeStart;
  private waitResolve: Action0 | null = null;
  private tasks: TaskRecord[] = [];
  private timerId: number | null = null;
  private waiting: Promise<void> | null = null;
  private delay = 0;

  /**
   * Creates an instance of Queue.
   * @param {string} name of the queue, useful for logging.
   * @memberof Queue
   */
  constructor(name: string) {
    this.name = name;
    this.state = QueueState.beforeStart;
    this.waitResolve = null;
    this.tasks = [];
    this.loop = this.loop.bind(this);
  }
  /**
   * Put a task to queue
   *
   * @param {string} name optional task name
   * @param {opt} retry: re-run the task on error unless FatalError raised.
   * @memberof Queue
   */
  put(task: Task, name: string = '', opt?: { retry: boolean }) {
    if (this.state === QueueState.stopped) {
      throw Error(`Queue ${this.name} has stopped`);
    }

    this.tasks.push({
      task,
      name,
      retry: !!opt && opt.retry,
    });

    if (this.state === QueueState.running && this.timerId == null) {
      this._start_loop();
    }
  }

  /**
   * Returns queue current length
   *
   * @memberof Queue
   */
  len() {
    return this.tasks.length;
  }

  /**
   * Start queue
   */
  start() {
    assert(
      this.state === QueueState.beforeStart,
      `Queue ${this.name} already started`,
    );
    this.state = QueueState.running;

    if (!this.tasks.length) {
      return;
    }

    this._start_loop();
  }

  async loop() {
    this.timerId = null;

    const task = this.tasks.shift();
    if (task) {
      console.log(`[${this.name}] Execute task ${task.name}`);
      let needRetry = false;
      try {
        await task.task();
        this.delay = 0;
      } catch (e) {
        console.log(
          `[${this.name}] Error execute task ${task.name}:\n${e.toString()}`,
        );
        if (task.retry && !isFatalError(e)) {
          needRetry = true;
        }
      }

      if (needRetry) {
        this.tasks.unshift(task);
        if (this.delay === 0) {
          this.delay = firstRetryDelay;
        } else {
          this.delay = Math.min(this.delay * 2, maxRetryDelay);
        }
      }

      if (this.tasks.length) {
        this._start_loop();
        return;
      }
    }

    const wr = this.waitResolve;
    if (wr) {
      wr();
    }
  }

  /**
   * Wait all tasks complete executing.
   *
   * After .wait() called, .put() refuse adding new tasks and raise an exception.
   */
  wait() {
    if (this.waiting) {
      return this.waiting;
    }

    if (this.timerId == null) {
      this.state = QueueState.stopped;
      return (this.waiting = Promise.resolve());
    }

    return (this.waiting = new Promise((resolve) => {
      this.waitResolve = () => {
        this.state = QueueState.stopped;
        resolve();
      };
    }));
  }

  /**
   * Stop queue, clear tasks, reset state.
   *
   * Use reset() only in unit tests.
   *
   * @memberof Queue
   */
  async reset() {
    this.tasks = [];
    await this.wait();
    this.state = QueueState.beforeStart;
    this.waiting = null;
    this.timerId = null;
  }

  _start_loop() {
    this.timerId = setTimeout(this.loop, this.delay);
  }
}
