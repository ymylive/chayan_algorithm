import sys
import json
import pandas as pd
from sklearn.linear_model import LinearRegression
import numpy as np

def analyze_financial(data):
    """财务健康度分析"""
    df = pd.DataFrame([data])
    score = 0
    factors = {}

    # 资产负债率
    if 'total_assets' in data and 'total_liabilities' in data:
        ratio = data['total_liabilities'] / data['total_assets'] if data['total_assets'] > 0 else 1
        factors['debt_ratio'] = ratio
        score += (1 - min(ratio, 1)) * 30

    # 流动比率
    if 'current_assets' in data and 'current_liabilities' in data:
        current_ratio = data['current_assets'] / data['current_liabilities'] if data['current_liabilities'] > 0 else 0
        factors['current_ratio'] = current_ratio
        score += min(current_ratio / 2, 1) * 30

    # 净利润率
    if 'net_profit' in data and 'revenue' in data:
        profit_margin = data['net_profit'] / data['revenue'] if data['revenue'] > 0 else 0
        factors['profit_margin'] = profit_margin
        score += min(profit_margin * 10, 1) * 40

    return {'score': round(score, 2), 'factors': factors, 'level': 'good' if score >= 70 else 'medium' if score >= 40 else 'poor'}

def analyze_market_trend(data):
    """市场趋势分析"""
    if 'revenue_history' not in data or len(data['revenue_history']) < 2:
        return {'trend': 'insufficient_data', 'prediction': None}

    history = data['revenue_history']
    X = np.array(range(len(history))).reshape(-1, 1)
    y = np.array(history)

    model = LinearRegression()
    model.fit(X, y)

    next_period = model.predict([[len(history)]])[0]
    trend = 'up' if model.coef_[0] > 0 else 'down'

    return {'trend': trend, 'prediction': round(next_period, 2), 'growth_rate': round(model.coef_[0], 2)}

def analyze_competitiveness(data):
    """竞争力分析"""
    score = 0
    factors = {}

    if 'market_share' in data:
        factors['market_share'] = data['market_share']
        score += min(data['market_share'] * 100, 40)

    if 'innovation_index' in data:
        factors['innovation_index'] = data['innovation_index']
        score += data['innovation_index'] * 30

    if 'brand_value' in data:
        factors['brand_value'] = data['brand_value']
        score += min(data['brand_value'] / 1000, 1) * 30

    return {'score': round(score, 2), 'factors': factors, 'rank': 'high' if score >= 70 else 'medium' if score >= 40 else 'low'}

if __name__ == '__main__':
    input_data = json.loads(sys.argv[1])
    analysis_type = input_data['type']
    data = input_data['data']

    result = None
    if analysis_type == 'financial':
        result = analyze_financial(data)
    elif analysis_type == 'market_trend':
        result = analyze_market_trend(data)
    elif analysis_type == 'competitiveness':
        result = analyze_competitiveness(data)

    print(json.dumps(result))
