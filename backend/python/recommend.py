import sys
import json

def generate_recommendations(enterprise, analysis):
    """生成企业推荐建议"""
    recommendations = []

    # 基于财务分析的建议
    if analysis and 'result_data' in analysis:
        result = analysis['result_data']

        if 'financial' in result:
            financial = result['financial']
            if financial.get('level') == 'poor':
                recommendations.append({
                    'title': '优化财务结构',
                    'description': '当前财务健康度较低，建议优化资产负债结构，提高流动比率',
                    'priority': 9,
                    'category': 'financial'
                })

            if financial.get('factors', {}).get('debt_ratio', 0) > 0.7:
                recommendations.append({
                    'title': '降低负债率',
                    'description': '资产负债率过高，建议通过增资或减债降低财务风险',
                    'priority': 8,
                    'category': 'financial'
                })

        if 'market_trend' in result:
            trend = result['market_trend']
            if trend.get('trend') == 'down':
                recommendations.append({
                    'title': '调整市场策略',
                    'description': '市场趋势下行，建议调整产品策略或开拓新市场',
                    'priority': 7,
                    'category': 'market'
                })

        if 'competitiveness' in result:
            comp = result['competitiveness']
            if comp.get('rank') == 'low':
                recommendations.append({
                    'title': '提升竞争力',
                    'description': '市场竞争力较弱，建议加强创新投入和品牌建设',
                    'priority': 8,
                    'category': 'strategy'
                })

    # 基于行业的通用建议
    industry = enterprise.get('industry', '')
    if '科技' in industry or 'tech' in industry.lower():
        recommendations.append({
            'title': '加强技术研发',
            'description': '科技行业需持续投入研发，保持技术领先优势',
            'priority': 6,
            'category': 'innovation'
        })

    if not recommendations:
        recommendations.append({
            'title': '持续监控',
            'description': '企业运营状况良好，建议持续监控关键指标',
            'priority': 5,
            'category': 'general'
        })

    return recommendations

if __name__ == '__main__':
    input_data = json.loads(sys.argv[1])
    enterprise = input_data.get('enterprise', {})
    analysis = input_data.get('analysis', {})

    result = generate_recommendations(enterprise, analysis)
    print(json.dumps(result, ensure_ascii=False))
