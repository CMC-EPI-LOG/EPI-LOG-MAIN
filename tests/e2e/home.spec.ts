import { test, expect, type Page } from '@playwright/test';

const mockReport = {
  airQuality: {
    stationName: '중구',
    grade: 'BAD',
    value: 88,
    pm25_value: 55,
    pm10_value: 88,
    o3_value: 0.07,
    no2_value: 0.04,
    co_value: 0.3,
    so2_value: 0.004,
    temp: 22,
    humidity: 45,
    detail: {
      pm10: { grade: 3, value: 88 },
      pm25: { grade: 3, value: 55 },
      o3: { value: 0.07 },
      no2: { value: 0.04 },
    },
  },
  aiGuide: {
    summary: '오늘은 실외 활동 가능해요',
    csvReason: '초미세먼지 농도가 높아 호흡기 자극 위험이 있어 실외 활동 시간을 조절해야 해요.',
    detail: '초미세먼지는 높지만 실외 활동 시간을 짧게 조절하면 좋아요.',
    threeReason: [
      '오전보다 오후에 농도가 높아질 수 있어요.',
      '아이의 호흡기 반응을 자주 확인하세요.',
      '귀가 후 손씻기와 세안을 권장해요.',
    ],
    detailAnswer: '실외 활동은 가능하지만 활동량을 중강도로 제한하는 것이 안전해요.',
    actionItems: ['KF80 마스크 챙기기', '실외 활동은 30분 내로 조절하기'],
    activityRecommendation: '실외 활동 가능',
    maskRecommendation: 'KF80 권장',
    references: ['WHO Guidelines'],
  },
  decisionSignals: {
    pm25Grade: 3,
    o3Grade: 2,
    adjustedRiskGrade: 3,
    finalGrade: 'BAD',
    o3IsDominantRisk: false,
    o3OutingBanForced: false,
    infantMaskBanApplied: false,
    weatherAdjusted: false,
  },
  reliability: {
    status: 'LIVE',
    label: '최근 1시간 기준 실측 데이터',
    description: '현재 선택한 지역 측정소의 최근 1시간 기준 실측값을 반영했어요.',
    requestedStation: '중구',
    resolvedStation: '중구',
    triedStations: ['중구'],
    updatedAt: '2026-02-06T00:10:00.000Z',
    aiStatus: 'ok',
  },
  timestamp: '2026-02-06T00:00:00.000Z',
};

async function mockBaseApis(page: Page) {
  await page.route('**/api/reverse-geocode', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        address: '서울특별시 중구',
        regionName: '서울 중구',
        stationCandidate: '중구',
      }),
    });
  });

  await page.route('**/api/daily-report', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockReport),
    });
  });

  await page.route('**/api/clothing-recommendation', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        summary: '다소 따뜻해요. 얇고 통풍 잘되는 옷이 좋아요.',
        recommendation: '반팔 + 얇은 셔츠(또는 가디건) + 통풍 좋은 하의',
        tips: ['현재 습도는 비교적 안정적이에요. 활동량에 따라 한 겹 조절하세요.'],
        comfortLevel: 'WARM',
        temperature: 22,
        humidity: 45,
        source: 'test-mock',
      }),
    });
  });
}

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.5635, longitude: 126.9975 });
  await mockBaseApis(page);
});

test('핵심 대시보드가 렌더링된다', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('hero-outing-status')).toContainText('외출 비권장');
  await expect(page.getByTestId('hero-mask-recommendation')).toContainText('KF80 마스크 착용 권장');
  await expect(page.getByText('오늘은 실외 활동 가능해요')).toBeVisible();
  await expect(page.getByText('초미세먼지 농도가 높아 호흡기 자극 위험이 있어 실외 활동 시간을 조절해야 해요.')).toBeVisible();
  await expect(page.getByText('아이를 위한 오늘의 액션')).toBeVisible();
  await expect(page.getByTestId('share-button')).toBeVisible();
});

test('실시간 수치 위젯 토글 시 날씨/대기질 섹션이 노출된다', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('datagrid-toggle').click();

  await expect(page.getByText('[날씨]')).toBeVisible();
  await expect(page.getByText('[대기질]')).toBeVisible();
  await expect(page.getByText('초미세먼지', { exact: true })).toBeVisible();
  await expect(page.getByText('이산화질소', { exact: true })).toBeVisible();
});

