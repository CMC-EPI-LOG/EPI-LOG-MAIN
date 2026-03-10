import { HOME_FAQS, HOME_FEATURES, HOME_USE_CASES } from "@/lib/homeSeo";

export default function HomeSeoSections() {
  return (
    <section className="px-3 pb-24 md:px-4" aria-labelledby="home-seo-overview">
      <div className="mx-auto max-w-2xl space-y-4">
        <section className="bento-card bg-white p-6">
          <p className="section-label">Overview</p>
          <h2
            id="home-seo-overview"
            className="mt-2 text-2xl font-black tracking-tight text-gray-900"
          >
            아이숨은 우리 아이 외출 판단을 돕는 대기질 맞춤 가이드입니다.
          </h2>
          <p className="mt-3 text-sm leading-6 text-gray-700 md:text-base">
            아이숨은 미세먼지, 초미세먼지, 오존 같은 실시간 대기질 정보와
            기온, 습도, 자외선, 꽃가루 지수, 그리고 아이의 연령대와 질환 정보를
            함께 반영해 오늘의 외출 가능 여부와 준비사항을 안내합니다.
          </p>
          <p className="mt-3 text-sm leading-6 text-gray-700 md:text-base">
            보호자는 위치 기반으로 현재 지역 상태를 확인하고, 행동
            체크리스트와 복장 힌트까지 한 번에 받아볼 수 있습니다. 의료 진단을
            대체하지는 않지만, 등원 전과 산책 전처럼 빠른 생활 판단이 필요한
            순간에 실용적인 기준점을 제공합니다.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3" aria-labelledby="home-seo-features">
          {HOME_FEATURES.map((feature) => (
            <article key={feature.title} className="bento-card bg-white p-5">
              <h2
                id={feature.title === HOME_FEATURES[0].title ? "home-seo-features" : undefined}
                className="text-lg font-black text-gray-900"
              >
                {feature.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-700">
                {feature.description}
              </p>
            </article>
          ))}
        </section>

        <section className="bento-card bg-white p-6" aria-labelledby="home-seo-use-cases">
          <p className="section-label">Use cases</p>
          <h2
            id="home-seo-use-cases"
            className="mt-2 text-2xl font-black tracking-tight text-gray-900"
          >
            이런 상황에서 특히 유용합니다.
          </h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-700 md:text-base">
            {HOME_USE_CASES.map((item) => (
              <li key={item} className="rounded-2xl bg-gray-50 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="bento-card bg-white p-6" aria-labelledby="home-seo-faq">
          <p className="section-label">FAQ</p>
          <h2
            id="home-seo-faq"
            className="mt-2 text-2xl font-black tracking-tight text-gray-900"
          >
            자주 묻는 질문
          </h2>
          <div className="mt-4 space-y-3">
            {HOME_FAQS.map((item) => (
              <article key={item.question} className="rounded-2xl bg-gray-50 px-4 py-4">
                <h3 className="text-base font-black text-gray-900">
                  {item.question}
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-700 md:text-base">
                  {item.answer}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
