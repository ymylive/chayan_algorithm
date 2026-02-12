const { validateEnterprise, validateAnalysisRequest } = require('../src/utils/validator');

describe('validator', () => {
  test('valid enterprise payload passes', () => {
    const result = validateEnterprise({
      name: ' A ',
      industry: 'Tech',
      revenue: '100',
      employee_count: 10,
      region: 'CN',
      status: 'active'
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('invalid enterprise payload fails with key errors', () => {
    const result = validateEnterprise({
      name: '',
      industry: '',
      revenue: 'abc'
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'Name is required',
      'Industry is required',
      'Revenue must be a number'
    ]);
  });

  test('allows zero revenue because it is a valid numeric value', () => {
    const result = validateEnterprise({
      name: 'Zero Revenue Co',
      industry: 'Retail',
      revenue: 0
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('analysis request validates enterpriseId presence and metrics array shape', () => {
    expect(validateAnalysisRequest({ enterpriseId: 1, metrics: [] }).valid).toBe(true);
    expect(validateAnalysisRequest({ enterpriseId: 'x', metrics: ['m1'] }).valid).toBe(false);
    expect(validateAnalysisRequest({ enterpriseId: '1', metrics: ['m1'] }).valid).toBe(true);
    expect(validateAnalysisRequest({ enterpriseId: 1 }).valid).toBe(false);
    expect(validateAnalysisRequest({ enterpriseId: 1, metrics: 'm1' }).valid).toBe(false);
    expect(validateAnalysisRequest({ enterpriseId: 0, metrics: [] }).valid).toBe(true);
  });
});