test('온보딩 수정 후 제출하면 프로필 값으로 재요청된다', async ({ page }) => {
  const sentProfiles: string[] = [];
  await page.unroute('**/api/daily-report');
  await page.route('**/api/daily-report', async (route) => {
    const body = route.request().postDataJSON() as { profile?: { ageGroup?: string } };
    if (body.profile?.ageGroup) sentProfiles.push(body.profile.ageGroup);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockReport),
    });
  });

  await page.goto('/');

  await page.getByTestId('settings-button').click();
  const onboardingModal = page.getByTestId('onboarding-modal');
  await expect(onboardingModal).toBeVisible();

  await onboardingModal.getByRole('button', { name: /영아/ }).click();
  await page.getByTestId('onboarding-submit').click();

  await expect(page.getByTestId('onboarding-modal')).toBeHidden();
  await expect.poll(() => sentProfiles.includes('infant')).toBeTruthy();
});

test('히어로 카드 질환 선택 버튼으로 모달을 열어 profile.conditions를 갱신한다', async ({ page }) => {
  const sentConditions: string[][] = [];

  await page.unroute('**/api/daily-report');
  await page.route('**/api/daily-report', async (route) => {
    const body = route.request().postDataJSON() as { profile?: { conditions?: string[] } };
    if (Array.isArray(body.profile?.conditions)) {
      sentConditions.push(body.profile.conditions);
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockReport),
    });
  });

  await page.goto('/');

  await expect(page.getByTestId('hero-condition-open')).toBeVisible();
  await page.getByTestId('hero-condition-open').click();

  const conditionModal = page.getByTestId('condition-modal');
  await expect(conditionModal).toBeVisible();
  await conditionModal.getByRole('button', { name: /천식/ }).click();
  await conditionModal.getByTestId('condition-submit').click();

  await expect.poll(() => sentConditions.some((conditions) => conditions.includes('asthma'))).toBeTruthy();
});

test('프로필 변경 중에는 전체 데이터 컴포넌트가 스켈레톤으로 전환된다', async ({ page }) => {
  let delayedProfileRequestCount = 0;

  await page.unroute('**/api/daily-report');
  await page.route('**/api/daily-report', async (route) => {
    const body = route.request().postDataJSON() as { profile?: { ageGroup?: string } };

    if (body.profile?.ageGroup === 'infant') {
      delayedProfileRequestCount += 1;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1500);
      });
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockReport),
    });
  });

  await page.goto('/');

  await page.getByTestId('settings-button').click();
  const onboardingModal = page.getByTestId('onboarding-modal');
  await expect(onboardingModal).toBeVisible();
  await onboardingModal.getByRole('button', { name: /영아/ }).click();
  await page.getByTestId('onboarding-submit').click();

  await expect(page.getByTestId('onboarding-modal')).toBeHidden();
  await expect.poll(() => delayedProfileRequestCount).toBeGreaterThan(0);

  await Promise.all([
    expect(page.getByTestId('hero-loading')).toBeVisible(),
    expect(page.getByTestId('checklist-loading')).toBeVisible(),
    expect(page.getByTestId('clothing-card-loading')).toBeVisible(),
    expect(page.getByTestId('insight-loading')).toBeVisible(),
    expect(page.getByTestId('datagrid-loading')).toBeVisible(),
    expect(page.getByTestId('share-button-loading')).toBeVisible(),
  ]);

  await expect(page.getByText('오늘은 실외 활동 가능해요')).toBeVisible({ timeout: 10000 });
});

test('위치 버튼은 키보드로 모달을 열고 닫을 수 있다', async ({ page }) => {
  await page.goto('/');

  const trigger = page.getByTestId('location-trigger');
  await trigger.focus();
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('location-modal')).toBeVisible();

  await page.getByTestId('location-close').click();
  await expect(page.getByTestId('location-modal')).toBeHidden();
});

test('첫 화면은 요약 + 액션 + 옷차림 카드 우선으로 보이고 상세 섹션은 접혀 있다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByTestId('hero-outing-status')).toContainText('외출 비권장');
  await expect(page.getByText('오늘은 실외 활동 가능해요')).toBeVisible();
  await expect(page.getByText('아이를 위한 오늘의 액션')).toBeVisible();
  await expect(page.getByTestId('clothing-card')).toBeVisible();
  await expect(page.getByText('오늘의 옷차림')).toBeVisible();
  await expect(page.getByText('마스크', { exact: true })).toHaveCount(0);
  await expect(page.getByText('활동', { exact: true })).toHaveCount(0);

  await expect(page.getByTestId('insight-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('datagrid-toggle')).toHaveAttribute('aria-expanded', 'false');
});

test('공유 CTA는 고정형 컴팩트 높이를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const cta = page.getByTestId('share-button');
  await expect(cta).toBeVisible();

  const box = await cta.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('Share button box is missing');

  expect(box.height).toBeLessThanOrEqual(64);
  expect(box.y + box.height).toBeGreaterThanOrEqual(viewport.height - 30);
});

