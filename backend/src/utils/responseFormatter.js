const success = (data, message = 'Success') => ({
  success: true,
  message,
  data
});

const error = (message, code = 500) => ({
  success: false,
  message,
  code
});

module.exports = { success, error };
