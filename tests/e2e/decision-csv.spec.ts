import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

interface DecisionCsvRow {
  항목: string;
  대기등급: '좋음' | '보통' | '나쁨' | '매우나쁨';
  메인문구: string;
  연령대: '영아(0-2세)' | '유아(3-6세)' | '초등저(7-9세)' | '초등고(10-12)' | '청소년/성인';
  이유: string;
  질환군: '일반' | '비염' | '천식' | '아토피';
  행동1: string;
  행동2: string;
  행동3: string;
}

type AgeGroupCode = 'infant' | 'toddler' | 'elementary_low' | 'elementary_high' | 'teen_adult';
type ConditionCode = 'none' | 'rhinitis' | 'asthma' | 'atopy';
type AirGradeCode = 'GOOD' | 'NORMAL' | 'BAD' | 'VERY_BAD';

interface Scenario {
  row: DecisionCsvRow;
  expectedAgeGroup: AgeGroupCode;
  expectedCondition: ConditionCode;
  expectedGrade: AirGradeCode;
}

const CSV_PATH = path.resolve(process.cwd(), 'tests/fixtures/decision-data.csv');
const CSV_HEADERS = ['항목', '대기등급', '메인문구', '연령대', '이유', '질환군', '행동1', '행동2', '행동3'] as const;
const CSV_ROWS = loadDecisionCsv();

const AGE_CODE_MAP: Record<DecisionCsvRow['연령대'], AgeGroupCode> = {
  '영아(0-2세)': 'infant',
  '유아(3-6세)': 'toddler',
  '초등저(7-9세)': 'elementary_low',
  '초등고(10-12)': 'elementary_high',
  '청소년/성인': 'teen_adult',
};

const CONDITION_CODE_MAP: Record<DecisionCsvRow['질환군'], ConditionCode> = {
  일반: 'none',
  비염: 'rhinitis',
  천식: 'asthma',
  아토피: 'atopy',
};

const GRADE_CODE_MAP: Record<DecisionCsvRow['대기등급'], AirGradeCode> = {
  좋음: 'GOOD',
  보통: 'NORMAL',
  나쁨: 'BAD',
  매우나쁨: 'VERY_BAD',
};

function toScenario(row: DecisionCsvRow): Scenario {
  return {
    row,
    expectedAgeGroup: AGE_CODE_MAP[row.연령대],
    expectedCondition: CONDITION_CODE_MAP[row.질환군],
    expectedGrade: GRADE_CODE_MAP[row.대기등급],
  };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out;
}

function loadDecisionCsv(): DecisionCsvRow[] {
  const raw = fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error(`CSV is empty: ${CSV_PATH}`);
  }

  const headers = parseCsvLine(lines[0]);
  if (headers.length !== CSV_HEADERS.length || !CSV_HEADERS.every((header, index) => headers[index] === header)) {
    throw new Error(`Unexpected CSV headers. got=${JSON.stringify(headers)}`);
  }

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    if (cols.length !== CSV_HEADERS.length) {
      throw new Error(`Unexpected CSV column count(${cols.length}) in line: ${line}`);
    }
    return {
      항목: cols[0],
      대기등급: cols[1] as DecisionCsvRow['대기등급'],
      메인문구: cols[2],
      연령대: cols[3] as DecisionCsvRow['연령대'],
      이유: cols[4],
      질환군: cols[5] as DecisionCsvRow['질환군'],
      행동1: cols[6],
      행동2: cols[7],
      행동3: cols[8],
    };
  });
}

async function gotoHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
}

async function waitForHydratedDashboard(page: Page) {
  await expect(page.getByText('아이를 위한 오늘의 액션')).toBeVisible();
  await page.waitForFunction(() => (window as Window & { __AISOOM_TEST_HOOKS_READY__?: boolean }).__AISOOM_TEST_HOOKS_READY__ === true);
}

function gradeMetrics(grade: AirGradeCode) {
  if (grade === 'GOOD') return { pm25: 10, pm10: 20 };
  if (grade === 'NORMAL') return { pm25: 25, pm10: 40 };
  if (grade === 'BAD') return { pm25: 45, pm10: 70 };
  return { pm25: 85, pm10: 130 };
}