test('핵심 본문 텍스트는 handwriting 클래스를 사용하지 않는다', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /왜 그런가요/ }).click();
  await expect(page.getByText('AI 선생님의 3줄 요약')).toBeVisible();

  await expect(page.locator('main .handwriting')).toHaveCount(0);
});

test('왜 그런가요 섹션은 3줄 요약과 자세히 보기만 제공하고 중복 액션 카드는 노출하지 않는다', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('insight-toggle').click();

  const summaryList = page.getByTestId('insight-summary-list');
  const detailToggle = page.getByTestId('insight-detail-toggle');

  await expect(summaryList.locator('li')).toHaveCount(3);
  await expect(page.getByText('아이를 위해 지금 결정하세요')).toHaveCount(0);
  await expect(detailToggle).toBeVisible();
  await expect(detailToggle).toHaveAttribute('aria-expanded', 'false');

  await detailToggle.click();
  await expect(detailToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('insight-detail-content')).toContainText(
    '실외 활동은 가능하지만 활동량을 중강도로 제한하는 것이 안전해요.',
  );
});

test('근거/수치 섹션에 데이터 신뢰성 배지가 표시된다', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('insight-toggle').click();
  await expect(page.getByTestId('insight-reliability-badge')).toContainText('최근 1시간 기준 실측 데이터');

  await page.getByTestId('datagrid-toggle').click();
  await expect(page.getByTestId('datagrid-reliability-badge')).toContainText('최근 1시간 기준 실측 데이터');
});

test('의사결정 근거 칩과 지연 데이터 배지/재조회 버튼이 노출된다', async ({ page }) => {
  let requestCount = 0;
  await page.unroute('**/api/daily-report');
  await page.route('**/api/daily-report', async (route) => {
    requestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...mockReport,
        airQuality: {
          ...mockReport.airQuality,
          dataTime: '2024-01-01 00:00',
        },
        decisionSignals: {
          ...mockReport.decisionSignals,
          o3OutingBanForced: true,
          infantMaskBanApplied: true,
          weatherAdjusted: true,
          finalGrade: 'BAD',
        },
      }),
    });
  });

  await page.goto('/');
  await page.getByTestId('insight-toggle').click();

  await expect(page.getByText('오존 시간대 규칙 적용')).toBeVisible();
  await expect(page.getByText('영아 마스크 금지 적용')).toBeVisible();
  await expect(page.getByText('질환/온습도 보정 적용')).toBeVisible();
  await expect(page.getByTestId('insight-freshness-badge')).toBeVisible();
  await expect(page.getByTestId('insight-refresh-button')).toBeVisible();

  await page.getByTestId('insight-refresh-button').click();
  await expect.poll(() => requestCount).toBeGreaterThan(1);

  await page.getByTestId('datagrid-toggle').click();
  await expect(page.getByTestId('datagrid-freshness-badge')).toBeVisible();
  await expect(page.getByTestId('datagrid-refresh-button')).toBeVisible();
});

test('fallback 신뢰성 배지 카피 스냅샷이 유지된다', async ({ page }) => {
  await page.unroute('**/api/daily-report');
  await page.route('**/api/daily-report', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...mockReport,
        reliability: {
          status: 'STATION_FALLBACK',
          label: '인근 측정소 자동 보정',
          description: '입력 주소와 인접한 유효 측정소의 최근 1시간 기준 실측값으로 자동 보정했어요.',
          requestedStation: '판교동',
          resolvedStation: '정자동',
          triedStations: ['판교동', '분당구', '정자동'],
          aiStatus: 'ok',
        },
      }),
    });
  });

  await page.goto('/');

  await page.getByTestId('insight-toggle').click();
  await page.getByTestId('datagrid-toggle').click();

  const insightBadgeText = (await page.getByTestId('insight-reliability-badge').innerText())
    .replace(/\s+/g, ' ')
    .trim();
  const datagridBadgeText = (await page.getByTestId('datagrid-reliability-badge').innerText())
    .replace(/\s+/g, ' ')
    .trim();

  expect(insightBadgeText).toBe('인근 측정소 자동 보정');
  expect(datagridBadgeText).toBe('인근 측정소 자동 보정');
});

