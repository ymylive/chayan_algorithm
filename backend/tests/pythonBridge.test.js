const EventEmitter = require('events');
const path = require('path');

const mockSpawn = jest.fn();

jest.mock('child_process', () => ({
  spawn: (...args) => mockSpawn(...args)
}));

const createMockProcess = () => {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = new EventEmitter();
  proc.stdin.write = jest.fn();
  proc.stdin.end = jest.fn();
  proc.kill = jest.fn();
  return proc;
};

describe('pythonBridge.executePython', () => {
  beforeEach(() => {
    jest.resetModules();
    mockSpawn.mockReset();
  });

  test('spawns python with script path and serialized args', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    const { executePython } = require('../src/services/pythonBridge');

    const promise = executePython('analyze.py', { a: 1, b: 'x' });

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockSpawn).toHaveBeenCalledWith('python', [
      expect.stringContaining(path.join('python', 'analyze.py')),
      JSON.stringify({ a: 1, b: 'x' })
    ]);

    proc.stdout.emit('data', Buffer.from('{"ok":true}'));
    proc.emit('close', 0);
    await expect(promise).resolves.toEqual({ ok: true });
  });

  test('resolves parsed JSON output on success', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    const { executePython } = require('../src/services/pythonBridge');

    const promise = executePython('analyze.py', { a: 1 });
    proc.stdout.emit('data', Buffer.from('{"ok":'));
    proc.stdout.emit('data', Buffer.from('true}'));
    proc.emit('close', 0);

    await expect(promise).resolves.toEqual({ ok: true });
  });

  test('rejects with stderr content when python exits non-zero', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    const { executePython } = require('../src/services/pythonBridge');

    const promise = executePython('analyze.py', { a: 1 });
    proc.stderr.emit('data', Buffer.from('boom'));
    proc.emit('close', 1);

    await expect(promise).rejects.toThrow('boom');
  });

  test('rejects with fallback message when python exits non-zero without stderr', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    const { executePython } = require('../src/services/pythonBridge');

    const promise = executePython('analyze.py', { a: 1 });
    proc.emit('close', 2);

    await expect(promise).rejects.toThrow('Python script failed');
  });

  test('rejects when python returns invalid JSON', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    const { executePython } = require('../src/services/pythonBridge');

    const promise = executePython('analyze.py', { a: 1 });
    proc.stdout.emit('data', Buffer.from('not-json'));
    proc.emit('close', 0);

    await expect(promise).rejects.toThrow('Invalid JSON output from Python');
  });
});
