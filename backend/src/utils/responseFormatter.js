const success = (data, message = 'Success', total) => {
  const result = { success: true, message, data };
  if (total !== undefined) result.total = total;
  return result;
};

const error = (message, code = 500) => ({
  success: false,
  message,
  code
});

module.exports = { success, error };
