const validateEnterprise = (data) => {
  const errors = [];
  if (!data.name || data.name.trim().length === 0) errors.push('Name is required');
  if (!data.industry) errors.push('Industry is required');
  if (data.revenue && isNaN(data.revenue)) errors.push('Revenue must be a number');
  return { valid: errors.length === 0, errors };
};

const validateAnalysisRequest = (data) => {
  const errors = [];
  if (!data.enterpriseId) errors.push('Enterprise ID is required');
  if (!data.metrics || !Array.isArray(data.metrics)) errors.push('Metrics array is required');
  return { valid: errors.length === 0, errors };
};

module.exports = { validateEnterprise, validateAnalysisRequest };
