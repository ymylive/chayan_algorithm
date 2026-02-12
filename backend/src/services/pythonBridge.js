const { spawn } = require('child_process');
const path = require('path');

const DEFAULT_PYTHON_OUTPUT_MAX_BYTES = 1024 * 1024;

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const executePython = (scriptName, args) => {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../../python', scriptName);
    const maxOutputBytes = toPositiveInt(
      process.env.PYTHON_OUTPUT_MAX_BYTES,
      DEFAULT_PYTHON_OUTPUT_MAX_BYTES
    );
    const python = spawn('python', [scriptPath, JSON.stringify(args)]);

    let output = '';
    let error = '';
    let totalOutputBytes = 0;
    let settled = false;

    const settle = (handler, value) => {
      if (settled) {
        return;
      }
      settled = true;
      handler(value);
    };

    const rejectAndKill = (err, signal) => {
      if (!python.killed) {
        python.kill(signal);
      }
      settle(reject, err);
    };

    const appendOutput = (chunk, isStdErr) => {
      if (settled) {
        return;
      }

      const text = chunk.toString();
      totalOutputBytes += Buffer.byteLength(text, 'utf8');

      if (totalOutputBytes > maxOutputBytes) {
        const overflowError = new Error(
          `Python output exceeded ${maxOutputBytes} bytes limit`
        );
        overflowError.code = 'PYTHON_OUTPUT_OVERFLOW';
        rejectAndKill(overflowError, 'SIGKILL');
        return;
      }

      if (isStdErr) {
        error += text;
      } else {
        output += text;
      }
    };

    python.stdout.on('data', (data) => {
      appendOutput(data, false);
    });

    python.stderr.on('data', (data) => {
      appendOutput(data, true);
    });

    python.on('error', (spawnError) => {
      const err = new Error(`Python process error: ${spawnError.message}`);
      err.code = 'PYTHON_PROCESS_ERROR';
      rejectAndKill(err);
    });

    python.on('close', (code) => {
      if (settled) {
        return;
      }

      if (code !== 0) {
        const err = new Error(error || `Python script failed with exit code ${code}`);
        err.code = 'PYTHON_EXIT_ERROR';
        settle(reject, err);
      } else {
        try {
          settle(resolve, JSON.parse(output));
        } catch (e) {
          const parseError = new Error('Invalid JSON output from Python');
          parseError.code = 'PYTHON_INVALID_JSON';
          settle(reject, parseError);
        }
      }
    });
  });
};

module.exports = { executePython };
