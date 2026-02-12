const validateEnterprise = (data) => {
  const errors = [];

  if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('Name is required');
  }

  if (typeof data.industry !== 'string' || data.industry.trim().length === 0) {
    errors.push('Industry is required');
  }

  if (data.revenue !== undefined && data.revenue !== null && data.revenue !== '') {
    const revenue = Number(data.revenue);
    if (!Number.isFinite(revenue)) {
      errors.push('Revenue must be a number');
    } else if (revenue < 0) {
      errors.push('Revenue must be non-negative');
    }
  }

  if (data.employee_count !== undefined && data.employee_count !== null && data.employee_count !== '') {
    const employeeCount = Number(data.employee_count);
    if (!Number.isInteger(employeeCount) || employeeCount < 0) {
      errors.push('Employee count must be a non-negative integer');
    }
  }

  if (data.region !== undefined && data.region !== null && typeof data.region !== 'string') {
    errors.push('Region must be a string');
  }

  if (data.status !== undefined && data.status !== null) {
    const allowedStatuses = new Set(['active', 'inactive', 'archived']);
    if (typeof data.status !== 'string' || !allowedStatuses.has(data.status)) {
      errors.push('Status must be one of: active, inactive, archived');
    }
  }

  return { valid: errors.length === 0, errors };
};

const validateAnalysisRequest = (data) => {
  const errors = [];

  if (data.enterpriseId === undefined || data.enterpriseId === null || data.enterpriseId === '') {
    errors.push('Enterprise ID is required');
  } else if (!Number.isFinite(Number(data.enterpriseId))) {
    errors.push('Enterprise ID must be numeric');
  }

  if (!Array.isArray(data.metrics)) {
    errors.push('Metrics array is required');
  }

  return { valid: errors.length === 0, errors };
};

module.exports = { validateEnterprise, validateAnalysisRequest };
