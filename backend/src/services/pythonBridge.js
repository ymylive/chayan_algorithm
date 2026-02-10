const { spawn } = require('child_process');
const path = require('path');

const executePython = (scriptName, args) => {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../../python', scriptName);
    const python = spawn('python', [scriptPath, JSON.stringify(args)]);

    let output = '';
    let error = '';

    python.stdout.on('data', (data) => {
      output += data.toString();
    });

    python.stderr.on('data', (data) => {
      error += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(error || 'Python script failed'));
      } else {
        try {
          resolve(JSON.parse(output));
        } catch (e) {
          reject(new Error('Invalid JSON output from Python'));
        }
      }
    });
  });
};

module.exports = { executePython };
