const { rankAndFilterRecords, scoreRecordRelevance, runSearchFanout } = require('../mcp-server');

describe('mcp-server ranking governance', () => {
  test('promotes higher-authority source on near-tie relevance', () => {
    const ranked = rankAndFilterRecords([
      {
        name: 'Tea market reference',
        description: 'Tea market trend analysis',
        url: 'https://insights.example.com/tea-market',
        source: 'duckduckgo'
      },
      {
        name: 'Tea market reference',
        description: 'Tea market trend analysis',
        url: 'https://stats.gov/tea-market',
        source: 'bing_web'
      }
    ], {
      mode: 'industry',
      query: 'tea market',
      minScore: 1.2
    });

    expect(ranked.records).toHaveLength(2);
    expect(ranked.records[0].url).toContain('stats.gov');
    expect(ranked.records[0].authority).toEqual(expect.objectContaining({
      tier: 'official',
      weight: expect.any(Number)
    }));
    expect(ranked.records[0].relevanceScore).toBeGreaterThan(ranked.records[1].relevanceScore);
  });

  test('keeps unsafe blocked while noisy items remain scored', () => {
    const unsafe = scoreRecordRelevance({
      name: 'adult site',
      description: 'porn video',
      url: 'https://example.com/porn',
      source: 'bing_web'
    }, ['tea'], 'competitor');

    expect(unsafe.blockedReason).toBe('unsafe_content');

    const ranked = rankAndFilterRecords([
      {
        name: 'CrazyGames play now tea rival',
        description: 'free online games',
        url: 'https://games.example.com/tea',
        source: 'bing_web'
      },
      {
        name: 'Tea brand unsafe',
        description: 'porn content',
        url: 'https://unsafe.example.com',
        source: 'duckduckgo'
      }
    ], {
      mode: 'competitor',
      query: 'tea rival',
      minScore: 0
    });

    expect(ranked.blockedCount).toBe(1);
    expect(ranked.records).toHaveLength(1);
    expect(ranked.records[0].reasonCodes).toContain('noisy_term_penalty');
    expect(ranked.filteredItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reasonCodes: expect.arrayContaining(['filtered_unsafe_content'])
      })
    ]));
  });

  test('exposes authority metadata and filter rationale reason codes', () => {
    const ranked = rankAndFilterRecords([
      {
        name: 'Tea annual report',
        description: 'Tea annual report investor relations',
        url: 'https://ir.tea-brand.com/report',
        source: 'bing_news'
      },
      {
        name: 'Tea forum thread',
        description: 'forum thread tea market',
        url: 'https://example.com/forum/tea',
        source: 'duckduckgo'
      }
    ], {
      mode: 'financial_data',
      query: 'tea',
      minScore: 1
    });

    expect(ranked.records[0]).toEqual(expect.objectContaining({
      baseRelevanceScore: expect.any(Number),
      authority: expect.objectContaining({
        tier: expect.any(String),
        reasonCode: expect.any(String)
      }),
      reasonCodes: expect.any(Array)
    }));

    expect(ranked.filterRationale).toEqual(expect.objectContaining({
      mode: 'financial_data',
      reasonCounts: expect.any(Object)
    }));
    expect(ranked.filteredItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reasonCodes: expect.arrayContaining(['filtered_governance_denied', 'filter_low_signal_forum'])
      })
    ]));
  });

  test('demotes repeated hosts in top window to improve domain diversity', () => {
    const ranked = rankAndFilterRecords([
      {
        name: 'Tea Insight A',
        description: 'tea market trend analysis',
        url: 'https://repeat.example.com/a',
        source: 'bing_web'
      },
      {
        name: 'Tea Insight B',
        description: 'tea market trend analysis',
        url: 'https://repeat.example.com/b',
        source: 'bing_web'
      },
      {
        name: 'Tea Insight C',
        description: 'tea market trend analysis',
        url: 'https://alt.example.com/c',
        source: 'bing_news'
      }
    ], {
      mode: 'industry',
      query: 'tea market',
      minScore: 0.2,
      hostPenalty: 0.5,
      hostWindowSize: 10
    });

    const urls = ranked.records.map((item) => item.url);
    const altIndex = urls.indexOf('https://alt.example.com/c');
    const repeatBIndex = urls.indexOf('https://repeat.example.com/b');
    expect(altIndex).toBeGreaterThanOrEqual(0);
    expect(repeatBIndex).toBeGreaterThanOrEqual(0);
    expect(altIndex).toBeLessThan(repeatBIndex);
    expect(ranked.records[repeatBIndex].reasonCodes).toContain('host_diversity_penalty');
  });

  test('runs additional waves when source diversity target is not met', async () => {
    const searchExecutor = jest.fn(async (query) => {
      if (String(query).includes('competitor list')) {
        return {
          items: [
            {
              name: 'Tea Brand B',
              description: 'tea competitor brand alternative',
              url: 'https://zh.wikipedia.org/wiki/Tea_Brand_B',
              source: 'wikipedia'
            }
          ],
          sourceCounts: { wikipedia: 1 },
          sourceAttempts: [{ source: 'wikipedia', success: true, resultCount: 1 }],
          partialFailure: false
        };
      }

      return {
        items: [
          {
            name: 'Tea Brand A',
            description: 'tea competitor brand analysis',
            url: 'https://example.com/tea-brand-a',
            source: 'bing_web'
          }
        ],
        sourceCounts: { bing_web: 1 },
        sourceAttempts: [{ source: 'bing_web', success: true, resultCount: 1 }],
        partialFailure: false
      };
    });

    const fanout = await runSearchFanout(['tea competitor'], 1, {
      mode: 'competitor',
      anchorQuery: 'tea',
      minResults: 1,
      minSources: 2,
      maxWaves: 3,
      minScore: 0.2,
      searchExecutor
    });

    expect(searchExecutor).toHaveBeenCalledTimes(2);
    expect(fanout.sourceCoverageBoostInjected).toBe(true);
    expect(fanout.sourceDiversityCount).toBeGreaterThanOrEqual(2);
    expect(fanout.sourceCoverageSatisfied).toBe(true);
    expect(fanout.attempts).toHaveLength(2);
  });

  test('news_stream rewards recently published items', () => {
    const now = new Date('2026-02-16T12:00:00Z').getTime();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

    const ranked = rankAndFilterRecords([
      {
        name: 'Tea latest update',
        description: 'fresh news about tea',
        url: 'https://news.example.com/tea-recent',
        source: 'bing_news',
        publishedAt: '2026-02-16T09:00:00Z'
      },
      {
        name: 'Tea last week update',
        description: 'old announcement',
        url: 'https://news.example.com/tea-old',
        source: 'bing_news',
        publishedAt: '2026-02-10T09:00:00Z'
      }
    ], {
      mode: 'news_stream',
      query: 'tea update',
      minScore: 0
    });

    expect(ranked.records).toHaveLength(2);
    expect(ranked.records[0].url).toContain('tea-recent');
    expect(ranked.records[0].reasonCodes).toContain('recency_recent_news');

    nowSpy.mockRestore();
  });

  test('news_stream applies source boost for google_news', () => {
    const googleNews = scoreRecordRelevance({
      name: 'Tea company update',
      description: 'latest update',
      url: 'https://example.com/tea-update',
      source: 'google_news'
    }, ['tea company'], 'news_stream');

    const genericWeb = scoreRecordRelevance({
      name: 'Tea company update',
      description: 'latest update',
      url: 'https://example.com/tea-update',
      source: 'duckduckgo'
    }, ['tea company'], 'news_stream');

    expect(googleNews.baseRelevanceScore).toBeGreaterThan(genericWeb.baseRelevanceScore);
  });

  test('news_stream ignores short latin token collisions for cjk entity aliases', () => {
    const ranked = rankAndFilterRecords([
      {
        name: 'Conceptual artist Theresa Hak Kyung Cha celebrated in California',
        description: 'art exhibition update',
        url: 'https://www.example.com/theresa-hak-kyung-cha',
        source: 'tavily'
      },
      {
        name: '\u8336\u989c\u60a6\u8272\u5c06\u5165\u9a7b\u6df1\u5733 \u9996\u6279\u95e8\u5e97\u56db\u6708\u5f00\u4e1a',
        description: '\u8336\u989c\u60a6\u8272 \u516c\u53f8 \u6700\u65b0\u65b0\u95fb',
        url: 'https://www.hk01.com/article/123456/chayan-yuese-shenzhen',
        source: 'google_news'
      }
    ], {
      mode: 'news_stream',
      anchorQuery: '\u8336\u989c\u60a6\u8272 cha yan yue se chayan yuese chayan',
      query: '\u8336\u989c\u60a6\u8272',
      minScore: 1.1
    });

    expect(ranked.records).toHaveLength(1);
    expect(ranked.records[0].url).toContain('hk01.com');
  });

  test('news_stream filters unrelated generic headline pages when anchor is missing', () => {
    const ranked = rankAndFilterRecords([
      {
        name: 'Breaking News, Latest News and Videos',
        description: 'world updates',
        url: 'https://www.cnn.com/',
        source: 'crawl4ai'
      },
      {
        name: '茶颜悦色联名新品发布',
        description: '茶颜悦色 官方新闻',
        url: 'https://example.com/chayan-release',
        source: 'tavily'
      }
    ], {
      mode: 'news_stream',
      query: '茶颜悦色',
      minScore: 1.1
    });

    expect(ranked.records).toHaveLength(1);
    expect(ranked.records[0].url).toContain('chayan-release');
  });

  test('financial_data mode promotes SEC filings authority', () => {
    const ranked = rankAndFilterRecords([
      {
        name: 'Tea SEC filing overview',
        description: '10-K summary',
        url: 'https://www.sec.gov/Archives/edgar/data/123456/10-k.html',
        source: 'bing_news'
      },
      {
        name: 'Tea filing blog recap',
        description: 'analysis blog',
        url: 'https://blog.example.com/tea-10-k',
        source: 'duckduckgo'
      }
    ], {
      mode: 'financial_data',
      query: 'tea filing',
      minScore: 0
    });

    const secRecord = ranked.records.find((item) => String(item.url).includes('sec.gov'));
    expect(secRecord).toBeDefined();
    expect(secRecord.authority).toEqual(expect.objectContaining({
      tier: 'filing',
      reasonCode: 'authority_promoted_filings'
    }));
    expect(secRecord.reasonCodes).toContain('authority_promoted_filings');
  });

  test('financial_data mode promotes exchange disclosure hosts as filings authority', () => {
    const ranked = rankAndFilterRecords([
      {
        name: 'Tea disclosure bulletin',
        description: 'annual disclosure',
        url: 'https://www.cninfo.com.cn/disclosure/2026-02-16/doc-example.html',
        source: 'tavily'
      },
      {
        name: 'Tea disclosure blog',
        description: 'recap',
        url: 'https://blog.example.com/disclosure',
        source: 'duckduckgo'
      }
    ], {
      mode: 'financial_data',
      query: 'tea disclosure',
      minScore: 0
    });

    const filingHostRecord = ranked.records.find((item) => String(item.url).includes('cninfo.com.cn'));
    expect(filingHostRecord).toBeDefined();
    expect(filingHostRecord.authority).toEqual(expect.objectContaining({
      tier: 'filing',
      reasonCode: 'authority_promoted_filings'
    }));
  });
});