test('주소/프로필 변경 시 스켈레톤 캡션과 변경 데이터가 반영된다', async ({ page }) => {
  test.setTimeout(45_000);

  const reportForStation = (stationName: string) => {
    if (stationName === '종로구') {
      return {
        ...mockReport,
        airQuality: {
          ...mockReport.airQuality,
          stationName: '종로구',
          grade: 'GOOD',
          pm25_value: 12,
          pm10_value: 24,
          o3_value: 0.028,
          no2_value: 0.017,
        },
        aiGuide: {
          ...mockReport.aiGuide,
          summary: '종로구 기준으로는 외출하기 좋아요',
        },
        reliability: {
          ...mockReport.reliability,
          requestedStation: '종로구',
          resolvedStation: '종로구',
          triedStations: ['종로구'],
        },
      };
    }

    return mockReport;
  };

  await page.unroute('**/api/daily-report');
  await page.route('**/api/daily-report', async (route) => {
    const body = route.request().postDataJSON() as {
      stationName?: string;
      profile?: { ageGroup?: string; condition?: string; conditions?: string[] };
    };

    const stationName = body.stationName || '중구';
    const isProfileRefresh = body.profile?.ageGroup === 'infant';
    const payload = reportForStation(stationName);

    if (stationName === '종로구' || isProfileRefresh) {
      await new Promise((resolve) => setTimeout(resolve, 1600));
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });

  await page.goto('/');
  await expect(page.getByText('오늘은 실외 활동 가능해요')).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('aisoom:test-location-select', {
        detail: { address: '서울 종로구', stationName: '종로구' },
      }),
    );
  });

  await expect(page.getByTestId('hero-loading')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('hero-loading-caption')).toContainText('서울 종로구 기준으로 데이터 업데이트 중');
  await expect(page.getByText('종로구 기준으로는 외출하기 좋아요')).toBeVisible();

  await page.getByTestId('datagrid-toggle').click();
  await expect(page.getByText('12', { exact: true })).toBeVisible();

  await page.getByTestId('settings-button').click();
  const onboardingModal = page.getByTestId('onboarding-modal');
  await expect(onboardingModal).toBeVisible();
  await onboardingModal.getByRole('button', { name: /영아/ }).click();
  await page.getByTestId('onboarding-submit').click();

  await expect(page.getByTestId('hero-loading')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('hero-loading-caption')).toContainText(
    '선택한 연령/질환 기준으로 맞춤 가이드를 다시 계산 중',
  );
});

test('요청 타임아웃 후 재시도로 복구된다', async ({ page }) => {
  test.setTimeout(70_000);
  let attempts = 0;
  await page.unroute('**/api/daily-report');
  await page.route('**/api/daily-report', async (route) => {
    attempts += 1;

    if (attempts === 1) {
      await new Promise((resolve) => setTimeout(resolve, 26_000));
      try {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockReport),
        });
      } catch {
        // First request is expected to be aborted by the client timeout.
      }
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockReport),
    });
  });

  await page.goto('/');

  await expect(page.getByTestId('hero-error')).toBeVisible({ timeout: 40_000 });
  await page.getByRole('button', { name: '다시 시도' }).click();

  await expect(page.getByText('오늘은 실외 활동 가능해요')).toBeVisible();
});

test('영아 프로필에서도 마스크/활동 스티커 카드는 노출되지 않고 인사이트 칩으로만 표시된다', async ({ page }) => {
  await page.unroute('**/api/daily-report');
  await page.route('**/api/daily-report', async (route) => {
    const body = route.request().postDataJSON() as { profile?: { ageGroup?: string } };
    const isInfant = body.profile?.ageGroup === 'infant';

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...mockReport,
        decisionSignals: {
          ...mockReport.decisionSignals,
          infantMaskBanApplied: isInfant,
        },
      }),
    });
  });
  await page.goto('/');
  await expect(page.getByText('마스크', { exact: true })).toHaveCount(0);
  await expect(page.getByText('활동', { exact: true })).toHaveCount(0);
  await expect(page.getByText('영아 마스크 금지', { exact: true })).toHaveCount(0);

  await page.getByTestId('settings-button').click();
  const onboardingModal = page.getByTestId('onboarding-modal');
  await expect(onboardingModal).toBeVisible();
  await onboardingModal.getByRole('button', { name: /영아/ }).click();
  await page.getByTestId('onboarding-submit').click();

  await expect(page.getByText('영아 마스크 금지', { exact: true })).toHaveCount(0);
  await page.getByTestId('insight-toggle').click();
  await expect(page.getByText('영아 마스크 금지 적용')).toBeVisible();
});

test('왜 그런가요 하단 VOC 1탭 피드백이 동작한다', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/');
  await expect(page.getByText('오늘은 실외 활동 가능해요')).toBeVisible();

  await page.getByTestId('insight-toggle').click();
  const helpful = page.getByTestId('insight-feedback-helpful');
  const notHelpful = page.getByTestId('insight-feedback-not-helpful');

  await expect(helpful).toBeVisible();
  await expect(notHelpful).toBeVisible();

  await helpful.click();
  await expect(helpful).toHaveAttribute('aria-pressed', 'true');
  await expect(notHelpful).toHaveAttribute('aria-pressed', 'false');
});