function buildDailyReportPayload(scenario: Scenario) {
  const metrics = gradeMetrics(scenario.expectedGrade);

  return {
    airQuality: {
      stationName: '중구',
      sidoName: '서울',
      dataTime: '2026-02-27 18:00',
      grade: scenario.expectedGrade,
      value: metrics.pm10,
      pm25_value: metrics.pm25,
      pm10_value: metrics.pm10,
      o3_value: 0.03,
      no2_value: 0.02,
      temp: 22,
      humidity: 45,
      detail: {
        pm10: { grade: 2, value: metrics.pm10 },
        pm25: { grade: 2, value: metrics.pm25 },
        o3: { value: 0.03 },
        no2: { value: 0.02 },
      },
    },
    aiGuide: {
      summary: scenario.row.메인문구,
      detail: scenario.row.이유,
      threeReason: [scenario.row.이유],
      detailAnswer: scenario.row.이유,
      actionItems: [scenario.row.행동1, scenario.row.행동2, scenario.row.행동3],
      activityRecommendation: scenario.row.메인문구,
      maskRecommendation: 'KF80 권장',
      references: ['csv-contract'],
    },
    decisionSignals: {
      pm25Grade: 2,
      o3Grade: 2,
      adjustedRiskGrade: 2,
      finalGrade: scenario.expectedGrade,
      o3IsDominantRisk: false,
      o3OutingBanForced: false,
      infantMaskBanApplied: scenario.expectedAgeGroup === 'infant',
      weatherAdjusted: false,
    },
    reliability: {
      status: 'STATION_FALLBACK',
      label: '인근 측정소 자동 보정',
      description: 'CSV 계약 검증용 응답',
      requestedStation: '중구',
      resolvedStation: '중구',
      triedStations: ['중구'],
      updatedAt: '2026-02-27T09:00:00.000Z',
      aiStatus: 'ok',
    },
    timestamp: '2026-02-27T09:00:00.000Z',
  };
}

async function selectProfile(page: Page, scenario: Scenario) {
  await waitForHydratedDashboard(page);
  await page.evaluate((profile) => {
    window.dispatchEvent(
      new CustomEvent('aisoom:test-profile-select', {
        detail: { profile },
      }),
    );
  }, {
    nickname: '',
    ageGroup: scenario.expectedAgeGroup,
    condition: scenario.expectedCondition,
    conditions: scenario.expectedCondition === 'none' ? ['none'] : [scenario.expectedCondition],
    customConditions: [],
  });
}

test.describe('CSV Decision Matrix E2E', () => {
  test('CSV 80개 결정 시나리오가 프로필 요청값/화면 출력과 일치한다', async ({ context, page }) => {
    test.setTimeout(600_000);

    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 37.5635, longitude: 126.9975 });

    let activeScenario = toScenario(CSV_ROWS[0]);
    let matchedProfileRequest = false;

    await page.route('**/api/reverse-geocode', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          address: '서울특별시 중구',
          regionName: '서울 중구',
          stationCandidate: '서울특별시 중구',
        }),
      });
    });

    await page.route('**/api/daily-report', async (route) => {
      const body = route.request().postDataJSON() as {
        profile?: { ageGroup?: string; condition?: string; conditions?: string[] };
      };
      const profile = body.profile;
      const expected = activeScenario;
      const hasExpectedCondition =
        profile?.condition === expected.expectedCondition ||
        (Array.isArray(profile?.conditions) && profile.conditions.includes(expected.expectedCondition));

      if (profile?.ageGroup === expected.expectedAgeGroup && hasExpectedCondition) {
        matchedProfileRequest = true;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildDailyReportPayload(expected)),
      });
    });

    await page.route('**/api/clothing-recommendation', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: '테스트용 복장 안내',
          recommendation: '가벼운 겉옷을 준비하세요.',
          tips: ['CSV 시나리오 검증용 고정 응답입니다.'],
          comfortLevel: 'MILD',
          temperature: 22,
          humidity: 45,
          source: 'decision-csv-mock',
        }),
      });
    });

    await page.route('**/api/weather-forecast**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          requestedStation: '중구',
          resolvedStation: '중구',
          triedStations: ['중구'],
          windowHours: 48,
          items: [],
          airQualityForecast: null,
          lifestyleIndices: null,
          timestamp: '2026-02-27T09:00:00.000Z',
        }),
      });
    });

    await page.route('**/api/log**', async (route) => {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await gotoHome(page);
    await waitForHydratedDashboard(page);

    for (const row of CSV_ROWS) {
      const scenario = toScenario(row);
      activeScenario = scenario;
      matchedProfileRequest = false;

      await selectProfile(page, scenario);

      await expect.poll(() => matchedProfileRequest, { timeout: 10_000 }).toBe(true);

      await expect(page.getByTestId('hero-main-text')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('hero-main-text')).toHaveText(row.메인문구);
      await expect(page.getByText(row.행동1, { exact: true })).toBeVisible();
      await expect(page.getByText(row.행동2, { exact: true })).toBeVisible();
      await expect(page.getByText(row.행동3, { exact: true })).toBeVisible();

      const insightToggle = page.getByTestId('insight-toggle');
      if ((await insightToggle.getAttribute('aria-expanded')) !== 'true') {
        await insightToggle.click();
      }

      const detailToggle = page.getByTestId('insight-detail-toggle');
      if ((await detailToggle.getAttribute('aria-expanded')) !== 'true') {
        await detailToggle.click();
      }

      await expect(page.getByTestId('insight-detail-content')).toContainText(row.이유);
    }
  });
});
